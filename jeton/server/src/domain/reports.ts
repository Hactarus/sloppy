import type { Q, Row } from '../db.js';
import { AppError } from '../errors.js';
import { canonicalJson } from '../util/crypto.js';
import { loadEvent } from './common.js';

/** SQL fragment: the fact's journal has not been reversed (reversal journals have no fact rows of their own, except order credit notes). */
const nr = (tx: Q, alias: string) => tx`NOT EXISTS (SELECT 1 FROM journal x WHERE x.reverses_journal_id = ${tx(alias)}.journal_id)`;

// ───────────────────────────── Z report ─────────────────────────────

export interface ZContent extends Record<string, unknown> {
  event_id: string;
  stand_id: string;
  business_date: string;
}

/** Content of a Z-report for one stand and business day (training data excluded). Same code for preview and seal. */
export async function buildZContent(tx: Q, eventId: string, standId: string, date: string): Promise<{ content: ZContent; firstReceipt: number | null; lastReceipt: number | null; periodStart: Date; periodEnd: Date }> {
  const ev = await loadEvent(tx, eventId);
  const st = (await tx<Row[]>`SELECT * FROM stands WHERE id = ${standId} AND event_id = ${eventId}`)[0];
  if (!st) throw new AppError('NOT_FOUND', 'Unknown stand');

  const per = (await tx<Row[]>`
    SELECT (${date}::date::timestamp AT TIME ZONE ${ev.timezone}) AS s,
           ((${date}::date + 1)::timestamp AT TIME ZONE ${ev.timezone}) AS e`)[0]!;

  const o = (await tx<Row[]>`
    SELECT count(*) FILTER (WHERE kind = 'sale')::int AS orders_count,
           count(*) FILTER (WHERE kind = 'refund')::int AS refunds_count,
           COALESCE(sum(gross_cents) FILTER (WHERE kind = 'refund'), 0)::bigint AS refunds_gross_cents,
           COALESCE(sum(CASE WHEN kind = 'refund' THEN -gross_cents ELSE gross_cents END), 0)::bigint AS gross_cents,
           COALESCE(sum(CASE WHEN kind = 'refund' THEN -net_cents   ELSE net_cents   END), 0)::bigint AS net_cents,
           COALESCE(sum(CASE WHEN kind = 'refund' THEN -vat_cents   ELSE vat_cents   END), 0)::bigint AS vat_cents,
           COALESCE(sum(CASE WHEN kind = 'refund' THEN -items_tokens ELSE items_tokens END), 0)::bigint AS total_tokens,
           COALESCE(sum(CASE WHEN kind = 'refund' THEN -tip_tokens  ELSE tip_tokens  END), 0)::bigint AS tips_tokens,
           min(receipt_no) AS first_receipt, max(receipt_no) AS last_receipt
      FROM orders WHERE event_id = ${eventId} AND stand_id = ${standId} AND business_date = ${date}::date AND NOT training`)[0]!;

  const groups = await tx<Row[]>`
    SELECT v.vat_rate_bp,
           sum(CASE WHEN o.kind = 'refund' THEN -v.gross_cents ELSE v.gross_cents END)::bigint AS gross_cents,
           sum(CASE WHEN o.kind = 'refund' THEN -v.net_cents   ELSE v.net_cents   END)::bigint AS net_cents,
           sum(CASE WHEN o.kind = 'refund' THEN -v.vat_cents   ELSE v.vat_cents   END)::bigint AS vat_cents,
           bool_and(v.vat_due) AS vat_due
      FROM orders o JOIN order_vat v ON v.order_id = o.id
     WHERE o.event_id = ${eventId} AND o.stand_id = ${standId} AND o.business_date = ${date}::date AND NOT o.training
     GROUP BY v.vat_rate_bp ORDER BY v.vat_rate_bp DESC`;

  let first: number | null = o.first_receipt;
  let last: number | null = o.last_receipt;
  let byMethod: unknown[] = [];
  let cashRec: unknown = null;
  if (st.kind === 'cashdesk') {
    const tm = await tx<Row[]>`
      SELECT payment_method, count(*)::int AS count, sum(amount_cents)::bigint AS topups_cents, 0::bigint AS cashouts_cents,
             min(receipt_no) AS f, max(receipt_no) AS l
        FROM topups t WHERE t.event_id = ${eventId} AND t.stand_id = ${standId} AND t.business_date = ${date}::date AND NOT t.training AND ${nr(tx, 't')}
       GROUP BY payment_method
      UNION ALL
      SELECT payment_method, count(*)::int, 0::bigint, sum(amount_cents)::bigint, min(receipt_no), max(receipt_no)
        FROM cashouts c WHERE c.event_id = ${eventId} AND c.stand_id = ${standId} AND c.business_date = ${date}::date AND NOT c.training AND ${nr(tx, 'c')}
       GROUP BY payment_method`;
    const m = new Map<string, { payment_method: string; topups_cents: number; cashouts_cents: number; count: number }>();
    for (const r of tm) {
      const e = m.get(r.payment_method) ?? { payment_method: r.payment_method, topups_cents: 0, cashouts_cents: 0, count: 0 };
      e.topups_cents += Number(r.topups_cents);
      e.cashouts_cents += Number(r.cashouts_cents);
      e.count += r.count;
      m.set(r.payment_method, e);
      if (r.f !== null) first = first === null ? r.f : Math.min(first, r.f);
      if (r.l !== null) last = last === null ? r.l : Math.max(last, r.l);
    }
    byMethod = [...m.values()].sort((a, b) => a.payment_method.localeCompare(b.payment_method));
    const cs = (await tx<Row[]>`
      SELECT count(*)::int AS n, COALESCE(sum(expected_cents), 0)::bigint AS expected, COALESCE(sum(counted_cents), 0)::bigint AS counted,
             COALESCE(sum(variance_cents), 0)::bigint AS variance
        FROM cashdesk_sessions s
       WHERE s.cashdesk_id = ${standId} AND s.closed_at IS NOT NULL
         AND (s.closed_at AT TIME ZONE ${ev.timezone})::date = ${date}::date`)[0]!;
    cashRec = cs.n > 0 ? { expected_cents: cs.expected, counted_cents: cs.counted, variance_cents: cs.variance } : null;
  }

  const head = (await tx<Row[]>`SELECT last_seq, encode(last_hash, 'hex') AS h FROM event_chain WHERE event_id = ${eventId}`)[0]!;
  const counter = (await tx<Row[]>`SELECT grand_total_cents FROM stand_counters WHERE stand_id = ${standId}`)[0];

  const content: ZContent = {
    event_id: eventId,
    stand_id: standId,
    business_date: date,
    period_start: per.s,
    period_end: per.e,
    first_receipt_no: first,
    last_receipt_no: last,
    orders_count: o.orders_count,
    refunds_count: o.refunds_count,
    refunds_gross_cents: o.refunds_gross_cents,
    gross_cents: o.gross_cents,
    net_cents: o.net_cents,
    vat_cents: o.vat_cents,
    vat_groups: groups.map((g) => ({ vat_rate_bp: g.vat_rate_bp, gross_cents: g.gross_cents, net_cents: g.net_cents, vat_cents: g.vat_cents, vat_due: g.vat_due })),
    total_tokens: o.total_tokens,
    tips_tokens: o.tips_tokens,
    by_method: byMethod,
    cash_reconciliation: cashRec,
    grand_total_cents: counter?.grand_total_cents ?? 0,
    chain_seq: head.last_seq,
    chain_hash: head.h,
  };
  return { content, firstReceipt: first, lastReceipt: last, periodStart: per.s, periodEnd: per.e };
}

export function zPreviewDto(content: ZContent) {
  return { id: null, sealed: false, z_no: null, z_seq: null, prev_hash: null, hash: null, sealed_at: null, ...content };
}

export function zRowDto(r: Row) {
  const payload = JSON.parse(r.payload) as Record<string, unknown>;
  return {
    ...payload,
    id: r.id, sealed: true, z_no: r.z_no, z_seq: r.z_seq, period_start: r.period_start, period_end: r.period_end,
    first_receipt_no: r.first_receipt_no, last_receipt_no: r.last_receipt_no, grand_total_cents: r.grand_total_cents,
    chain_seq: r.chain_seq, chain_hash: Buffer.from(r.chain_hash).toString('hex'), prev_hash: Buffer.from(r.prev_hash).toString('hex'),
    hash: Buffer.from(r.hash).toString('hex'), sealed_at: r.sealed_at,
  };
}

export const zPayload = (content: ZContent): string => canonicalJson(content);

// ───────────────────────────── sales ─────────────────────────────

const GROUPS = ['item', 'category', 'vat_rate', 'stand', 'hour', 'day'] as const;
export type SalesGroup = (typeof GROUPS)[number];
export const SALES_GROUPS = GROUPS;

export async function salesReport(tx: Q, eventId: string, q: { group_by: SalesGroup; from?: string; to?: string; stand_id?: string | null }) {
  const ev = await loadEvent(tx, eventId);
  const from = q.from ?? null;
  const to = q.to ?? null;
  const stand = q.stand_id ?? null;
  let rows: Row[];
  if (q.group_by === 'vat_rate') {
    // exact: VAT is computed per rate group per order
    rows = await tx<Row[]>`
      SELECT v.vat_rate_bp::text AS key, (v.vat_rate_bp / 100.0)::text || ' %' AS label,
             COALESCE((SELECT sum(CASE WHEN o2.kind = 'refund' THEN -l.qty ELSE l.qty END) FROM orders o2 JOIN order_lines l ON l.order_id = o2.id
                        WHERE o2.event_id = ${eventId} AND NOT o2.training AND l.vat_rate_bp = v.vat_rate_bp
                          AND (${from}::date IS NULL OR o2.business_date >= ${from}) AND (${to}::date IS NULL OR o2.business_date <= ${to})
                          AND (${stand}::uuid IS NULL OR o2.stand_id = ${stand})), 0)::bigint AS qty,
             sum(CASE WHEN o.kind = 'refund' THEN -v.gross_cents ELSE v.gross_cents END)::bigint AS gross_cents,
             sum(CASE WHEN o.kind = 'refund' THEN -v.net_cents   ELSE v.net_cents   END)::bigint AS net_cents,
             sum(CASE WHEN o.kind = 'refund' THEN -v.vat_cents   ELSE v.vat_cents   END)::bigint AS vat_cents
        FROM orders o JOIN order_vat v ON v.order_id = o.id
       WHERE o.event_id = ${eventId} AND NOT o.training
         AND (${from}::date IS NULL OR o.business_date >= ${from}) AND (${to}::date IS NULL OR o.business_date <= ${to})
         AND (${stand}::uuid IS NULL OR o.stand_id = ${stand})
       GROUP BY v.vat_rate_bp ORDER BY v.vat_rate_bp DESC`;
    for (const r of rows) r.tokens = Math.round(Number(r.gross_cents) / ev.token_price_cents);
  } else {
    // per line: VAT = round_half_up(gross * rate / (10000 + rate)) per line (may differ by cents from the per-order group rounding)
    const keyExpr = {
      item: tx`l.item_id::text`,
      category: tx`l.category_id::text`,
      stand: tx`o.stand_id::text`,
      hour: tx`to_char(j.effective_at AT TIME ZONE ${ev.timezone}, 'YYYY-MM-DD"T"HH24":00"')`,
      day: tx`o.business_date::text`,
    }[q.group_by as Exclude<SalesGroup, 'vat_rate'>];
    const labelExpr = {
      item: tx`max(l.item_name)`,
      category: tx`max(l.category_name)`,
      stand: tx`max(s.name)`,
      hour: tx`NULL`,
      day: tx`NULL`,
    }[q.group_by as Exclude<SalesGroup, 'vat_rate'>];
    rows = await tx<Row[]>`
      SELECT ${keyExpr} AS key, ${labelExpr} AS label,
             sum(sg * l.qty)::bigint AS qty,
             sum(sg * l.qty * l.unit_price_tokens)::bigint AS tokens,
             sum(sg * l.gross_cents)::bigint AS gross_cents,
             sum(sg * (l.gross_cents - ((2 * l.gross_cents * l.vat_rate_bp + (10000 + l.vat_rate_bp)) / (2 * (10000 + l.vat_rate_bp)))))::bigint AS net_cents,
             sum(sg * ((2 * l.gross_cents * l.vat_rate_bp + (10000 + l.vat_rate_bp)) / (2 * (10000 + l.vat_rate_bp))))::bigint AS vat_cents
        FROM (SELECT o.*, CASE WHEN o.kind = 'refund' THEN -1 ELSE 1 END AS sg FROM orders o) o
        JOIN order_lines l ON l.order_id = o.id JOIN journal j ON j.id = o.journal_id JOIN stands s ON s.id = o.stand_id
       WHERE o.event_id = ${eventId} AND NOT o.training
         AND (${from}::date IS NULL OR o.business_date >= ${from}) AND (${to}::date IS NULL OR o.business_date <= ${to})
         AND (${stand}::uuid IS NULL OR o.stand_id = ${stand})
       GROUP BY 1 ORDER BY 1`;
  }
  const out = rows.map((r) => ({
    key: r.key, label: r.label ?? undefined, qty: Number(r.qty), tokens: Number(r.tokens), gross_cents: Number(r.gross_cents),
    net_cents: Number(r.net_cents), vat_cents: Number(r.vat_cents),
  }));
  const sum = (k: 'qty' | 'tokens' | 'gross_cents' | 'net_cents' | 'vat_cents') => out.reduce((s, r) => s + r[k], 0);
  return {
    group_by: q.group_by,
    rows: out,
    totals: { qty: sum('qty'), tokens: sum('tokens'), gross_cents: sum('gross_cents'), net_cents: sum('net_cents'), vat_cents: sum('vat_cents') },
  };
}

// ───────────────────────────── VAT ─────────────────────────────

/** Return-box mapping [À VALIDER by the accountant]: BE VAT return grids (turnover 00/01/02/03), FR CA3 lines (08/09/9B). */
export function vatBox(country: string, rateBp: number): string | null {
  const be: Record<number, string> = { 0: '00', 600: '01', 1200: '02', 2100: '03' };
  const fr: Record<number, string> = { 2000: '08', 550: '09', 1000: '9B' };
  return (country === 'BE' ? be[rateBp] : fr[rateBp]) ?? null;
}

export async function vatReport(tx: Q, eventId: string, q: { from?: string; to?: string }) {
  const ev = await loadEvent(tx, eventId);
  const from = q.from ?? null;
  const to = q.to ?? null;
  let rows: Row[];
  if (ev.voucher_type === 'single_purpose') {
    // VAT booked at top-up (ADR 0005)
    const t = await tx<Row[]>`
      SELECT t.business_date, t.stand_id, sum(t.amount_cents)::bigint AS gross_cents, sum(t.vat_cents)::bigint AS vat_cents
        FROM topups t WHERE t.event_id = ${eventId} AND NOT t.training AND t.kind = 'paid' AND ${nr(tx, 't')}
         AND (${from}::date IS NULL OR t.business_date >= ${from}) AND (${to}::date IS NULL OR t.business_date <= ${to})
       GROUP BY t.business_date, t.stand_id ORDER BY t.business_date`;
    rows = [];
    for (const r of t) {
      const rate = (await tx<Row[]>`SELECT vat_rate_bp(${ev.country}, ${ev.single_purpose_vat_category}, 'on_site', ${r.business_date}::date) AS r`)[0]!.r;
      rows.push({ ...r, vat_rate_bp: rate, net_cents: Number(r.gross_cents) - Number(r.vat_cents) });
    }
  } else {
    rows = await tx<Row[]>`
      SELECT business_date, stand_id, vat_rate_bp, gross_cents, net_cents, vat_cents FROM v_vat_breakdown
       WHERE event_id = ${eventId} AND (${from}::date IS NULL OR business_date >= ${from}) AND (${to}::date IS NULL OR business_date <= ${to})
       ORDER BY business_date, stand_id, vat_rate_bp DESC`;
  }
  const out = rows.map((r) => ({
    business_date: r.business_date, stand_id: r.stand_id, vat_rate_bp: r.vat_rate_bp, box: vatBox(ev.country, r.vat_rate_bp),
    gross_cents: Number(r.gross_cents), net_cents: Number(r.net_cents), vat_cents: Number(r.vat_cents),
  }));
  return {
    event_id: eventId,
    voucher_type: ev.voucher_type,
    rows: out,
    totals: {
      gross_cents: out.reduce((s, r) => s + r.gross_cents, 0),
      net_cents: out.reduce((s, r) => s + r.net_cents, 0),
      vat_cents: out.reduce((s, r) => s + r.vat_cents, 0),
    },
  };
}

// ───────────────────────────── top-ups, liability, tips ─────────────────────────────

export async function topupsReport(tx: Q, eventId: string, q: { from?: string; to?: string }) {
  const from = q.from ?? null;
  const to = q.to ?? null;
  const t = await tx<Row[]>`
    SELECT payment_method, count(*)::int AS count, sum(amount_cents)::bigint AS gross_cents, sum(tokens)::bigint AS tokens
      FROM topups t WHERE t.event_id = ${eventId} AND NOT t.training AND ${nr(tx, 't')}
       AND (${from}::date IS NULL OR t.business_date >= ${from}) AND (${to}::date IS NULL OR t.business_date <= ${to})
     GROUP BY payment_method`;
  const c = await tx<Row[]>`
    SELECT payment_method, sum(amount_cents)::bigint AS cents FROM cashouts c WHERE c.event_id = ${eventId} AND NOT c.training AND ${nr(tx, 'c')}
       AND (${from}::date IS NULL OR c.business_date >= ${from}) AND (${to}::date IS NULL OR c.business_date <= ${to})
     GROUP BY payment_method`;
  const s = await tx<Row[]>`
    SELECT method, sum(fee_cents)::bigint AS fees, sum(net_cents)::bigint AS net FROM psp_settlements s
     WHERE s.event_id = ${eventId} AND ${nr(tx, 's')}
       AND (${from}::date IS NULL OR s.payout_date >= ${from}) AND (${to}::date IS NULL OR s.payout_date <= ${to})
     GROUP BY method`;
  const un = (await tx<Row[]>`
    SELECT count(*)::int AS n FROM psp_settlement_lines l JOIN psp_settlements s ON s.id = l.settlement_id
     WHERE s.event_id = ${eventId} AND l.matched_topup_id IS NULL`)[0]!.n;
  const cv = (await tx<Row[]>`
    SELECT COALESCE(sum(variance_cents), 0)::bigint AS v FROM cashdesk_sessions WHERE event_id = ${eventId} AND closed_at IS NOT NULL`)[0]!.v;
  const methods = new Set<string>([...t.map((r) => r.payment_method), ...c.map((r) => r.payment_method), ...s.map((r) => r.method)]);
  const by_method = [...methods].sort().map((m) => {
    const tr = t.find((r) => r.payment_method === m);
    const cr = c.find((r) => r.payment_method === m);
    const sr = s.find((r) => r.method === m);
    const gross = Number(tr?.gross_cents ?? 0);
    const fees = Number(sr?.fees ?? 0);
    return {
      payment_method: m, count: tr?.count ?? 0, gross_cents: gross, tokens: Number(tr?.tokens ?? 0), cashouts_cents: Number(cr?.cents ?? 0),
      psp_fees_cents: fees, net_cents: gross - fees, paid_out_cents: Number(sr?.net ?? 0),
    };
  });
  return { by_method, unmatched_psp_lines: un, cash_variance_cents: Number(cv) };
}

export async function liabilityReport(tx: Q, eventId: string, asOf: Date | null) {
  const ev = await loadEvent(tx, eventId);
  const at = asOf ?? new Date();
  const kinds = await tx<Row[]>`
    SELECT a.kind, sum(p.amount)::bigint AS s
      FROM postings p JOIN journal j ON j.id = p.journal_id JOIN accounts a ON a.id = p.account_id
     WHERE p.event_id = ${eventId} AND NOT a.training AND j.occurred_at <= ${at}
     GROUP BY a.kind`;
  const k = (kind: string) => Number(kinds.find((r) => r.kind === kind)?.s ?? 0);
  const wallets = await tx<Row[]>`
    SELECT p.account_id, sum(p.amount)::bigint AS b
      FROM postings p JOIN journal j ON j.id = p.journal_id JOIN accounts a ON a.id = p.account_id
     WHERE p.event_id = ${eventId} AND a.kind = 'wallet' AND NOT a.training AND j.occurred_at <= ${at}
     GROUP BY p.account_id`;
  const outstanding = k('wallet');
  return {
    as_of: at,
    outstanding_tokens: outstanding,
    outstanding_cents: outstanding * ev.token_price_cents,
    wallets_with_balance: wallets.filter((w) => Number(w.b) > 0).length,
    negative_wallets: wallets.filter((w) => Number(w.b) < 0).length,
    tips_payable_tokens: k('tips_payable'),
    promo_issued_tokens: -k('promo_tokens'),
    refunds_tokens: k('refund_tokens'),
    breakage_tokens: k('breakage_tokens'),
    breakage_cents: -k('breakage_income'),
  };
}

export async function tipsReport(tx: Q, eventId: string, groupBy: 'stand' | 'staff' | 'day') {
  const ev = await loadEvent(tx, eventId);
  const payable = Number((await tx<Row[]>`SELECT COALESCE(sum(tokens), 0)::bigint AS t FROM v_tips_payable WHERE event_id = ${eventId}`)[0]!.t);
  const paidTotal = Number((await tx<Row[]>`
    SELECT COALESCE(sum(tokens), 0)::bigint AS t FROM tips_payouts p WHERE p.event_id = ${eventId} AND NOT p.training AND ${nr(tx, 'p')}`)[0]!.t);
  let rows: Row[];
  if (groupBy === 'stand') {
    rows = await tx<Row[]>`
      SELECT s.id::text AS key, s.name AS label,
             COALESCE((SELECT sum(tip_tokens) FROM v_tips v WHERE v.event_id = ${eventId} AND v.stand_id = s.id), 0)::bigint AS tip_tokens,
             COALESCE((SELECT sum(p.tokens) FROM tips_payouts p WHERE p.event_id = ${eventId} AND p.stand_id = s.id AND NOT p.training
                        AND ${nr(tx, 'p')}), 0)::bigint AS paid_tokens
        FROM stands s WHERE s.event_id = ${eventId} AND s.kind = 'stand' ORDER BY s.sort_order, s.name`;
  } else if (groupBy === 'staff') {
    rows = await tx<Row[]>`
      SELECT st.id::text AS key, st.name AS label,
             COALESCE((SELECT sum(tip_tokens) FROM v_tips v WHERE v.event_id = ${eventId} AND v.staff_id = st.id), 0)::bigint AS tip_tokens,
             COALESCE((SELECT sum(p.tokens) FROM tips_payouts p WHERE p.event_id = ${eventId} AND p.recipient_staff_id = st.id AND NOT p.training
                        AND ${nr(tx, 'p')}), 0)::bigint AS paid_tokens
        FROM staff st WHERE st.id IN (SELECT staff_id FROM v_tips WHERE event_id = ${eventId} AND staff_id IS NOT NULL
                                       UNION SELECT recipient_staff_id FROM tips_payouts WHERE event_id = ${eventId} AND recipient_staff_id IS NOT NULL)
       ORDER BY st.name`;
  } else {
    rows = await tx<Row[]>`
      SELECT d.d::text AS key, NULL AS label,
             COALESCE((SELECT sum(tip_tokens) FROM v_tips v WHERE v.event_id = ${eventId} AND v.business_date = d.d), 0)::bigint AS tip_tokens,
             COALESCE((SELECT sum(p.tokens) FROM tips_payouts p WHERE p.event_id = ${eventId} AND p.business_date = d.d AND NOT p.training
                        AND ${nr(tx, 'p')}), 0)::bigint AS paid_tokens
        FROM (SELECT business_date AS d FROM v_tips WHERE event_id = ${eventId}
              UNION SELECT business_date FROM tips_payouts WHERE event_id = ${eventId} AND NOT training) d ORDER BY d.d`;
  }
  return {
    group_by: groupBy,
    payable_tokens: payable,
    paid_tokens: paidTotal,
    rows: rows.map((r) => ({
      key: r.key, label: r.label ?? undefined, tip_tokens: Number(r.tip_tokens), tip_cents: Number(r.tip_tokens) * ev.token_price_cents,
      paid_tokens: Number(r.paid_tokens),
    })),
  };
}

export async function redemptionVolume(tx: Q, organizerId: string) {
  const r = (await tx<Row[]>`SELECT * FROM v_redemptions_rolling_12m WHERE organizer_id = ${organizerId}`)[0];
  if (!r) throw new AppError('NOT_FOUND', 'Unknown organizer');
  const v = Number(r.redeemed_cents_12m);
  return {
    organizer_id: organizerId,
    redeemed_cents_12m: v,
    warn_threshold_cents: Number(r.warn_threshold_cents),
    limit_threshold_cents: Number(r.limit_threshold_cents),
    status: v >= Number(r.limit_threshold_cents) ? 'limit_reached' : v >= Number(r.warn_threshold_cents) ? 'warn' : 'ok',
  };
}
