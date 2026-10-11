import { z } from 'zod';
import type { RouteModule } from '../http.js';
import { parse, zUuid } from '../http.js';
import { enrollDevice, login, loginStaffList, sessionDto } from '../domain/admin.js';
import { principal } from './util.js';
import { AppError } from '../errors.js';

export const authRoutes: RouteModule = (add, ctx) => {
  const rl = { max: ctx.cfg.AUTH_RATE_LIMIT_MAX, timeWindow: ctx.cfg.AUTH_RATE_LIMIT_WINDOW_MS };

  add({
    method: 'GET', path: '/health',
    handler: async (_req, reply) => {
      try {
        await ctx.sql`SELECT 1`;
      } catch {
        throw new AppError('SERVICE_UNAVAILABLE', 'Database unavailable');
      }
      reply.header('Cache-Control', 'no-store');
      return { status: 'ok', server_time: new Date(), version: ctx.cfg.APP_VERSION, min_client_contract: '1.0.0' };
    },
  });

  add({
    method: 'POST', path: '/auth/devices/enroll', rateLimit: rl,
    handler: async (req, reply) => {
      const b = parse(z.object({
        enrollment_code: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{8}$/), device_name: z.string().min(1).max(100),
        platform: z.enum(['android', 'ios', 'web']), app_version: z.string().max(40).optional(),
      }), req.body);
      reply.code(201);
      return enrollDevice(ctx, b);
    },
  });

  add({ method: 'GET', path: '/auth/staff', handler: async (req) => loginStaffList(ctx.sql, principal(req)) });

  add({
    method: 'POST', path: '/auth/login', rateLimit: rl,
    handler: async (req) => login(ctx, principal(req), parse(z.object({ staff_id: zUuid, pin: z.string().regex(/^[0-9]{4,8}$/) }), req.body)),
  });

  add({ method: 'GET', path: '/auth/me', handler: async (req) => sessionDto(principal(req)) });
};
