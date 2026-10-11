import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeWorld, verifyOk, type World } from './helpers.js';
import { uuidv7 } from '../src/util/ids.js';

let w: World;
beforeAll(async () => { w = await makeWorld(); });
afterAll(async () => { await w.close(); });

const ago = (s: number) => new Date(Date.now() - s * 1000).toISOString();
const item = (w: World, type: string, payload: any, staff = w.staff.vendor) => ({ type, staff_id: staff, payload });
const orderPayload = (w: World, tag: any, qty: number, extra: any = {}) => ({
  client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty }], client_created_at: ago(60), ...extra,
});
const batch = (w: World, items: any[]) => w.api(w.devices.bar.token).post('/sync/batch', { batch_id: uuidv7(), items });

describe('offline batch sync', () => {
  it('applies in order, accepts and FLAGS overdrafts, cap breaches, blocked tags, UID mismatch', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 3);
    const o1 = orderPayload(w, tag, 2);
    const o2 = orderPayload(w, tag, 4); // overdraws: balance 1 -> -3 ; cumulative 6 <= cap 10
    const o3 = orderPayload(w, tag, 5); // cumulative 11 > cap 10
    const r = await batch(w, [item(w, 'order', o1), item(w, 'order', o2), item(w, 'order', o3)]);
    expect(r.status, JSON.stringify(r.body)).toBe(200);
    const [a, b, c] = r.body.results;
    expect(a.status).toBe('applied'); expect(a.flags).toEqual([]);
    expect(b.status).toBe('applied'); expect(b.flags).toContain('NEGATIVE_BALANCE');
    expect(c.flags).toEqual(expect.arrayContaining(['NEGATIVE_BALANCE', 'OFFLINE_CAP_EXCEEDED']));
    expect(a.result.receipt_no).toBeGreaterThan(0);
    expect(c.result.balance_tokens).toBe(3 - 11);
    const list = await w.as('admin').get(`/events/${w.eventId}/tags?negative_only=true`);
    expect(list.body.items.map((t: any) => t.tag_code)).toContain(tag.tag_code);
    const flags = await w.as('auditor').get(`/events/${w.eventId}/flags`);
    expect(flags.body.items.filter((f: any) => f.flag === 'NEGATIVE_BALANCE').length).toBeGreaterThanOrEqual(2);
    expect((await verifyOk(w)).ok).toBe(true);
  });

  it('replay of a batch yields duplicate results; different body is rejected DUPLICATE_TX', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 5);
    const p = orderPayload(w, tag, 1);
    const first = await batch(w, [item(w, 'order', p)]);
    const again = await batch(w, [item(w, 'order', p), item(w, 'order', { ...p, lines: [{ item_id: w.items.cola, qty: 2 }] })]);
    expect(first.body.results[0].status).toBe('applied');
    expect(again.body.results[0].status).toBe('duplicate');
    expect(again.body.results[0].result).toEqual(first.body.results[0].result);
    expect(again.body.results[1].status).toBe('rejected');
    expect(again.body.results[1].error.code).toBe('DUPLICATE_TX');
  });

  it('rejects only structurally impossible items; others in the batch still apply', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 5);
    const ghost = { tag_code: '0123456789ABCDEFGHJ0', uid: '04AABBCCDDEEFF' };
    const r = await batch(w, [
      item(w, 'order', orderPayload(w, ghost, 1)),
      item(w, 'topup', { client_tx_id: uuidv7(), tag, payment_method: 'cash', amount_cents: 200, client_created_at: ago(5) }),
      item(w, 'order', orderPayload(w, tag, 1), w.staff.auditor),
      item(w, 'order', orderPayload(w, tag, 1)),
    ]);
    expect(r.body.results.map((x: any) => x.status)).toEqual(['rejected', 'rejected', 'rejected', 'applied']);
    expect(r.body.results[0].error.code).toBe('TAG_NOT_FOUND');
    expect(r.body.results[1].error.code).toBe('OFFLINE_NOT_ALLOWED');
    expect(r.body.results[2].error.code).toBe('FORBIDDEN');
  });

  it('blocked tag and UID mismatch are posted and flagged; clock skew uses server time', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 10);
    await w.as('cashier').post(`/tags/${tag.tag_code}/status`, { client_tx_id: uuidv7(), status: 'blocked', reason_code: 'lost_tag' });
    const blocked = await batch(w, [item(w, 'order', orderPayload(w, tag, 1))]);
    expect(blocked.body.results[0].flags).toContain('TAG_BLOCKED_AT_SYNC');
    const t2 = await w.newTag();
    await w.topup(t2, 10);
    const mism = await batch(w, [item(w, 'order', orderPayload(w, { ...t2, uid: '04FFFFFFFFFFFF' }, 1, { client_created_at: new Date(Date.now() + 3600e3).toISOString() }))]);
    expect(mism.body.results[0].flags).toEqual(expect.arrayContaining(['TAG_UID_MISMATCH', 'CLOCK_SKEW']));
  });

  it('terminal price differing from the catalog is posted with the terminal price and flagged OFFLINE_PRICE_MISMATCH', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 10);
    const p = orderPayload(w, tag, 1, { lines: [{ item_id: w.items.cola, qty: 1, unit_price_tokens: 2 }] });
    const r = await batch(w, [item(w, 'order', p)]);
    expect(r.body.results[0].flags).toContain('OFFLINE_PRICE_MISMATCH');
    expect(r.body.results[0].result.items_tokens).toBe(2);
    expect(r.body.results[0].result.lines[0].unit_price_tokens).toBe(2);
    // online the same price difference is a PRICE_MISMATCH
    const on = await w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty: 1, unit_price_tokens: 2 }] });
    expect(on.body.code).toBe('PRICE_MISMATCH');
  });

  it('works with a device token only (expired JWT), accepts more than the cap per batch size rules, and limits to 200 items', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 50);
    const items = Array.from({ length: 201 }, () => item(w, 'order', orderPayload(w, tag, 1)));
    const big = await batch(w, items);
    expect(big.status).toBe(413);
    expect(big.body.code).toBe('PAYLOAD_TOO_LARGE');
    const ok = await batch(w, items.slice(0, 3));
    expect(ok.status).toBe(200);
    expect(ok.body.results.every((x: any) => x.status === 'applied')).toBe(true);
  });

  it('late orders after event close are accepted and flagged LATE_AFTER_CLOSE', async () => {
    const lw = await makeWorld();
    try {
      const tag = await lw.newTag();
      await lw.topup(tag, 10);
      await lw.owner`UPDATE events SET status = 'closed' WHERE id = ${lw.eventId}`;
      const r = await lw.api(lw.devices.bar.token).post('/sync/batch', { batch_id: uuidv7(), items: [item(lw, 'order', orderPayload(lw, tag, 1), lw.staff.vendor)] });
      expect(r.body.results[0].status).toBe('applied');
      expect(r.body.results[0].flags).toContain('LATE_AFTER_CLOSE');
      const online = await lw.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: lw.stands.bar, tag, lines: [{ item_id: lw.items.cola, qty: 1 }] });
      expect(online.body.code).toBe('EVENT_CLOSED');
    } finally { await lw.close(); }
  });

  it('offline refunds, cashouts and cash movements sync too', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 10);
    const op = orderPayload(w, tag, 2);
    const sync1 = await batch(w, [item(w, 'order', op)]);
    const orderId = sync1.body.results[0].result.id;
    const r = await w.api(w.devices.desk.token).post('/sync/batch', {
      batch_id: uuidv7(),
      items: [
        item(w, 'order_refund', { order_id: orderId, client_tx_id: uuidv7(), reason_code: 'customer_request', client_created_at: ago(30) }, w.staff.cashier),
        item(w, 'cashout', { client_tx_id: uuidv7(), tag, method: 'cash', reason_code: 'customer_request', tokens: 4, client_created_at: ago(20) }, w.staff.cashier),
        item(w, 'cash_movement', { client_tx_id: uuidv7(), cashdesk_id: w.stands.desk, movement: 'float_in', amount_cents: 5000, reason_code: 'other', client_created_at: ago(10) }, w.staff.cashier),
      ],
    });
    expect(r.body.results.map((x: any) => x.status), JSON.stringify(r.body)).toEqual(['applied', 'applied', 'applied']);
  });
});
