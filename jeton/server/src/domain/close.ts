import { type Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { Accounts, JournalBuilder, postJournal } from '../ledger/ledger.js';
import { derivedUuid } from '../util/ids.js';
import { requestHash } from '../util/crypto.js';
import { Actor, loadEvent, runIdempotent } from './common.js';

/** Irreversible event close: preconditions, tips disposition, breakage journals for every remaining wallet, status = closed. */
export function closeEvent(app: AppCtx, a: Actor, body: { client_tx_id: string; tips_disposition: string }) {
  return runIdempotent(app, a, { operation: 'event.close', clientTxId: body.client_tx_id, body }, async (tx) => {
    const ev = await loadEvent(tx, a.eventId);
    if (ev.status === 'closed') throw new AppError('EVENT_CLOSED', 'Event is already closed');
    if (ev.status !== 'open') throw new AppError('EVENT_NOT_OPEN', 'Only an open event can be closed');

    // Every stand needs a sealed Z for each business day with sales (or, for cash desks, top-ups / cash-outs).
    const missing = await tx<Row[]>`
      SELECT d.stand_id, d.business_date::text AS business_date FROM (
        SELECT stand_id, business_date FROM orders WHERE event_id = ${a.eventId} AND NOT training
        UNION SELECT stand_id, business_date FROM topups WHERE event_id = ${a.eventId} AND NOT training
        UNION SELECT stand_id, business_date FROM cashouts WHERE event_id = ${a.eventId} AND NOT training) d
       WHERE NOT EXISTS (SELECT 1 FROM z_reports z WHERE z.stand_id = d.stand_id AND z.business_date = d.business_date)
       ORDER BY 2, 1`;
    if (missing.length) throw new AppError('CLOSE_PRECONDITION_FAILED', 'Seal the Z-report of every stand and day first', { missing_z_reports: missing });

    const acc = new Accounts(tx, a.eventId, false);
    const tips = await tx<Row[]>`SELECT stand_id, tokens FROM v_tips_payable WHERE event_id = ${a.eventId} AND tokens > 0`;
    if (tips.length) {
      if (body.tips_disposition !== 'assigned_to_donation') {
        throw new AppError('TIPS_OUTSTANDING', 'Tips are still payable', { tips_payable_tokens: tips.reduce((s, t) => s + Number(t.tokens), 0) });
      }
      for (const t of tips) {
        const lines = new JournalBuilder()
          .add(await acc.tipsPayable(t.stand_id), -t.tokens)
          .add(await acc.refunds(), t.tokens)
          .add(await acc.liability(), t.tokens * ev.token_price_cents)
          .add(await acc.bank(), -t.tokens * ev.token_price_cents)
          .build();
        const cid = derivedUuid('close-tips', body.client_tx_id, t.stand_id);
        const j = await postJournal(tx, {
          eventId: a.eventId, kind: 'tips_payout', clientTxId: cid, requestHash: requestHash('close-tips', { t: body.client_tx_id, s: t.stand_id }),
          deviceId: a.deviceId, staffId: a.staffId, clientCreatedAt: null, offline: false, training: false, lines,
        });
        const desk = (await tx<Row[]>`SELECT id FROM stands WHERE event_id = ${a.eventId} AND kind = 'cashdesk' ORDER BY created_at LIMIT 1`)[0];
        if (!desk) throw new AppError('CLOSE_PRECONDITION_FAILED', 'A cash desk is needed to record the donation of tips');
        await tx`INSERT INTO tips_payouts(id, event_id, journal_id, stand_id, cashdesk_id, tokens, amount_cents, method, ack_ref)
                 VALUES (${derivedUuid('close-tips-fact', cid)}, ${a.eventId}, ${j.journalId}, ${t.stand_id}, ${desk.id}, ${t.tokens}, ${t.tokens * ev.token_price_cents}, 'donation', 'event_close')`;
      }
    }

    let tokens = 0;
    let wallets = 0;
    if (ev.breakage_treatment !== 'refund_later') {
      const ws = await tx<Row[]>`
        SELECT w.id, w.account_id, a.code, b.balance FROM wallets w JOIN accounts a ON a.id = w.account_id
          JOIN account_balances b ON b.account_id = w.account_id WHERE w.event_id = ${a.eventId} AND NOT w.training AND b.balance > 0 ORDER BY w.created_at, w.id`;
      for (const w of ws) {
        const wallet = { id: w.account_id as string, code: w.code as string, kind: 'wallet', unit: 'TOKEN' as const };
        const amount = w.balance * ev.token_price_cents;
        const lines = new JournalBuilder().add(wallet, -w.balance).add(await acc.breakage(), w.balance)
          .add(await acc.liability(), amount).add(await acc.breakageIncome(), -amount).build();
        await postJournal(tx, {
          eventId: a.eventId, kind: 'breakage', clientTxId: derivedUuid('close-breakage', body.client_tx_id, w.id),
          requestHash: requestHash('close-breakage', { t: body.client_tx_id, w: w.id }), deviceId: a.deviceId, staffId: a.staffId,
          clientCreatedAt: null, offline: false, training: false, reasonCode: 'event_close', lines,
        });
        tokens += Number(w.balance);
        wallets++;
      }
    }
    await tx`UPDATE events SET status = 'closed' WHERE id = ${a.eventId}`;
    const closed = (await tx<Row[]>`SELECT closed_at FROM events WHERE id = ${a.eventId}`)[0]!;
    const head = (await tx<Row[]>`SELECT last_seq, encode(last_hash,'hex') AS h FROM event_chain WHERE event_id = ${a.eventId}`)[0]!;
    return {
      status: 200,
      body: {
        event_id: a.eventId, closed_at: closed.closed_at, breakage_treatment: ev.breakage_treatment, breakage_tokens: tokens,
        breakage_cents: tokens * ev.token_price_cents, wallets_affected: wallets, final_chain_seq: head.last_seq, final_chain_hash: head.h,
      },
    };
  });
}
