import { timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import type { RouteModule } from '../http.js';
import { parse, sendIdem, zLimit } from '../http.js';
import { AppError } from '../errors.js';
import { actor, actorFor, boolQ, eventParam, idParam, principal, query } from './util.js';
import { ReverseJournalRequest, SealZRequest, SyncBatchRequest } from '../schemas.js';
import { countersign, getJournal, ledgerHead, listFlags, listJournal, resolveFlag, reverseJournal, verifyLedger } from '../domain/journals.js';
import { assertEventAccess } from '../auth/plugin.js';
import { printReceipt } from '../domain/receipts.js';
import { syncBatch } from '../domain/sync.js';
import { handleSumupWebhook } from '../domain/payments.js';
import { sealZ, listZ } from '../domain/zreports.js';
import { buildZContent, liabilityReport, redemptionVolume, SALES_GROUPS, salesReport, tipsReport, topupsReport, vatReport, zPreviewDto } from '../domain/reports.js';
import { DATASETS, exportCsv } from '../domain/exports.js';
import { assertStandAccess, loadStand } from '../domain/common.js';
import type { Row } from '../db.js';

const zDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'must be YYYY-MM-DD');

export const ledgerRoutes: RouteModule = (add, ctx) => {
  const sql = ctx.sql;

  add({ method: 'GET', path: '/journals/{journal_id}', handler: async (req) => getJournal(sql, actor(req).eventId, idParam(req, 'journal_id')) });
  add({
    method: 'POST', path: '/journals/{journal_id}/reversals',
    handler: async (req, reply) => sendIdem(reply, await reverseJournal(ctx, actor(req), idParam(req, 'journal_id'), parse(ReverseJournalRequest, req.body))),
  });
  add({ method: 'POST', path: '/journals/{journal_id}/countersignature', handler: async (req) => countersign(ctx, actor(req), idParam(req, 'journal_id')) });
  add({
    method: 'GET', path: '/events/{event_id}/journal',
    handler: async (req) => {
      const id = eventParam(req);
      const q = query(req, z.object({
        after_seq: z.coerce.number().int().min(0).default(0), include_training: boolQ.default(false), limit: z.coerce.number().int().min(1).max(500).default(100),
      }));
      return listJournal(sql, id, q);
    },
  });
  add({ method: 'GET', path: '/events/{event_id}/ledger/verify', handler: async (req) => verifyLedger(ctx, eventParam(req)) });
  add({ method: 'GET', path: '/events/{event_id}/ledger/head', handler: async (req) => ledgerHead(sql, eventParam(req)) });
  add({
    method: 'GET', path: '/events/{event_id}/flags',
    handler: async (req) => {
      const id = eventParam(req);
      const q = query(req, z.object({ resolved: boolQ.optional(), limit: zLimit, cursor: z.string().max(512).optional() }));
      return listFlags(sql, id, q);
    },
  });
  add({
    method: 'POST', path: '/flags/{flag_id}/resolve',
    handler: async (req) => {
      const { flag_id } = parse(z.object({ flag_id: z.coerce.number().int().min(1) }), req.params, 'params');
      const { note } = parse(z.object({ note: z.string().min(1).max(500) }), req.body);
      return resolveFlag(ctx, actor(req), flag_id, note);
    },
  });

  add({
    method: 'POST', path: '/sync/batch',
    handler: async (req) => {
      const p = principal(req);
      const raw = req.body as { items?: unknown[] } | undefined;
      if (Array.isArray(raw?.items) && raw.items.length > 200) throw new AppError('PAYLOAD_TOO_LARGE', 'At most 200 items per batch');
      const b = parse(SyncBatchRequest, req.body);
      const results = await syncBatch(ctx, p, req.id, b.items);
      return { batch_id: b.batch_id, server_time: new Date(), results };
    },
  });

  add({
    method: 'POST', path: '/receipts/{document_type}/{document_id}/prints',
    handler: async (req) => {
      const p = parse(z.object({ document_type: z.enum(['order', 'topup', 'cashout']), document_id: z.string().uuid() }), req.params, 'params');
      return printReceipt(ctx, actor(req), p.document_type, p.document_id);
    },
  });

  // ───────── Z reports ─────────
  add({
    method: 'GET', path: '/events/{event_id}/reports/z',
    handler: async (req) => {
      const id = eventParam(req);
      const q = query(req, z.object({ stand_id: z.string().uuid(), business_date: zDate }));
      assertStandAccess(actor(req), q.stand_id);
      await loadStand(sql, id, q.stand_id);
      return zPreviewDto((await buildZContent(sql, id, q.stand_id, q.business_date)).content);
    },
  });
  add({
    method: 'POST', path: '/events/{event_id}/z-reports',
    handler: async (req, reply) => sendIdem(reply, await sealZ(ctx, actorFor(req, eventParam(req)), parse(SealZRequest, req.body))),
  });
  add({
    method: 'GET', path: '/events/{event_id}/z-reports',
    handler: async (req) => {
      const id = eventParam(req);
      const a = actor(req);
      const q = query(req, z.object({ stand_id: z.string().uuid().optional() }));
      return listZ(sql, id, a.role === 'vendor' ? a.standId : (q.stand_id ?? null));
    },
  });

  // ───────── reports ─────────
  add({
    method: 'GET', path: '/events/{event_id}/reports/sales',
    handler: async (req) => {
      const id = eventParam(req);
      const a = actor(req);
      const q = query(req, z.object({ group_by: z.enum(SALES_GROUPS), from: zDate.optional(), to: zDate.optional(), stand_id: z.string().uuid().optional() }));
      return salesReport(sql, id, { ...q, stand_id: a.role === 'vendor' ? a.standId : (q.stand_id ?? null) });
    },
  });
  add({ method: 'GET', path: '/events/{event_id}/reports/vat', handler: async (req) => vatReport(sql, eventParam(req), query(req, z.object({ from: zDate.optional(), to: zDate.optional() }))) });
  add({ method: 'GET', path: '/events/{event_id}/reports/topups', handler: async (req) => topupsReport(sql, eventParam(req), query(req, z.object({ from: zDate.optional(), to: zDate.optional() }))) });
  add({
    method: 'GET', path: '/events/{event_id}/reports/liability',
    handler: async (req) => {
      const q = query(req, z.object({ as_of: z.string().datetime({ offset: true }).optional() }));
      return liabilityReport(sql, eventParam(req), q.as_of ? new Date(q.as_of) : null);
    },
  });
  add({
    method: 'GET', path: '/events/{event_id}/reports/tips',
    handler: async (req) => tipsReport(sql, eventParam(req), query(req, z.object({ group_by: z.enum(['stand', 'staff', 'day']).default('stand') })).group_by),
  });
  add({
    method: 'GET', path: '/organizers/{organizer_id}/reports/redemption-volume',
    handler: async (req) => {
      const id = idParam(req, 'organizer_id');
      const p = principal(req);
      const ok = (await sql<Row[]>`SELECT 1 FROM events WHERE id = ${p.eventId} AND organizer_id = ${id}`)[0];
      if (!ok && !(p.staff?.role === 'admin' && p.deviceKind === 'console')) throw new AppError('NOT_FOUND', 'Unknown organizer');
      return redemptionVolume(sql, id);
    },
  });
  add({
    method: 'GET', path: '/events/{event_id}/exports/{dataset}',
    handler: async (req, reply) => {
      const id = eventParam(req);
      const { dataset } = parse(z.object({ dataset: z.enum(DATASETS) }), req.params, 'params');
      const q = query(req, z.object({ include_training: boolQ.default(false) }));
      const p = principal(req);
      const out = await exportCsv(sql, id, dataset, q.include_training, ctx.cfg.UID_PEPPER);
      await sql`INSERT INTO export_log(event_id, dataset, include_training, row_count, staff_id, device_id) VALUES (${id}, ${dataset}, ${q.include_training}, ${out.rows}, ${p.staff?.id ?? null}, ${p.deviceId})`;
      ctx.log.info({ audit: 'export', event_id: id, dataset, rows: out.rows, staff_id: p.staff?.id }, 'csv export');
      reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${id}-${dataset}.csv"`).header('Cache-Control', 'no-store');
      return out.csv;
    },
  });

  // ───────── webhook (not authenticated by token; secret in query) ─────────
  add({
    method: 'POST', path: '/webhooks/sumup',
    rateLimit: { max: 300, timeWindow: 60_000 },
    handler: async (req) => {
      const { token } = query(req, z.object({ token: z.string().min(1).max(200) }));
      const a = Buffer.from(token);
      const b = Buffer.from(ctx.cfg.SUMUP_WEBHOOK_SECRET);
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw new AppError('UNAUTHENTICATED', 'Bad webhook token');
      try {
        await handleSumupWebhook(ctx, req.body);
      } catch (e) {
        ctx.log.error({ err: String(e) }, 'sumup webhook processing failed');
        throw new AppError('SERVICE_UNAVAILABLE', 'retry later'); // makes the PSP retry
      }
      return { ok: true };
    },
  });
  void assertEventAccess;
};
