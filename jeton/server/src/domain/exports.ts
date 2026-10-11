import type { Q, Row } from '../db.js';
import { AppError } from '../errors.js';
import { toCsv } from '../util/csv.js';
import { centsToDecimal } from '../util/money.js';
import { uidPseudonym } from '../util/crypto.js';
import { loadEvent } from './common.js';

export const DATASETS = ['journal', 'postings', 'orders', 'order_lines', 'topups', 'cashouts', 'tips', 'tips_payouts', 'vat_daily', 'fec', 'accounting', 'z_reports', 'flags'] as const;
export type Dataset = (typeof DATASETS)[number];

type Def = { cols: string[]; rows: (tx: Q, eventId: string, inc: boolean, ctx: { pepper: string }) => Promise<Row[]> };

const hex = (b: unknown) => (b ? Buffer.from(b as Buffer).toString('hex') : '');

/** journal / postings are the input of the offline verification tool: ALL journals (training ones carry is_training=true) so the chain has no gaps. */
const JOURNAL_COLS = ['event_id', 'seq', 'journal_id', 'kind', 'client_tx_id', 'reverses_journal_id', 'device_id', 'staff_id', 'offline', 'is_training',
  'occurred_at', 'occurred_us', 'effective_at', 'effective_us', 'reason_code', 'request_hash', 'prev_hash', 'hash'];
const POSTING_COLS = ['journal_id', 'line_no', 'account_id', 'account_code', 'unit', 'amount'];

const defs: Record<Dataset, Def> = {
  journal: {
    cols: JOURNAL_COLS,
    rows: async (tx, e) => (await tx<Row[]>`
      SELECT j.event_id, j.seq, j.id AS journal_id, j.kind, j.client_tx_id, j.reverses_journal_id, j.device_id, j.staff_id, j.offline, j.training AS is_training,
             to_char(j.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS occurred_at,
             (extract(epoch FROM j.occurred_at) * 1000000)::bigint::text AS occurred_us,
             to_char(j.effective_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS effective_at,
             (extract(epoch FROM j.effective_at) * 1000000)::bigint::text AS effective_us,
             j.reason_code, encode(j.request_hash, 'hex') AS request_hash, encode(j.prev_hash, 'hex') AS prev_hash, encode(j.hash, 'hex') AS hash
        FROM journal j WHERE j.event_id = ${e} ORDER BY j.seq`),
  },
  postings: {
    cols: POSTING_COLS,
    rows: async (tx, e) => tx<Row[]>`
      SELECT p.journal_id, p.line_no, p.account_id, a.code AS account_code, p.unit, p.amount
        FROM postings p JOIN accounts a ON a.id = p.account_id JOIN journal j ON j.id = p.journal_id WHERE p.event_id = ${e} ORDER BY j.seq, p.line_no`,
  },
  orders: {
    cols: ['order_id', 'journal_seq', 'kind', 'refund_of_order_id', 'stand_id', 'business_date', 'receipt_no', 'grand_total_cents', 'items_tokens', 'tip_tokens', 'gross_cents', 'net_cents', 'vat_cents', 'is_training', 'tag_uid_hmac'],
    rows: async (tx, e, inc, c) => (await tx<Row[]>`
      SELECT o.id AS order_id, j.seq AS journal_seq, o.kind, o.refund_of_order_id, o.stand_id, o.business_date, o.receipt_no, o.grand_total_cents,
             o.items_tokens, o.tip_tokens, o.gross_cents, o.net_cents, o.vat_cents, o.training AS is_training, upper(encode(t.uid, 'hex')) AS uid
        FROM orders o JOIN journal j ON j.id = o.journal_id JOIN wallets w ON w.id = o.wallet_id JOIN tags t ON t.id = w.tag_id
       WHERE o.event_id = ${e} AND (${inc} OR NOT o.training) ORDER BY j.seq`).map((r) => ({ ...r, tag_uid_hmac: uidPseudonym(c.pepper, r.uid) })),
  },
  order_lines: {
    cols: ['order_id', 'line_no', 'item_id', 'item_name', 'category_name', 'qty', 'unit_price_tokens', 'vat_category', 'consumption_mode', 'vat_rate_bp', 'gross_cents', 'refund_of_line_no', 'is_training'],
    rows: (tx, e, inc) => tx<Row[]>`
      SELECT l.order_id, l.line_no, l.item_id, l.item_name, l.category_name, l.qty, l.unit_price_tokens, l.vat_category, l.consumption_mode, l.vat_rate_bp,
             l.gross_cents, l.refund_of_line_no, o.training AS is_training
        FROM order_lines l JOIN orders o ON o.id = l.order_id JOIN journal j ON j.id = o.journal_id
       WHERE o.event_id = ${e} AND (${inc} OR NOT o.training) ORDER BY j.seq, l.line_no`,
  },
  topups: {
    cols: ['topup_id', 'journal_seq', 'stand_id', 'kind', 'payment_method', 'external_ref', 'manual', 'amount_cents', 'tokens', 'token_price_cents', 'vat_cents', 'receipt_no', 'business_date', 'is_training'],
    rows: (tx, e, inc) => tx<Row[]>`
      SELECT t.id AS topup_id, j.seq AS journal_seq, t.stand_id, t.kind, t.payment_method, t.external_ref, t.manual, t.amount_cents, t.tokens, t.token_price_cents,
             t.vat_cents, t.receipt_no, t.business_date, t.training AS is_training
        FROM topups t JOIN journal j ON j.id = t.journal_id WHERE t.event_id = ${e} AND (${inc} OR NOT t.training) ORDER BY j.seq`,
  },
  cashouts: {
    cols: ['cashout_id', 'journal_seq', 'stand_id', 'payment_method', 'external_ref', 'tokens', 'amount_cents', 'receipt_no', 'business_date', 'is_training'],
    rows: (tx, e, inc) => tx<Row[]>`
      SELECT c.id AS cashout_id, j.seq AS journal_seq, c.stand_id, c.payment_method, c.external_ref, c.tokens, c.amount_cents, c.receipt_no, c.business_date, c.training AS is_training
        FROM cashouts c JOIN journal j ON j.id = c.journal_id WHERE c.event_id = ${e} AND (${inc} OR NOT c.training) ORDER BY j.seq`,
  },
  tips: {
    cols: ['business_date', 'stand_id', 'staff_id', 'tip_tokens'],
    rows: (tx, e) => tx<Row[]>`SELECT business_date, stand_id, staff_id, tip_tokens FROM v_tips WHERE event_id = ${e} ORDER BY business_date, stand_id, staff_id`,
  },
  tips_payouts: {
    cols: ['payout_id', 'journal_seq', 'stand_id', 'cashdesk_id', 'recipient_staff_id', 'tokens', 'amount_cents', 'method', 'ack_ref', 'business_date', 'is_training'],
    rows: (tx, e, inc) => tx<Row[]>`
      SELECT p.id AS payout_id, j.seq AS journal_seq, p.stand_id, p.cashdesk_id, p.recipient_staff_id, p.tokens, p.amount_cents, p.method, p.ack_ref, p.business_date, p.training AS is_training
        FROM tips_payouts p JOIN journal j ON j.id = p.journal_id WHERE p.event_id = ${e} AND (${inc} OR NOT p.training) ORDER BY j.seq`,
  },
  vat_daily: {
    cols: ['business_date', 'vat_rate_bp', 'gross_cents', 'net_cents', 'vat_cents'],
    rows: (tx, e) => tx<Row[]>`
      SELECT business_date, vat_rate_bp, sum(gross_cents)::bigint AS gross_cents, sum(net_cents)::bigint AS net_cents, sum(vat_cents)::bigint AS vat_cents
        FROM v_vat_breakdown WHERE event_id = ${e} GROUP BY business_date, vat_rate_bp ORDER BY business_date, vat_rate_bp`,
  },
  accounting: {
    cols: ['business_date', 'journal_seq', 'kind', 'account_code', 'account_kind', 'debit_cents', 'credit_cents', 'is_training'],
    rows: (tx, e, inc) => tx<Row[]>`
      SELECT to_char(j.effective_at AT TIME ZONE ev.timezone, 'YYYY-MM-DD') AS business_date, j.seq AS journal_seq, j.kind, a.code AS account_code, a.kind AS account_kind,
             GREATEST(p.amount, 0) AS debit_cents, GREATEST(-p.amount, 0) AS credit_cents, j.training AS is_training
        FROM postings p JOIN journal j ON j.id = p.journal_id JOIN accounts a ON a.id = p.account_id JOIN events ev ON ev.id = j.event_id
       WHERE p.event_id = ${e} AND p.unit = 'EUR_CENTS' AND (${inc} OR NOT j.training) ORDER BY j.seq, p.line_no`,
  },
  // [À VALIDER] FEC (FR): 18 columns; amounts with decimal comma as required by the format.
  fec: {
    cols: ['JournalCode', 'JournalLib', 'EcritureNum', 'EcritureDate', 'CompteNum', 'CompteLib', 'CompAuxNum', 'CompAuxLib', 'PieceRef', 'PieceDate', 'EcritureLib',
      'Debit', 'Credit', 'EcritureLet', 'DateLet', 'ValidDate', 'Montantdevise', 'Idevise'],
    rows: async (tx, e, inc) => {
      const rows = await tx<Row[]>`
        SELECT to_char(j.effective_at AT TIME ZONE ev.timezone, 'YYYYMMDD') AS d, j.seq, j.kind, a.code, a.kind AS akind, p.amount
          FROM postings p JOIN journal j ON j.id = p.journal_id JOIN accounts a ON a.id = p.account_id JOIN events ev ON ev.id = j.event_id
         WHERE p.event_id = ${e} AND p.unit = 'EUR_CENTS' AND (${inc} OR NOT j.training) ORDER BY j.seq, p.line_no`;
      const num: Record<string, [string, string]> = {
        liability: ['419100', 'Tokens en circulation'], receipts: ['531000', 'Caisse'], psp_clearing: ['511000', 'Encaissements PSP'], psp_fees: ['627000', 'Frais PSP'],
        bank: ['512000', 'Banque'], cash_over_short: ['658000', 'Ecarts de caisse'], rounding: ['658100', 'Arrondis'], stand_revenue: ['706000', 'Ventes'],
        vat_payable: ['445710', 'TVA collectee'], vat_deferred: ['445870', 'TVA differee'], breakage_income: ['778000', 'Tokens non utilises'], promo_expense: ['623000', 'Tokens offerts'],
      };
      return rows.map((r) => {
        const [n, lib] = num[r.akind] ?? ['890000', r.akind];
        return {
          JournalCode: 'JT', JournalLib: 'Jeton', EcritureNum: r.seq, EcritureDate: r.d, CompteNum: n, CompteLib: lib + ' ' + r.code, CompAuxNum: '', CompAuxLib: '',
          PieceRef: r.seq, PieceDate: r.d, EcritureLib: r.kind, Debit: r.amount > 0 ? centsToDecimal(r.amount, ',') : '0,00',
          Credit: r.amount < 0 ? centsToDecimal(-r.amount, ',') : '0,00', EcritureLet: '', DateLet: '', ValidDate: r.d, Montantdevise: '', Idevise: 'EUR',
        };
      });
    },
  },
  z_reports: {
    cols: ['z_seq', 'stand_id', 'z_no', 'business_date', 'first_receipt_no', 'last_receipt_no', 'grand_total_cents', 'chain_seq', 'chain_hash', 'prev_hash', 'hash', 'sealed_at'],
    rows: async (tx, e) => (await tx<Row[]>`SELECT * FROM z_reports WHERE event_id = ${e} ORDER BY z_seq`)
      .map((r) => ({ ...r, chain_hash: hex(r.chain_hash), prev_hash: hex(r.prev_hash), hash: hex(r.hash) })),
  },
  flags: {
    cols: ['id', 'journal_id', 'flag', 'detail', 'created_at', 'resolved'],
    rows: async (tx, e) => (await tx<Row[]>`
      SELECT f.id, f.journal_id, f.flag, f.detail, f.created_at, (r.flag_id IS NOT NULL) AS resolved FROM ledger_flags f LEFT JOIN flag_resolutions r ON r.flag_id = f.id
       WHERE f.event_id = ${e} ORDER BY f.id`).map((r) => ({ ...r, detail: JSON.stringify(r.detail) })),
  },
};

export async function exportCsv(tx: Q, eventId: string, dataset: string, includeTraining: boolean, pepper: string): Promise<{ csv: string; rows: number }> {
  const d = defs[dataset as Dataset];
  if (!d) throw new AppError('NOT_FOUND', 'Unknown dataset');
  await loadEvent(tx, eventId);
  const rows = await d.rows(tx, eventId, includeTraining, { pepper });
  return { csv: toCsv(d.cols, rows), rows: rows.length };
}
