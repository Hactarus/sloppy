import type { Q, Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { Accounts, JournalBuilder, addFlag, postJournal } from '../ledger/ledger.js';
import { requestHash } from '../util/crypto.js';
import { uuidv7 } from '../util/ids.js';
import { vatOfGross } from '../util/money.js';
import type { OrderRequest, RefundOrderRequest } from '../schemas.js';
import {
  Actor, OpResult, assertEventAcceptsWrites, assertStandAccess, businessDate, effectiveTime, loadEvent, loadStand, runIdempotent,
} from './common.js';
import { assertWalletUsable, resolveTag } from './tags.js';
import { decodeCursor, encodeCursor } from '../util/cursor.js';
import { page } from '../http.js';

export interface OfflineCtx {
  /** (device:wallet) -> offline tokens already spent in this batch, for OFFLINE_CAP_EXCEEDED */
  capTracker: Map<string, number>;
  provisionalRef?: string;
}

interface PricedLine {
  line_no: number;
  item_id: string;
  item_name: string;
  category_id: string;
  category_name: string;
  qty: number;
  unit_price_tokens: number;
  vat_category: string;
  consumption_mode: 'on_site' | 'takeaway';
  vat_rate_bp: number;
  gross_cents: number;
  tokens: number;
}

export interface VatGroup {
  vat_rate_bp: number;
  gross_cents: number;
  net_cents: number;
  vat_cents: number;
}

/** VAT per rate group: round_half_up(gross * rate / (10000 + rate)) per group (ADR 0005); net = gross - vat. */
export function groupVat(lines: { vat_rate_bp: number; gross_cents: number }[]): VatGroup[] {
  const g = new Map<number, number>();
  for (const l of lines) g.set(l.vat_rate_bp, (g.get(l.vat_rate_bp) ?? 0) + l.gross_cents);
  return [...g.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([rate, gross]) => {
      const { net, vat } = vatOfGross(gross, rate);
      return { vat_rate_bp: rate, gross_cents: gross, net_cents: net, vat_cents: vat };
    });
}

async function priceLines(tx: Q, ev: Row, body: OrderRequest, standId: string, on: string, strictItems: boolean, priceFlags: string[]): Promise<PricedLine[]> {
  const ids = [...new Set(body.lines.map((l) => l.item_id))];
  const items = await tx<Row[]>`
    SELECT i.id, i.name, i.price_tokens, i.vat_category, i.default_consumption_mode, i.min_age, i.active, i.stand_id, i.category_id,
           c.name AS category_name
      FROM items i JOIN categories c ON c.id = i.category_id
     WHERE i.event_id = ${ev.id} AND i.id = ANY(${ids}::uuid[])`;
  const byId = new Map(items.map((i) => [i.id as string, i]));
  const out: PricedLine[] = [];
  const rateCache = new Map<string, number>();
  let n = 0;
  for (const l of body.lines) {
    const it = byId.get(l.item_id);
    if (!it || it.stand_id !== standId) throw new AppError('ITEM_NOT_FOUND', 'Unknown item for this stand', { item_id: l.item_id });
    if (!it.active && strictItems) throw new AppError('ITEM_UNAVAILABLE', 'Item is no longer available', { item_id: l.item_id });
    const mode = (body.consumption_mode ?? it.default_consumption_mode) as 'on_site' | 'takeaway';
    const key = `${it.vat_category}|${mode}`;
    let rate = rateCache.get(key);
    if (rate === undefined) {
      const r = await tx<Row[]>`SELECT vat_rate_bp(${ev.country}, ${it.vat_category}, ${mode}, ${on}::date) AS r`;
      rate = r[0]!.r as number;
      rateCache.set(key, rate);
    }
    n++;
    let unit = it.price_tokens as number;
    if (l.unit_price_tokens !== undefined && l.unit_price_tokens !== unit) {
      // online: the guest saw another price => PRICE_MISMATCH; offline: post with the terminal's price and flag it
      if (strictItems) throw new AppError('PRICE_MISMATCH', 'Prices changed, refresh the catalog', { catalog_version: ev.catalog_version });
      unit = l.unit_price_tokens;
      if (!priceFlags.includes('OFFLINE_PRICE_MISMATCH')) priceFlags.push('OFFLINE_PRICE_MISMATCH');
    }
    const tokens = l.qty * unit;
    out.push({
      line_no: n, item_id: it.id, item_name: it.name, category_id: it.category_id, category_name: it.category_name, qty: l.qty,
      unit_price_tokens: unit, vat_category: it.vat_category, consumption_mode: mode, vat_rate_bp: rate,
      gross_cents: tokens * ev.token_price_cents, tokens,
    });
  }
  return out;
}

/** Creates an order inside an already locked transaction. Used online (POST /orders) and offline (sync). */
export async function executeOrder(
  tx: Q,
  app: AppCtx,
  a: Actor,
  body: OrderRequest,
  offline: OfflineCtx | null,
): Promise<OpResult> {
  const ev = await loadEvent(tx, a.eventId);
  const isOffline = offline !== null;
  if (!isOffline) assertEventAcceptsWrites(ev, { training: a.training });
  const stand = await loadStand(tx, a.eventId, body.stand_id);
  if (stand.kind !== 'stand') throw new AppError('STAND_MISMATCH', 'Orders are sold at stands, not at cash desks');
  assertStandAccess(a, body.stand_id);

  const flags: Array<{ flag: string; detail: Record<string, unknown> }> = [];
  const rt = await resolveTag(tx, a, body.tag, { lenient: isOffline });
  if (rt.uidMismatch) flags.push({ flag: 'TAG_UID_MISMATCH', detail: { tag_code: body.tag.tag_code } });
  if (rt.wallet?.status === 'blocked') {
    if (!isOffline) assertWalletUsable(rt.wallet);
    flags.push({ flag: 'TAG_BLOCKED_AT_SYNC', detail: { tag_code: body.tag.tag_code } });
  }

  const eff = effectiveTime(body.client_created_at ?? null);
  const on = await businessDate(tx, ev.timezone, eff.at);
  const priceFlags: string[] = [];
  const lines = await priceLines(tx, ev, body, body.stand_id, on, !isOffline, priceFlags);
  const items_tokens = lines.reduce((s, l) => s + l.tokens, 0);
  const tip = body.tip_tokens;

  if (!isOffline) {
    const needsAge = await tx<Row[]>`SELECT 1 FROM items WHERE id = ANY(${body.lines.map((l) => l.item_id)}::uuid[]) AND min_age IS NOT NULL LIMIT 1`;
    if (needsAge.length > 0 && !body.age_check_confirmed) throw new AppError('AGE_CHECK_REQUIRED', 'Age check must be confirmed for this basket');
    if (tip > 0) {
      if (!ev.tips_enabled) throw new AppError('TIP_DISABLED', 'Tips are disabled for this event');
      if (tip > ev.tip_max_tokens || tip * 100 > items_tokens * ev.tip_max_percent) {
        throw new AppError('TIP_TOO_HIGH', 'Tip exceeds the allowed maximum', { max_tokens: ev.tip_max_tokens, max_percent: ev.tip_max_percent });
      }
    }
    if (body.expected_total_tokens !== undefined && body.expected_total_tokens !== items_tokens + tip) {
      throw new AppError('PRICE_MISMATCH', 'Prices changed, refresh the catalog', { catalog_version: ev.catalog_version, total_tokens: items_tokens + tip });
    }
  }
  const total = items_tokens + tip;
  if (isOffline && body.expected_total_tokens !== undefined && body.expected_total_tokens !== total && !priceFlags.length) priceFlags.push('OFFLINE_PRICE_MISMATCH');
  for (const f of priceFlags) flags.push({ flag: f, detail: { expected_total_tokens: body.expected_total_tokens ?? null, posted_total_tokens: total } });

  const acc = new Accounts(tx, a.eventId, a.training);
  const { walletId, account: wallet } = await acc.wallet(rt.tag.id);

  if (isOffline && offline) {
    const key = `${a.deviceId}:${walletId}`;
    const spent = (offline.capTracker.get(key) ?? 0) + total;
    offline.capTracker.set(key, spent);
    if (spent > ev.offline_cap_tokens) {
      flags.push({ flag: 'OFFLINE_CAP_EXCEEDED', detail: { cap_tokens: ev.offline_cap_tokens, spent_tokens: spent, tag_code: body.tag.tag_code } });
    }
  }

  const groups = groupVat(lines);
  const gross = groups.reduce((s, g) => s + g.gross_cents, 0);
  const net = groups.reduce((s, g) => s + g.net_cents, 0);
  const vat = groups.reduce((s, g) => s + g.vat_cents, 0);
  const singlePurpose = ev.voucher_type === 'single_purpose';

  const jb = new JournalBuilder()
    .add(wallet, -total)
    .add(await acc.stand(body.stand_id), items_tokens)
    .add(await acc.liability(), gross)
    .add(await acc.revenue(body.stand_id), -net);
  if (tip > 0) jb.add(await acc.tipsPayable(body.stand_id), tip);
  if (singlePurpose) jb.add(await acc.vatDeferred(), -vat);
  else for (const g of groups) jb.add(await acc.vat(g.vat_rate_bp), -g.vat_cents);

  const op = 'order';
  const j = await postJournal(tx, {
    eventId: a.eventId, kind: 'sale', clientTxId: body.client_tx_id, requestHash: requestHash(op, body), deviceId: a.deviceId,
    staffId: a.staffId, clientCreatedAt: body.client_created_at ?? null, offline: isOffline, training: a.training,
    allowNegative: isOffline, appVersion: a.appVersion ?? null, lines: jb.build(),
  });
  if (j.replayed) throw new AppError('INTERNAL_ERROR', 'Journal replay without idempotency record');

  const orderId = uuidv7();
  await tx`INSERT INTO orders(id, event_id, journal_id, kind, wallet_id, stand_id, device_id, staff_id, consumption_mode_override,
                              age_check_confirmed, items_tokens, tip_tokens, gross_cents, net_cents, vat_cents, provisional_ref)
           VALUES (${orderId}, ${a.eventId}, ${j.journalId}, 'sale', ${walletId}, ${body.stand_id}, ${a.deviceId}, ${a.staffId},
                   ${body.consumption_mode ?? null}, ${body.age_check_confirmed}, ${items_tokens}, ${tip}, ${gross}, ${net}, ${vat},
                   ${body.provisional_ref ?? offline?.provisionalRef ?? null})`;
  for (const l of lines) {
    await tx`INSERT INTO order_lines(order_id, line_no, item_id, item_name, category_id, category_name, qty, unit_price_tokens,
                                     vat_category, consumption_mode, vat_rate_bp, gross_cents)
             VALUES (${orderId}, ${l.line_no}, ${l.item_id}, ${l.item_name}, ${l.category_id}, ${l.category_name}, ${l.qty},
                     ${l.unit_price_tokens}, ${l.vat_category}, ${l.consumption_mode}, ${l.vat_rate_bp}, ${l.gross_cents})`;
  }
  for (const g of groups) {
    await tx`INSERT INTO order_vat(order_id, vat_rate_bp, gross_cents, net_cents, vat_cents, vat_due)
             VALUES (${orderId}, ${g.vat_rate_bp}, ${g.gross_cents}, ${g.net_cents}, ${g.vat_cents}, ${!singlePurpose})`;
  }
  for (const f of flags) await addFlag(tx, a.eventId, j.journalId, f.flag, f.detail);

  const [order] = await fetchOrders(tx, [orderId]);
  return { status: 201, body: order, journalId: j.journalId };
}

export function createOrder(app: AppCtx, a: Actor, body: OrderRequest) {
  return runIdempotent(app, a, { operation: 'order', clientTxId: body.client_tx_id, body }, (tx) => executeOrder(tx, app, a, body, null));
}

// ───────────────────────────── refunds ─────────────────────────────

export async function executeRefund(tx: Q, app: AppCtx, a: Actor, orderId: string, body: RefundOrderRequest, offline: boolean): Promise<OpResult> {
  const ev = await loadEvent(tx, a.eventId);
  const o = (await tx<Row[]>`SELECT o.*, w.account_id AS wallet_account FROM orders o JOIN wallets w ON w.id = o.wallet_id
                              WHERE o.id = ${orderId} AND o.event_id = ${a.eventId}`)[0];
  if (!o) throw new AppError('NOT_FOUND', 'Unknown order');
  if (o.training !== a.training) throw new AppError('TRAINING_MODE_MISMATCH', 'Training and production data cannot be mixed');
  if (o.kind !== 'sale') throw new AppError('REFUND_EXCEEDS_ORIGINAL', 'A refund order cannot be refunded');
  assertStandAccess(a, o.stand_id);

  const origLines = await tx<Row[]>`SELECT * FROM order_lines WHERE order_id = ${orderId} ORDER BY line_no`;
  // Already refunded quantities per original line (refund orders whose journal was not reversed).
  const done = await tx<Row[]>`
    SELECT l.refund_of_line_no AS line_no, sum(l.qty)::int AS qty
      FROM orders r JOIN order_lines l ON l.order_id = r.id
     WHERE r.refund_of_order_id = ${orderId} AND r.kind = 'refund'
       AND NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = r.journal_id)
     GROUP BY l.refund_of_line_no`;
  const doneQty = new Map(done.map((d) => [d.line_no as number, d.qty as number]));
  const tipDone = (await tx<Row[]>`
    SELECT COALESCE(sum(r.tip_tokens), 0)::int AS t FROM orders r
     WHERE r.refund_of_order_id = ${orderId} AND r.kind = 'refund'
       AND NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = r.journal_id)`)[0]!.t as number;

  const want = new Map<number, number>();
  if (body.lines) {
    for (const l of body.lines) want.set(l.line_no, (want.get(l.line_no) ?? 0) + l.qty);
  } else {
    for (const l of origLines) want.set(l.line_no, l.qty - (doneQty.get(l.line_no) ?? 0));
  }
  const chosen: Array<{ orig: Row; qty: number }> = [];
  for (const [lineNo, qty] of want) {
    if (qty <= 0) continue;
    const orig = origLines.find((l) => l.line_no === lineNo);
    if (!orig) throw new AppError('VALIDATION_ERROR', 'Unknown line_no', { fields: [{ path: 'lines', issue: `line ${lineNo} not in order` }] });
    if (qty > orig.qty - (doneQty.get(lineNo) ?? 0)) {
      throw new AppError('REFUND_EXCEEDS_ORIGINAL', 'Refund exceeds the original order', { line_no: lineNo });
    }
    chosen.push({ orig, qty });
  }
  const tipRefund = body.include_tip ? o.tip_tokens - tipDone : 0;
  if (body.include_tip && body.lines && o.tip_tokens - tipDone <= 0 && o.tip_tokens > 0) {
    throw new AppError('REFUND_EXCEEDS_ORIGINAL', 'Tip already refunded');
  }
  if (chosen.length === 0 && tipRefund <= 0) throw new AppError('REFUND_EXCEEDS_ORIGINAL', 'Nothing left to refund');

  const rlines = chosen.map((c, i) => ({
    line_no: i + 1, refund_of_line_no: c.orig.line_no as number, item_id: c.orig.item_id as string | null, item_name: c.orig.item_name as string,
    category_id: c.orig.category_id as string | null, category_name: c.orig.category_name as string | null, qty: c.qty,
    unit_price_tokens: c.orig.unit_price_tokens as number, vat_category: c.orig.vat_category as string,
    consumption_mode: c.orig.consumption_mode as string, vat_rate_bp: c.orig.vat_rate_bp as number,
    gross_cents: c.qty * c.orig.unit_price_tokens * ev.token_price_cents,
  }));
  const items_tokens = rlines.reduce((s, l) => s + l.qty * l.unit_price_tokens, 0);
  const groups = groupVat(rlines);
  const gross = groups.reduce((s, g) => s + g.gross_cents, 0);
  const net = groups.reduce((s, g) => s + g.net_cents, 0);
  const vat = groups.reduce((s, g) => s + g.vat_cents, 0);
  const singlePurpose = ev.voucher_type === 'single_purpose';

  const acc = new Accounts(tx, a.eventId, a.training);
  const walletAcc = { id: o.wallet_account as string, code: '', kind: 'wallet', unit: 'TOKEN' as const };
  const codeRow = await tx<Row[]>`SELECT code FROM accounts WHERE id = ${walletAcc.id}`;
  walletAcc.code = codeRow[0]!.code;

  const jb = new JournalBuilder()
    .add(walletAcc, items_tokens + tipRefund)
    .add(await acc.stand(o.stand_id), -items_tokens)
    .add(await acc.liability(), -gross)
    .add(await acc.revenue(o.stand_id), net);
  if (tipRefund > 0) {
    const tp = await acc.tipsPayable(o.stand_id);
    const bal = (await tx<Row[]>`SELECT COALESCE(balance, 0)::bigint AS b FROM account_balances WHERE account_id = ${tp.id}`)[0]?.b ?? 0;
    if (bal < tipRefund) throw new AppError('INSUFFICIENT_BALANCE', 'Tips already paid out', { balance_tokens: bal, required_tokens: tipRefund });
    jb.add(tp, -tipRefund);
  }
  if (singlePurpose) jb.add(await acc.vatDeferred(), vat);
  else for (const g of groups) jb.add(await acc.vat(g.vat_rate_bp), g.vat_cents);

  const j = await postJournal(tx, {
    eventId: a.eventId, kind: 'order_refund', clientTxId: body.client_tx_id, requestHash: requestHash('order.refund:' + orderId, body),
    deviceId: a.deviceId, staffId: a.staffId, clientCreatedAt: body.client_created_at ?? null, offline, training: a.training,
    reasonCode: body.reason_code, appVersion: a.appVersion ?? null, lines: jb.build(),
  });
  const refundId = uuidv7();
  await insertOrderFacts(tx, {
    id: refundId, eventId: a.eventId, journalId: j.journalId, kind: 'refund', refundOf: orderId, walletId: o.wallet_id, standId: o.stand_id,
    deviceId: a.deviceId, staffId: a.staffId, override: o.consumption_mode_override, itemsTokens: items_tokens, tip: tipRefund, gross, net, vat,
    provisionalRef: body.provisional_ref ?? null, lines: rlines, groups, vatDue: !singlePurpose,
  });
  const [order] = await fetchOrders(tx, [refundId]);
  return { status: 201, body: order, journalId: j.journalId };
}

export function refundOrder(app: AppCtx, a: Actor, orderId: string, body: RefundOrderRequest) {
  return runIdempotent(app, a, { operation: 'order.refund:' + orderId, clientTxId: body.client_tx_id, body }, (tx) =>
    executeRefund(tx, app, a, orderId, body, false));
}

export interface OrderFactInput {
  id: string; eventId: string; journalId: string; kind: 'sale' | 'refund'; refundOf: string | null; walletId: string; standId: string;
  deviceId: string | null; staffId: string | null; override: string | null; itemsTokens: number; tip: number; gross: number; net: number; vat: number;
  provisionalRef: string | null; vatDue: boolean; groups: VatGroup[];
  lines: Array<{ line_no: number; refund_of_line_no: number | null; item_id: string | null; item_name: string; category_id: string | null;
    category_name: string | null; qty: number; unit_price_tokens: number; vat_category: string; consumption_mode: string; vat_rate_bp: number; gross_cents: number }>;
}

export async function insertOrderFacts(tx: Q, f: OrderFactInput): Promise<void> {
  await tx`INSERT INTO orders(id, event_id, journal_id, kind, refund_of_order_id, wallet_id, stand_id, device_id, staff_id,
                              consumption_mode_override, items_tokens, tip_tokens, gross_cents, net_cents, vat_cents, provisional_ref)
           VALUES (${f.id}, ${f.eventId}, ${f.journalId}, ${f.kind}, ${f.refundOf}, ${f.walletId}, ${f.standId}, ${f.deviceId}, ${f.staffId},
                   ${f.override}, ${f.itemsTokens}, ${f.tip}, ${f.gross}, ${f.net}, ${f.vat}, ${f.provisionalRef})`;
  for (const l of f.lines) {
    await tx`INSERT INTO order_lines(order_id, line_no, item_id, item_name, category_id, category_name, qty, unit_price_tokens,
                                     vat_category, consumption_mode, vat_rate_bp, gross_cents, refund_of_line_no)
             VALUES (${f.id}, ${l.line_no}, ${l.item_id}, ${l.item_name}, ${l.category_id}, ${l.category_name}, ${l.qty},
                     ${l.unit_price_tokens}, ${l.vat_category}, ${l.consumption_mode}, ${l.vat_rate_bp}, ${l.gross_cents}, ${l.refund_of_line_no})`;
  }
  for (const g of f.groups) {
    await tx`INSERT INTO order_vat(order_id, vat_rate_bp, gross_cents, net_cents, vat_cents, vat_due)
             VALUES (${f.id}, ${g.vat_rate_bp}, ${g.gross_cents}, ${g.net_cents}, ${g.vat_cents}, ${f.vatDue})`;
  }
}

// ───────────────────────────── read side ─────────────────────────────

/** Order resources (contract `Order`) for the given ids, in the same order. */
export async function fetchOrders(tx: Q, ids: string[]): Promise<Record<string, unknown>[]> {
  if (ids.length === 0) return [];
  const rows = await tx<Row[]>`
    SELECT o.*, j.seq AS journal_seq, t.tag_code,
           (SELECT COALESCE(sum(p.amount), 0)::bigint FROM postings p JOIN journal jj ON jj.id = p.journal_id
             WHERE p.account_id = w.account_id AND jj.seq <= j.seq) AS balance_tokens
      FROM orders o JOIN journal j ON j.id = o.journal_id JOIN wallets w ON w.id = o.wallet_id JOIN tags t ON t.id = w.tag_id
     WHERE o.id = ANY(${ids}::uuid[])`;
  const lines = await tx<Row[]>`SELECT * FROM order_lines WHERE order_id = ANY(${ids}::uuid[]) ORDER BY order_id, line_no`;
  const vats = await tx<Row[]>`SELECT * FROM order_vat WHERE order_id = ANY(${ids}::uuid[]) ORDER BY order_id, vat_rate_bp DESC`;
  const flags = await tx<Row[]>`SELECT o.id AS order_id, f.flag FROM orders o JOIN ledger_flags f ON f.journal_id = o.journal_id
                                  WHERE o.id = ANY(${ids}::uuid[]) ORDER BY f.id`;
  const byId = new Map(rows.map((r) => [r.id as string, r]));
  return ids.map((id) => {
    const o = byId.get(id);
    if (!o) throw new AppError('NOT_FOUND', 'Unknown order');
    return {
      id: o.id,
      kind: o.kind,
      refund_of_order_id: o.refund_of_order_id,
      journal_id: o.journal_id,
      journal_seq: o.journal_seq,
      receipt_no: o.receipt_no,
      grand_total_cents: o.grand_total_cents,
      provisional_ref: o.provisional_ref,
      stand_id: o.stand_id,
      tag_code: o.tag_code,
      lines: lines.filter((l) => l.order_id === id).map((l) => ({
        line_no: l.line_no, item_id: l.item_id, item_name: l.item_name, qty: l.qty, unit_price_tokens: l.unit_price_tokens,
        tokens: l.qty * l.unit_price_tokens, vat_category: l.vat_category, consumption_mode: l.consumption_mode,
        vat_rate_bp: l.vat_rate_bp, gross_cents: l.gross_cents, refund_of_line_no: l.refund_of_line_no,
      })),
      items_tokens: o.items_tokens,
      tip_tokens: o.tip_tokens,
      total_tokens: o.items_tokens + o.tip_tokens,
      gross_cents: o.gross_cents,
      net_cents: o.net_cents,
      vat_cents: o.vat_cents,
      vat_groups: vats.filter((v) => v.order_id === id).map((v) => ({
        vat_rate_bp: v.vat_rate_bp, gross_cents: v.gross_cents, net_cents: v.net_cents, vat_cents: v.vat_cents, vat_due: v.vat_due,
      })),
      consumption_mode_override: o.consumption_mode_override,
      balance_tokens: o.balance_tokens,
      flags: flags.filter((f) => f.order_id === id).map((f) => f.flag),
      business_date: o.business_date instanceof Date ? o.business_date.toISOString().slice(0, 10) : o.business_date,
      training: o.training,
      created_at: o.created_at,
    };
  });
}

export async function listOrders(
  tx: Q,
  eventId: string,
  a: Pick<Actor, 'role' | 'standId' | 'training'>,
  q: { stand_id?: string; business_date?: string; tag_code?: string; kind?: string; limit: number; cursor?: string },
) {
  const cur = decodeCursor<{ t: string; id: string }>(q.cursor);
  const standFilter = a.role === 'vendor' ? a.standId : (q.stand_id ?? null);
  const rows = await tx<Row[]>`
    SELECT o.id, o.created_at FROM orders o JOIN wallets w ON w.id = o.wallet_id JOIN tags t ON t.id = w.tag_id
     WHERE o.event_id = ${eventId} AND o.training = ${a.training}
       AND (${standFilter}::uuid IS NULL OR o.stand_id = ${standFilter})
       AND (${q.business_date ?? null}::date IS NULL OR o.business_date = ${q.business_date ?? null})
       AND (${q.tag_code ?? null}::text IS NULL OR t.tag_code = ${q.tag_code ?? null})
       AND (${q.kind ?? null}::text IS NULL OR o.kind = ${q.kind ?? null})
       AND (${cur?.t ?? null}::timestamptz IS NULL OR (o.created_at, o.id) < (${cur?.t ?? null}::timestamptz, ${cur?.id ?? null}::uuid))
     ORDER BY o.created_at DESC, o.id DESC LIMIT ${q.limit + 1}`;
  const p = page(rows, q.limit, (r) => ({ t: (r.created_at as Date).toISOString(), id: r.id }), encodeCursor);
  return { items: await fetchOrders(tx, p.items.map((r) => r.id as string)), next_cursor: p.next_cursor };
}
