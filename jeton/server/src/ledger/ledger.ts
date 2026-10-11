/**
 * The ONLY module that writes ledger rows.
 *
 *  - builds balanced journals (per-unit zero-sum check before anything reaches the database),
 *  - calls the SECURITY DEFINER SQL function post_journal(), which computes seq / prev_hash / hash (ADR 0003), enforces
 *    idempotency on (event, client_tx_id), wallet sufficiency and the append-only rules,
 *  - must be called inside a transaction opened with `withEventTx` (event lock, so that fact rows written after the
 *    journal see a consistent state).
 *
 * Never UPDATE/DELETE ledger rows: corrections are reversal journals (see `reverseJournal`).
 */
import type { Q, Row } from '../db.js';
import { AppError, mapPgError } from '../errors.js';

export type Unit = 'TOKEN' | 'EUR_CENTS';

export type JournalKind =
  | 'topup' | 'promo_grant' | 'sale' | 'order_refund' | 'cashout' | 'tag_replacement' | 'reversal' | 'breakage'
  | 'adjustment' | 'tips_payout' | 'cash_movement' | 'cash_variance' | 'psp_settlement';

export interface AccountRef {
  id: string;
  code: string;
  kind: string;
  unit: Unit;
}

export interface PostedJournal {
  journalId: string;
  seq: number;
  hashHex: string;
  replayed: boolean;
}

export interface JournalInput {
  eventId: string;
  kind: JournalKind;
  clientTxId: string;
  requestHash: Buffer;
  deviceId: string | null;
  staffId: string | null;
  clientCreatedAt: Date | null;
  offline: boolean;
  training: boolean;
  reverses?: string | null;
  reasonCode?: string | null;
  allowNegative?: boolean;
  appVersion?: string | null;
  lines: PostingLine[];
}

export interface PostingLine {
  account: AccountRef;
  amount: number; // + debit / - credit, integer
}

/** Collects posting lines and refuses unbalanced journals before they are sent to the database. */
export class JournalBuilder {
  private readonly lines = new Map<string, PostingLine>();

  add(account: AccountRef, amount: number): this {
    if (!Number.isSafeInteger(amount)) throw new Error(`non-integer posting on ${account.code}: ${amount}`);
    if (amount === 0) return this; // zero lines are meaningless (and forbidden by the schema)
    const cur = this.lines.get(account.id);
    if (cur) cur.amount += amount;
    else this.lines.set(account.id, { account, amount });
    return this;
  }

  /** Lines (netted per account, zero lines dropped), after asserting that every unit sums to zero. */
  build(): PostingLine[] {
    const out = [...this.lines.values()].filter((l) => l.amount !== 0);
    const sums: Record<string, number> = {};
    for (const l of out) sums[l.account.unit] = (sums[l.account.unit] ?? 0) + l.amount;
    for (const [unit, s] of Object.entries(sums)) {
      if (s !== 0) throw new AppError('INTERNAL_ERROR', `Unbalanced journal (${unit} sums to ${s})`);
    }
    if (out.length < 2) throw new AppError('INTERNAL_ERROR', 'Journal needs at least two postings');
    return out;
  }
}

/** Posts a journal through post_journal(). Idempotent on (event, client_tx_id) at the database level. */
export async function postJournal(tx: Q, j: JournalInput): Promise<PostedJournal> {
  // Re-check balance here too: callers may hand-build `lines`.
  const sums: Record<string, number> = {};
  for (const l of j.lines) sums[l.account.unit] = (sums[l.account.unit] ?? 0) + l.amount;
  if (Object.values(sums).some((s) => s !== 0)) throw new AppError('INTERNAL_ERROR', 'Unbalanced journal');

  const postings = j.lines.map((l) => ({ account_id: l.account.id, amount: l.amount }));
  try {
    const rows = await tx<Row[]>`
      SELECT * FROM post_journal(
        ${j.eventId}::uuid, ${j.kind}, ${j.clientTxId}::uuid, ${j.requestHash}::bytea,
        ${j.deviceId}::uuid, ${j.staffId}::uuid, ${j.clientCreatedAt}::timestamptz, ${j.offline},
        ${j.reverses ?? null}::uuid, ${j.reasonCode ?? null}, ${tx.json(postings as any)}::jsonb,
        ${j.allowNegative ?? false}, NULL::uuid, ${j.training}, ${j.appVersion ?? null})`;
    const r = rows[0]!;
    return { journalId: r.r_journal_id, seq: r.r_seq, hashHex: Buffer.from(r.r_hash).toString('hex'), replayed: r.r_replayed };
  } catch (e) {
    throw mapPgError(e) ?? e;
  }
}

/** Account lookup / creation for one event, with transparent training shadows. */
export class Accounts {
  private readonly cache = new Map<string, AccountRef>();
  constructor(
    private readonly tx: Q,
    readonly eventId: string,
    readonly training: boolean,
  ) {}

  async get(code: string, kind: string, unit: Unit, refId: string | null = null): Promise<AccountRef> {
    const full = this.training ? 'training:' + code : code;
    const hit = this.cache.get(full);
    if (hit) return hit;
    const rows = await this.tx<Row[]>`SELECT ensure_account(${this.eventId}::uuid, ${full}, ${kind}, ${unit}, ${refId}::uuid) AS id`;
    const ref = { id: rows[0]!.id as string, code: full, kind, unit };
    this.cache.set(full, ref);
    return ref;
  }

  // TOKEN accounts
  issuance() { return this.get('issuance', 'issuance', 'TOKEN'); }
  promo() { return this.get('promo', 'promo_tokens', 'TOKEN'); }
  breakage() { return this.get('breakage', 'breakage_tokens', 'TOKEN'); }
  refunds() { return this.get('refunds', 'refund_tokens', 'TOKEN'); }
  stand(standId: string) { return this.get('stand:' + standId, 'stand_tokens', 'TOKEN', standId); }
  tipsPayable(standId: string) { return this.get('tips_payable:stand:' + standId, 'tips_payable', 'TOKEN', standId); }
  // EUR accounts
  liability() { return this.get('liability', 'liability', 'EUR_CENTS'); }
  cashReceipts(cashdeskId: string) { return this.get('receipts:cash:' + cashdeskId, 'receipts', 'EUR_CENTS', cashdeskId); }
  pspClearing(method: string) { return this.get('psp_clearing:' + method, 'psp_clearing', 'EUR_CENTS'); }
  pspFees() { return this.get('psp_fees', 'psp_fees', 'EUR_CENTS'); }
  bank() { return this.get('bank', 'bank', 'EUR_CENTS'); }
  cashOverShort() { return this.get('cash_over_short', 'cash_over_short', 'EUR_CENTS'); }
  revenue(standId: string) { return this.get('revenue:stand:' + standId, 'stand_revenue', 'EUR_CENTS', standId); }
  vat(rateBp: number) { return this.get('vat:' + rateBp, 'vat_payable', 'EUR_CENTS'); }
  vatDeferred() { return this.get('vat_deferred', 'vat_deferred', 'EUR_CENTS'); }
  breakageIncome() { return this.get('breakage_income', 'breakage_income', 'EUR_CENTS'); }
  promoExpense() { return this.get('promo_expense', 'promo_expense', 'EUR_CENTS'); }

  /** Counter-account of the money side of a payment method. */
  async forPaymentMethod(method: string, cashdeskId: string | null): Promise<AccountRef> {
    if (method === 'cash') {
      if (!cashdeskId) throw new AppError('VALIDATION_ERROR', 'A cash desk is required for cash movements');
      return this.cashReceipts(cashdeskId);
    }
    if (method === 'bank_transfer' || method === 'donation') return this.bank();
    return this.pspClearing(method);
  }

  /** Get-or-create the wallet of a tag. */
  async wallet(tagId: string): Promise<{ walletId: string; account: AccountRef }> {
    const rows = await this.tx<Row[]>`SELECT * FROM ensure_wallet(${this.eventId}::uuid, ${tagId}::uuid, ${this.training})`;
    const r = rows[0]!;
    const code = await this.tx<Row[]>`SELECT code FROM accounts WHERE id = ${r.account_id}`;
    const ref: AccountRef = { id: r.account_id, code: code[0]!.code, kind: 'wallet', unit: 'TOKEN' };
    this.cache.set(ref.code, ref);
    return { walletId: r.wallet_id, account: ref };
  }
}

export async function balanceOf(tx: Q, accountId: string): Promise<number> {
  const r = await tx<Row[]>`SELECT balance FROM account_balances WHERE account_id = ${accountId}`;
  return r[0]?.balance ?? 0;
}

/** Wallet balance after (and including) journal `seq`. */
export async function balanceAfter(tx: Q, accountId: string, seq: number): Promise<number> {
  const r = await tx<Row[]>`
    SELECT COALESCE(sum(p.amount), 0)::bigint AS b FROM postings p JOIN journal j ON j.id = p.journal_id
     WHERE p.account_id = ${accountId} AND j.seq <= ${seq}`;
  return r[0]!.b;
}

export async function flagsOfJournal(tx: Q, journalId: string): Promise<string[]> {
  const r = await tx<Row[]>`SELECT flag FROM ledger_flags WHERE journal_id = ${journalId} ORDER BY id`;
  return r.map((x) => x.flag);
}

export async function addFlag(tx: Q, eventId: string, journalId: string | null, flag: string, detail: Record<string, unknown> = {}): Promise<void> {
  await tx`SELECT add_ledger_flag(${eventId}::uuid, ${journalId}::uuid, ${flag}, ${tx.json(detail as any)}::jsonb)`;
}

/**
 * Reversal: appends a `reversal` journal with every posting negated. Never touches the original. The caller supplies the
 * client_tx_id / actor. Wallets may go negative (accepted and flagged NEGATIVE_BALANCE by the database).
 */
export async function reverseJournal(
  tx: Q,
  orig: { id: string; eventId: string; training: boolean },
  input: Omit<JournalInput, 'kind' | 'lines' | 'reverses' | 'allowNegative' | 'training' | 'eventId'> & { reasonCode: string },
): Promise<PostedJournal> {
  const rows = await tx<Row[]>`
    SELECT p.account_id, p.amount, a.code, a.kind, a.unit FROM postings p JOIN accounts a ON a.id = p.account_id
     WHERE p.journal_id = ${orig.id} ORDER BY p.line_no`;
  const b = new JournalBuilder();
  for (const r of rows) b.add({ id: r.account_id, code: r.code, kind: r.kind, unit: r.unit }, -Number(r.amount));
  return postJournal(tx, {
    ...input,
    eventId: orig.eventId,
    kind: 'reversal',
    reverses: orig.id,
    training: orig.training,
    allowNegative: true,
    lines: b.build(),
  });
}
