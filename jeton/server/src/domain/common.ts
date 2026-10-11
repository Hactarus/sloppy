import type { Q, Row } from '../db.js';
import { inTx, lockEvent } from '../db.js';
import { AppError, isUniqueViolation, mapPgError } from '../errors.js';
import type { Principal } from '../auth/principal.js';
import type { AppCtx } from '../context.js';
import type { Role } from '../contract.js';
import { requestHash } from '../util/crypto.js';

/** Who performs a ledger operation (staff may differ from the JWT for offline sync items). */
export interface Actor {
  deviceId: string;
  deviceKind: Principal['deviceKind'];
  standId: string | null;
  eventId: string;
  training: boolean;
  staffId: string;
  role: Role;
  appVersion?: string | null;
}

export function actorOf(p: Principal): Actor {
  if (!p.staff) throw new AppError('UNAUTHENTICATED', 'Staff login required');
  return { deviceId: p.deviceId, deviceKind: p.deviceKind, standId: p.standId, eventId: p.eventId, training: p.training, staffId: p.staff.id, role: p.staff.role };
}

export interface OpResult<T = any> {
  status: 200 | 201;
  body: T;
  journalId?: string | null;
}

export interface IdemOutcome<T = any> {
  status: number;
  body: T;
  replayed: boolean;
}

const jsonRoundTrip = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

/**
 * Runs `run` in a transaction that holds the event lock (ledger writers of one event are strictly serial, so balance and
 * limit checks are race-free) and implements the idempotency contract:
 *   same (event, client_tx_id) + identical request  -> original response, replayed = true (HTTP 200 + Idempotent-Replayed)
 *   same (event, client_tx_id) + different request  -> DUPLICATE_TX (409)
 * The original response is stored in `idempotency_keys` in the same transaction as the journal.
 */
export async function runIdempotent<B>(
  app: AppCtx,
  a: Actor,
  spec: { operation: string; clientTxId: string; body: unknown; eventId?: string },
  run: (tx: Q) => Promise<OpResult<B>>,
): Promise<IdemOutcome<B>> {
  const eventId = spec.eventId ?? a.eventId;
  const hash = requestHash(spec.operation, spec.body);
  try {
    return await inTx(app.sql, async (tx) => {
      await lockEvent(tx, eventId);
      const prev = await tx<Row[]>`SELECT request_hash, status_code, response, operation FROM idempotency_keys
                                    WHERE event_id = ${eventId} AND client_tx_id = ${spec.clientTxId}`;
      if (prev[0]) {
        if (Buffer.compare(Buffer.from(prev[0].request_hash), hash) !== 0) {
          throw new AppError('DUPLICATE_TX', 'client_tx_id already used with a different request');
        }
        return { status: 200, body: prev[0].response as B, replayed: true };
      }
      const res = await run(tx);
      const body = jsonRoundTrip(res.body);
      await tx`INSERT INTO idempotency_keys(event_id, client_tx_id, operation, request_hash, status_code, response, journal_id, device_id, staff_id)
               VALUES (${eventId}, ${spec.clientTxId}, ${spec.operation}, ${hash}, ${res.status}, ${tx.json(body as any)},
                       ${res.journalId ?? null}, ${a.deviceId}, ${a.staffId})`;
      return { status: res.status, body, replayed: false };
    });
  } catch (e) {
    throw translateDbError(e);
  }
}

/** Contract errors pass through; PostgreSQL errors of the ledger schema are translated; anything else is INTERNAL_ERROR. */
export function translateDbError(e: unknown): unknown {
  if (e instanceof AppError) return e;
  const m = mapPgError(e);
  if (m) return m;
  if (isUniqueViolation(e, 'topups_external_ref_uq')) return new AppError('EXTERNAL_REF_ALREADY_USED', 'external_ref already used for this payment method');
  return e;
}

// ───────────────────────────── events ─────────────────────────────

export async function loadEvent(tx: Q, eventId: string): Promise<Row> {
  const r = await tx<Row[]>`SELECT * FROM events WHERE id = ${eventId}`;
  if (!r[0]) throw new AppError('EVENT_NOT_FOUND', 'Unknown event');
  return r[0];
}

/** Business date (event time zone) of an instant. */
export async function businessDate(tx: Q, tz: string, at: Date): Promise<string> {
  const r = await tx<Row[]>`SELECT to_char((${at}::timestamptz AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') AS d`;
  return r[0]!.d;
}

/** Effective (business) time of a client-created action: client time clamped to server time, > 5 min ahead => server time. */
export function effectiveTime(clientCreatedAt: Date | null, now: Date = new Date()): { at: Date; skew: boolean } {
  if (!clientCreatedAt) return { at: now, skew: false };
  if (clientCreatedAt.getTime() > now.getTime() + 5 * 60_000) return { at: now, skew: true };
  return { at: clientCreatedAt.getTime() < now.getTime() ? clientCreatedAt : now, skew: false };
}

export function assertEventAcceptsWrites(ev: Row, opts: { training: boolean; allowDraft?: boolean; allowClosed?: boolean } = { training: false }): void {
  if (ev.status === 'closed' && !opts.allowClosed) throw new AppError('EVENT_CLOSED', 'Event is closed');
  if (ev.status === 'draft' && !opts.training && !opts.allowDraft) throw new AppError('EVENT_NOT_OPEN', 'Event is not open yet');
}

// ───────────────────────────── stands ─────────────────────────────

export async function loadStand(tx: Q, eventId: string, standId: string): Promise<Row> {
  const r = await tx<Row[]>`SELECT * FROM stands WHERE id = ${standId} AND event_id = ${eventId}`;
  if (!r[0]) throw new AppError('NOT_FOUND', 'Unknown stand');
  return r[0];
}

/** A vendor may only act on the stand its device is bound to. */
export function assertStandAccess(a: Pick<Actor, 'role' | 'standId'>, standId: string): void {
  if (a.role === 'vendor' && a.standId !== standId) throw new AppError('STAND_MISMATCH', 'Vendors can only act on their own stand');
}

/** The cash desk of a cash operation: explicit id > device stand (must be a cash desk) > the only cash desk of the event. */
export async function resolveCashdesk(tx: Q, a: Actor, explicit?: string | null): Promise<string> {
  const id = explicit ?? a.standId;
  if (id) {
    const s = await loadStand(tx, a.eventId, id);
    if (s.kind !== 'cashdesk') throw new AppError('STAND_MISMATCH', 'This operation needs a cash desk');
    if (a.role === 'cashier' && a.standId && a.standId !== id) throw new AppError('STAND_MISMATCH', 'Cashiers can only act on their own cash desk');
    return id;
  }
  const all = await tx<Row[]>`SELECT id FROM stands WHERE event_id = ${a.eventId} AND kind = 'cashdesk' AND active`;
  if (all.length === 1) return all[0]!.id;
  throw new AppError('STAND_MISMATCH', 'cashdesk_id is required (device is not bound to a cash desk)');
}
