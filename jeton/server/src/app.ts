import Fastify, { type FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';
import cors from '@fastify/cors';
import { randomBytes } from 'node:crypto';
import type { Config } from './config.js';
import { loadContract } from './contract.js';
import { createSql, type Q } from './db.js';
import { AppError, errorBody, mapPgError } from './errors.js';
import type { AnchorNotifier, AppCtx } from './context.js';
import { registerAuth } from './auth/plugin.js';
import { registerContractRoute, type RouteDef } from './http.js';
import type { PaymentProvider } from './payments/provider.js';
import { FakePaymentProvider } from './payments/fake.js';
import { SumupProvider } from './payments/sumup.js';
import { authRoutes } from './routes/auth.js';
import { adminRoutes } from './routes/admin.js';
import { tagRoutes } from './routes/tags.js';
import { moneyRoutes } from './routes/money.js';
import { ledgerRoutes } from './routes/ledger.js';

export interface BuildOptions {
  cfg: Config;
  sql?: Q;
  payments?: PaymentProvider;
  notifier?: AnchorNotifier;
  logger?: boolean;
}

export interface Built {
  app: FastifyInstance;
  ctx: AppCtx;
  /** Operations of the contract that are only 501 stubs. */
  stubs: string[];
}

export async function buildApp(o: BuildOptions): Promise<Built> {
  const { cfg } = o;
  const contract = loadContract(cfg.OPENAPI_PATH);
  const app = Fastify({
    logger: o.logger === false ? false : { level: cfg.LOG_LEVEL, redact: ['req.headers.authorization'] },
    trustProxy: cfg.TRUST_PROXY,
    genReqId: () => 'req_' + randomBytes(8).toString('hex'),
    disableRequestLogging: o.logger === false,
  });
  const sql = o.sql ?? createSql(cfg.DATABASE_URL, cfg.DB_POOL_MAX);
  const payments =
    o.payments ??
    (cfg.PAYMENT_PROVIDER === 'sumup'
      ? new SumupProvider({ apiBase: cfg.SUMUP_API_BASE, apiKey: cfg.SUMUP_API_KEY, merchantCode: cfg.SUMUP_MERCHANT_CODE })
      : new FakePaymentProvider());
  const notifier: AnchorNotifier = o.notifier ?? {
    async anchor(i) {
      app.log.info({ audit: 'chain_anchor', ...i }, 'chain head anchored (log notifier; plug an SMTP notifier to e-mail it)');
    },
  };
  const ctx: AppCtx = { cfg, sql, ops: contract.ops, payments, notifier, log: app.log as unknown as AppCtx['log'] };

  // JSON parser that tolerates an empty body (POST .../ack, .../countersignature carry none)
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (_req, body, done) => {
    if (body === '' || body === undefined) return done(null, undefined);
    try {
      done(null, JSON.parse(body as string));
    } catch {
      done(new AppError('VALIDATION_ERROR', 'Malformed JSON body'), undefined);
    }
  });

  await app.register(rateLimit, {
    global: false,
    keyGenerator: (req) => req.ip,
    errorResponseBuilder: (_req, ctxRl) => Object.assign(new AppError('RATE_LIMITED', 'Too many requests', undefined, { 'Retry-After': String(Math.ceil(ctxRl.ttl / 1000)) }), {}),
  });
  if (cfg.CORS_ORIGINS) await app.register(cors, { origin: cfg.CORS_ORIGINS.split(',').map((s) => s.trim()), exposedHeaders: ['ETag', 'Idempotent-Replayed', 'Retry-After'] });

  app.setErrorHandler((err, req, reply) => {
    let e: AppError;
    if (err instanceof AppError) e = err;
    else {
      const pg = mapPgError(err);
      const status = (err as { statusCode?: number }).statusCode;
      if (pg) e = pg;
      else if (status === 429) e = new AppError('RATE_LIMITED', 'Too many requests');
      else if (status === 413) e = new AppError('PAYLOAD_TOO_LARGE', 'Request body too large');
      else if (status && status >= 400 && status < 500) e = new AppError('VALIDATION_ERROR', (err as Error).message || 'Bad request');
      else {
        req.log.error({ err }, 'unhandled error');
        e = new AppError('INTERNAL_ERROR', 'Internal error');
      }
    }
    if (e.status >= 500) req.log.error({ err, code: e.code }, 'request failed');
    if (e.headers) reply.headers(e.headers);
    reply.code(e.status).send(errorBody(e, req.id));
  });
  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send(errorBody(new AppError('NOT_FOUND', 'No such route'), req.id));
  });

  registerAuth(app, ctx);

  const registered = new Set<string>();
  const stubs: string[] = [];
  await app.register(
    async (v1) => {
      const mods = [authRoutes, adminRoutes, tagRoutes, moneyRoutes, ledgerRoutes];
      for (const m of mods) m((def: RouteDef) => registerContractRoute(v1, ctx, def, registered), ctx);
      for (const op of contract.ops) {
        const key = `${op.method} ${op.fastifyPath}`;
        if (registered.has(key)) continue;
        stubs.push(`${op.method} ${op.path}`);
        v1.route({
          method: op.method as 'GET', url: op.fastifyPath, config: { op },
          handler: async () => { throw new AppError('NOT_IMPLEMENTED', `${op.operationId} is not implemented yet`); },
        });
      }
    },
    { prefix: '/v1' },
  );
  app.get('/healthz', async () => ({ ok: true }));
  app.addHook('onClose', async () => {
    if (!o.sql) await sql.end({ timeout: 5 });
  });
  return { app, ctx, stubs };
}
