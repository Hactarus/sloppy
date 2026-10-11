import { inTx, lockEvent, type Q, type Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { Accounts, JournalBuilder, addFlag, balanceOf, postJournal } from '../ledger/ledger.js';
import { encryptJson, requestHash } from '../util/crypto.js';
import { derivedUuid, uuidv7 } from '../util/ids.js';
import type { CashMovementRequest, CashoutRequest } from '../schemas.js';
import { Actor, OpResult, assertEventAcceptsWrites, effectiveTime, loadEvent, loadStand, resolveCashdesk, runIdempotent } from './common.js';
import { assertWalletUsable, resolveTag } from './tags.js';
import type { z } from 'zod';
import type { OpenSessionRequest, CloseSessionRequest, PspSettlementRequest, TipsPayoutRequest } from '../schemas.js';

// ───────────────────────────── cash-outs ─────────────────────────────

export async function executeCashout(tx: Q, app: AppCtx, a: Actor, body: CashoutRequest, offline: boolean): Promise<OpResult> {
  const ev = await loadEvent(tx, a.eventId);
  assertEventAcceptsWrites(ev, { training: a.training, allowClosed: true, allowDraft: offline });
  const eff = effectiveTime(body.client_created_at ?? null);
  if (ev.refundable_until && eff.at.getTime() > new Date(ev.refundable_until).getTime()) {
    throw new AppError('REFUND_WINDOW_CLOSED', 'The refund window of this event is over');
  }
  const flags: Array<{ flag: string; detail: Record<string, unknown> }> = [];
  const rt = await resolveTag(tx, a, body.tag, { lenient: offline });
  if (rt.uidMismatch) flags.push({ flag: 'TAG_UID_MISMATCH', detail: { tag_code: body.tag.tag_code } });
  if (rt.wallet?.status === 'blocked') {
    if (!offline) assertWalletUsable(rt.wallet);
    flags.push({ flag: 'TAG_BLOCKED_AT_SYNC', detail: { tag_code: body.tag.tag_code } });
  }
  if (!rt.wallet) throw new AppError('INSUFFICIENT_BALANCE', 'Nothing to cash out', { balance_tokens: 0, required_tokens: body.tokens ?? 1 });
  const balance = rt.wallet.balance;
  const tokens = body.tokens ?? balance;
  if (tokens < 1) throw new AppError('INSUFFICIENT_BALANCE', 'Nothing to cash out', { balance_tokens: balance, required_tokens: body.tokens ?? 1 });
  if (tokens < ev.min_refund_tokens) throw new AppError('INVALID_AMOUNT', `At least ${ev.min_refund_tokens} token(s) must be cashed out`);
  if (!offline && tokens > balance) throw new AppError('INSUFFICIENT_BALANCE', 'Balance too low', { balance_tokens: balance, required_tokens: tokens });

  if (body.method === 'cash' && ev.refund_cash_limited_to_cash_topups) {
    const r = await tx<Row[]>`
      SELECT (SELECT COALESCE(sum(t.tokens), 0) FROM topups t WHERE t.wallet_id = ${rt.wallet.wallet_id} AND t.payment_method = 'cash'
                 AND t.kind = 'paid' AND NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = t.journal_id))::bigint
           - (SELECT COALESCE(sum(c.tokens), 0) FROM cashouts c WHERE c.wallet_id = ${rt.wallet.wallet_id} AND c.payment_method = 'cash'
                 AND NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = c.journal_id))::bigint AS allowed`;
    const allowed = r[0]!.allowed as number;
    if (tokens > allowed) throw new AppError('REFUND_METHOD_LIMIT', 'Cash refunds are limited to the cash top-ups of this tag', { allowed_tokens: Math.max(0, allowed) });
  }
  let contactId: string | null = null;
  if (body.method === 'bank_transfer') {
    if (!body.contact || !body.contact.iban) {
      throw new AppError('VALIDATION_ERROR', 'contact (with iban) is required for bank_transfer', { fields: [{ path: 'contact', issue: 'required for bank_transfer' }] });
    }
  }
  const cashdesk = await resolveCashdesk(tx, a, null);
  const acc = new Accounts(tx, a.eventId, a.training);
  const { walletId, account: wallet } = await acc.wallet(rt.tag.id);
  const amount = tokens * ev.token_price_cents;
  const jb = new JournalBuilder()
    .add(wallet, -tokens)
    .add(await acc.refunds(), tokens)
    .add(await acc.liability(), amount)
    .add(await acc.forPaymentMethod(body.method, cashdesk), -amount);
  const j = await postJournal(tx, {
    eventId: a.eventId, kind: 'cashout', clientTxId: body.client_tx_id, requestHash: requestHash('cashout', body), deviceId: a.deviceId,
    staffId: a.staffId, clientCreatedAt: body.client_created_at ?? null, offline, training: a.training, allowNegative: offline,
    reasonCode: body.reason_code, appVersion: a.appVersion ?? null, lines: jb.build(),
  });
  if (body.method === 'bank_transfer' && body.contact) {
    contactId = uuidv7();
    const { iban, ...rest } = body.contact;
    await tx`INSERT INTO refund_contacts(id, event_id, contact_enc, iban_enc, purge_after)
             VALUES (${contactId}, ${a.eventId}, ${encryptJson(app.cfg.CONTACT_ENC_KEY, rest)}, ${encryptJson(app.cfg.CONTACT_ENC_KEY, { iban })},
                     now() + interval '180 days')`;
  }
  const id = uuidv7();
  await tx`INSERT INTO cashouts(id, event_id, journal_id, wallet_id, stand_id, device_id, staff_id, payment_method, external_ref, refund_contact_id,
                                tokens, amount_cents)
           VALUES (${id}, ${a.eventId}, ${j.journalId}, ${walletId}, ${cashdesk}, ${a.deviceId}, ${a.staffId}, ${body.method},
                   ${body.external_ref ?? null}, ${contactId}, ${tokens}, ${amount})`;
  for (const f of flags) await addFlag(tx, a.eventId, j.journalId, f.flag, f.detail);
  return { status: 201, body: (await fetchCashouts(tx, [id]))[0], journalId: j.journalId };
}

export function createCashout(app: AppCtx, a: Actor, body: CashoutRequest) {
  return runIdempotent(app, a, { operation: 'cashout', clientTxId: body.client_tx_id, body }, (tx) => executeCashout(tx, app, a, body, false));
}

export async function fetchCashouts(tx: Q, ids: string[]): Promise<Record<string, unknown>[]> {
  const rows = await tx<Row[]>`
    SELECT c.*, j.seq AS journal_seq, tg.tag_code,
           (SELECT COALESCE(sum(p.amount), 0)::bigint FROM postings p JOIN journal jj ON jj.id = p.journal_id
             WHERE p.account_id = w.account_id AND jj.seq <= j.seq) AS balance_tokens
      FROM cashouts c JOIN journal j ON j.id = c.journal_id JOIN wallets w ON w.id = c.wallet_id JOIN tags tg ON tg.id = w.tag_id
     WHERE c.id = ANY(${ids}::uuid[])`;
  const by = new Map(rows.map((r) => [r.id as string, r]));
  return ids.map((id) => {
    const c = by.get(id);
    if (!c) throw new AppError('NOT_FOUND', 'Unknown cash-out');
    return {
      id: c.id, journal_seq: c.journal_seq, receipt_no: c.receipt_no, tag_code: c.tag_code, tokens: c.tokens, amount_cents: c.amount_cents,
      method: c.payment_method, refund_contact_id: c.refund_contact_id, balance_tokens: c.balance_tokens, business_date: c.business_date,
      training: c.training,
    };
  });
}

// ───────────────────────────── cash movements ─────────────────────────────

export async function executeCashMovement(tx: Q, app: AppCtx, a: Actor, body: CashMovementRequest, offline: boolean): Promise<OpResult> {
  const ev = await loadEvent(tx, a.eventId);
  assertEventAcceptsWrites(ev, { training: a.training, allowClosed: true, allowDraft: true });
  const cashdesk = await resolveCashdesk(tx, a, body.cashdesk_id);
  let sessionId = body.session_id ?? null;
  if (sessionId) {
    const s = (await tx<Row[]>`SELECT * FROM cashdesk_sessions WHERE id = ${sessionId} AND event_id = ${a.eventId} AND cashdesk_id = ${cashdesk}`)[0];
    if (!s) throw new AppError('NOT_FOUND', 'Unknown cash desk session');
    if (s.closed_at) throw new AppError('SESSION_CLOSED', 'Session is closed');
  }
  const acc = new Accounts(tx, a.eventId, a.training);
  const receipts = await acc.cashReceipts(cashdesk);
  const bank = await acc.bank();
  const inflow = body.movement === 'float_in' || body.movement === 'pay_in';
  const jb = new JournalBuilder().add(receipts, inflow ? body.amount_cents : -body.amount_cents).add(bank, inflow ? -body.amount_cents : body.amount_cents);
  const j = await postJournal(tx, {
    eventId: a.eventId, kind: 'cash_movement', clientTxId: body.client_tx_id, requestHash: requestHash('cash_movement', body), deviceId: a.deviceId,
    staffId: a.staffId, clientCreatedAt: body.client_created_at ?? null, offline, training: a.training, reasonCode: body.reason_code,
    appVersion: a.appVersion ?? null, lines: jb.build(),
  });
  const id = uuidv7();
  await tx`INSERT INTO cash_movements(id, event_id, journal_id, cashdesk_id, session_id, movement, amount_cents)
           VALUES (${id}, ${a.eventId}, ${j.journalId}, ${cashdesk}, ${sessionId}, ${body.movement}, ${body.amount_cents})`;
  return { status: 201, journalId: j.journalId, body: { id, journal_seq: j.seq, movement: body.movement, amount_cents: body.amount_cents } };
}

export function createCashMovement(app: AppCtx, a: Actor, body: CashMovementRequest) {
  return runIdempotent(app, a, { operation: 'cash_movement', clientTxId: body.client_tx_id, body }, (tx) => executeCashMovement(tx, app, a, body, false));
}

// ───────────────────────────── cash desk sessions ─────────────────────────────

function sessionDto(s: Row): Record<string, unknown> {
  return {
    id: s.id, cashdesk_id: s.cashdesk_id, opened_at: s.opened_at, opening_float_cents: s.opening_float_cents, closed_at: s.closed_at,
    counted_cents: s.counted_cents, expected_cents: s.expected_cents, variance_cents: s.variance_cents,
    variance_acknowledged: s.closed_at ? s.variance_cents === 0 || s.ack_at !== null : false,
  };
}

export function openSession(app: AppCtx, a: Actor, body: z.output<typeof OpenSessionRequest>) {
  return runIdempotent(app, a, { operation: 'cashdesk.open', clientTxId: body.client_tx_id, body }, async (tx) => {
    const cashdesk = await resolveCashdesk(tx, a, body.cashdesk_id);
    const open = await tx<Row[]>`SELECT 1 FROM cashdesk_sessions WHERE cashdesk_id = ${cashdesk} AND closed_at IS NULL`;
    if (open.length > 0) throw new AppError('SESSION_ALREADY_OPEN', 'A session is already open on this cash desk');
    const id = uuidv7();
    const r = await tx<Row[]>`INSERT INTO cashdesk_sessions(id, event_id, cashdesk_id, device_id, opened_by, opening_float_cents)
                              VALUES (${id}, ${a.eventId}, ${cashdesk}, ${a.deviceId}, ${a.staffId}, ${body.opening_float_cents}) RETURNING *`;
    return { status: 201, body: sessionDto(r[0]!) };
  });
}

export async function sessionExpectedCents(tx: Q, s: Row, training: boolean): Promise<number> {
  const r = await tx<Row[]>`
    SELECT
      (SELECT COALESCE(sum(t.amount_cents), 0) FROM topups t WHERE t.stand_id = ${s.cashdesk_id} AND t.payment_method = 'cash' AND t.kind = 'paid'
          AND t.training = ${training} AND t.created_at >= ${s.opened_at}
          AND NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = t.journal_id))::bigint AS topups,
      (SELECT COALESCE(sum(c.amount_cents), 0) FROM cashouts c WHERE c.stand_id = ${s.cashdesk_id} AND c.payment_method = 'cash'
          AND c.training = ${training} AND c.created_at >= ${s.opened_at}
          AND NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = c.journal_id))::bigint AS cashouts,
      (SELECT COALESCE(sum(p.amount_cents), 0) FROM tips_payouts p WHERE p.cashdesk_id = ${s.cashdesk_id} AND p.method = 'cash'
          AND p.training = ${training} AND p.created_at >= ${s.opened_at}
          AND NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = p.journal_id))::bigint AS tips,
      (SELECT COALESCE(sum(CASE WHEN m.movement IN ('float_in','pay_in') THEN m.amount_cents ELSE -m.amount_cents END), 0)
         FROM cash_movements m WHERE m.cashdesk_id = ${s.cashdesk_id} AND m.training = ${training}
          AND (m.session_id = ${s.id} OR (m.session_id IS NULL AND m.created_at >= ${s.opened_at}))
          AND NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = m.journal_id))::bigint AS moves`;
  const x = r[0]!;
  return s.opening_float_cents + x.topups - x.cashouts - x.tips + x.moves;
}

export function closeSession(app: AppCtx, a: Actor, sessionId: string, body: z.output<typeof CloseSessionRequest>) {
  return runIdempotent(app, a, { operation: 'cashdesk.close:' + sessionId, clientTxId: body.client_tx_id, body }, async (tx) => {
    const s = (await tx<Row[]>`SELECT * FROM cashdesk_sessions WHERE id = ${sessionId} AND event_id = ${a.eventId}`)[0];
    if (!s) throw new AppError('NOT_FOUND', 'Unknown cash desk session');
    if (s.closed_at) throw new AppError('SESSION_CLOSED', 'Session is already closed');
    await resolveCashdesk(tx, a, s.cashdesk_id);
    let counted = 0;
    for (const [denom, n] of Object.entries(body.counted_breakdown)) counted += Number(denom) * n;
    const expected = await sessionExpectedCents(tx, s, a.training);
    const variance = counted - expected;
    let varianceJournal: string | null = null;
    if (variance !== 0) {
      const acc = new Accounts(tx, a.eventId, a.training);
      const jb = new JournalBuilder().add(await acc.cashReceipts(s.cashdesk_id), variance).add(await acc.cashOverShort(), -variance);
      const clientTx = derivedUuid('cash_variance', sessionId);
      const j = await postJournal(tx, {
        eventId: a.eventId, kind: 'cash_variance', clientTxId: clientTx, requestHash: requestHash('cash_variance', { sessionId, variance }),
        deviceId: a.deviceId, staffId: a.staffId, clientCreatedAt: null, offline: false, training: a.training, reasonCode: 'other', lines: jb.build(),
      });
      varianceJournal = j.journalId;
    }
    const r = await tx<Row[]>`UPDATE cashdesk_sessions SET closed_at = now(), closed_by = ${a.staffId}, counted_cents = ${counted},
                                     counted_breakdown = ${tx.json(body.counted_breakdown)}, expected_cents = ${expected},
                                     variance_cents = ${variance}, variance_journal_id = ${varianceJournal}
                               WHERE id = ${sessionId} RETURNING *`;
    return { status: 200, body: sessionDto(r[0]!), journalId: varianceJournal };
  });
}

export async function ackSession(app: AppCtx, a: Actor, sessionId: string): Promise<Record<string, unknown>> {
  return inTx(app.sql, async (tx) => {
    await lockEvent(tx, a.eventId);
    const s = (await tx<Row[]>`SELECT * FROM cashdesk_sessions WHERE id = ${sessionId} AND event_id = ${a.eventId} FOR UPDATE`)[0];
    if (!s) throw new AppError('NOT_FOUND', 'Unknown cash desk session');
    if (!s.closed_at) throw new AppError('SESSION_ALREADY_OPEN', 'Close the session before acknowledging its variance');
    if (s.ack_at) return sessionDto(s);
    const r = await tx<Row[]>`UPDATE cashdesk_sessions SET ack_by = ${a.staffId}, ack_at = now() WHERE id = ${sessionId} RETURNING *`;
    return sessionDto(r[0]!);
  });
}

// ───────────────────────────── PSP settlements ─────────────────────────────

export function importPspSettlement(app: AppCtx, a: Actor, body: z.output<typeof PspSettlementRequest>) {
  return runIdempotent(app, a, { operation: 'psp.settlement', clientTxId: body.client_tx_id, body }, async (tx) => {
    const gross = body.lines.reduce((s, l) => s + l.gross_cents, 0);
    const fee = body.lines.reduce((s, l) => s + l.fee_cents, 0);
    if (fee > gross) throw new AppError('INVALID_AMOUNT', 'Fees exceed the gross amount');
    const dup = await tx<Row[]>`SELECT 1 FROM psp_settlements WHERE event_id = ${a.eventId} AND method = ${body.method} AND payout_ref = ${body.payout_ref}`;
    if (dup.length > 0) throw new AppError('EXTERNAL_REF_ALREADY_USED', 'This payout_ref has already been imported');
    const acc = new Accounts(tx, a.eventId, a.training);
    const jb = new JournalBuilder()
      .add(await acc.bank(), gross - fee)
      .add(await acc.pspFees(), fee)
      .add(await acc.pspClearing(body.method), -gross);
    const j = await postJournal(tx, {
      eventId: a.eventId, kind: 'psp_settlement', clientTxId: body.client_tx_id, requestHash: requestHash('psp.settlement', body), deviceId: a.deviceId,
      staffId: a.staffId, clientCreatedAt: null, offline: false, training: a.training, lines: jb.build(),
    });
    const id = uuidv7();
    await tx`INSERT INTO psp_settlements(id, event_id, journal_id, method, payout_ref, payout_date, gross_cents, fee_cents, net_cents)
             VALUES (${id}, ${a.eventId}, ${j.journalId}, ${body.method}, ${body.payout_ref}, ${body.payout_date}, ${gross}, ${fee}, ${gross - fee})`;
    const unmatched: Array<{ psp_ref: string; gross_cents: number }> = [];
    let matched = 0;
    let n = 0;
    for (const l of body.lines) {
      n++;
      const m = await tx<Row[]>`
        SELECT t.id FROM topups t
         WHERE t.event_id = ${a.eventId} AND t.payment_method = ${body.method} AND t.external_ref = ${l.psp_ref}
           AND t.amount_cents = ${l.gross_cents} AND t.training = ${a.training}
           AND NOT EXISTS (SELECT 1 FROM psp_settlement_lines x WHERE x.matched_topup_id = t.id)
         LIMIT 1`;
      await tx`INSERT INTO psp_settlement_lines(settlement_id, line_no, psp_ref, gross_cents, fee_cents, matched_topup_id)
               VALUES (${id}, ${n}, ${l.psp_ref}, ${l.gross_cents}, ${l.fee_cents}, ${m[0]?.id ?? null})`;
      if (m[0]) matched++;
      else unmatched.push({ psp_ref: l.psp_ref, gross_cents: l.gross_cents });
    }
    return {
      status: 201, journalId: j.journalId,
      body: { id, journal_seq: j.seq, gross_cents: gross, fee_cents: fee, net_cents: gross - fee, matched, unmatched },
    };
  });
}

// ───────────────────────────── tips payouts ─────────────────────────────

export function createTipsPayout(app: AppCtx, a: Actor, body: z.output<typeof TipsPayoutRequest>) {
  return runIdempotent(app, a, { operation: 'tips.payout', clientTxId: body.client_tx_id, body }, async (tx) => {
    const ev = await loadEvent(tx, a.eventId);
    assertEventAcceptsWrites(ev, { training: a.training, allowClosed: true });
    const stand = await loadStand(tx, a.eventId, body.stand_id);
    if (stand.kind !== 'stand') throw new AppError('STAND_MISMATCH', 'Tips belong to a stand');
    const cashdesk = await resolveCashdesk(tx, a, body.cashdesk_id);
    if (body.recipient_staff_id) {
      const s = await tx<Row[]>`SELECT 1 FROM staff WHERE id = ${body.recipient_staff_id}`;
      if (s.length === 0) throw new AppError('NOT_FOUND', 'Unknown recipient');
    }
    if (body.method === 'donation' && body.recipient_staff_id) {
      throw new AppError('VALIDATION_ERROR', 'A donation has no recipient', { fields: [{ path: 'recipient_staff_id', issue: 'must be null for donation' }] });
    }
    const acc = new Accounts(tx, a.eventId, a.training);
    const tp = await acc.tipsPayable(body.stand_id);
    const bal = await balanceOf(tx, tp.id);
    if (bal < body.tokens) throw new AppError('INSUFFICIENT_BALANCE', 'Not enough tips payable', { balance_tokens: bal, required_tokens: body.tokens });
    const amount = body.tokens * ev.token_price_cents;
    const jb = new JournalBuilder()
      .add(tp, -body.tokens)
      .add(await acc.refunds(), body.tokens)
      .add(await acc.liability(), amount)
      .add(await acc.forPaymentMethod(body.method, cashdesk), -amount);
    const j = await postJournal(tx, {
      eventId: a.eventId, kind: 'tips_payout', clientTxId: body.client_tx_id, requestHash: requestHash('tips.payout', body), deviceId: a.deviceId,
      staffId: a.staffId, clientCreatedAt: null, offline: false, training: a.training, lines: jb.build(),
    });
    const id = uuidv7();
    await tx`INSERT INTO tips_payouts(id, event_id, journal_id, stand_id, cashdesk_id, recipient_staff_id, tokens, amount_cents, method, ack_ref)
             VALUES (${id}, ${a.eventId}, ${j.journalId}, ${body.stand_id}, ${cashdesk}, ${body.recipient_staff_id ?? null}, ${body.tokens}, ${amount},
                     ${body.method}, ${body.ack_ref ?? null})`;
    return {
      status: 201, journalId: j.journalId,
      body: { id, journal_seq: j.seq, tokens: body.tokens, amount_cents: amount, method: body.method, tips_payable_after_tokens: bal - body.tokens },
    };
  });
}
