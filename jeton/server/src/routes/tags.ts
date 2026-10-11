import { z } from 'zod';
import type { RouteModule } from '../http.js';
import { parse, sendIdem, zLimit, zTagCode, zTagUid } from '../http.js';
import { AppError } from '../errors.js';
import { actor, boolQ, eventParam, idParam, principal, query } from './util.js';
import { ConfirmTagRequest, EnrollTagRequest, ReplaceTagRequest, SetTagStatusRequest } from '../schemas.js';
import { confirmTag, enrollTag, findTag, listTagTransactions, listTags, replaceTag, setTagStatus, tagInfo } from '../domain/tags.js';
import { loadEvent } from '../domain/common.js';
import { publicTagPage } from '../domain/public.js';

const code = (req: any) => parse(z.object({ tag_code: zTagCode }), req.params, 'params').tag_code;

export const tagRoutes: RouteModule = (add, ctx) => {
  add({
    method: 'POST', path: '/tags/enroll',
    handler: async (req, reply) => sendIdem(reply, await enrollTag(ctx, actor(req), parse(EnrollTagRequest, req.body))),
  });
  add({
    method: 'POST', path: '/tags/{tag_code}/confirm',
    handler: async (req, reply) => sendIdem(reply, await confirmTag(ctx, actor(req), code(req), parse(ConfirmTagRequest, req.body))),
  });
  add({
    method: 'GET', path: '/tags/{tag_code}',
    handler: async (req) => {
      const a = actor(req);
      const { uid } = query(req, z.object({ uid: zTagUid }));
      const tag = await findTag(ctx.sql, code(req));
      if (!tag) throw new AppError('TAG_NOT_FOUND', 'Unknown tag');
      if (tag.status !== 'active') throw new AppError('TAG_NOT_ACTIVE', 'Tag is not active');
      if (tag.uid_hex !== uid) throw new AppError('TAG_UID_MISMATCH', 'Chip UID does not match the enrolled tag');
      const ev = await loadEvent(ctx.sql, a.eventId);
      const info = await tagInfo(ctx.sql, ev.token_price_cents, a, tag);
      if (info.wallet_status === 'blocked' && a.role !== 'admin' && a.role !== 'cashier') throw new AppError('TAG_BLOCKED', 'This tag is blocked');
      return info;
    },
  });
  add({
    method: 'POST', path: '/tags/{tag_code}/status',
    handler: async (req, reply) => sendIdem(reply, await setTagStatus(ctx, actor(req), code(req), parse(SetTagStatusRequest, req.body))),
  });
  add({
    method: 'POST', path: '/tags/{tag_code}/replace',
    handler: async (req, reply) => sendIdem(reply, await replaceTag(ctx, actor(req), code(req), parse(ReplaceTagRequest, req.body))),
  });
  add({
    method: 'GET', path: '/events/{event_id}/tags',
    handler: async (req) => {
      const id = eventParam(req);
      const q = query(req, z.object({ wallet_status: z.enum(['new', 'active', 'blocked']).optional(), negative_only: boolQ.default(false), limit: zLimit, cursor: z.string().max(512).optional() }));
      return listTags(ctx.sql, id, q);
    },
  });
  add({
    method: 'GET', path: '/tags/{tag_code}/transactions',
    handler: async (req) => {
      const a = actor(req);
      const tag = await findTag(ctx.sql, code(req));
      if (!tag) throw new AppError('TAG_NOT_FOUND', 'Unknown tag');
      const q = query(req, z.object({ limit: zLimit, cursor: z.string().max(512).optional() }));
      return listTagTransactions(ctx.sql, a.eventId, tag.id, a.training, q);
    },
  });

  add({
    method: 'GET', path: '/public/tags/{tag_code}',
    rateLimit: { max: ctx.cfg.PUBLIC_RATE_LIMIT_MAX, timeWindow: ctx.cfg.PUBLIC_RATE_LIMIT_WINDOW_MS },
    handler: async (req, reply) => {
      reply.header('Cache-Control', 'no-store').header('X-Robots-Tag', 'noindex, nofollow');
      const raw = (req.params as { tag_code?: string }).tag_code ?? '';
      const page = await publicTagPage(ctx.sql, ctx.cfg, raw);
      if (!page) throw new AppError('NOT_FOUND', 'Not found');
      return page;
    },
  });
  void principal; void idParam;
};
