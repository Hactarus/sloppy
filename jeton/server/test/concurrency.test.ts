import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeWorld, verifyOk, type World } from './helpers.js';
import { uuidv7 } from '../src/util/ids.js';

let w: World;
beforeAll(async () => { w = await makeWorld(); });
afterAll(async () => { await w.close(); });

describe('concurrency', () => {
  it('parallel spends on one tag never overdraw: exactly floor(balance/price) succeed', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 5);
    const results = await Promise.all(Array.from({ length: 24 }, () =>
      w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty: 1 }] })));
    const ok = results.filter((r) => r.status === 201);
    const refused = results.filter((r) => r.status === 409);
    expect(ok).toHaveLength(5);
    expect(refused).toHaveLength(19);
    expect(refused.every((r) => r.body.code === 'INSUFFICIENT_BALANCE')).toBe(true);
    const bal = await w.as('cashier').get(`/tags/${tag.tag_code}?uid=${tag.uid}`);
    expect(bal.body.balance_tokens).toBe(0);
    const seqs = ok.map((r) => r.body.receipt_no).sort((a, b) => a - b);
    expect(new Set(seqs).size).toBe(5);
    const v = await verifyOk(w);
    expect(v.ok, JSON.stringify(v)).toBe(true);
  });

  it('parallel replays of the same client_tx_id post exactly once', async () => {
    const tag = await w.newTag();
    const body = { client_tx_id: uuidv7(), tag, payment_method: 'cash', amount_cents: 2000 };
    const rs = await Promise.all(Array.from({ length: 12 }, () => w.as('cashier').post('/topups', body)));
    expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
    expect(rs.filter((r) => r.status === 200)).toHaveLength(11);
    expect((await w.as('cashier').get(`/tags/${tag.tag_code}?uid=${tag.uid}`)).body.balance_tokens).toBe(10);
  });

  it('mixed parallel top-ups and spends on many tags keep gapless seq, receipt numbers and a valid chain', async () => {
    const tags = await Promise.all(Array.from({ length: 6 }, () => w.newTag()));
    await Promise.all(tags.map((t) => w.topup(t, 10)));
    await Promise.all(tags.flatMap((t) => Array.from({ length: 4 }, () =>
      w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag: t, lines: [{ item_id: w.items.cola, qty: 1 }] }))));
    const gaps = await w.owner`SELECT count(*)::int AS n, max(seq)::int AS mx FROM journal WHERE event_id = ${w.eventId}`;
    expect(gaps[0]!.n).toBe(gaps[0]!.mx);
    const rn = await w.owner`SELECT receipt_no FROM orders WHERE stand_id = ${w.stands.bar} ORDER BY receipt_no`;
    rn.forEach((r, i) => expect(r.receipt_no).toBe(i + 1));
    expect((await verifyOk(w)).ok).toBe(true);
  });
});
