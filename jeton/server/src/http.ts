import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z, type ZodType } from 'zod';
import type { AppCtx } from './context.js';
import { AppError } from './errors.js';
import { TAG_CODE_RE, TAG_UID_RE, UUID_RE } from './util/ids.js';
import type { IdemOutcome } from './domain/common.js';

// ───────── shared zod primitives (mirror components/schemas of the contract) ─────────
export const zUuid = z.string().regex(UUID_RE, 'must be a UUID').transform((s) => s.toLowerCase());
export const zTagCode = z.string().regex(TAG_CODE_RE, 'invalid tag_code');
export const zTagUid = z.string().regex(TAG_UID_RE, 'invalid uid (upper-case hex, 4/7/10 bytes)');
export const zTagRef = z.object({ tag_code: zTagCode, uid: zTagUid }).strict();
export const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');
export const zTimestamp = z.string().datetime({ offset: true }).transform((s) => new Date(s));
export const zInt = z.number().int();
export const zReason = z.enum([
  'customer_request', 'cashier_error', 'vendor_error', 'duplicate', 'chargeback', 'lost_tag', 'psp_failed', 'event_cancelled',
  'tag_replacement', 'event_close', 'other',
]);
export const zConsumptionMode = z.enum(['on_site', 'takeaway']);
export const zVatCategory = z.enum(['FOOD', 'DRINK_SOFT', 'ALCOHOL', 'ICE_CREAM', 'MERCH', 'ZERO']);
export const zClientMeta = {
  client_created_at: zTimestamp.optional(),
  provisional_ref: z.string().max(40).optional(),
};
export const zLimit = z.coerce.number().int().min(1).max(200).default(50);

export function parse<T extends ZodType>(schema: T, data: unknown, where = 'body'): z.output<T> {
  const r = schema.safeParse(data ?? {});
  if (r.success) return r.data;
  const fields = r.error.issues.map((i) => ({
    path: [where === 'body' ? '' : where, ...i.path].filter((x) => x !== '').join('/'),
    issue: i.message,
  }));
  throw new AppError('VALIDATION_ERROR', 'Invalid request ' + where, { fields });
}

/** Pagination helpers: `limit` is clamped, `next_cursor` is null on the last page. */
export function page<T>(rows: T[], limit: number, cursorOf: (last: T) => unknown, encode: (v: unknown) => string): { items: T[]; next_cursor: string | null } {
  if (rows.length > limit) {
    const items = rows.slice(0, limit);
    return { items, next_cursor: encode(cursorOf(items[items.length - 1]!)) };
  }
  return { items: rows, next_cursor: null };
}

// ───────── route registration bound to the contract ─────────
export type Handler = (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>;

export interface RouteDef {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  /** OpenAPI template path, e.g. /events/{event_id}/catalog */
  path: string;
  handler: Handler;
  rateLimit?: { max: number; timeWindow: number };
}

/**
 * Registers a route that exists in the OpenAPI file. The operation's roles and security schemes are attached to the route
 * config; the auth hook enforces them (see auth/plugin.ts). Routes missing from the contract are a programming error.
 */
export function registerContractRoute(app: FastifyInstance, ctx: AppCtx, def: RouteDef, registered: Set<string>): void {
  const key = `${def.method} ${def.path.replace(/\{([^}]+)\}/g, ':$1')}`;
  const op = ctx.ops.find((o) => `${o.method} ${o.fastifyPath}` === key);
  if (!op) throw new Error(`Route ${key} is not part of api/openapi.yaml`);
  registered.add(key);
  app.route({
    method: def.method,
    url: op.fastifyPath,
    config: { op, rateLimit: def.rateLimit },
    handler: def.handler,
  });
}

/** Sends the outcome of an idempotent operation: 201/200 first time, 200 + Idempotent-Replayed on replays. */
export function sendIdem<T>(reply: FastifyReply, out: IdemOutcome<T>): T {
  reply.code(out.replayed ? 200 : out.status);
  if (out.replayed) reply.header('Idempotent-Replayed', 'true');
  return out.body;
}

export type RouteModule = (add: (def: RouteDef) => void, ctx: AppCtx) => void;
