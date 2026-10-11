import type { Q, Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { Accounts, JournalBuilder, balanceAfter, postJournal } from '../ledger/ledger.js';
import { requestHash } from '../util/crypto.js';
import { uuidv7 } from '../util/ids.js';
import { vatOfGross } from '../util/money.js';
import type { TopupRequest } from '../schemas.js';
import { Actor, OpResult, assertEventAcceptsWrites, businessDate, effectiveTime, loadEvent, resolveCashdesk, runIdempotent } from './common.js';
import { assertWalletUsable, resolveTag } from './tags.js';

const EXTERNAL_REF_METHODS = new Set(['sumup_card', 'sumup_online', 'wero', 'bancontact']);

/** Online top-up inside a locked transaction. Also used by the SumUp checkout confirmation. */
export async function executeTopup(tx: Q, app: AppCtx, a: Actor, body: TopupRequest): Promise<OpResult> {
  const ev = await loadEvent(tx, a.eventId);
  assertEventAcceptsWrites(ev, { training: a.training });
  if (ev.status !== 'open' && !a.training) throw new AppError('EVENT_NOT_OPEN', 'Event is not open');

  const promo = body.payment_method === 'promo';
  if (promo && a.role !== 'admin') throw new AppError('FORBIDDEN', 'Only an admin can grant promo tokens');
  const ext = body.external_ref?.trim() || null;
  if (promo && ext) throw new AppError('VALIDATION_ERROR', 'external_ref is not allowed for promo tokens', { fields: [{ path: 'external_ref', issue: 'not allowed' }] });
  if ((body.manual || EXTERNAL_REF_METHODS.has(body.payment_method)) && !ext) {
    throw new AppError('EXTERNAL_REF_REQUIRED', 'external_ref (PSP / payment reference) is required for this payment method');
  }
  const price: number = ev.token_price_cents;
  if (body.amount_cents <= 0 || body.amount_cents % price !== 0) {
    throw new AppError('INVALID_AMOUNT', `amount_cents must be a positive multiple of ${price}`);
  }
  const tokens = body.amount_cents / price;
  if (tokens > ev.max_topup_tokens) {
    throw new AppError('LIMIT_EXCEEDED', 'Top-up exceeds the per-top-up limit', { limit: ev.max_topup_tokens, would_be: tokens });
  }
  const cashdesk = await resolveCashdesk(tx, a, body.cashdesk_id);
  const rt = await resolveTag(tx, a, body.tag);
  assertWalletUsable(rt.wallet);
  const would = (rt.wallet?.balance ?? 0) + tokens;
  if (would > ev.max_balance_tokens) {
    throw new AppError('LIMIT_EXCEEDED', 'Balance limit per tag exceeded', { limit: ev.max_balance_tokens, would_be: would });
  }
  if (ext && !a.training) {
    const dup = await tx<Row[]>`SELECT 1 FROM topups WHERE event_id = ${a.eventId} AND payment_method = ${body.payment_method}
                                  AND external_ref = ${ext} AND NOT training`;
    if (dup.length > 0) throw new AppError('EXTERNAL_REF_ALREADY_USED', 'external_ref already used for this payment method');
  }

  const acc = new Accounts(tx, a.eventId, a.training);
  const { walletId, account: wallet } = await acc.wallet(rt.tag.id);
  const jb = new JournalBuilder();
  let vatCents = 0;
  if (promo) {
    jb.add(await acc.promo(), -tokens).add(wallet, tokens);
    jb.add(await acc.promoExpense(), body.amount_cents).add(await acc.liability(), -body.amount_cents);
  } else {
    jb.add(await acc.issuance(), -tokens).add(wallet, tokens);
    jb.add(await acc.forPaymentMethod(body.payment_method, cashdesk), body.amount_cents).add(await acc.liability(), -body.amount_cents);
    if (ev.voucher_type === 'single_purpose') {
      // [À VALIDER] single-purpose voucher: VAT is due at issue (ADR 0005).
      const eff = effectiveTime(body.client_created_at ?? null);
      const on = await businessDate(tx, ev.timezone, eff.at);
      const rate = (await tx<Row[]>`SELECT vat_rate_bp(${ev.country}, ${ev.single_purpose_vat_category}, 'on_site', ${on}::date) AS r`)[0]!.r as number;
      vatCents = vatOfGross(body.amount_cents, rate).vat;
      jb.add(await acc.vatDeferred(), vatCents).add(await acc.vat(rate), -vatCents);
    }
  }
  const j = await postJournal(tx, {
    eventId: a.eventId, kind: promo ? 'promo_grant' : 'topup', clientTxId: body.client_tx_id, requestHash: requestHash('topup', body),
    deviceId: a.deviceId, staffId: a.staffId, clientCreatedAt: body.client_created_at ?? null, offline: false, training: a.training,
    appVersion: a.appVersion ?? null, lines: jb.build(),
  });
  const id = uuidv7();
  await tx`INSERT INTO topups(id, event_id, journal_id, wallet_id, stand_id, device_id, staff_id, kind, payment_method, external_ref, manual,
                              confirmed_by_staff_id, amount_cents, tokens, token_price_cents, vat_cents, terms_version, provisional_ref)
           VALUES (${id}, ${a.eventId}, ${j.journalId}, ${walletId}, ${cashdesk}, ${a.deviceId}, ${a.staffId}, ${promo ? 'promo' : 'paid'},
                   ${body.payment_method}, ${ext}, ${body.manual}, ${body.manual ? a.staffId : null}, ${body.amount_cents}, ${tokens}, ${price},
                   ${vatCents}, ${body.terms_version ?? null}, ${body.provisional_ref ?? null})`;
  if (body.terms_version && rt.wallet?.terms_version == null) {
    await tx`UPDATE wallets SET terms_version = ${body.terms_version} WHERE id = ${walletId} AND terms_version IS NULL`;
  }
  return { status: 201, body: (await fetchTopups(tx, [id]))[0], journalId: j.journalId };
}

export function createTopup(app: AppCtx, a: Actor, body: TopupRequest) {
  return runIdempotent(app, a, { operation: 'topup', clientTxId: body.client_tx_id, body }, (tx) => executeTopup(tx, app, a, body));
}

export async function fetchTopups(tx: Q, ids: string[]): Promise<Record<string, unknown>[]> {
  const rows = await tx<Row[]>`
    SELECT t.*, j.seq AS journal_seq, tg.tag_code,
           (SELECT COALESCE(sum(p.amount), 0)::bigint FROM postings p JOIN journal jj ON jj.id = p.journal_id
             WHERE p.account_id = w.account_id AND jj.seq <= j.seq) AS balance_tokens
      FROM topups t JOIN journal j ON j.id = t.journal_id JOIN wallets w ON w.id = t.wallet_id JOIN tags tg ON tg.id = w.tag_id
     WHERE t.id = ANY(${ids}::uuid[])`;
  const by = new Map(rows.map((r) => [r.id as string, r]));
  return ids.map((id) => {
    const t = by.get(id);
    if (!t) throw new AppError('NOT_FOUND', 'Unknown top-up');
    return {
      id: t.id, journal_id: t.journal_id, journal_seq: t.journal_seq, receipt_no: t.receipt_no, tag_code: t.tag_code,
      payment_method: t.payment_method, external_ref: t.external_ref, amount_cents: t.amount_cents, tokens: t.tokens,
      token_price_cents: t.token_price_cents, vat_cents: t.vat_cents, balance_tokens: t.balance_tokens,
      business_date: t.business_date, training: t.training, created_at: t.created_at,
    };
  });
}

// keep helper exported for reuse
export { balanceAfter };
