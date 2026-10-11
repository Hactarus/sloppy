import type { Q, Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { newTagCode } from '../util/ids.js';
import { ntagProtection } from '../util/crypto.js';
import { Accounts, JournalBuilder, balanceOf, postJournal } from '../ledger/ledger.js';
import { requestHash } from '../util/crypto.js';
import { derivedUuid } from '../util/ids.js';
import { Actor, OpResult, loadEvent, runIdempotent } from './common.js';
import { decodeCursor, encodeCursor } from '../util/cursor.js';
import { page } from '../http.js';

export interface TagRow extends Row {
  id: string;
  tag_code: string;
  uid_hex: string;
  chip_type: string;
  status: 'pending' | 'active' | 'retired';
}

export async function findTag(tx: Q, tagCode: string): Promise<TagRow | undefined> {
  const r = await tx<TagRow[]>`SELECT *, upper(encode(uid,'hex')) AS uid_hex FROM tags WHERE tag_code = ${tagCode}`;
  return r[0];
}

export interface WalletState {
  wallet_id: string;
  account_id: string;
  status: 'active' | 'blocked';
  terms_version: string | null;
  balance: number;
}

export async function findWallet(tx: Q, eventId: string, tagId: string, training: boolean): Promise<WalletState | null> {
  const r = await tx<Row[]>`
    SELECT w.id AS wallet_id, w.account_id, w.status, w.terms_version, COALESCE(b.balance, 0)::bigint AS balance
      FROM wallets w LEFT JOIN account_balances b ON b.account_id = w.account_id
     WHERE w.event_id = ${eventId} AND w.tag_id = ${tagId} AND w.training = ${training}`;
  return (r[0] as WalletState | undefined) ?? null;
}

export interface ResolvedTag {
  tag: TagRow;
  wallet: WalletState | null;
  uidMismatch: boolean;
}

/**
 * Resolves the tag tapped by a terminal. Online: unknown tag => TAG_NOT_FOUND, pending/retired => TAG_NOT_ACTIVE, UID mismatch =>
 * TAG_UID_MISMATCH. Offline sync (`lenient`): a UID mismatch is reported to the caller (it flags and posts); unknown tags still fail.
 */
export async function resolveTag(
  tx: Q,
  a: Actor,
  ref: { tag_code: string; uid: string },
  opts: { lenient?: boolean } = {},
): Promise<ResolvedTag> {
  const tag = await findTag(tx, ref.tag_code);
  if (!tag) throw new AppError('TAG_NOT_FOUND', 'Unknown tag');
  if (tag.status !== 'active') throw new AppError('TAG_NOT_ACTIVE', 'Tag is not active');
  const uidMismatch = tag.uid_hex !== ref.uid;
  if (uidMismatch && !opts.lenient) throw new AppError('TAG_UID_MISMATCH', 'Chip UID does not match the enrolled tag');
  const wallet = await findWallet(tx, a.eventId, tag.id, a.training);
  return { tag, wallet, uidMismatch };
}

export function assertWalletUsable(wallet: WalletState | null): void {
  if (wallet?.status === 'blocked') throw new AppError('TAG_BLOCKED', 'This tag is blocked');
}

export async function tagInfo(tx: Q, price: number, a: Pick<Actor, 'eventId' | 'training'>, tag: TagRow): Promise<Record<string, unknown>> {
  const w = await findWallet(tx, a.eventId, tag.id, a.training);
  const flags: string[] = [];
  if (w && w.balance < 0) flags.push('NEGATIVE_BALANCE');
  return {
    tag_code: tag.tag_code,
    chip_type: tag.chip_type,
    tag_status: tag.status,
    wallet_status: w ? w.status : 'new',
    balance_tokens: w?.balance ?? 0,
    balance_cents: (w?.balance ?? 0) * price,
    wallet_id: w?.wallet_id ?? null,
    flags,
    terms_version: w?.terms_version ?? null,
  };
}

// ───────────────────────────── provisioning ─────────────────────────────

export async function enrollTag(app: AppCtx, a: Actor, body: { client_tx_id: string; uid: string; chip_type: string; signature?: string | null }) {
  return runIdempotent(app, a, { operation: 'tag.enroll', clientTxId: body.client_tx_id, body }, async (tx) => {
    const ev = await loadEvent(tx, a.eventId);
    if (ev.status === 'closed') throw new AppError('EVENT_CLOSED', 'Event is closed');
    const existing = await tx<TagRow[]>`SELECT *, upper(encode(uid,'hex')) AS uid_hex FROM tags WHERE uid = decode(${body.uid}, 'hex')`;
    let tag = existing[0];
    let status: 200 | 201 = 200;
    if (tag) {
      if (tag.status !== 'pending') throw new AppError('TAG_ALREADY_ENROLLED', 'This chip is already enrolled');
    } else {
      status = 201;
      for (let attempt = 0; attempt < 5 && !tag; attempt++) {
        const code = newTagCode();
        const ins = await tx<TagRow[]>`
          INSERT INTO tags(tag_code, uid, chip_type, status, enrolled_event_id, enrolled_by_staff_id, enrolled_by_device_id)
          VALUES (${code}, decode(${body.uid}, 'hex'), ${body.chip_type}, 'pending', ${a.eventId}, ${a.staffId}, ${a.deviceId})
          ON CONFLICT (tag_code) DO NOTHING RETURNING *, upper(encode(uid,'hex')) AS uid_hex`;
        tag = ins[0];
      }
      if (!tag) throw new AppError('INTERNAL_ERROR', 'Could not allocate a tag code');
    }
    const ntag = ['ntag213', 'ntag215', 'ntag216'].includes(tag.chip_type);
    const prot = ntag ? ntagProtection(app.cfg.TAG_MASTER_KEY, body.uid) : null;
    return {
      status,
      body: {
        tag_code: tag.tag_code,
        ndef_url: `${app.cfg.PUBLIC_BASE_URL.replace(/\/$/, '')}/t/${tag.tag_code}`,
        status: 'pending',
        // NXP originality-signature verification needs the NXP public keys: not implemented, reported as unknown (null).
        signature_verified: null,
        protection: prot ? { ...prot, auth0: 4, prot: 0, authlim: 7 } : null,
      },
    } satisfies OpResult;
  });
}

export async function confirmTag(app: AppCtx, a: Actor, tagCode: string, body: { client_tx_id: string; uid: string; readback_ok: boolean; password_protected?: boolean }) {
  return runIdempotent(app, a, { operation: 'tag.confirm:' + tagCode, clientTxId: body.client_tx_id, body }, async (tx) => {
    const tag = await findTag(tx, tagCode);
    if (!tag) throw new AppError('TAG_NOT_FOUND', 'Unknown tag');
    if (tag.uid_hex !== body.uid) throw new AppError('TAG_UID_MISMATCH', 'Chip UID does not match the enrolled tag');
    if (!body.readback_ok) {
      throw new AppError('VALIDATION_ERROR', 'readback_ok must be true to activate a tag', { fields: [{ path: 'readback_ok', issue: 'must be true' }] });
    }
    if (tag.status === 'retired') throw new AppError('TAG_NOT_ACTIVE', 'Tag is retired');
    if (tag.status === 'pending') {
      await tx`UPDATE tags SET status = 'active', password_protected = ${body.password_protected ?? false}, activated_at = now() WHERE id = ${tag.id}`;
    }
    const ev = await loadEvent(tx, a.eventId);
    const fresh = (await findTag(tx, tagCode))!;
    return { status: 200, body: await tagInfo(tx, ev.token_price_cents, a, fresh) };
  });
}

// ───────────────────────────── status & replacement ─────────────────────────────

export async function setTagStatus(app: AppCtx, a: Actor, tagCode: string, body: { client_tx_id: string; status: 'active' | 'blocked'; reason_code: string }) {
  return runIdempotent(app, a, { operation: 'tag.status:' + tagCode, clientTxId: body.client_tx_id, body }, async (tx) => {
    const tag = await findTag(tx, tagCode);
    if (!tag) throw new AppError('TAG_NOT_FOUND', 'Unknown tag');
    const ev = await loadEvent(tx, a.eventId);
    const acc = new Accounts(tx, a.eventId, a.training);
    const { walletId } = await acc.wallet(tag.id); // blocking a tag that never had a wallet creates it (blocked from the start)
    await tx`SELECT set_config('jeton.reason', ${body.reason_code}, true), set_config('jeton.staff_id', ${a.staffId}, true),
                    set_config('jeton.device_id', ${a.deviceId}, true)`;
    await tx`UPDATE wallets SET status = ${body.status} WHERE id = ${walletId}`;
    return { status: 200, body: await tagInfo(tx, ev.token_price_cents, a, tag) };
  });
}

export async function replaceTag(
  app: AppCtx,
  a: Actor,
  oldCode: string,
  body: { client_tx_id: string; new_tag: { tag_code: string; uid: string }; old_uid?: string | null; reason_code: string },
) {
  return runIdempotent(app, a, { operation: 'tag.replace:' + oldCode, clientTxId: body.client_tx_id, body }, async (tx) => {
    const ev = await loadEvent(tx, a.eventId);
    if (ev.status === 'closed') throw new AppError('EVENT_CLOSED', 'Event is closed');
    const oldTag = await findTag(tx, oldCode);
    if (!oldTag) throw new AppError('TAG_NOT_FOUND', 'Unknown tag');
    if (body.old_uid && body.old_uid !== oldTag.uid_hex) throw new AppError('TAG_UID_MISMATCH', 'Old chip UID does not match');
    const newTag = await findTag(tx, body.new_tag.tag_code);
    if (!newTag) throw new AppError('TAG_NOT_FOUND', 'Unknown new tag');
    if (newTag.status !== 'active') throw new AppError('TAG_NOT_ACTIVE', 'The new tag is not active');
    if (newTag.uid_hex !== body.new_tag.uid) throw new AppError('TAG_UID_MISMATCH', 'New chip UID does not match');
    if (newTag.id === oldTag.id) throw new AppError('VALIDATION_ERROR', 'The new tag must differ from the old tag');

    const acc = new Accounts(tx, a.eventId, a.training);
    const oldW = await acc.wallet(oldTag.id);
    const newW = await acc.wallet(newTag.id);
    const newBal = await balanceOf(tx, newW.account.id);
    const newStatus = (await findWallet(tx, a.eventId, newTag.id, a.training))!;
    if (newBal !== 0 || newStatus.status !== 'active') {
      throw new AppError('TAG_NOT_ACTIVE', 'The new tag must have an empty, active wallet');
    }
    const moved = Math.max(0, await balanceOf(tx, oldW.account.id));
    let journalSeq = 0;
    let journalId: string | null = null;
    if (moved > 0) {
      const lines = new JournalBuilder().add(oldW.account, -moved).add(newW.account, moved).build();
      const j = await postJournal(tx, {
        eventId: a.eventId, kind: 'tag_replacement', clientTxId: body.client_tx_id,
        requestHash: requestHash('tag.replace:' + oldCode, body), deviceId: a.deviceId, staffId: a.staffId,
        clientCreatedAt: null, offline: false, training: a.training, reasonCode: body.reason_code, lines,
      });
      journalSeq = j.seq;
      journalId = j.journalId;
      await tx`INSERT INTO tag_replacements(id, event_id, journal_id, from_wallet_id, to_wallet_id, tokens)
               VALUES (${derivedUuid('tag_replacement', j.journalId)}, ${a.eventId}, ${j.journalId}, ${oldW.walletId}, ${newW.walletId}, ${moved})`;
    }
    await tx`SELECT set_config('jeton.reason', ${body.reason_code}, true), set_config('jeton.staff_id', ${a.staffId}, true),
                    set_config('jeton.device_id', ${a.deviceId}, true)`;
    await tx`UPDATE wallets SET status = 'blocked' WHERE id = ${oldW.walletId}`;
    return {
      status: 201,
      journalId,
      body: {
        journal_seq: journalSeq, // 0 when the old wallet had nothing to move (no journal is possible without postings)
        moved_tokens: moved,
        old_tag: await tagInfo(tx, ev.token_price_cents, a, oldTag),
        new_tag: await tagInfo(tx, ev.token_price_cents, a, newTag),
      },
    };
  });
}

// ───────────────────────────── queries ─────────────────────────────

export async function listTags(
  tx: Q,
  eventId: string,
  q: { wallet_status?: string; negative_only: boolean; limit: number; cursor?: string },
) {
  const cur = decodeCursor<{ t: string; id: string }>(q.cursor);
  const rows = await tx<Row[]>`
    SELECT t.id, t.tag_code, t.chip_type, t.status AS tag_status, t.created_at,
           COALESCE(w.status, 'new') AS wallet_status, COALESCE(b.balance, 0)::bigint AS balance_tokens, w.id AS wallet_id,
           w.terms_version, e.token_price_cents
      FROM tags t
      JOIN events e ON e.id = ${eventId}
      LEFT JOIN wallets w ON w.tag_id = t.id AND w.event_id = ${eventId} AND NOT w.training
      LEFT JOIN account_balances b ON b.account_id = w.account_id
     WHERE (w.id IS NOT NULL OR t.status = 'active')
       AND (${q.wallet_status ?? null}::text IS NULL OR COALESCE(w.status, 'new') = ${q.wallet_status ?? null})
       AND (NOT ${q.negative_only} OR COALESCE(b.balance, 0) < 0)
       AND (${cur?.t ?? null}::timestamptz IS NULL OR (t.created_at, t.id) > (${cur?.t ?? null}::timestamptz, ${cur?.id ?? null}::uuid))
     ORDER BY t.created_at, t.id LIMIT ${q.limit + 1}`;
  const p = page(rows, q.limit, (r) => ({ t: (r.created_at as Date).toISOString(), id: r.id }), encodeCursor);
  return {
    items: p.items.map((r) => ({
      tag_code: r.tag_code, chip_type: r.chip_type, tag_status: r.tag_status, wallet_status: r.wallet_status,
      balance_tokens: r.balance_tokens, balance_cents: r.balance_tokens * r.token_price_cents, wallet_id: r.wallet_id,
      flags: r.balance_tokens < 0 ? ['NEGATIVE_BALANCE'] : [], terms_version: r.terms_version,
    })),
    next_cursor: p.next_cursor,
  };
}

export async function listTagTransactions(tx: Q, eventId: string, tagId: string, training: boolean, q: { limit: number; cursor?: string }) {
  const cur = decodeCursor<{ seq: number }>(q.cursor);
  const w = await findWallet(tx, eventId, tagId, training);
  if (!w) return { items: [], next_cursor: null };
  const rows = await tx<Row[]>`
    WITH entries AS (
      SELECT j.id AS journal_id, j.seq AS journal_seq, j.kind, j.effective_at AS at, sum(p.amount)::bigint AS delta_tokens,
             sum(sum(p.amount)) OVER (ORDER BY j.seq)::bigint AS balance_after_tokens
        FROM postings p JOIN journal j ON j.id = p.journal_id
       WHERE p.account_id = ${w.account_id}
       GROUP BY j.id, j.seq, j.kind, j.effective_at)
    SELECT e.*,
           COALESCE(o.id, t.id, c.id) AS document_id,
           COALESCE(so.name, st.name, sc.name) AS stand_name
      FROM entries e
      LEFT JOIN orders  o ON o.journal_id = e.journal_id LEFT JOIN stands so ON so.id = o.stand_id
      LEFT JOIN topups  t ON t.journal_id = e.journal_id LEFT JOIN stands st ON st.id = t.stand_id
      LEFT JOIN cashouts c ON c.journal_id = e.journal_id LEFT JOIN stands sc ON sc.id = c.stand_id
     WHERE (${cur?.seq ?? null}::bigint IS NULL OR e.journal_seq < ${cur?.seq ?? null})
     ORDER BY e.journal_seq DESC LIMIT ${q.limit + 1}`;
  const p = page(rows, q.limit, (r) => ({ seq: r.journal_seq }), encodeCursor);
  return {
    items: p.items.map((r) => ({
      journal_id: r.journal_id, journal_seq: r.journal_seq, kind: r.kind, at: r.at, delta_tokens: r.delta_tokens,
      balance_after_tokens: r.balance_after_tokens, document_id: r.document_id ?? null, stand_name: r.stand_name ?? null,
    })),
    next_cursor: p.next_cursor,
  };
}
