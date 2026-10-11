import { z } from 'zod';
import type { RouteModule } from '../http.js';
import { page, parse, zLimit, zUuid, zVatCategory } from '../http.js';
import { AppError } from '../errors.js';
import { actor, actorFor, boolQ, eventParam, idParam, principal, query } from './util.js';
import { assertEventAccess } from '../auth/plugin.js';
import { createEnrollmentCode, eventDto, listEvents, organizerDto, putEvent, putStaff, staffDto } from '../domain/admin.js';
import { loadEvent } from '../domain/common.js';
import { closeEvent } from '../domain/close.js';
import { catalogSnapshot, listVatRates, putCategory, putItem, putStand, validateVatRates } from '../domain/catalog.js';
import { sendIdem } from '../http.js';
import type { Row } from '../db.js';

const dateTime = z.string().datetime({ offset: true }).transform((s) => new Date(s));
const EventWrite = z.object({
  id: zUuid, organizer_id: zUuid, name: z.string().min(1).max(200), country: z.enum(['BE', 'FR']),
  timezone: z.string().min(1).optional(), token_price_cents: z.number().int().min(1).optional(),
  offline_cap_tokens: z.number().int().min(0).optional(), max_balance_tokens: z.number().int().min(1).optional(), max_topup_tokens: z.number().int().min(1).optional(),
  vat_regime: z.enum(['standard', 'franchise', 'exempt_event']).optional(), voucher_type: z.enum(['multi_purpose', 'single_purpose']).optional(),
  single_purpose_vat_category: zVatCategory.nullish(), be_gks_required: z.boolean().optional(), fr_cash_software_required: z.boolean().optional(),
  third_party_vendors_enabled: z.literal(false).optional(), tips_enabled: z.boolean().optional(),
  tip_presets_tokens: z.array(z.number().int().min(1)).optional(), tip_max_tokens: z.number().int().min(0).optional(), tip_max_percent: z.number().int().min(0).max(100).optional(),
  tips_payout_policy: z.enum(['staff', 'collective_donation']).optional(), refundable_until: dateTime.nullish(), min_refund_tokens: z.number().int().min(1).optional(),
  expiry_at: dateTime.nullish(), breakage_treatment: z.enum(['retain', 'donate', 'refund_later']).optional(), refund_cash_limited_to_cash_topups: z.boolean().optional(),
  policy_version: z.string().nullish(), terms_version: z.string().nullish(), starts_at: dateTime.nullish(), ends_at: dateTime.nullish(),
  status: z.enum(['draft', 'open']).optional(),
}).strict();

const Localized = z.object({ fr: z.string().max(100).optional(), nl: z.string().max(100).optional(), en: z.string().max(100).optional() }).strict();
const Allergen = z.enum(['gluten', 'crustaceans', 'eggs', 'fish', 'peanuts', 'soy', 'milk', 'nuts', 'celery', 'mustard', 'sesame', 'sulphites', 'lupin', 'molluscs']);

export const adminRoutes: RouteModule = (add, ctx) => {
  const sql = ctx.sql;

  add({
    method: 'PUT', path: '/organizers/{organizer_id}',
    handler: async (req, reply) => {
      const id = idParam(req, 'organizer_id');
      const b = parse(z.object({
        id: zUuid, legal_name: z.string().min(1), legal_form: z.enum(['asbl_vzw', 'company_be', 'person_be', 'association_1901', 'company_fr', 'micro_fr', 'other']),
        address: z.string().min(1), enterprise_no: z.string().min(1), vat_no: z.string().nullish(), contact_email: z.string().email().nullish(),
      }), req.body);
      if (b.id !== id) throw new AppError('VALIDATION_ERROR', 'id in body must equal the path', { fields: [{ path: 'id', issue: 'mismatch' }] });
      const ex = await sql<Row[]>`SELECT id FROM organizers WHERE id = ${id}`;
      const r = await sql<Row[]>`
        INSERT INTO organizers(id, legal_name, legal_form, address, enterprise_no, vat_no, contact_email)
        VALUES (${id}, ${b.legal_name}, ${b.legal_form}, ${b.address}, ${b.enterprise_no}, ${b.vat_no ?? null}, ${b.contact_email ?? null})
        ON CONFLICT (id) DO UPDATE SET legal_name = EXCLUDED.legal_name, legal_form = EXCLUDED.legal_form, address = EXCLUDED.address,
          enterprise_no = EXCLUDED.enterprise_no, vat_no = EXCLUDED.vat_no, contact_email = EXCLUDED.contact_email RETURNING *`;
      reply.code(ex.length ? 200 : 201);
      return organizerDto(r[0]!);
    },
  });
  add({
    method: 'GET', path: '/organizers/{organizer_id}',
    handler: async (req) => {
      const id = idParam(req, 'organizer_id');
      const r = (await sql<Row[]>`SELECT o.* FROM organizers o WHERE o.id = ${id}
                                   AND (o.id = (SELECT organizer_id FROM events WHERE id = ${principal(req).eventId}) OR ${principal(req).staff?.role === 'admin'})`)[0];
      if (!r) throw new AppError('NOT_FOUND', 'Unknown organizer');
      return organizerDto(r);
    },
  });

  add({ method: 'GET', path: '/events', handler: async (req) => listEvents(sql, principal(req), { limit: query(req, z.object({ limit: zLimit, cursor: z.string().max(512).optional() })).limit, cursor: (req.query as any)?.cursor }) });
  add({ method: 'GET', path: '/events/{event_id}', handler: async (req) => eventDto(sql, await loadEvent(sql, eventParam(req))) });
  add({
    method: 'PUT', path: '/events/{event_id}',
    handler: async (req, reply) => {
      const id = idParam(req, 'event_id');
      assertEventAccess(principal(req), id) ;
      const b = parse(EventWrite, req.body);
      if (b.id !== id) throw new AppError('VALIDATION_ERROR', 'id in body must equal the path', { fields: [{ path: 'id', issue: 'mismatch' }] });
      const r = await putEvent(ctx, id, b);
      reply.code(r.status);
      return r.body;
    },
  });
  add({
    method: 'POST', path: '/events/{event_id}/close',
    handler: async (req, reply) => {
      const id = eventParam(req);
      const b = parse(z.object({ client_tx_id: zUuid, tips_disposition: z.enum(['payout_done', 'none_outstanding', 'assigned_to_donation']) }), req.body);
      const out = await closeEvent(ctx, actorFor(req, id), b);
      reply.code(200);
      if (out.replayed) reply.header('Idempotent-Replayed', 'true');
      return out.body;
    },
  });

  add({
    method: 'GET', path: '/events/{event_id}/staff',
    handler: async (req) => {
      const id = eventParam(req);
      const ids = await sql<Row[]>`SELECT staff_id FROM staff_events WHERE event_id = ${id} ORDER BY staff_id`;
      return { items: await Promise.all(ids.map((r) => staffDto(sql, r.staff_id))) };
    },
  });
  add({
    method: 'PUT', path: '/staff/{staff_id}',
    handler: async (req, reply) => {
      const id = idParam(req, 'staff_id');
      const b = parse(z.object({
        display_name: z.string().min(1).max(100), role: z.enum(['admin', 'cashier', 'vendor', 'auditor']),
        staff_type: z.enum(['employee', 'volunteer', 'vendor_staff']).optional(), active: z.boolean().optional(),
        pin: z.string().regex(/^[0-9]{4,8}$/).optional(), event_ids: z.array(zUuid).optional(),
      }), req.body);
      const r = await putStaff(ctx, principal(req), id, b);
      reply.code(r.created ? 201 : 200);
      return r.body;
    },
  });

  add({
    method: 'POST', path: '/events/{event_id}/enrollment-codes',
    handler: async (req, reply) => {
      const id = eventParam(req);
      const b = parse(z.object({ kind: z.enum(['terminal', 'cashdesk', 'console']), stand_id: zUuid.nullish(), training: z.boolean().optional() }), req.body);
      reply.code(201);
      return createEnrollmentCode(ctx, principal(req), id, b);
    },
  });
  add({
    method: 'GET', path: '/events/{event_id}/devices',
    handler: async (req) => {
      const id = eventParam(req);
      const rows = await sql<Row[]>`SELECT * FROM devices WHERE event_id = ${id} ORDER BY enrolled_at`;
      return { items: rows.map(deviceDto) };
    },
  });
  add({
    method: 'POST', path: '/devices/{device_id}/revoke',
    handler: async (req) => {
      const id = idParam(req, 'device_id');
      const b = parse(z.object({ reason: z.string().max(200).optional() }), req.body);
      const d = (await sql<Row[]>`SELECT * FROM devices WHERE id = ${id}`)[0];
      if (!d) throw new AppError('NOT_FOUND', 'Unknown device');
      assertEventAccess(principal(req), d.event_id);
      const r = await sql<Row[]>`UPDATE devices SET revoked_at = COALESCE(revoked_at, now()), revoked_reason = COALESCE(revoked_reason, ${b.reason ?? null}) WHERE id = ${id} RETURNING *`;
      return deviceDto(r[0]!);
    },
  });

  // ───────── catalog ─────────
  add({
    method: 'GET', path: '/events/{event_id}/catalog',
    handler: async (req, reply) => {
      const id = eventParam(req);
      const q = query(req, z.object({ include_inactive: boolQ.default(false) }));
      const snap = await catalogSnapshot(sql, id, q.include_inactive);
      const etag = `"${snap.version}${q.include_inactive ? '-all' : ''}"`;
      reply.header('ETag', etag).header('Cache-Control', 'private, no-cache');
      if (req.headers['if-none-match'] === etag) return reply.code(304).send();
      return snap.body;
    },
  });
  add({
    method: 'PUT', path: '/events/{event_id}/stands/{stand_id}',
    handler: async (req, reply) => {
      const id = eventParam(req);
      const sid = idParam(req, 'stand_id');
      const b = parse(z.object({
        id: zUuid, name: z.string().min(1).max(100), name_i18n: Localized.optional(), kind: z.enum(['stand', 'cashdesk']),
        active: z.boolean().optional(), sort_order: z.number().int().optional(),
      }), req.body);
      if (b.id !== sid) throw new AppError('VALIDATION_ERROR', 'id in body must equal the path', { fields: [{ path: 'id', issue: 'mismatch' }] });
      const r = await putStand(sql, id, sid, b);
      reply.code(r.created ? 201 : 200);
      return r.body;
    },
  });
  add({
    method: 'PUT', path: '/events/{event_id}/categories/{category_id}',
    handler: async (req, reply) => {
      const id = eventParam(req);
      const cid = idParam(req, 'category_id');
      const b = parse(z.object({ id: zUuid, name: z.string().min(1).max(100), name_i18n: Localized.optional(), active: z.boolean().optional(), sort_order: z.number().int().optional() }), req.body);
      if (b.id !== cid) throw new AppError('VALIDATION_ERROR', 'id in body must equal the path', { fields: [{ path: 'id', issue: 'mismatch' }] });
      const r = await putCategory(sql, id, cid, b);
      reply.code(r.created ? 201 : 200);
      return r.body;
    },
  });
  add({
    method: 'PUT', path: '/events/{event_id}/items/{item_id}',
    handler: async (req, reply) => {
      const id = eventParam(req);
      const iid = idParam(req, 'item_id');
      const b = parse(z.object({
        id: zUuid, stand_id: zUuid, category_id: zUuid, name: z.string().min(1).max(100), name_i18n: Localized.optional(), price_tokens: z.number().int().min(1),
        vat_category: zVatCategory, default_consumption_mode: z.enum(['on_site', 'takeaway']).optional(), min_age: z.number().int().min(1).max(99).nullish(),
        allergens: z.array(Allergen).optional(), icon: z.string().nullish(), color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).nullish(),
        active: z.boolean().optional(), sort_order: z.number().int().optional(),
      }).passthrough(), req.body);
      if (b.id !== iid) throw new AppError('VALIDATION_ERROR', 'id in body must equal the path', { fields: [{ path: 'id', issue: 'mismatch' }] });
      const r = await putItem(sql, id, iid, b);
      reply.code(r.created ? 201 : 200);
      return r.body;
    },
  });
  add({
    method: 'GET', path: '/vat-rates',
    handler: async (req) => listVatRates(sql, query(req, z.object({ country: z.enum(['BE', 'FR']).optional(), on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }))),
  });
  add({
    method: 'POST', path: '/vat-rates/validate',
    handler: async (req) => validateVatRates(sql, parse(z.object({
      validated_by: z.string().min(1).max(100),
      rates: z.array(z.object({ country: z.enum(['BE', 'FR']), category_code: zVatCategory, consumption_mode: z.enum(['on_site', 'takeaway']), valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) })).min(1),
    }), req.body)),
  });
  void page; void actor; void sendIdem;
};

function deviceDto(d: Row) {
  return {
    id: d.id, name: d.name, kind: d.kind, stand_id: d.stand_id, platform: d.platform, training: d.training, app_version: d.app_version,
    enrolled_at: d.enrolled_at, last_seen_at: d.last_seen_at, revoked_at: d.revoked_at,
  };
}
