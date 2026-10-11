import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeWorld, verifyOk, type World } from './helpers.js';
import { uuidv7 } from '../src/util/ids.js';

let w: World;
const today = () => new Date().toISOString().slice(0, 10);
beforeAll(async () => { w = await makeWorld(); });
afterAll(async () => { await w.close(); });

describe('reports and Z', () => {
  let bizDate = today();
  it('sale: VAT grouped per rate, tip separate; Z preview, VAT, sales, topups, liability, tips match', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 20);                                   // 4000 cents cash
    const card = await w.newTag();
    expect((await w.topup(card, 5, 'sumup_card')).status).toBe(201);   // 1000 cents card
    // contract example: 2 x pils (21 % ALCOHOL) 400 + 1 cola (21 % DRINK_SOFT on_site) 200 = 600 @21%, tip 1
    const o = await w.as('vendor').post('/orders', {
      client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, age_check_confirmed: true, tip_tokens: 1,
      lines: [{ item_id: w.items.pils, qty: 2 }, { item_id: w.items.cola, qty: 1 }],
    });
    expect(o.status, JSON.stringify(o.body)).toBe(201);
    bizDate = o.body.business_date;
    expect(o.body.vat_groups).toEqual([{ vat_rate_bp: 2100, gross_cents: 600, net_cents: 496, vat_cents: 104, vat_due: true }]);
    expect(o.body.gross_cents).toBe(600);
    expect(o.body.tip_tokens).toBe(1);
    expect(o.body.receipt_no).toBe(1);

    // mixed rates: 1 frites (12 %) at the food stand + 1 cone takeaway (6 %) at ice cream
    const o2 = await w.as('admin').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.food, tag, lines: [{ item_id: w.items.frites, qty: 1 }] });
    expect(o2.body.vat_groups).toEqual([{ vat_rate_bp: 1200, gross_cents: 600, net_cents: 536, vat_cents: 64, vat_due: true }]);
    const o3 = await w.as('admin').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.ice, tag, lines: [{ item_id: w.items.cone, qty: 1 }] });
    expect(o3.body.vat_groups[0]).toMatchObject({ vat_rate_bp: 600, gross_cents: 400, vat_cents: 23, net_cents: 377 });
    // consumption mode override changes the rate: cone on site = 12 %
    const o4 = await w.as('admin').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.ice, tag, consumption_mode: 'on_site', lines: [{ item_id: w.items.cone, qty: 1 }] });
    expect(o4.body.vat_groups[0]).toMatchObject({ vat_rate_bp: 1200, gross_cents: 400, vat_cents: 43 });

    const z = await w.as('vendor').get(`/events/${w.eventId}/reports/z?stand_id=${w.stands.bar}&business_date=${bizDate}`);
    expect(z.status).toBe(200);
    expect(z.body).toMatchObject({ sealed: false, z_no: null, orders_count: 1, gross_cents: 600, net_cents: 496, vat_cents: 104, tips_tokens: 1, total_tokens: 3 });

    const vat = await w.as('auditor').get(`/events/${w.eventId}/reports/vat`);
    const byRate = Object.fromEntries(vat.body.rows.map((r: any) => [r.vat_rate_bp + ':' + r.stand_id, r.vat_cents]));
    expect(byRate['2100:' + w.stands.bar]).toBe(104);
    expect(vat.body.totals).toEqual({ gross_cents: 600 + 600 + 400 + 400, net_cents: 496 + 536 + 377 + 357, vat_cents: 104 + 64 + 23 + 43 });
    expect(vat.body.rows.find((r: any) => r.vat_rate_bp === 2100).box).toBe('03');

    const sales = await w.as('auditor').get(`/events/${w.eventId}/reports/sales?group_by=vat_rate`);
    expect(sales.body.totals.gross_cents).toBe(2000);
    expect(sales.body.totals.vat_cents).toBe(234);
    const byItem = await w.as('auditor').get(`/events/${w.eventId}/reports/sales?group_by=item`);
    expect(byItem.body.totals.gross_cents).toBe(2000);
    expect(byItem.body.rows.find((r: any) => r.label === 'Pils 25cl').qty).toBe(2);
    const byStand = await w.as('vendor').get(`/events/${w.eventId}/reports/sales?group_by=stand`);
    expect(byStand.body.rows).toHaveLength(1);                       // vendors only see their own stand

    const tops = await w.as('auditor').get(`/events/${w.eventId}/reports/topups`);
    const cash = tops.body.by_method.find((m: any) => m.payment_method === 'cash');
    const sumup = tops.body.by_method.find((m: any) => m.payment_method === 'sumup_card');
    expect(cash).toMatchObject({ count: 1, gross_cents: 4000, tokens: 20 });
    expect(sumup).toMatchObject({ count: 1, gross_cents: 1000 });

    const liab = await w.as('auditor').get(`/events/${w.eventId}/reports/liability`);
    // 25 tokens issued - (3+1) bar - 3 food - 2 ice - 2 ice = 25 - 4 - 3 - 2 - 2 = 14 outstanding; tip 1 payable
    expect(liab.body).toMatchObject({ outstanding_tokens: 14, outstanding_cents: 2800, tips_payable_tokens: 1, wallets_with_balance: 2 });

    const tips = await w.as('auditor').get(`/events/${w.eventId}/reports/tips?group_by=stand`);
    expect(tips.body).toMatchObject({ payable_tokens: 1, paid_tokens: 0 });
    expect(tips.body.rows.find((r: any) => r.key === w.stands.bar)).toMatchObject({ tip_tokens: 1, tip_cents: 200 });

    const red = await w.as('auditor').get(`/organizers/${w.organizerId}/reports/redemption-volume`);
    expect(red.body).toMatchObject({ redeemed_cents_12m: 1800 + 200 + 0, status: 'ok', warn_threshold_cents: 80000000 });
    const v = await verifyOk(w);
    expect(v.ok, JSON.stringify(v)).toBe(true);
  });

  it('refund shows as negative VAT; Z nets refunds', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 10);
    const o = await w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty: 2 }] });
    const before = (await w.as('vendor').get(`/events/${w.eventId}/reports/z?stand_id=${w.stands.bar}&business_date=${o.body.business_date}`)).body;
    const r = await w.as('vendor').post(`/orders/${o.body.id}/refunds`, { client_tx_id: uuidv7(), reason_code: 'customer_request', lines: [{ line_no: 1, qty: 1 }] });
    expect(r.body.gross_cents).toBe(200);
    const over = await w.as('vendor').post(`/orders/${o.body.id}/refunds`, { client_tx_id: uuidv7(), reason_code: 'customer_request', lines: [{ line_no: 1, qty: 2 }] });
    expect(over.body.code).toBe('REFUND_EXCEEDS_ORIGINAL');
    const after = (await w.as('vendor').get(`/events/${w.eventId}/reports/z?stand_id=${w.stands.bar}&business_date=${o.body.business_date}`)).body;
    expect(after.gross_cents).toBe(before.gross_cents - 200);
    expect(after.refunds_count).toBe(before.refunds_count + 1);
    expect(after.vat_cents).toBe(before.vat_cents - 35);   // 200 @21 % = 35
    const other = await w.as('vendor').post(`/orders/${o.body.id}/refunds`, { client_tx_id: uuidv7(), reason_code: 'customer_request' });
    expect(other.status).toBe(201);                          // the remaining 1 x cola
  });

  it('Z seal: gapless z_no, grand total, chained, immutable, once per stand/day, blocked by pending offline ops', async () => {
    const date = bizDate;
    await w.api(w.devices.bar.token).get('/auth/staff', { 'x-pending-offline-ops': '2' });
    const blocked = await w.as('vendor').post(`/events/${w.eventId}/z-reports`, { client_tx_id: uuidv7(), stand_id: w.stands.bar, business_date: date });
    expect(blocked.body.code).toBe('PENDING_OFFLINE_OPERATIONS');
    await w.api(w.devices.bar.token).get('/auth/staff', { 'x-pending-offline-ops': '0' });

    const body = { client_tx_id: uuidv7(), stand_id: w.stands.bar, business_date: date };
    const prev = (await w.as('vendor').get(`/events/${w.eventId}/reports/z?stand_id=${w.stands.bar}&business_date=${date}`)).body;
    const s1 = await w.as('vendor').post(`/events/${w.eventId}/z-reports`, body);
    expect(s1.status, JSON.stringify(s1.body)).toBe(201);
    expect(s1.body).toMatchObject({ sealed: true, z_no: 1, gross_cents: prev.gross_cents, orders_count: prev.orders_count });
    expect(s1.body.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(s1.body.grand_total_cents).toBe(prev.gross_cents);
    const replay = await w.as('vendor').post(`/events/${w.eventId}/z-reports`, body);
    expect(replay.status).toBe(200);
    expect(replay.body).toEqual(s1.body);
    const again = await w.as('vendor').post(`/events/${w.eventId}/z-reports`, { ...body, client_tx_id: uuidv7() });
    expect(again.body.code).toBe('Z_ALREADY_SEALED');
    const other = await w.as('vendor').post(`/events/${w.eventId}/z-reports`, { ...body, client_tx_id: uuidv7(), stand_id: w.stands.food });
    expect(other.status).toBe(403);                        // vendor of the bar cannot seal the food stand
    const food = await w.as('admin').post(`/events/${w.eventId}/z-reports`, { ...body, client_tx_id: uuidv7(), stand_id: w.stands.food });
    expect(food.body).toMatchObject({ z_no: 1 });
    expect(food.body.prev_hash).toBe(s1.body.hash);       // event-wide Z chain
    const list = await w.as('auditor').get(`/events/${w.eventId}/z-reports`);
    expect(list.body.items.map((z: any) => z.z_seq)).toEqual([1, 2]);
    await expect(w.owner`UPDATE z_reports SET payload = 'x'`).rejects.toMatchObject({ code: 'JT005' });
    const anchors = await w.owner`SELECT count(*)::int AS n FROM chain_anchors WHERE event_id = ${w.eventId}`;
    expect(anchors[0]!.n).toBe(2);
  });

  it('exports: every dataset is CSV with a header, is logged, and tag UIDs are only HMACs', async () => {
    const sets = ['journal', 'postings', 'orders', 'order_lines', 'topups', 'cashouts', 'tips', 'tips_payouts', 'vat_daily', 'fec', 'accounting', 'z_reports', 'flags'];
    for (const d of sets) {
      const r = await w.as('auditor').get(`/events/${w.eventId}/exports/${d}`);
      expect(r.status, d).toBe(200);
      expect(r.headers['content-disposition']).toContain(`${d}.csv`);
      expect(r.text.split('\n')[0]!.split(';').length).toBeGreaterThan(2);
    }
    const orders = await w.as('auditor').get(`/events/${w.eventId}/exports/orders`);
    expect(orders.text).not.toMatch(/04[0-9A-F]{12}/);
    const logged = await w.owner`SELECT count(*)::int AS n FROM export_log WHERE event_id = ${w.eventId}`;
    expect(logged[0]!.n).toBeGreaterThanOrEqual(sets.length);
    const vd = await w.as('auditor').get(`/events/${w.eventId}/exports/vat_daily`);
    expect(vd.text).toContain('2100');
    expect((await w.as('vendor').get(`/events/${w.eventId}/exports/journal`)).status).toBe(403);
  });
});
