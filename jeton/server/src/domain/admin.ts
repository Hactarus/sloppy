import { inTx, type Q, type Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import type { Principal } from '../auth/principal.js';
import { sha256 } from '../util/crypto.js';
import { newEnrollmentCode } from '../util/ids.js';
import { hashPin, verifyPin } from '../auth/pin.js';
import { signJwt } from '../auth/jwt.js';
import { decodeCursor, encodeCursor } from '../util/cursor.js';
import { page } from '../http.js';
import { loadEvent } from './common.js';

// ───────────────────────────── events ─────────────────────────────

export const EVENT_COLUMNS = [
  'timezone', 'token_price_cents', 'offline_cap_tokens', 'max_balance_tokens', 'max_topup_tokens', 'vat_regime', 'voucher_type',
  'single_purpose_vat_category', 'be_gks_required', 'fr_cash_software_required', 'third_party_vendors_enabled', 'tips_enabled',
  'tip_presets_tokens', 'tip_max_tokens', 'tip_max_percent', 'tips_payout_policy', 'refundable_until', 'min_refund_tokens', 'expiry_at',
  'breakage_treatment', 'refund_cash_limited_to_cash_topups', 'policy_version', 'terms_version', 'starts_at', 'ends_at',
] as const;

export async function eventDto(tx: Q, ev: Row, withWarnings = true): Promise<Record<string, unknown>> {
  const out: Record<string, unknown> = { id: ev.id, organizer_id: ev.organizer_id, name: ev.name, country: ev.country, status: ev.status };
  for (const c of EVENT_COLUMNS) out[c] = ev[c] ?? null;
  out.catalog_version = ev.catalog_version;
  out.closed_at = ev.closed_at;
  if (withWarnings) {
    const w: string[] = [];
    const cats = await tx<Row[]>`SELECT count(*)::int AS n, count(DISTINCT vat_category)::int AS d FROM items WHERE event_id = ${ev.id} AND active`;
    if (cats[0]!.n >= 2 && cats[0]!.d === 1) w.push('SINGLE_VAT_CATEGORY_ALL_ITEMS');
    const un = await tx<Row[]>`SELECT 1 FROM vat_rates WHERE country = ${ev.country} AND NOT validated LIMIT 1`;
    if (un.length) w.push('UNVALIDATED_VAT_RATES');
    if (!ev.refundable_until && !ev.policy_version) w.push('NO_REFUND_POLICY');
    if (ev.be_gks_required) w.push('BE_GKS_REQUIRED');
    out.warnings = w;
  }
  return out;
}

const IMMUTABLE = ['token_price_cents', 'country', 'timezone', 'voucher_type', 'vat_regime', 'organizer_id'] as const;

/** PUT /events/{id}: create (defaults) or update (omitted fields keep their value). */
export async function putEvent(app: AppCtx, eventId: string, b: Record<string, any>) {
  return inTx(app.sql, async (tx) => {
    const org = await tx<Row[]>`SELECT 1 FROM organizers WHERE id = ${b.organizer_id}`;
    if (!org[0]) throw new AppError('NOT_FOUND', 'Unknown organizer');
    const cur = (await tx<Row[]>`SELECT * FROM events WHERE id = ${eventId} FOR UPDATE`)[0];
    if ((b.voucher_type === 'single_purpose') !== (b.single_purpose_vat_category != null) && (b.voucher_type !== undefined || b.single_purpose_vat_category !== undefined)) {
      throw new AppError('VALIDATION_ERROR', 'single_purpose_vat_category is required iff voucher_type=single_purpose', { fields: [{ path: 'single_purpose_vat_category', issue: 'required iff single_purpose' }] });
    }
    if (!cur) {
      if (b.status && b.status !== 'draft' && b.status !== 'open') throw new AppError('VALIDATION_ERROR', 'status must be draft or open');
      const v = { ...b };
      await tx`INSERT INTO events ${tx({
        id: eventId, organizer_id: b.organizer_id, name: b.name, country: b.country,
        ...pick(v, ['timezone', 'token_price_cents', 'offline_cap_tokens', 'max_balance_tokens', 'max_topup_tokens', 'vat_regime', 'voucher_type',
          'single_purpose_vat_category', 'be_gks_required', 'fr_cash_software_required', 'third_party_vendors_enabled', 'tips_enabled', 'tip_max_tokens',
          'tip_max_percent', 'tips_payout_policy', 'refundable_until', 'min_refund_tokens', 'expiry_at', 'breakage_treatment',
          'refund_cash_limited_to_cash_topups', 'policy_version', 'terms_version', 'starts_at', 'ends_at', 'status']),
        ...(b.tip_presets_tokens ? { tip_presets_tokens: tx.array(b.tip_presets_tokens as number[]) } : {}),
      } as any)}`;
      return { status: 201, body: await eventDto(tx, await loadEvent(tx, eventId)) };
    }
    if (cur.status === 'closed') throw new AppError('EVENT_CLOSED', 'Event is closed');
    const hasJournal = (await tx<Row[]>`SELECT 1 FROM journal WHERE event_id = ${eventId} LIMIT 1`).length > 0;
    if (hasJournal) {
      const locked = IMMUTABLE.filter((k) => b[k] !== undefined && String(b[k]) !== String(cur[k]));
      if (locked.length) throw new AppError('EVENT_FIELD_LOCKED', 'Field is immutable once the event has ledger entries', { fields: locked });
    }
    if (b.status === 'draft' && cur.status === 'open') throw new AppError('EVENT_FIELD_LOCKED', 'An open event cannot go back to draft', { fields: ['status'] });
    const upd: Record<string, unknown> = {};
    for (const k of ['name', 'country', 'organizer_id', ...EVENT_COLUMNS, 'status'] as const) if (b[k] !== undefined) upd[k] = b[k];
    if (b.tip_presets_tokens) upd.tip_presets_tokens = tx.array(b.tip_presets_tokens as number[]);
    if (Object.keys(upd).length) {
      // voucher_type / single_purpose category must be changed together
      if ('voucher_type' in upd && upd.voucher_type === 'multi_purpose') upd.single_purpose_vat_category = null;
      await tx`UPDATE events SET ${tx(upd as any)} WHERE id = ${eventId}`;
    }
    return { status: 200, body: await eventDto(tx, await loadEvent(tx, eventId)) };
  });
}

function pick(o: Record<string, any>, keys: string[]): Record<string, any> {
  const r: Record<string, any> = {};
  for (const k of keys) if (o[k] !== undefined) r[k] = o[k];
  return r;
}

export async function listEvents(tx: Q, p: Principal, q: { limit: number; cursor?: string }) {
  const cur = decodeCursor<{ t: string; id: string }>(q.cursor);
  const wide = p.staff?.role === 'admin';
  const rows = await tx<Row[]>`
    SELECT e.* FROM events e
     WHERE (e.id = ${p.eventId} OR (${wide} AND e.organizer_id = (SELECT organizer_id FROM events WHERE id = ${p.eventId})))
       AND (${cur?.t ?? null}::timestamptz IS NULL OR (e.created_at, e.id) > (${cur?.t ?? null}::timestamptz, ${cur?.id ?? null}::uuid))
     ORDER BY e.created_at, e.id LIMIT ${q.limit + 1}`;
  const pg = page(rows, q.limit, (r) => ({ t: (r.created_at as Date).toISOString(), id: r.id }), encodeCursor);
  return { items: await Promise.all(pg.items.map((e) => eventDto(tx, e))), next_cursor: pg.next_cursor };
}

// ───────────────────────────── organizers, staff ─────────────────────────────

export const organizerDto = (o: Row) => ({
  id: o.id, legal_name: o.legal_name, legal_form: o.legal_form, address: o.address, enterprise_no: o.enterprise_no, vat_no: o.vat_no, contact_email: o.contact_email,
});

export async function putStaff(app: AppCtx, p: Principal, staffId: string, b: { display_name: string; role: string; staff_type?: string; active?: boolean; pin?: string; event_ids?: string[] }) {
  return inTx(app.sql, async (tx) => {
    const cur = (await tx<Row[]>`SELECT * FROM staff WHERE id = ${staffId} FOR UPDATE`)[0];
    if (!cur && !b.pin) throw new AppError('VALIDATION_ERROR', 'pin is required when creating a staff member', { fields: [{ path: 'pin', issue: 'required on create' }] });
    const pinHash = b.pin ? await hashPin(b.pin) : null;
    if (!cur) {
      await tx`INSERT INTO staff(id, name, role, staff_type, pin_hash, active) VALUES (${staffId}, ${b.display_name}, ${b.role}, ${b.staff_type ?? 'volunteer'}, ${pinHash!}, ${b.active ?? true})`;
    } else {
      await tx`UPDATE staff SET name = ${b.display_name}, role = ${b.role}, staff_type = ${b.staff_type ?? cur.staff_type}, active = ${b.active ?? cur.active},
                    pin_hash = ${pinHash ?? cur.pin_hash}, pin_failed_count = ${pinHash ? 0 : cur.pin_failed_count}, pin_locked_until = ${pinHash ? null : cur.pin_locked_until}
               WHERE id = ${staffId}`;
    }
    const events = b.event_ids ?? (cur ? null : [p.eventId]);
    if (events) {
      for (const e of events) {
        const ok = await tx<Row[]>`SELECT 1 FROM events WHERE id = ${e}`;
        if (!ok[0]) throw new AppError('EVENT_NOT_FOUND', 'Unknown event ' + e);
      }
      await tx`DELETE FROM staff_events WHERE staff_id = ${staffId} AND NOT (event_id = ANY(${events}::uuid[]))`;
      for (const e of events) await tx`INSERT INTO staff_events(staff_id, event_id) VALUES (${staffId}, ${e}) ON CONFLICT DO NOTHING`;
    }
    return { created: !cur, body: await staffDto(tx, staffId) };
  });
}

export async function staffDto(tx: Q, id: string) {
  const s = (await tx<Row[]>`SELECT * FROM staff WHERE id = ${id}`)[0]!;
  const ev = await tx<Row[]>`SELECT event_id FROM staff_events WHERE staff_id = ${id} ORDER BY event_id`;
  return { id: s.id, display_name: s.name, role: s.role, staff_type: s.staff_type, active: s.active, event_ids: ev.map((e) => e.event_id) };
}

// ───────────────────────────── devices & login ─────────────────────────────

export async function createEnrollmentCode(app: AppCtx, p: Principal, eventId: string, b: { kind: string; stand_id?: string | null; training?: boolean }) {
  return inTx(app.sql, async (tx) => {
    const ev = await loadEvent(tx, eventId);
    if (b.training && ev.status === 'closed') throw new AppError('EVENT_CLOSED', 'Training devices cannot be enrolled on a closed event');
    if (b.kind !== 'console' && !b.stand_id) throw new AppError('VALIDATION_ERROR', 'stand_id is required for terminal/cashdesk devices', { fields: [{ path: 'stand_id', issue: 'required' }] });
    if (b.stand_id) {
      const st = (await tx<Row[]>`SELECT kind FROM stands WHERE id = ${b.stand_id} AND event_id = ${eventId}`)[0];
      if (!st) throw new AppError('NOT_FOUND', 'Unknown stand');
      if ((b.kind === 'cashdesk') !== (st.kind === 'cashdesk')) throw new AppError('STAND_MISMATCH', 'Device kind does not match the stand kind');
    }
    const code = newEnrollmentCode();
    const r = await tx<Row[]>`INSERT INTO enrollment_codes(code_hash, event_id, stand_id, kind, training, created_by, expires_at)
                              VALUES (${sha256(code)}, ${eventId}, ${b.stand_id ?? null}, ${b.kind}, ${b.training ?? false}, ${p.staff?.id ?? null}, now() + interval '15 minutes')
                              RETURNING expires_at`;
    return { code, expires_at: r[0]!.expires_at };
  });
}

export async function enrollDevice(app: AppCtx, b: { enrollment_code: string; device_name: string; platform: string; app_version?: string }) {
  return inTx(app.sql, async (tx) => {
    const c = (await tx<Row[]>`SELECT * FROM enrollment_codes WHERE code_hash = ${sha256(b.enrollment_code)} FOR UPDATE`)[0];
    if (!c || c.used_at || new Date(c.expires_at).getTime() < Date.now()) throw new AppError('ENROLLMENT_CODE_INVALID', 'Enrolment code expired or already used');
    const token = 'dvc_' + (await import('node:crypto')).randomBytes(32).toString('base64url');
    const d = (await tx<Row[]>`INSERT INTO devices(event_id, stand_id, name, kind, platform, training, app_version, token_hash)
                               VALUES (${c.event_id}, ${c.stand_id}, ${b.device_name}, ${c.kind}, ${b.platform}, ${c.training}, ${b.app_version ?? null}, ${sha256(token)})
                               RETURNING id`)[0]!;
    await tx`UPDATE enrollment_codes SET used_at = now(), device_id = ${d.id} WHERE id = ${c.id}`;
    return { device_id: d.id, device_token: token, event_id: c.event_id, stand_id: c.stand_id, kind: c.kind, training: c.training };
  });
}

export async function loginStaffList(tx: Q, p: Principal) {
  const rows = await tx<Row[]>`SELECT s.id, s.name, s.role FROM staff s JOIN staff_events se ON se.staff_id = s.id
                               WHERE se.event_id = ${p.eventId} AND s.active AND s.purged_at IS NULL ORDER BY s.name`;
  return { items: rows.map((r) => ({ id: r.id, display_name: r.name, role: r.role })) };
}

export async function login(app: AppCtx, p: Principal, b: { staff_id: string; pin: string }) {
  const s = (await app.sql<Row[]>`
    SELECT s.* FROM staff s JOIN staff_events se ON se.staff_id = s.id AND se.event_id = ${p.eventId}
     WHERE s.id = ${b.staff_id} AND s.active AND s.purged_at IS NULL`)[0];
  if (!s) throw new AppError('INVALID_CREDENTIALS', 'Wrong staff or PIN');
  if (s.pin_locked_until && new Date(s.pin_locked_until).getTime() > Date.now()) {
    const secs = Math.ceil((new Date(s.pin_locked_until).getTime() - Date.now()) / 1000);
    throw new AppError('PIN_LOCKED', 'Too many wrong PINs, try again later', { locked_until: s.pin_locked_until }, { 'Retry-After': String(secs) });
  }
  if (!(await verifyPin(s.pin_hash, b.pin))) {
    const n = s.pin_failed_count + 1;
    const lock = n >= 5;
    await app.sql`UPDATE staff SET pin_failed_count = ${lock ? 0 : n}, pin_locked_until = ${lock ? new Date(Date.now() + 15 * 60_000) : null} WHERE id = ${s.id}`;
    if (lock) throw new AppError('PIN_LOCKED', 'Too many wrong PINs, try again in 15 minutes', { locked_until: new Date(Date.now() + 15 * 60_000) }, { 'Retry-After': '900' });
    throw new AppError('INVALID_CREDENTIALS', 'Wrong staff or PIN');
  }
  if (s.pin_failed_count > 0 || s.pin_locked_until) await app.sql`UPDATE staff SET pin_failed_count = 0, pin_locked_until = NULL WHERE id = ${s.id}`;
  const { token, expiresAt } = await signJwt(app.cfg.JWT_SECRET, { sub: s.id, did: p.deviceId, eid: p.eventId, sid: p.standId, role: s.role, trn: p.training }, app.cfg.JWT_TTL_SECONDS);
  return {
    access_token: token,
    expires_at: expiresAt,
    session: sessionDto({ ...p, staff: { id: s.id, name: s.name, role: s.role } }),
  };
}

export function sessionDto(p: Principal) {
  return {
    staff: { id: p.staff!.id, display_name: p.staff!.name, role: p.staff!.role },
    device_id: p.deviceId, event_id: p.eventId, stand_id: p.standId, role: p.staff!.role, training: p.training, server_time: new Date(),
  };
}
