import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { makeWorld, verifyOk, type World } from './helpers.js';
import { uuidv7 } from '../src/util/ids.js';
import { verifyCsvExports, verifyEventChain } from '../src/ledger/verify.js';
import { createSql } from '../src/db.js';

let w: World;
beforeAll(async () => { w = await makeWorld(); });
afterAll(async () => { await w.close(); });

const order = (w: World, tag: any, lines: any[], extra: any = {}) =>
  w.as('vendor').post('/orders', { client_tx_id: uuidv7(), stand_id: w.stands.bar, tag, lines, age_check_confirmed: true, ...extra });

describe('ledger invariants', () => {
  it('top-up, sale with tip, refund, cash-out: every journal balances per unit, chain verifies, liability reconciles', async () => {
    const tag = await w.newTag();
    expect((await w.topup(tag, 20)).status).toBe(201);
    const o = await order(w, tag, [{ item_id: w.items.pils, qty: 2 }, { item_id: w.items.cola, qty: 1 }], { tip_tokens: 1, expected_total_tokens: 4 });
    expect(o.status, JSON.stringify(o.body)).toBe(201);
    expect(o.body.items_tokens).toBe(3);
    expect(o.body.total_tokens).toBe(4);
    expect(o.body.balance_tokens).toBe(16);
    const r = await w.as('vendor').post(`/orders/${o.body.id}/refunds`, { client_tx_id: uuidv7(), reason_code: 'customer_request', lines: [{ line_no: 1, qty: 1 }], include_tip: true });
    expect(r.status, JSON.stringify(r.body)).toBe(201);
    expect(r.body.kind).toBe('refund');
    expect(r.body.balance_tokens).toBe(18);
    const c = await w.as('cashier').post('/cashouts', { client_tx_id: uuidv7(), tag, method: 'cash', reason_code: 'customer_request', tokens: 10 });
    expect(c.status, JSON.stringify(c.body)).toBe(201);
    expect(c.body.amount_cents).toBe(2000);

    const bad = await w.owner`SELECT journal_id, unit, sum(amount)::bigint AS s FROM postings WHERE event_id = ${w.eventId} GROUP BY journal_id, unit HAVING sum(amount) <> 0`;
    expect(bad).toHaveLength(0);
    const v = await verifyOk(w);
    expect(v.ok, JSON.stringify(v)).toBe(true);
    expect(v.checks.map((c: any) => c.name)).toContain('independent_hash_chain_recompute');
    expect(v.checks.every((c: any) => c.ok)).toBe(true);
  });

  it('no negative balance online', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 2);
    const o = await order(w, tag, [{ item_id: w.items.cola, qty: 3 }]);
    expect(o.status).toBe(409);
    expect(o.body.code).toBe('INSUFFICIENT_BALANCE');
    expect(o.body.details).toMatchObject({ balance_tokens: 2 });
    const bal = await w.as('cashier').get(`/tags/${tag.tag_code}?uid=${tag.uid}`);
    expect(bal.body.balance_tokens).toBe(2);
    expect((await w.owner`SELECT 1 FROM v_negative_wallets WHERE event_id = ${w.eventId}`).length).toBe(0);
  });

  it('TypeScript hash chain implementation agrees with SQL, also on the CSV exports', async () => {
    const sql = createSql(process.env.DATABASE_URL_OWNER!, 2);
    const res = await verifyEventChain(sql, w.eventId);
    expect(res.ok, res.reason ?? '').toBe(true);
    expect(res.checked).toBeGreaterThan(3);
    const j = await w.as('auditor').get(`/events/${w.eventId}/exports/journal`);
    const p = await w.as('auditor').get(`/events/${w.eventId}/exports/postings`);
    expect(j.status).toBe(200);
    expect(j.headers['content-type']).toContain('text/csv');
    const csv = verifyCsvExports(w.eventId, j.text, p.text);
    expect(csv.ok, csv.reason ?? '').toBe(true);
    expect(csv.checked).toBe(res.checked);
    // tamper with one amount in the export: verification fails at that journal
    const tampered = p.text.replace(/;(-?\d+)\n/, (_m, a) => `;${Number(a) + 1}\n`);
    expect(verifyCsvExports(w.eventId, j.text, tampered).ok).toBe(false);
    await sql.end();
  });

  it('ledger is append-only for the runtime role and the owner (triggers)', async () => {
    const rt = createSql(process.env.DATABASE_URL!, 1);
    await expect(rt`UPDATE postings SET amount = amount + 1`).rejects.toThrow();
    await expect(rt`DELETE FROM journal`).rejects.toThrow();
    await expect(rt`INSERT INTO journal(id, event_id, seq, kind, client_tx_id, occurred_at, effective_at, prev_hash, hash)
                    VALUES (gen_random_uuid(), ${w.eventId}, 999, 'topup', gen_random_uuid(), now(), now(), sha256('a'), sha256('b'))`).rejects.toThrow();
    await expect(w.owner`UPDATE journal SET kind = kind`).rejects.toMatchObject({ code: 'JT005' });
    await expect(w.owner`DELETE FROM orders`).rejects.toMatchObject({ code: 'JT005' });
    await rt.end();
  });

  it('reversal appends a negating journal, can only happen once, and nets the sale out of reports', async () => {
    const tag = await w.newTag();
    await w.topup(tag, 10);
    const o = await order(w, tag, [{ item_id: w.items.cola, qty: 2 }]);
    const before = await w.as('auditor').get(`/events/${w.eventId}/reports/vat`);
    const orig = await w.as('admin').get(`/journals/${o.body.journal_id}`);
    const rev = await w.as('cashier').post(`/journals/${o.body.journal_id}/reversals`, { client_tx_id: uuidv7(), reason_code: 'cashier_error', note: 'oops' });
    expect(rev.status, JSON.stringify(rev.body)).toBe(201);
    expect(rev.body.kind).toBe('reversal');
    expect(rev.body.reverses_journal_id).toBe(o.body.journal_id);
    const sum = (js: any) => Object.fromEntries(js.postings.map((p: any) => [p.account_id, p.amount]));
    const a = sum(orig.body), b = sum(rev.body);
    for (const k of Object.keys(a)) expect(b[k]).toBe(-a[k]);
    const again = await w.as('admin').post(`/journals/${o.body.journal_id}/reversals`, { client_tx_id: uuidv7(), reason_code: 'cashier_error' });
    expect(again.body.code).toBe('ALREADY_REVERSED');
    const after = await w.as('auditor').get(`/events/${w.eventId}/reports/vat`);
    expect(after.body.totals.gross_cents).toBe(before.body.totals.gross_cents - 400);
    expect((await w.as('cashier').get(`/tags/${tag.tag_code}?uid=${tag.uid}`)).body.balance_tokens).toBe(10);
    expect((await verifyOk(w)).ok).toBe(true);
  });

  it('training devices post on shadow accounts and never touch production figures', async () => {
    const tw = await makeWorld();
    try {
      const d = await tw.owner<{ id: string }[]>`SELECT id FROM devices WHERE event_id = ${tw.eventId} AND kind = 'cashdesk'`;
      await tw.owner`UPDATE devices SET training = false WHERE id = ${d[0]!.id}`.catch(() => undefined); // immutable: expected to fail
      // enrol a training cash desk via the API
      const code = await tw.as('admin').post(`/events/${tw.eventId}/enrollment-codes`, { kind: 'cashdesk', stand_id: tw.stands.desk, training: true });
      expect(code.status).toBe(201);
      const enr = await tw.api('x').post('/auth/devices/enroll', { enrollment_code: code.body.code, device_name: 'Trainer', platform: 'web' });
      expect(enr.status).toBe(201);
      expect(enr.body.training).toBe(true);
      const login = await tw.api(enr.body.device_token).post('/auth/login', { staff_id: tw.staff.cashier, pin: '1234' });
      expect(login.status).toBe(200);
      const tag = await tw.newTag();
      const t = await tw.api(login.body.access_token).post('/topups', { client_tx_id: uuidv7(), tag, payment_method: 'cash', amount_cents: 2000 });
      expect(t.status, JSON.stringify(t.body)).toBe(201);
      expect(t.body.training).toBe(true);
      expect(t.body.receipt_no).toBeNull();
      const liab = await tw.as('auditor').get(`/events/${tw.eventId}/reports/liability`);
      expect(liab.body.outstanding_tokens).toBe(0);
      expect((await tw.as('cashier').get(`/tags/${tag.tag_code}?uid=${tag.uid}`)).body.balance_tokens).toBe(0);
      expect((await verifyOk(tw)).ok).toBe(true);
    } finally { await tw.close(); }
  });
});
