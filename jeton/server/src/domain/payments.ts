import { inTx, lockEvent, type Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { requestHash } from '../util/crypto.js';
import { uuidv7 } from '../util/ids.js';
import { Actor, loadEvent, resolveCashdesk, assertEventAcceptsWrites, runIdempotent, translateDbError } from './common.js';
import { resolveTag, assertWalletUsable } from './tags.js';
import { executeTopup, fetchTopups } from './topups.js';
import type { z } from 'zod';
import type { CheckoutRequest } from '../schemas.js';
import type { Role } from '../contract.js';

async function dto(app: AppCtx, r: Row) {
  const topup = r.topup_id ? (await fetchTopups(app.sql, [r.topup_id]))[0] : null;
  return {
    id: r.id, status: r.status, amount_cents: r.amount_cents, tag_code: r.tag_code, hosted_url: r.hosted_url, external_ref: r.external_ref,
    topup, last_error: r.last_error,
  };
}

/** Step 1 validates and records the intent (event lock), step 2 calls the PSP outside any transaction, step 3 stores the checkout. */
export async function createCheckout(app: AppCtx, a: Actor, body: z.output<typeof CheckoutRequest>) {
  const hash = requestHash('checkout', body);
  const { intent, replayed } = await inTx(app.sql, async (tx) => {
    await lockEvent(tx, a.eventId);
    const ex = (await tx<Row[]>`SELECT * FROM payment_intents WHERE event_id = ${a.eventId} AND client_tx_id = ${body.client_tx_id}`)[0];
    if (ex) {
      const same = Buffer.compare(requestHash('checkout', { tag: body.tag, amount_cents: body.amount_cents, client_tx_id: body.client_tx_id, cashdesk_id: ex.cashdesk_id === body.cashdesk_id ? body.cashdesk_id : undefined }), hash) === 0
        || (ex.tag_code === body.tag.tag_code && ex.amount_cents === body.amount_cents);
      if (!same) throw new AppError('DUPLICATE_TX', 'client_tx_id already used with a different request');
      return { intent: ex, replayed: true };
    }
    const ev = await loadEvent(tx, a.eventId);
    assertEventAcceptsWrites(ev, { training: a.training });
    if (ev.status !== 'open' && !a.training) throw new AppError('EVENT_NOT_OPEN', 'Event is not open');
    const price: number = ev.token_price_cents;
    if (body.amount_cents % price !== 0) throw new AppError('INVALID_AMOUNT', `amount_cents must be a positive multiple of ${price}`);
    const tokens = body.amount_cents / price;
    if (tokens > ev.max_topup_tokens) throw new AppError('LIMIT_EXCEEDED', 'Top-up exceeds the per-top-up limit', { limit: ev.max_topup_tokens, would_be: tokens });
    const cashdesk = await resolveCashdesk(tx, a, body.cashdesk_id);
    const rt = await resolveTag(tx, a, body.tag);
    assertWalletUsable(rt.wallet);
    const would = (rt.wallet?.balance ?? 0) + tokens;
    if (would > ev.max_balance_tokens) throw new AppError('LIMIT_EXCEEDED', 'Balance limit per tag exceeded', { limit: ev.max_balance_tokens, would_be: would });
    const id = uuidv7();
    const r = await tx<Row[]>`
      INSERT INTO payment_intents(id, event_id, provider, payment_method, checkout_reference, client_tx_id, tag_code, tag_uid, cashdesk_id,
                                  amount_cents, created_by_staff_id, device_id, training)
      VALUES (${id}, ${a.eventId}, ${app.payments.name}, 'sumup_online', ${id}, ${body.client_tx_id}, ${body.tag.tag_code}, ${body.tag.uid},
              ${cashdesk}, ${body.amount_cents}, ${a.staffId}, ${a.deviceId}, ${a.training}) RETURNING *`;
    return { intent: r[0]!, replayed: false };
  }).catch((e) => { throw translateDbError(e); });

  let row = intent;
  if (!row.provider_checkout_id) {
    try {
      const base = app.cfg.SUMUP_RETURN_URL || app.cfg.PUBLIC_BASE_URL.replace(/\/$/, '') + '/v1/webhooks/sumup';
      const c = await app.payments.createCheckout({
        amountCents: row.amount_cents, reference: row.checkout_reference, description: 'Jeton tokens',
        webhookUrl: `${base}?token=${encodeURIComponent(app.cfg.SUMUP_WEBHOOK_SECRET)}`,
      });
      row = (await app.sql<Row[]>`UPDATE payment_intents SET provider_checkout_id = ${c.id}, hosted_url = ${c.hostedUrl ?? null} WHERE id = ${row.id} RETURNING *`)[0]!;
    } catch (e) {
      app.log.error({ err: String(e) }, 'payment provider createCheckout failed');
      await app.sql`UPDATE payment_intents SET status = 'failed', last_error = 'provider unavailable' WHERE id = ${row.id} AND provider_checkout_id IS NULL`;
      throw new AppError('SERVICE_UNAVAILABLE', 'Payment provider unavailable, retry with a new client_tx_id');
    }
  }
  return { status: replayed ? 200 : 201, replayed, body: await dto(app, row) };
}

/** Reads the PSP status and, when paid, credits the tag exactly once (idempotent on the intent's client_tx_id). */
export async function syncIntent(app: AppCtx, intentId: string): Promise<Row> {
  let r = (await app.sql<Row[]>`SELECT * FROM payment_intents WHERE id = ${intentId}`)[0];
  if (!r) throw new AppError('NOT_FOUND', 'Unknown checkout');
  if (['credited', 'failed', 'expired'].includes(r.status) || !r.provider_checkout_id) return r;
  const c = await app.payments.getCheckout(r.provider_checkout_id);
  if (c.reference !== r.checkout_reference || c.amountCents !== r.amount_cents) {
    app.log.warn({ intent: r.id }, 'checkout reference/amount mismatch, ignoring');
    return r;
  }
  if (c.status === 'FAILED' || c.status === 'EXPIRED') {
    return (await app.sql<Row[]>`UPDATE payment_intents SET status = ${c.status.toLowerCase()} WHERE id = ${r.id} AND status = 'pending' RETURNING *`)[0] ?? r;
  }
  if (c.status !== 'PAID') return r;

  const ext = c.transactionCode || c.id;
  const staff = (await app.sql<Row[]>`SELECT role FROM staff WHERE id = ${r.created_by_staff_id}`)[0];
  const dev = (await app.sql<Row[]>`SELECT kind, stand_id, training FROM devices WHERE id = ${r.device_id}`)[0]!;
  const actor: Actor = {
    deviceId: r.device_id, deviceKind: dev.kind, standId: dev.stand_id, eventId: r.event_id, training: dev.training,
    staffId: r.created_by_staff_id, role: (staff?.role ?? 'cashier') as Role,
  };
  const body = {
    client_tx_id: r.client_tx_id, tag: { tag_code: r.tag_code, uid: r.tag_uid }, cashdesk_id: r.cashdesk_id, payment_method: 'sumup_online' as const,
    amount_cents: r.amount_cents, external_ref: ext, manual: false,
  };
  try {
    const out = await runIdempotent(app, actor, { operation: 'topup', clientTxId: body.client_tx_id, body }, (tx) => executeTopup(tx, app, actor, body));
    const topupId = (out.body as { id: string }).id;
    return (await app.sql<Row[]>`UPDATE payment_intents SET status = 'credited', external_ref = ${ext}, topup_id = ${topupId}, last_error = NULL
                                  WHERE id = ${r.id} RETURNING *`)[0]!;
  } catch (e) {
    const msg = e instanceof AppError ? `${e.code}: ${e.message}` : String(e);
    app.log.error({ intent: r.id, err: msg }, 'paid checkout could not be credited: manual follow-up / PSP refund needed');
    return (await app.sql<Row[]>`UPDATE payment_intents SET status = 'credit_failed', external_ref = ${ext}, last_error = ${msg} WHERE id = ${r.id} RETURNING *`)[0]!;
  }
}

export async function getCheckout(app: AppCtx, a: Actor, id: string) {
  const r = (await app.sql<Row[]>`SELECT id FROM payment_intents WHERE id = ${id} AND event_id = ${a.eventId}`)[0];
  if (!r) throw new AppError('NOT_FOUND', 'Unknown checkout');
  return dto(app, await syncIntent(app, id));
}

export async function handleSumupWebhook(app: AppCtx, body: unknown): Promise<void> {
  const cid = app.payments.extractCheckoutId(body);
  if (!cid) return;
  const r = (await app.sql<Row[]>`SELECT id FROM payment_intents WHERE provider_checkout_id = ${cid}`)[0];
  if (!r) return;
  await syncIntent(app, r.id);
}
