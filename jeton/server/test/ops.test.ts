import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeWorld, verifyOk, type World } from './helpers.js';
import { uuidv7 } from '../src/util/ids.js';
import { loadContract } from '../src/contract.js';

let w: World;
beforeAll(async () => { w = await makeWorld(); });
afterAll(async () => { await w.close(); });

describe('catalog, tags, public page', () => {
  it('catalog snapshot with ETag / 304; item writes bump the version; VAT table included', async () => {
    const a = await w.as('vendor').get(`/events/${w.eventId}/catalog`);
    expect(a.status).toBe(200);
    expect(a.headers.etag).toBe(`"${a.body.catalog_version}"`);
    expect(a.body.items.find((i: any) => i.name === 'Pils 25cl').price_cents).toBe(200);
    expect(a.body.vat_rates.length).toBeGreaterThan(10);
    expect(a.body.event.id).toBe(w.eventId);
    const b = await w.as('vendor').get(`/events/${w.eventId}/catalog`, { 'if-none-match': a.headers.etag as string });
    expect(b.status).toBe(304);
    const id = uuidv7();
    const put = await w.as('admin').put(`/events/${w.eventId}/items/${id}`, { id, stand_id: w.stands.bar, category_id: (a.body.categories[0].id), name: 'Jus', price_tokens: 1, vat_category: 'DRINK_SOFT' });
    expect(put.status, JSON.stringify(put.body)).toBe(201);
    expect((await w.as('admin').put(`/events/${w.eventId}/items/${id}`, { id, stand_id: w.stands.bar, category_id: a.body.categories[0].id, name: 'Jus', price_tokens: 2, vat_category: 'DRINK_SOFT' })).status).toBe(200);
    const c = await w.as('vendor').get(`/events/${w.eventId}/catalog`, { 'if-none-match': a.headers.etag as string });
    expect(c.status).toBe(200);
    expect(Number(c.body.catalog_version)).toBeGreaterThan(a.body.catalog_version);
    expect((await w.as('vendor').put(`/events/${w.eventId}/items/${id}`, {})).status).toBe(403);
  });

  it('tag provisioning, lookup (UID binding), block, replace', async () => {
    const enr = await w.as('cashier').post('/tags/enroll', { client_tx_id: uuidv7(), uid: '04112233445566', chip_type: 'ntag215' });
    expect(enr.status).toBe(201);
    expect(enr.body.tag_code).toMatch(/^[0-9A-HJKMNP-TV-Z]{19}[0G]$/);
    const code = enr.body.tag_code;
    const early = await w.as('cashier').get(`/tags/${code}?uid=04112233445566`);
    expect(early.body.code).toBe('TAG_NOT_ACTIVE');
    const noRead = await w.as('cashier').post(`/tags/${code}/confirm`, { client_tx_id: uuidv7(), uid: '04112233445566', readback_ok: false });
    expect(noRead.status).toBe(400);
    const conf = await w.as('cashier').post(`/tags/${code}/confirm`, { client_tx_id: uuidv7(), uid: '04112233445566', readback_ok: true, password_protected: true });
    expect(conf.body).toMatchObject({ tag_status: 'active', wallet_status: 'new', balance_tokens: 0 });
    const reEnr = await w.as('cashier').post('/tags/enroll', { client_tx_id: uuidv7(), uid: '04112233445566', chip_type: 'ntag215' });
    expect(reEnr.body.code).toBe('TAG_ALREADY_ENROLLED');
    const clone = await w.as('vendor').get(`/tags/${code}?uid=04AAAAAAAAAAAA`);
    expect(clone.status).toBe(409);
    expect(clone.body.code).toBe('TAG_UID_MISMATCH');
    expect(JSON.stringify(clone.body)).not.toContain('04112233445566');

    const tag = { tag_code: code, uid: '04112233445566' };
    await w.topup(tag, 8);
    const blk = await w.as('cashier').post(`/tags/${code}/status`, { client_tx_id: uuidv7(), status: 'blocked', reason_code: 'lost_tag' });
    expect(blk.body.wallet_status).toBe('blocked');
    expect((await w.as('vendor').get(`/tags/${code}?uid=${tag.uid}`)).status).toBe(423);
    expect((await w.as('cashier').get(`/tags/${code}?uid=${tag.uid}`)).status).toBe(200);
    expect((await w.topup(tag, 1)).status).toBe(423);
    const fresh = await w.newTag();
    const rep = await w.as('cashier').post(`/tags/${code}/replace`, { client_tx_id: uuidv7(), new_tag: fresh, reason_code: 'tag_replacement' });
    expect(rep.status, JSON.stringify(rep.body)).toBe(201);
    expect(rep.body).toMatchObject({ moved_tokens: 8 });
    expect(rep.body.journal_seq).toBeGreaterThan(0);
    expect(rep.body.new_tag.balance_tokens).toBe(8);
    expect(rep.body.old_tag.balance_tokens).toBe(0);
    // empty wallet: nothing to move => journal_seq null
    const e1 = await w.newTag(), e2 = await w.newTag();
    const empty = await w.as('cashier').post(`/tags/${e1.tag_code}/replace`, { client_tx_id: uuidv7(), new_tag: e2, reason_code: 'tag_replacement' });
    expect(empty.body.journal_seq).toBeNull();
    const hist = await w.as('cashier').get(`/tags/${fresh.tag_code}/transactions`);
    expect(hist.body.items[0]).toMatchObject({ kind: 'tag_replacement', delta_tokens: 8, balance_after_tokens: 8 });
    expect((await verifyOk(w)).ok).toBe(true);
  });

  it('public balance page: no auth, no-store, noindex, no staff data, 404 oracle-free, rate limited', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 10);
    await w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines: [{ item_id: w.items.cola, qty: 2 }] });
    const r = await w.api('').get(`/public/tags/${tag.tag_code}`);
    expect(r.status).toBe(200);
    expect(r.headers['cache-control']).toBe('no-store');
    expect(r.headers['x-robots-tag']).toContain('noindex');
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(r.body).toMatchObject({ balance_tokens: 8, balance_cents: 1600, token_price_cents: 200, status: 'active' });
    expect(r.body.recent[0]).toMatchObject({ kind: 'sale', delta_tokens: -2, stand_name: 'Bar', receipt_no: 1, items: [{ name: 'Cola', qty: 2 }] });
    expect(JSON.stringify(r.body)).not.toContain(tag.uid);
    expect(JSON.stringify(r.body)).not.toContain(w.staff.vendor);
    const unknown = await w.api('').get('/public/tags/0123456789ABCDEFGHJ0');
    const malformed = await w.api('').get('/public/tags/nope');
    expect(unknown.status).toBe(404);
    expect(malformed.status).toBe(404);
    expect(unknown.body.code).toBe(malformed.body.code);
    const lim = await makeWorld({ cfg: { PUBLIC_RATE_LIMIT_MAX: 3, PUBLIC_RATE_LIMIT_WINDOW_MS: 60000 } });
    try {
      const codes: number[] = [];
      for (let i = 0; i < 5; i++) codes.push((await lim.api('').get('/public/tags/0123456789ABCDEFGHJ0')).status);
      expect(codes).toEqual([404, 404, 404, 429, 429]);
      const rl = await lim.api('').get('/public/tags/0123456789ABCDEFGHJ0');
      expect(rl.body.code).toBe('RATE_LIMITED');
      expect(Number(rl.headers['retry-after'])).toBeGreaterThan(0);
    } finally { await lim.close(); }
  });
});

describe('top-up rules', () => {
  it('amount multiple of price, limits, promo admin only, event state', async () => {
    const tag = await w.newTag();
    const bad = await w.as('cashier').post('/topups', { client_tx_id: uuidv7(), tag, payment_method: 'cash', amount_cents: 300 });
    expect(bad.body.code).toBe('INVALID_AMOUNT');
    const big = await w.as('cashier').post('/topups', { client_tx_id: uuidv7(), tag, payment_method: 'cash', amount_cents: 200 * 51 });
    expect(big.body).toMatchObject({ code: 'LIMIT_EXCEEDED', details: { limit: 50, would_be: 51 } });
    await w.topup(tag, 50); await w.topup(tag, 50);
    const over = await w.topup(tag, 1);
    expect(over.body).toMatchObject({ code: 'LIMIT_EXCEEDED', details: { limit: 100, would_be: 101 } });
    const promoC = await w.as('cashier').post('/topups', { client_tx_id: uuidv7(), tag: await w.newTag(), payment_method: 'promo', amount_cents: 400 });
    expect(promoC.status).toBe(403);
    const t2 = await w.newTag();
    const promo = await w.as('admin').post('/topups', { client_tx_id: uuidv7(), tag: t2, payment_method: 'promo', amount_cents: 400 });
    expect(promo.status, JSON.stringify(promo.body)).toBe(201);
    expect(promo.body.balance_tokens).toBe(2);
    expect((await w.as('auditor').get(`/events/${w.eventId}/reports/liability`)).body.promo_issued_tokens).toBe(2);
    const dw = await makeWorld({ status: 'draft' });
    try {
      const t = await dw.newTag();
      expect((await dw.topup(t, 1)).body.code).toBe('EVENT_NOT_OPEN');
    } finally { await dw.close(); }
    expect((await verifyOk(w)).ok).toBe(true);
  });

  it('single-purpose voucher events book VAT at top-up and release it at redemption', async () => {
    const sw = await makeWorld({ event: { voucher_type: 'single_purpose', single_purpose_vat_category: 'FOOD' } });
    try {
      const t = await sw.newTag();
      const r = await sw.topup(t, 10);
      expect(r.body.vat_cents).toBe(214);                       // 2000 @12 % = 214
      const o = await sw.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: sw.stands.bar, tag: t, lines: [{ item_id: sw.items.cola, qty: 2 }] });
      expect(o.body.vat_groups[0].vat_due).toBe(false);
      const v = await sw.as('auditor').get(`/events/${sw.eventId}/reports/vat`);
      expect(v.body.voucher_type).toBe('single_purpose');
      expect(v.body.totals.vat_cents).toBe(214);
      expect((await verifyOk(sw)).ok).toBe(true);
    } finally { await sw.close(); }
  });
});

describe('cash desk', () => {
  it('cash-out rules, sessions with variance, movements, PSP settlement, tips payout', async () => {
    const tag = await w.newTag();
    const card = await w.newTag();
    await w.topup(tag, 10);                    // cash
    await w.topup(card, 5, 'sumup_card');
    const co = (t: any, extra: any) => w.as('cashier').post('/cashouts', { client_tx_id: uuidv7(), tag: t, method: 'cash', reason_code: 'customer_request', ...extra });
    expect((await co(card, {})).body.code).toBe('REFUND_METHOD_LIMIT');             // card top-ups cannot be refunded in cash
    expect((await co(tag, { tokens: 99 })).body.code).toBe('INSUFFICIENT_BALANCE');
    const bank = await co(card, { method: 'bank_transfer' });
    expect(bank.body.code).toBe('VALIDATION_ERROR');
    const bank2 = await co(card, { method: 'bank_transfer', tokens: 2, contact: { name: 'A', iban: 'BE68539007547034' } });
    expect(bank2.status, JSON.stringify(bank2.body)).toBe(201);
    expect(bank2.body.refund_contact_id).toBeTruthy();
    const enc = await w.owner`SELECT contact_enc, iban_enc FROM refund_contacts`;
    expect(Buffer.from(enc[0]!.iban_enc).toString('utf8')).not.toContain('BE68');
    await w.owner`UPDATE events SET refundable_until = now() - interval '1 hour' WHERE id = ${w.eventId}`;
    expect((await co(tag, { tokens: 1 })).body.code).toBe('REFUND_WINDOW_CLOSED');
    await w.owner`UPDATE events SET refundable_until = NULL WHERE id = ${w.eventId}`;

    // sessions: float 50, cash top-up 20, cash-out of 4 tokens (8) => expected 50 + 20 ... counted 61.00 => +1 variance
    const s = await w.as('cashier').post('/cashdesk-sessions', { client_tx_id: uuidv7(), cashdesk_id: w.stands.desk, opening_float_cents: 5000 });
    expect(s.status, JSON.stringify(s.body)).toBe(201);
    expect((await w.as('cashier').post('/cashdesk-sessions', { client_tx_id: uuidv7(), cashdesk_id: w.stands.desk, opening_float_cents: 0 })).body.code).toBe('SESSION_ALREADY_OPEN');
    const t3 = await w.newTag();
    await w.topup(t3, 10);                     // +2000
    expect((await co(t3, { tokens: 4 })).status).toBe(201);   // -800
    const mv = await w.as('cashier').post('/cash-movements', { client_tx_id: uuidv7(), cashdesk_id: w.stands.desk, session_id: s.body.id, movement: 'pay_out', amount_cents: 300, reason_code: 'other' });
    expect(mv.status).toBe(201);
    // expected = 5000 + 2000 - 800 - 300 = 5900 ; counted 61.00 = 6100 => +200
    const cl = await w.as('cashier').post(`/cashdesk-sessions/${s.body.id}/close`, { client_tx_id: uuidv7(), counted_breakdown: { '5000': 1, '500': 2, '100': 1 } });
    expect(cl.status, JSON.stringify(cl.body)).toBe(200);
    expect(cl.body).toMatchObject({ expected_cents: 5900, counted_cents: 6100, variance_cents: 200, variance_acknowledged: false });
    const today = (await w.owner<{ d: string }[]>`SELECT business_date::text AS d FROM topups WHERE event_id = ${w.eventId} ORDER BY created_at DESC LIMIT 1`)[0]!.d;
    const zBlocked = await w.as('cashier').post(`/events/${w.eventId}/z-reports`, { client_tx_id: uuidv7(), stand_id: w.stands.desk, business_date: today });
    expect(zBlocked.body.code).toBe('CASH_VARIANCE_UNACKNOWLEDGED');
    expect((await w.as('cashier').post(`/cashdesk-sessions/${s.body.id}/ack`)).status).toBe(403);
    expect((await w.as('admin').post(`/cashdesk-sessions/${s.body.id}/ack`)).body.variance_acknowledged).toBe(true);
    const zOk = await w.as('cashier').post(`/events/${w.eventId}/z-reports`, { client_tx_id: uuidv7(), stand_id: w.stands.desk, business_date: today });
    expect(zOk.status, JSON.stringify(zOk.body)).toBe(201);
    expect(zOk.body.by_method.find((m: any) => m.payment_method === 'cash').topups_cents).toBeGreaterThan(0);
    expect(zOk.body.cash_reconciliation).toMatchObject({ variance_cents: 200 });

    // PSP settlement: sumup_card topup (EXT-...) 1000 matched, one unknown line
    const ref = (await w.owner<{ r: string }[]>`SELECT external_ref AS r FROM topups WHERE event_id = ${w.eventId} AND payment_method = 'sumup_card' AND amount_cents = 1000 ORDER BY created_at LIMIT 1`)[0]!.r;
    const ps = await w.as('admin').post(`/events/${w.eventId}/psp-settlements`, {
      client_tx_id: uuidv7(), method: 'sumup_card', payout_ref: 'PAYOUT-1', payout_date: today,
      lines: [{ psp_ref: ref, gross_cents: 1000, fee_cents: 19 }, { psp_ref: 'UNKNOWN', gross_cents: 500, fee_cents: 9 }],
    });
    expect(ps.status, JSON.stringify(ps.body)).toBe(201);
    expect(ps.body).toMatchObject({ gross_cents: 1500, fee_cents: 28, net_cents: 1472, matched: 1, unmatched: [{ psp_ref: 'UNKNOWN', gross_cents: 500 }] });
    const rep = await w.as('auditor').get(`/events/${w.eventId}/reports/topups`);
    expect(rep.body.unmatched_psp_lines).toBe(1);
    expect(rep.body.by_method.find((m: any) => m.payment_method === 'sumup_card')).toMatchObject({ psp_fees_cents: 28, paid_out_cents: 1472 });

    // tips payout
    const payable = (await w.as('auditor').get(`/events/${w.eventId}/reports/tips`)).body.payable_tokens;
    const tipTag = await w.newTag();
    await w.topup(tipTag, 10);
    await w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag: tipTag, tip_tokens: 2, lines: [{ item_id: w.items.cola, qty: 4 }] });
    const pay = await w.as('cashier').post('/tips-payouts', { client_tx_id: uuidv7(), stand_id: w.stands.bar, cashdesk_id: w.stands.desk, tokens: 2, method: 'cash', recipient_staff_id: w.staff.vendor });
    expect(pay.status, JSON.stringify(pay.body)).toBe(201);
    expect(pay.body).toMatchObject({ amount_cents: 400, tips_payable_after_tokens: payable });
    expect((await w.as('cashier').post('/tips-payouts', { client_tx_id: uuidv7(), stand_id: w.stands.bar, cashdesk_id: w.stands.desk, tokens: 9999, method: 'cash' })).body.code).toBe('INSUFFICIENT_BALANCE');
    const v = await verifyOk(w);
    expect(v.ok, JSON.stringify(v)).toBe(true);
  });

  it('receipts: first print original, later DUPLICATA; training/legal mentions', async () => {
    const tag = await w.newTag();
    const t = await w.topup(tag, 4);
    const p1 = await w.as('cashier').post(`/receipts/topup/${t.body.id}/prints`);
    expect(p1.body).toMatchObject({ duplicata: false, print_no: 1, receipt_no: t.body.receipt_no });
    expect(p1.body.legal_mentions.join(' ')).toContain('bon multi-usage');
    const p2 = await w.as('cashier').post(`/receipts/topup/${t.body.id}/prints`);
    expect(p2.body).toMatchObject({ duplicata: true, print_no: 2 });
    const o = await w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, tip_tokens: 1, lines: [{ item_id: w.items.cola, qty: 2 }] });
    const pr = await w.as('vendor').post(`/receipts/order/${o.body.id}/prints`);
    expect(pr.body.totals).toMatchObject({ tokens: 3, tip_tokens: 1, gross_cents: 400 });
    expect(pr.body.issued_by.legal_name).toBe('Test ASBL');
    expect(JSON.stringify(pr.body)).not.toMatch(/vendor [0-9a-f]{4}/);
  });
});

describe('events, close, payments, contract', () => {
  it('event close: needs Z + tips settled, books breakage (never VAT), then locks', async () => {
    const cw = await makeWorld();
    try {
      const t = await cw.newTag();
      await cw.topup(t, 10);
      const o = await cw.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: cw.stands.bar, tag: t, tip_tokens: 1, lines: [{ item_id: cw.items.cola, qty: 3 }] });
      const close = (disp: string) => cw.as('admin').post(`/events/${cw.eventId}/close`, { client_tx_id: uuidv7(), tips_disposition: disp });
      const c1 = await close('none_outstanding');
      expect(c1.body.code).toBe('CLOSE_PRECONDITION_FAILED');
      for (const stand of [cw.stands.bar, cw.stands.desk]) {
        const z = await cw.as('admin').post(`/events/${cw.eventId}/z-reports`, { client_tx_id: uuidv7(), stand_id: stand, business_date: o.body.business_date });
        expect(z.status, JSON.stringify(z.body)).toBe(201);
      }
      expect((await close('none_outstanding')).body.code).toBe('TIPS_OUTSTANDING');
      const vatBefore = (await cw.as('auditor').get(`/events/${cw.eventId}/reports/vat`)).body.totals;
      const ok = await close('assigned_to_donation');
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body).toMatchObject({ breakage_tokens: 6, breakage_cents: 1200, wallets_affected: 1 });
      expect(ok.body.final_chain_hash).toMatch(/^[0-9a-f]{64}$/);
      const liab = (await cw.as('auditor').get(`/events/${cw.eventId}/reports/liability`)).body;
      expect(liab).toMatchObject({ outstanding_tokens: 0, breakage_tokens: 6, breakage_cents: 1200, tips_payable_tokens: 0 });
      expect((await cw.as('auditor').get(`/events/${cw.eventId}/reports/vat`)).body.totals).toEqual(vatBefore);
      expect((await cw.topup(t, 1)).body.code).toBe('EVENT_CLOSED');
      expect((await cw.as('admin').put(`/events/${cw.eventId}`, {})).status).toBe(400);
      const v = await verifyOk(cw);
      expect(v.ok, JSON.stringify(v)).toBe(true);
      // post-closure adjustment: cashier refused, admin allowed + flagged, countersignatures
      const jr = await cw.as('admin').get(`/events/${cw.eventId}/journal?limit=1`);
      const jid = jr.body.items[0].id;
      expect((await cw.as('cashier').post(`/journals/${jid}/reversals`, { client_tx_id: uuidv7(), reason_code: 'other' })).body.code).toBe('REVERSAL_NOT_ALLOWED');
      const rev = await cw.as('admin').post(`/journals/${jid}/reversals`, { client_tx_id: uuidv7(), reason_code: 'other' });
      expect(rev.status, JSON.stringify(rev.body)).toBe(201);
      const flags = await cw.as('auditor').get(`/events/${cw.eventId}/flags`);
      expect(flags.body.items.map((f: any) => f.flag)).toContain('ADJUSTMENT_AFTER_CLOSE');
      await cw.as('admin').post(`/journals/${rev.body.id}/countersignature`);
      const cs = await cw.as('auditor').post(`/journals/${rev.body.id}/countersignature`);
      expect(cs.body.countersignatures.map((c: any) => c.role).sort()).toEqual(['admin', 'auditor']);
      const f = flags.body.items[0];
      expect((await cw.as('admin').post(`/flags/${f.id}/resolve`, { note: 'checked' })).body.resolved).toBe(true);
      expect((await cw.as('admin').post(`/flags/${f.id}/resolve`, { note: 'again' })).body.code).toBe('FLAG_ALREADY_RESOLVED');
    } finally { await cw.close(); }
  });

  it('events/staff admin: create event, immutable fields locked once journals exist', async () => {
    const id = uuidv7();
    const create = await w.as('admin').put(`/events/${id}`, { id, organizer_id: w.organizerId, name: 'Second', country: 'FR', token_price_cents: 100 });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    expect(create.body).toMatchObject({ status: 'draft', token_price_cents: 100, country: 'FR' });
    expect(create.body.warnings).toContain('UNVALIDATED_VAT_RATES');
    const locked = await w.as('admin').put(`/events/${w.eventId}`, { id: w.eventId, organizer_id: w.organizerId, name: 'x', country: 'BE', token_price_cents: 300 });
    expect(locked.status).toBe(409);
    expect(locked.body).toMatchObject({ code: 'EVENT_FIELD_LOCKED', details: { fields: ['token_price_cents'] } });
    const upd = await w.as('admin').put(`/events/${w.eventId}`, { id: w.eventId, organizer_id: w.organizerId, name: 'Renamed', country: 'BE', tip_max_tokens: 5 });
    expect(upd.status).toBe(200);
    expect(upd.body.tip_max_tokens).toBe(5);
    expect(upd.body.token_price_cents).toBe(200);
    await w.owner`UPDATE events SET tip_max_tokens = 10 WHERE id = ${w.eventId}`;
    const sid = uuidv7();
    const st = await w.as('admin').put(`/staff/${sid}`, { display_name: 'New', role: 'vendor' });
    expect(st.status).toBe(400);
    const st2 = await w.as('admin').put(`/staff/${sid}`, { display_name: 'New', role: 'vendor', pin: '5678' });
    expect(st2.status).toBe(201);
    expect(st2.body.event_ids).toEqual([w.eventId]);
    expect(JSON.stringify(st2.body)).not.toContain('5678');
    const list = await w.as('auditor').get(`/events/${w.eventId}/staff`);
    expect(list.body.items.some((s: any) => s.id === sid)).toBe(true);
    const evs = await w.as('admin').get('/events');
    expect(evs.body.items.map((e: any) => e.id)).toEqual(expect.arrayContaining([w.eventId, id]));
    expect((await w.as('vendor').get(`/events/${id}`)).status).toBe(403);
  });

  it('online checkout (fake PSP): create, webhook credits exactly once; amount mismatch is ignored', async () => {
    const tag = await w.newTag();
    const body = { client_tx_id: uuidv7(), tag, amount_cents: 2000 };
    const c = await w.as('cashier').post('/payments/checkouts', body);
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body).toMatchObject({ status: 'pending', amount_cents: 2000 });
    expect(c.body.hosted_url).toContain('https://pay.example/');
    const replay = await w.as('cashier').post('/payments/checkouts', body);
    expect(replay.status).toBe(200);
    expect(replay.body.id).toBe(c.body.id);
    expect((await w.as('cashier').get(`/payments/checkouts/${c.body.id}`)).body.status).toBe('pending');
    const providerId = [...w.fake.checkouts.keys()].pop()!;
    w.fake.pay(providerId, 'TXSUMUP1');
    const hook = (token = w.cfg.SUMUP_WEBHOOK_SECRET) => w.api('').post(`/webhooks/sumup?token=${token}`, { id: providerId, event_type: 'checkout.status.changed' });
    expect((await hook('wrong')).status).toBe(401);
    const results = await Promise.all([hook(), hook(), w.as('cashier').get(`/payments/checkouts/${c.body.id}`)]);
    expect(results[0]!.status).toBe(200);
    const after = await w.as('cashier').get(`/payments/checkouts/${c.body.id}`);
    expect(after.body).toMatchObject({ status: 'credited', external_ref: 'TXSUMUP1' });
    expect(after.body.topup).toMatchObject({ payment_method: 'sumup_online', tokens: 10, balance_tokens: 10, external_ref: 'TXSUMUP1' });
    const n = await w.owner`SELECT count(*)::int AS n FROM topups WHERE external_ref = 'TXSUMUP1'`;
    expect(n[0]!.n).toBe(1);
    // tampered amount at the PSP is never credited
    const t2 = await w.newTag();
    const c2 = await w.as('cashier').post('/payments/checkouts', { client_tx_id: uuidv7(), tag: t2, amount_cents: 400 });
    const pid2 = [...w.fake.checkouts.keys()].pop()!;
    w.fake.checkouts.get(pid2)!.amountCents = 200;
    w.fake.pay(pid2, 'TXBAD');
    expect((await w.as('cashier').get(`/payments/checkouts/${c2.body.id}`)).body.status).toBe('pending');
    w.fake.failCreate = true;
    const down = await w.as('cashier').post('/payments/checkouts', { client_tx_id: uuidv7(), tag: t2, amount_cents: 400 });
    w.fake.failCreate = false;
    expect(down.status).toBe(503);
    expect((await verifyOk(w)).ok).toBe(true);
  });

  it('every operation of the contract is routed and implemented (no 501 stubs)', async () => {
    const { ops } = loadContract(w.cfg.OPENAPI_PATH);
    expect(ops.length).toBe(65);
    expect(w.built.stubs).toEqual([]);
    for (const op of ops) expect(w.built.app.hasRoute({ method: op.method as 'GET', url: '/v1' + op.fastifyPath }), op.operationId).toBe(true);
  });
});
