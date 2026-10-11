import { inTx, lockEvent, type Q, type Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { addFlag, reverseJournal as reverseInLedger } from '../ledger/ledger.js';
import { verifyEventChain } from '../ledger/verify.js';
import { requestHash } from '../util/crypto.js';
import { uuidv7 } from '../util/ids.js';
import { Actor, businessDate, loadEvent, runIdempotent } from './common.js';
import { insertOrderFacts } from './orders.js';
import { decodeCursor, encodeCursor } from '../util/cursor.js';
import { page } from '../http.js';

const hex = (b: Buffer | Uint8Array): string => Buffer.from(b).toString('hex');

export async function fetchJournalEntries(tx: Q, ids: string[]): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const js = await tx<Row[]>`SELECT * FROM journal WHERE id = ANY(${ids}::uuid[])`;
  const ps = await tx<Row[]>`
    SELECT p.journal_id, p.line_no, p.account_id, a.code AS account_code, p.unit, p.amount
      FROM postings p JOIN accounts a ON a.id = p.account_id WHERE p.journal_id = ANY(${ids}::uuid[]) ORDER BY p.journal_id, p.line_no`;
  const cs = await tx<Row[]>`SELECT journal_id, role, staff_id, signed_at FROM journal_countersignatures WHERE journal_id = ANY(${ids}::uuid[])`;
  const by = new Map(js.map((j) => [j.id as string, j]));
  return ids.map((id) => {
    const j = by.get(id);
    if (!j) throw new AppError('NOT_FOUND', 'Unknown journal');
    return {
      id: j.id, seq: j.seq, kind: j.kind, client_tx_id: j.client_tx_id, device_id: j.device_id, staff_id: j.staff_id, offline: j.offline,
      training: j.training, client_created_at: j.client_created_at, occurred_at: j.occurred_at, effective_at: j.effective_at,
      reverses_journal_id: j.reverses_journal_id, reason_code: j.reason_code, prev_hash: hex(j.prev_hash), hash: hex(j.hash),
      postings: ps.filter((p) => p.journal_id === id).map((p) => ({
        line_no: p.line_no, account_id: p.account_id, account_code: p.account_code, unit: p.unit, amount: p.amount,
      })),
      countersignatures: cs.filter((c) => c.journal_id === id).map((c) => ({ role: c.role, staff_id: c.staff_id, signed_at: c.signed_at })),
    };
  });
}

export async function getJournal(tx: Q, eventId: string, journalId: string) {
  const r = await tx<Row[]>`SELECT id FROM journal WHERE id = ${journalId} AND event_id = ${eventId}`;
  if (!r[0]) throw new AppError('NOT_FOUND', 'Unknown journal');
  return (await fetchJournalEntries(tx, [journalId]))[0]!;
}

export async function listJournal(tx: Q, eventId: string, q: { after_seq: number; include_training: boolean; limit: number }) {
  const rows = await tx<Row[]>`
    SELECT id, seq FROM journal WHERE event_id = ${eventId} AND seq > ${q.after_seq} AND (${q.include_training} OR NOT training)
     ORDER BY seq LIMIT ${q.limit}`;
  const items = await fetchJournalEntries(tx, rows.map((r) => r.id as string));
  return { items, next_after_seq: rows.length ? rows[rows.length - 1]!.seq : q.after_seq };
}

// ───────────────────────────── reversal ─────────────────────────────

export function reverseJournal(app: AppCtx, a: Actor, journalId: string, body: { client_tx_id: string; reason_code: string; note?: string | null }) {
  return runIdempotent(app, a, { operation: 'journal.reverse:' + journalId, clientTxId: body.client_tx_id, body }, async (tx) => {
    const orig = (await tx<Row[]>`SELECT * FROM journal WHERE id = ${journalId} AND event_id = ${a.eventId}`)[0];
    if (!orig) throw new AppError('NOT_FOUND', 'Unknown journal');
    if (orig.kind === 'reversal') throw new AppError('REVERSAL_NOT_ALLOWED', 'A reversal cannot be reversed; post the operation again');
    if (orig.training !== a.training) throw new AppError('TRAINING_MODE_MISMATCH', 'Training and production data cannot be mixed');
    const already = await tx<Row[]>`SELECT 1 FROM journal WHERE reverses_journal_id = ${journalId}`;
    if (already.length > 0) throw new AppError('ALREADY_REVERSED', 'This journal has already been reversed');
    const ev = await loadEvent(tx, a.eventId);
    const closed = ev.status === 'closed';
    if (a.role === 'cashier') {
      if (closed) throw new AppError('REVERSAL_NOT_ALLOWED', 'After the event is closed only an admin can post adjustments');
      const today = await businessDate(tx, ev.timezone, new Date());
      const day = await businessDate(tx, ev.timezone, orig.effective_at);
      if (today !== day) throw new AppError('REVERSAL_NOT_ALLOWED', 'Cashiers can only reverse entries of the current business day');
    }
    const j = await reverseInLedger(
      tx,
      { id: orig.id, eventId: a.eventId, training: orig.training },
      {
        clientTxId: body.client_tx_id, requestHash: requestHash('journal.reverse:' + journalId, body), deviceId: a.deviceId, staffId: a.staffId,
        clientCreatedAt: null, offline: false, reasonCode: body.reason_code,
      },
    );
    if (body.note) await tx`INSERT INTO journal_notes(journal_id, note, created_by) VALUES (${j.journalId}, ${body.note}, ${a.staffId})`;
    if (closed) await addFlag(tx, a.eventId, j.journalId, 'ADJUSTMENT_AFTER_CLOSE', { reverses: journalId });
    await cloneOrderFactsForReversal(tx, orig, j.journalId, a);
    return { status: 201, body: (await fetchJournalEntries(tx, [j.journalId]))[0]!, journalId: j.journalId };
  });
}

/**
 * A reversed sale/refund must disappear from Z-reports, VAT and the stand grand total. Order facts are append-only, so the
 * reversal is mirrored by an order of the opposite kind (credit note) linked to the reversal journal; every view then nets out.
 */
async function cloneOrderFactsForReversal(tx: Q, orig: Row, reversalJournalId: string, a: Actor): Promise<void> {
  const o = (await tx<Row[]>`SELECT * FROM orders WHERE journal_id = ${orig.id}`)[0];
  if (!o) return;
  const lines = await tx<Row[]>`SELECT * FROM order_lines WHERE order_id = ${o.id} ORDER BY line_no`;
  const vats = await tx<Row[]>`SELECT * FROM order_vat WHERE order_id = ${o.id}`;
  const toRefund = o.kind === 'sale';
  await insertOrderFacts(tx, {
    id: uuidv7(), eventId: o.event_id, journalId: reversalJournalId, kind: toRefund ? 'refund' : 'sale', refundOf: toRefund ? o.id : null,
    walletId: o.wallet_id, standId: o.stand_id, deviceId: a.deviceId, staffId: a.staffId, override: o.consumption_mode_override,
    itemsTokens: o.items_tokens, tip: o.tip_tokens, gross: o.gross_cents, net: o.net_cents, vat: o.vat_cents, provisionalRef: null,
    vatDue: vats[0]?.vat_due ?? true,
    groups: vats.map((v) => ({ vat_rate_bp: v.vat_rate_bp, gross_cents: v.gross_cents, net_cents: v.net_cents, vat_cents: v.vat_cents })),
    lines: lines.map((l) => ({
      line_no: l.line_no, refund_of_line_no: toRefund ? l.line_no : null, item_id: l.item_id, item_name: l.item_name, category_id: l.category_id,
      category_name: l.category_name, qty: l.qty, unit_price_tokens: l.unit_price_tokens, vat_category: l.vat_category,
      consumption_mode: l.consumption_mode, vat_rate_bp: l.vat_rate_bp, gross_cents: l.gross_cents,
    })),
  });
}

export async function countersign(app: AppCtx, a: Actor, journalId: string) {
  return inTx(app.sql, async (tx) => {
    await lockEvent(tx, a.eventId);
    const j = await tx<Row[]>`SELECT id FROM journal WHERE id = ${journalId} AND event_id = ${a.eventId}`;
    if (!j[0]) throw new AppError('NOT_FOUND', 'Unknown journal');
    const f = await tx<Row[]>`SELECT 1 FROM ledger_flags WHERE journal_id = ${journalId} AND flag = 'ADJUSTMENT_AFTER_CLOSE'`;
    if (f.length === 0) throw new AppError('REVERSAL_NOT_ALLOWED', 'Only post-closure adjustments need a countersignature');
    const role = a.role === 'admin' ? 'admin' : 'auditor';
    await tx`INSERT INTO journal_countersignatures(journal_id, staff_id, role) VALUES (${journalId}, ${a.staffId}, ${role}) ON CONFLICT DO NOTHING`;
    return (await fetchJournalEntries(tx, [journalId]))[0]!;
  });
}

// ───────────────────────────── verification, head, flags ─────────────────────────────

export async function verifyLedger(app: AppCtx, eventId: string) {
  const sql = app.sql;
  const sqlV = (await sql<Row[]>`SELECT * FROM ledger_verify(${eventId})`)[0]!;
  const ts = await verifyEventChain(sql, eventId);
  const rec = await sql<Row[]>`SELECT * FROM ledger_reconcile(${eventId})`;
  const checks = [
    { name: 'sql_ledger_verify', ok: sqlV.ok as boolean, detail: sqlV.reason ?? `journals=${sqlV.checked}` },
    { name: 'independent_hash_chain_recompute', ok: ts.ok, detail: ts.reason ?? `journals=${ts.checked}` },
    ...rec
      .filter((r) => r.check_name !== 'hash_chain')
      .map((r) => ({ name: r.check_name as string, ok: r.ok as boolean, detail: r.detail as string })),
  ];
  const ok = checks.every((c) => c.ok);
  return {
    ok,
    journals_checked: sqlV.checked,
    head_seq: sqlV.ok ? sqlV.head_seq : null,
    head_hash: sqlV.ok && sqlV.head_hash ? hex(sqlV.head_hash) : null,
    first_bad_seq: sqlV.first_bad_seq ?? ts.firstBadSeq,
    reason: sqlV.reason ?? ts.reason ?? (ok ? null : 'reconciliation failed'),
    checks,
    verified_at: new Date(),
  };
}

export async function ledgerHead(tx: Q, eventId: string) {
  const r = await tx<Row[]>`SELECT last_seq, last_hash FROM event_chain WHERE event_id = ${eventId}`;
  if (!r[0]) throw new AppError('EVENT_NOT_FOUND', 'Unknown event');
  return { event_id: eventId, seq: r[0].last_seq, hash: hex(r[0].last_hash), at: new Date() };
}

export async function listFlags(tx: Q, eventId: string, q: { resolved?: boolean; limit: number; cursor?: string }) {
  const cur = decodeCursor<{ id: number }>(q.cursor);
  const rows = await tx<Row[]>`
    SELECT f.*, r.resolved_at FROM ledger_flags f LEFT JOIN flag_resolutions r ON r.flag_id = f.id
     WHERE f.event_id = ${eventId}
       AND (${q.resolved ?? null}::boolean IS NULL OR (r.flag_id IS NOT NULL) = ${q.resolved ?? null})
       AND (${cur?.id ?? null}::bigint IS NULL OR f.id < ${cur?.id ?? null})
     ORDER BY f.id DESC LIMIT ${q.limit + 1}`;
  const p = page(rows, q.limit, (r) => ({ id: r.id }), encodeCursor);
  return { items: p.items.map(flagDto), next_cursor: p.next_cursor };
}

const flagDto = (r: Row) => ({
  id: r.id, journal_id: r.journal_id, flag: r.flag, detail: r.detail, created_at: r.created_at, resolved: r.resolved_at != null, resolved_at: r.resolved_at ?? null,
});

export async function resolveFlag(app: AppCtx, a: Actor, flagId: number, note: string) {
  return inTx(app.sql, async (tx) => {
    const f = (await tx<Row[]>`SELECT * FROM ledger_flags WHERE id = ${flagId} AND event_id = ${a.eventId}`)[0];
    if (!f) throw new AppError('NOT_FOUND', 'Unknown flag');
    const ins = await tx<Row[]>`INSERT INTO flag_resolutions(flag_id, resolved_by, note) VALUES (${flagId}, ${a.staffId}, ${note})
                                 ON CONFLICT DO NOTHING RETURNING resolved_at`;
    if (ins.length === 0) throw new AppError('DUPLICATE_TX', 'Flag already resolved');
    return flagDto({ ...f, resolved_at: ins[0]!.resolved_at });
  });
}
