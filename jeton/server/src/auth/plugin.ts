import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AppCtx } from '../context.js';
import type { Operation, Role } from '../contract.js';
import { AppError } from '../errors.js';
import { sha256 } from '../util/crypto.js';
import { verifyJwt } from './jwt.js';
import type { Principal } from './principal.js';
import type { Row } from '../db.js';

function bearer(req: FastifyRequest): string | null {
  const h = req.headers.authorization;
  if (!h) return null;
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  return m ? m[1]! : null;
}

const DEVICE_TOKEN_PREFIX = 'dvc_';

/**
 * Global onRequest hook: authenticates (device token or staff JWT), loads the device (revocation is checked on every
 * request, so a revoked device dies at once, ADR 0010), then enforces the operation's `x-roles` from the OpenAPI file.
 */
export function registerAuth(app: FastifyInstance, ctx: AppCtx): void {
  app.addHook('onRequest', async (req) => {
    const op = (req.routeOptions.config as { op?: Operation } | undefined)?.op;
    if (!op) return; // unknown route (404) or non-contract route handling its own auth
    req.operationId = op.operationId;
    if (op.schemes.length === 0) return; // public

    const token = bearer(req);
    if (!token) throw new AppError('UNAUTHENTICATED', 'Missing credentials', undefined, { 'WWW-Authenticate': 'Bearer' });

    let principal: Principal;
    if (token.startsWith(DEVICE_TOKEN_PREFIX)) {
      if (!op.schemes.includes('deviceAuth')) throw new AppError('UNAUTHENTICATED', 'A staff session is required for this operation');
      const rows = await ctx.sql<Row[]>`
        SELECT id, kind, event_id, stand_id, training, revoked_at FROM devices WHERE token_hash = ${sha256(token)}`;
      const d = rows[0];
      if (!d) throw new AppError('UNAUTHENTICATED', 'Unknown device token');
      if (d.revoked_at) throw new AppError('DEVICE_REVOKED', 'This device has been revoked');
      principal = { deviceId: d.id, deviceKind: d.kind, eventId: d.event_id, standId: d.stand_id, training: d.training };
    } else {
      if (!op.schemes.includes('staffAuth')) throw new AppError('UNAUTHENTICATED', 'A device token is required for this operation');
      const claims = await verifyJwt(ctx.cfg.JWT_SECRET, token);
      const rows = await ctx.sql<Row[]>`
        SELECT d.id, d.kind, d.event_id, d.stand_id, d.training, d.revoked_at,
               s.id AS staff_id, s.name, s.role, s.active, s.purged_at,
               EXISTS (SELECT 1 FROM staff_events se WHERE se.staff_id = s.id AND se.event_id = d.event_id) AS assigned
          FROM devices d, staff s WHERE d.id = ${claims.did} AND s.id = ${claims.sub}`;
      const d = rows[0];
      if (!d) throw new AppError('UNAUTHENTICATED', 'Unknown session');
      if (d.revoked_at) throw new AppError('DEVICE_REVOKED', 'This device has been revoked');
      if (!d.active || d.purged_at || !d.assigned) throw new AppError('UNAUTHENTICATED', 'Staff member is inactive');
      principal = {
        deviceId: d.id, deviceKind: d.kind, eventId: d.event_id, standId: d.stand_id, training: d.training,
        staff: { id: d.staff_id, name: d.name, role: d.role as Role },
      };
    }

    // Role guard straight from x-roles. Device-only principals (sync) are checked per item by the handler.
    if (principal.staff && op.roles && !op.roles.includes(principal.staff.role)) {
      throw new AppError('FORBIDDEN', `Role ${principal.staff.role} cannot perform this operation`);
    }
    req.principal = principal;

    // Heartbeat + pending offline operations reported by the terminal.
    const pendingHdr = req.headers['x-pending-offline-ops'];
    const pending = typeof pendingHdr === 'string' && /^\d{1,6}$/.test(pendingHdr) ? Number(pendingHdr) : null;
    if (pending !== null) {
      await ctx.sql`UPDATE devices SET pending_offline_ops = ${pending}, pending_reported_at = now(), last_seen_at = now() WHERE id = ${principal.deviceId}`;
    } else {
      ctx.sql`UPDATE devices SET last_seen_at = now() WHERE id = ${principal.deviceId} AND (last_seen_at IS NULL OR last_seen_at < now() - interval '60 seconds')`
        .then(() => undefined, () => undefined);
    }
  });
}

/** Admins of a console device may manage other events (create events, codes ...); everybody else is bound to the device event. */
export function assertEventAccess(p: Principal, eventId: string): void {
  if (p.eventId === eventId) return;
  if (p.staff?.role === 'admin' && p.deviceKind === 'console') return;
  throw new AppError('FORBIDDEN', 'This device is not enrolled for that event');
}

export function staffOf(p: Principal | undefined): NonNullable<Principal['staff']> & { p: Principal } {
  if (!p?.staff) throw new AppError('UNAUTHENTICATED', 'Staff login required');
  return { ...p.staff, p };
}
