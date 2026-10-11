import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fastifyStatic from '@fastify/static';

/** Paths owned by the API: never answered with the SPA fallback. */
const API_PREFIXES = ['/v1', '/healthz'];
const NO_CACHE = 'no-cache';
const IMMUTABLE = 'public, max-age=31536000, immutable';

export function cacheControlFor(urlPath: string): string {
  if (urlPath.startsWith('/assets/')) return IMMUTABLE; // Vite content-hashed bundles
  if (/\.(html|webmanifest)$/.test(urlPath) || urlPath.endsWith('/sw.js') || urlPath === '/sw.js') return NO_CACHE;
  return 'public, max-age=3600';
}

const isApiPath = (p: string) => API_PREFIXES.some((x) => p === x || p.startsWith(x + '/') || p.startsWith(x + '?'));

/**
 * Serves the built web app (app/dist) from the same origin as the API.
 *   /            -> index.html (PWA)        /t/:tagCode -> t.html (guest page)
 *   unknown non-API paths without a file extension -> index.html (SPA fallback)
 * Returns the not-found handler the caller must install once (API paths keep the JSON 404).
 */
export async function registerStatic(
  app: FastifyInstance,
  dir: string,
  apiNotFound: (req: { id: string }, reply: FastifyReply) => void,
): Promise<(req: FastifyRequest, reply: FastifyReply) => unknown> {
  const root = resolve(dir);
  if (!existsSync(resolve(root, 'index.html'))) throw new Error(`STATIC_DIR ${root} has no index.html (build the app first)`);
  const hasGuest = existsSync(resolve(root, 't.html'));

  await app.register(fastifyStatic, {
    root,
    index: ['index.html'],
    cacheControl: false, // set per file below
    etag: false, // stat-based validators are meaningless in release tarballs (mtime 0); html is tiny, assets are immutable
    lastModified: false,
    setHeaders: (res, filePath) => {
      res.header('Cache-Control', cacheControlFor('/' + filePath.slice(root.length + 1).split('\\').join('/')));
    },
  });

  const send = (reply: FastifyReply, file: string) => {
    reply.header('Cache-Control', NO_CACHE).type('text/html; charset=utf-8');
    return reply.sendFile(file);
  };
  if (hasGuest) {
    app.get('/t/:tagCode', (_req, reply) => send(reply, 't.html'));
    app.get('/t/:tagCode/', (_req, reply) => send(reply, 't.html'));
  }

  return (req, reply) => {
    const path = req.url.split('?')[0]!;
    const last = path.split('/').pop() ?? '';
    const spa = (req.method === 'GET' || req.method === 'HEAD') && !isApiPath(path) && !last.includes('.');
    if (spa) return send(reply, 'index.html');
    return apiNotFound(req, reply);
  };
}
