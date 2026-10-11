import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeWorld, type World } from './helpers.js';
import { uuidv7 } from '../src/util/ids.js';

let w: World;
beforeAll(async () => { w = await makeWorld(); });
afterAll(async () => { await w.close(); });

describe('idempotency (client_tx_id)', () => {
  it('top-up replay returns the original result with 200 + Idempotent-Replayed, and posts once', async () => {
    const tag = await w.newTag();
    const body = { client_tx_id: uuidv7(), tag, payment_method: 'cash', amount_cents: 2000 };
    const a = await w.as('cashier').post('/topups', body);
    const b = await w.as('cashier').post('/topups', body);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.headers['idempotent-replayed']).toBe('true');
    expect(b.body).toEqual(a.body);
    const n = await w.owner`SELECT count(*)::int AS n FROM journal WHERE event_id = ${w.eventId} AND client_tx_id = ${body.client_tx_id}`;
    expect(n[0]!.n).toBe(1);
    expect((await w.as('cashier').get(`/tags/${tag.tag_code}?uid=${tag.uid}`)).body.balance_tokens).toBe(10);
  });

  it('same client_tx_id with a different body is DUPLICATE_TX (also across operations)', async () => {
    const tag = await w.newTag();
    const id = uuidv7();
    await w.as('cashier').post('/topups', { client_tx_id: id, tag, payment_method: 'cash', amount_cents: 2000 });
    const r = await w.as('cashier').post('/topups', { client_tx_id: id, tag, payment_method: 'cash', amount_cents: 4000 });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('DUPLICATE_TX');
    const o = await w.as('vendor').post('/orders', { client_tx_id: id, stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty: 1 }] });
    expect(o.body.code).toBe('DUPLICATE_TX');
  });

  it('order replay returns the original even after the tag was blocked or prices changed', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 10);
    const body = { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty: 2 }] };
    const a = await w.as('vendor').post('/orders', body);
    expect(a.status).toBe(201);
    await w.as('cashier').post(`/tags/${tag.tag_code}/status`, { client_tx_id: uuidv7(), status: 'blocked', reason_code: 'lost_tag' });
    await w.owner`UPDATE items SET price_tokens = 5 WHERE id = ${w.items.cola}`;
    const b = await w.as('vendor').post('/orders', body);
    await w.owner`UPDATE items SET price_tokens = 1 WHERE id = ${w.items.cola}`;
    expect(b.status).toBe(200);
    expect(b.body).toEqual(a.body);
    expect((await w.as('cashier').get(`/tags/${tag.tag_code}?uid=${tag.uid}`)).body.balance_tokens).toBe(8);
  });

  it('external_ref is unique per payment method', async () => {
    const t1 = await w.newTag(), t2 = await w.newTag();
    const mk = (tag: any, ref: string, method = 'sumup_card') => w.as('cashier').post('/topups', { client_tx_id: uuidv7(), tag, payment_method: method, amount_cents: 2000, external_ref: ref });
    expect((await mk(t1, 'TX1')).status).toBe(201);
    const dup = await mk(t2, 'TX1');
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EXTERNAL_REF_ALREADY_USED');
    expect((await mk(t2, 'TX1', 'wero')).status).toBe(201);
    const none = await w.as('cashier').post('/topups', { client_tx_id: uuidv7(), tag: t2, payment_method: 'wero', amount_cents: 2000 });
    expect(none.body.code).toBe('EXTERNAL_REF_REQUIRED');
  });

  it('tag status / replace / enrol are idempotent too', async () => {
    const tag = await w.newTag();
    const body = { client_tx_id: uuidv7(), status: 'blocked', reason_code: 'lost_tag' };
    const a = await w.as('cashier').post(`/tags/${tag.tag_code}/status`, body);
    const b = await w.as('cashier').post(`/tags/${tag.tag_code}/status`, body);
    expect(b.status).toBe(200);
    expect(b.headers['idempotent-replayed']).toBe('true');
    expect(b.body).toEqual(a.body);
    const enr = { client_tx_id: uuidv7(), uid: '04AABBCCDDEEFF', chip_type: 'ntag213' };
    const e1 = await w.as('cashier').post('/tags/enroll', enr);
    const e2 = await w.as('cashier').post('/tags/enroll', { ...enr, client_tx_id: uuidv7() });
    expect(e1.status).toBe(201);
    expect(e2.status).toBe(200);
    expect(e2.body.tag_code).toBe(e1.body.tag_code);
    expect(e1.body.protection).toMatchObject({ auth0: 4, prot: 0 });
    expect(e1.body.ndef_url).toContain('/t/' + e1.body.tag_code);
  });
});
