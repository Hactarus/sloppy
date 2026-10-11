/**
 * Independent (TypeScript) implementation of the ADR 0003 hash chain. It must agree with the SQL function ledger_hash();
 * the same code verifies a live database, and the `journal` + `postings` CSV exports offline (CLI `verify-chain --csv`).
 */
import { createHash } from 'node:crypto';
import type { Q, Row } from '../db.js';

export interface ChainPosting {
  line_no: number;
  account_id: string;
  unit: string;
  amount: number | string | bigint;
}

export interface ChainJournal {
  event_id: string;
  seq: number;
  id: string;
  kind: string;
  client_tx_id: string;
  reverses_journal_id: string | null;
  device_id: string | null;
  staff_id: string | null;
  offline: boolean;
  training: boolean;
  occurred_us: number | string | bigint;
  effective_us: number | string | bigint;
  reason_code: string | null;
  request_hash_hex: string | null;
  prev_hash_hex: string;
  hash_hex: string;
  postings: ChainPosting[];
}

export function genesisHash(eventId: string): string {
  return createHash('sha256').update(`jeton-genesis|${eventId}`, 'utf8').digest('hex');
}

/** jeton/v1|event_id|seq|journal_id|kind|client_tx_id|reverses|device|staff|offline|training|occurred_us|effective_us|reason|request_hash|prev_hash|POSTINGS */
export function canonicalJournal(j: ChainJournal): string {
  const postings = [...j.postings]
    .sort((a, b) => a.line_no - b.line_no)
    .map((p) => `${p.line_no}:${p.account_id}:${p.unit}:${String(p.amount)}`)
    .join(',');
  return [
    'jeton/v1', j.event_id, String(j.seq), j.id, j.kind, j.client_tx_id, j.reverses_journal_id ?? '', j.device_id ?? '',
    j.staff_id ?? '', j.offline ? 'true' : 'false', j.training ? 'true' : 'false', String(j.occurred_us), String(j.effective_us),
    j.reason_code ?? '', j.request_hash_hex ?? '', j.prev_hash_hex, postings,
  ].join('|');
}

export const hashJournal = (j: ChainJournal): string => createHash('sha256').update(canonicalJournal(j), 'utf8').digest('hex');

export interface ChainResult {
  ok: boolean;
  checked: number;
  headSeq: number | null;
  headHash: string | null;
  firstBadSeq: number | null;
  reason: string | null;
}

/** Incremental verifier so that a large event can be streamed in pages. */
export class ChainVerifier {
  private prev: string;
  private expected = 1;
  checked = 0;
  failure: { seq: number; reason: string } | null = null;
  constructor(readonly eventId: string) {
    this.prev = genesisHash(eventId);
  }
  push(j: ChainJournal): boolean {
    if (this.failure) return false;
    const bad = (reason: string) => {
      this.failure = { seq: Number(j.seq), reason };
      return false;
    };
    if (Number(j.seq) !== this.expected) return bad(`sequence gap: expected ${this.expected} got ${j.seq}`);
    if (j.prev_hash_hex !== this.prev) return bad('prev_hash does not match previous journal hash');
    if (hashJournal(j) !== j.hash_hex) return bad('hash does not match journal content');
    const sums: Record<string, bigint> = {};
    for (const p of j.postings) sums[p.unit] = (sums[p.unit] ?? 0n) + BigInt(p.amount);
    if (j.postings.length < 2 || Object.values(sums).some((s) => s !== 0n)) return bad('journal is not balanced');
    this.prev = j.hash_hex;
    this.expected++;
    this.checked++;
    return true;
  }
  result(): ChainResult {
    return {
      ok: this.failure === null,
      checked: this.checked,
      headSeq: this.failure ? null : this.checked,
      headHash: this.failure ? null : this.prev,
      firstBadSeq: this.failure?.seq ?? null,
      reason: this.failure?.reason ?? null,
    };
  }
}

export function verifyChainRows(eventId: string, rows: Iterable<ChainJournal>): ChainResult {
  const v = new ChainVerifier(eventId);
  for (const r of rows) if (!v.push(r)) break;
  return v.result();
}

/** Page through the journals of an event (with postings), as ChainJournal. */
export async function* streamChain(sql: Q, eventId: string, pageSize = 500): AsyncGenerator<ChainJournal> {
  let after = 0;
  for (;;) {
    const rows = await sql<Row[]>`
      SELECT j.event_id, j.seq, j.id, j.kind, j.client_tx_id, j.reverses_journal_id, j.device_id, j.staff_id, j.offline, j.training,
             (extract(epoch FROM j.occurred_at)  * 1000000)::bigint::text AS occurred_us,
             (extract(epoch FROM j.effective_at) * 1000000)::bigint::text AS effective_us,
             j.reason_code, encode(j.request_hash, 'hex') AS request_hash_hex, encode(j.prev_hash, 'hex') AS prev_hash_hex,
             encode(j.hash, 'hex') AS hash_hex,
             (SELECT jsonb_agg(jsonb_build_object('line_no', p.line_no, 'account_id', p.account_id, 'unit', p.unit, 'amount', p.amount::text)
                               ORDER BY p.line_no) FROM postings p WHERE p.journal_id = j.id) AS postings
        FROM journal j WHERE j.event_id = ${eventId} AND j.seq > ${after} ORDER BY j.seq LIMIT ${pageSize}`;
    if (rows.length === 0) return;
    for (const r of rows) yield r as unknown as ChainJournal;
    after = rows[rows.length - 1]!.seq;
  }
}

export async function verifyEventChain(sql: Q, eventId: string): Promise<ChainResult> {
  const v = new ChainVerifier(eventId);
  for await (const j of streamChain(sql, eventId)) if (!v.push(j)) break;
  const res = v.result();
  if (res.ok) {
    const head = await sql<Row[]>`SELECT last_seq, encode(last_hash,'hex') AS h FROM event_chain WHERE event_id = ${eventId}`;
    const h = head[0];
    if (!h || h.last_seq !== res.checked || h.h !== (res.checked === 0 ? genesisHash(eventId) : res.headHash)) {
      return { ...res, ok: false, headSeq: null, headHash: null, firstBadSeq: res.checked + 1, reason: 'event_chain head does not match last journal (truncated tail?)' };
    }
    if (res.checked === 0) res.headHash = genesisHash(eventId);
  }
  return res;
}

/** Offline verification of the `journal` and `postings` CSV exports (see exports.ts for the column layout). */
export function verifyCsvExports(eventId: string, journalCsv: string, postingsCsv: string): ChainResult {
  const parse = (t: string) => {
    const lines = t.split('\n').filter((l) => l.length > 0);
    const head = lines.shift()!.split(';');
    return lines.map((l) => {
      const cells = splitCsvLine(l);
      return Object.fromEntries(head.map((h, i) => [h, cells[i] ?? '']));
    });
  };
  const byJournal = new Map<string, ChainPosting[]>();
  for (const p of parse(postingsCsv)) {
    const arr = byJournal.get(p.journal_id!) ?? [];
    arr.push({ line_no: Number(p.line_no), account_id: p.account_id!, unit: p.unit!, amount: p.amount! });
    byJournal.set(p.journal_id!, arr);
  }
  const journals = parse(journalCsv)
    .map((r): ChainJournal => ({
      event_id: r.event_id!, seq: Number(r.seq), id: r.journal_id!, kind: r.kind!, client_tx_id: r.client_tx_id!,
      reverses_journal_id: r.reverses_journal_id || null, device_id: r.device_id || null, staff_id: r.staff_id || null,
      offline: r.offline === 'true', training: r.is_training === 'true', occurred_us: r.occurred_us!, effective_us: r.effective_us!,
      reason_code: r.reason_code || null, request_hash_hex: r.request_hash || null, prev_hash_hex: r.prev_hash!, hash_hex: r.hash!,
      postings: byJournal.get(r.journal_id!) ?? [],
    }))
    .sort((a, b) => a.seq - b.seq);
  return verifyChainRows(eventId, journals);
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c;
    } else if (c === '"') q = true;
    else if (c === ';') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur);
  return out;
}
