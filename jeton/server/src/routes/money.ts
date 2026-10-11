import { z } from 'zod';
import type { RouteModule } from '../http.js';
import { parse, sendIdem, zLimit, zDate, zTagCode, zUuid } from '../http.js';
import { AppError } from '../errors.js';
import { actor, eventParam, idParam, principal, query } from './util.js';
import {
  CashMovementRequest, CashoutRequest, CheckoutRequest, CloseSessionRequest, OpenSessionRequest, OrderRequest, PspSettlementRequest,
  RefundOrderRequest, TipsPayoutRequest, TopupRequest,
} from '../schemas.js';
import { createTopup } from '../domain/topups.js';
import { createOrder, fetchOrders, listOrders, refundOrder } from '../domain/orders.js';
import { ackSession, closeSession, createCashMovement, createCashout, createTipsPayout, importPspSettlement, openSession } from '../domain/cash.js';
import { createCheckout, getCheckout } from '../domain/payments.js';
import { assertStandAccess } from '../domain/common.js';
import type { Row } from '../db.js';

export const moneyRoutes: RouteModule = (add, ctx) => {
  add({ method: 'POST', path: '/topups', handler: async (req, reply) => sendIdem(reply, await createTopup(ctx, actor(req), parse(TopupRequest, req.body))) });
  add({ method: 'POST', path: '/orders', handler: async (req, reply) => sendIdem(reply, await createOrder(ctx, actor(req), parse(OrderRequest, req.body))) });
  add({
    method: 'GET', path: '/orders/{order_id}',
    handler: async (req) => {
      const a = actor(req);
      const id = idParam(req, 'order_id');
      const o = (await ctx.sql<Row[]>`SELECT stand_id, training FROM orders WHERE id = ${id} AND event_id = ${a.eventId}`)[0];
      if (!o || o.training !== a.training) throw new AppError('NOT_FOUND', 'Unknown order');
      assertStandAccess(a, o.stand_id);
      return (await fetchOrders(ctx.sql, [id]))[0];
    },
  });
  add({
    method: 'GET', path: '/events/{event_id}/orders',
    handler: async (req) => {
      const id = eventParam(req);
      const q = query(req, z.object({
        stand_id: zUuid.optional(), business_date: zDate.optional(), tag_code: zTagCode.optional(), kind: z.enum(['sale', 'refund']).optional(),
        limit: zLimit, cursor: z.string().max(512).optional(),
      }));
      return listOrders(ctx.sql, id, actor(req), q);
    },
  });
  add({
    method: 'POST', path: '/orders/{order_id}/refunds',
    handler: async (req, reply) => sendIdem(reply, await refundOrder(ctx, actor(req), idParam(req, 'order_id'), parse(RefundOrderRequest, req.body))),
  });
  add({ method: 'POST', path: '/cashouts', handler: async (req, reply) => sendIdem(reply, await createCashout(ctx, actor(req), parse(CashoutRequest, req.body))) });
  add({
    method: 'POST', path: '/cashdesk-sessions',
    handler: async (req, reply) => sendIdem(reply, await openSession(ctx, actor(req), parse(OpenSessionRequest, req.body))),
  });
  add({
    method: 'POST', path: '/cashdesk-sessions/{session_id}/close',
    handler: async (req, reply) => sendIdem(reply, await closeSession(ctx, actor(req), idParam(req, 'session_id'), parse(CloseSessionRequest, req.body))),
  });
  add({ method: 'POST', path: '/cashdesk-sessions/{session_id}/ack', handler: async (req) => ackSession(ctx, actor(req), idParam(req, 'session_id')) });
  add({
    method: 'POST', path: '/cash-movements',
    handler: async (req, reply) => sendIdem(reply, await createCashMovement(ctx, actor(req), parse(CashMovementRequest, req.body))),
  });
  add({
    method: 'POST', path: '/events/{event_id}/psp-settlements',
    handler: async (req, reply) => {
      const id = eventParam(req);
      return sendIdem(reply, await importPspSettlement(ctx, { ...actor(req), eventId: id }, parse(PspSettlementRequest, req.body)));
    },
  });
  add({ method: 'POST', path: '/tips-payouts', handler: async (req, reply) => sendIdem(reply, await createTipsPayout(ctx, actor(req), parse(TipsPayoutRequest, req.body))) });

  // ───────── online checkout (SumUp hosted checkout) ─────────
  add({
    method: 'POST', path: '/payments/checkouts',
    handler: async (req, reply) => {
      const out = await createCheckout(ctx, actor(req), parse(CheckoutRequest, req.body));
      reply.code(out.status);
      if (out.replayed) reply.header('Idempotent-Replayed', 'true');
      return out.body;
    },
  });
  add({ method: 'GET', path: '/payments/checkouts/{checkout_id}', handler: async (req) => getCheckout(ctx, actor(req), idParam(req, 'checkout_id')) });
  void principal;
};
