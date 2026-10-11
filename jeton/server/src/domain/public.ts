import type { Q, Row } from '../db.js';
import type { Config } from '../config.js';
import { TAG_CODE_RE } from '../util/ids.js';

/** Guest balance page data. Unknown, malformed, pending or training-only tags all return null (404, no oracle). */
export async function publicTagPage(tx: Q, cfg: Config, tagCode: string): Promise<Record<string, unknown> | null> {
  if (!TAG_CODE_RE.test(tagCode)) return null;
  const tag = (await tx<Row[]>`SELECT id, status FROM tags WHERE tag_code = ${tagCode}`)[0];
  if (!tag || tag.status !== 'active') return null;
  // most recent open event where the tag has a wallet; else the most recent event with a wallet; else the latest open event (new tag)
  const w = (await tx<Row[]>`
    SELECT w.*, e.name, e.token_price_cents, e.policy_version, e.refundable_until, e.expiry_at, e.terms_version AS event_terms, o.legal_name, o.enterprise_no,
           COALESCE(b.balance, 0)::bigint AS balance
      FROM wallets w JOIN events e ON e.id = w.event_id JOIN organizers o ON o.id = e.organizer_id LEFT JOIN account_balances b ON b.account_id = w.account_id
     WHERE w.tag_id = ${tag.id} AND NOT w.training
     ORDER BY (e.status = 'open') DESC, e.created_at DESC LIMIT 1`)[0];
  let ev: Row;
  let balance = 0;
  let status = 'new';
  let walletAccount: string | null = null;
  if (w) {
    ev = w;
    balance = w.balance;
    status = w.status;
    walletAccount = w.account_id;
  } else {
    const e = (await tx<Row[]>`SELECT e.*, o.legal_name, o.enterprise_no FROM events e JOIN organizers o ON o.id = e.organizer_id
                                ORDER BY (e.status = 'open') DESC, e.created_at DESC LIMIT 1`)[0];
    if (!e) return null;
    ev = { ...e, event_terms: e.terms_version };
    ev.name = e.name;
  }
  const recent = walletAccount
    ? await tx<Row[]>`
        SELECT j.id, j.seq, j.kind, j.effective_at AS at, sum(p.amount)::bigint AS delta, COALESCE(o.receipt_no, t.receipt_no, c.receipt_no) AS receipt_no,
               COALESCE(o.provisional_ref, t.provisional_ref) AS provisional_ref, COALESCE(so.name, st.name, sc.name) AS stand_name, o.id AS order_id
          FROM postings p JOIN journal j ON j.id = p.journal_id
          LEFT JOIN orders o ON o.journal_id = j.id LEFT JOIN stands so ON so.id = o.stand_id
          LEFT JOIN topups t ON t.journal_id = j.id LEFT JOIN stands st ON st.id = t.stand_id
          LEFT JOIN cashouts c ON c.journal_id = j.id LEFT JOIN stands sc ON sc.id = c.stand_id
         WHERE p.account_id = ${walletAccount} AND j.kind NOT IN ('breakage','adjustment')
         GROUP BY j.id, j.seq, j.kind, j.effective_at, o.receipt_no, t.receipt_no, c.receipt_no, o.provisional_ref, t.provisional_ref, so.name, st.name, sc.name, o.id
         ORDER BY j.seq DESC LIMIT 20`
    : [];
  const orderIds = recent.filter((r) => r.order_id).map((r) => r.order_id as string);
  const lines = orderIds.length
    ? await tx<Row[]>`SELECT order_id, item_name AS name, sum(qty)::int AS qty FROM order_lines WHERE order_id = ANY(${orderIds}::uuid[]) GROUP BY order_id, item_name`
    : [];
  return {
    tag_code: tagCode,
    status,
    balance_tokens: balance,
    balance_cents: balance * ev.token_price_cents,
    token_price_cents: ev.token_price_cents,
    event: {
      name: ev.name, organizer_name: ev.legal_name, organizer_enterprise_no: ev.enterprise_no, policy_version: ev.policy_version ?? null,
      refundable_until: ev.refundable_until ?? null, expiry_at: ev.expiry_at ?? null, terms_version: ev.event_terms ?? null, privacy_url: cfg.PRIVACY_URL,
    },
    recent: recent.map((r) => ({
      at: r.at, kind: r.kind, delta_tokens: r.delta, stand_name: r.stand_name ?? null, receipt_no: r.receipt_no ?? null, provisional_ref: r.provisional_ref ?? null,
      items: lines.filter((l) => l.order_id === r.order_id).map((l) => ({ name: l.name, qty: l.qty })),
    })),
  };
}
