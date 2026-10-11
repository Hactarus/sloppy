import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp, type Built } from '../src/app.js';
import { testConfig } from './helpers.js';

let dir: string;
let built: Built;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'jeton-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>PWA</title>');
  writeFileSync(join(dir, 't.html'), '<!doctype html><title>GUEST</title>');
  writeFileSync(join(dir, 'sw.js'), 'self.skip=1');
  writeFileSync(join(dir, 'assets', 'main-ABC123.js'), 'console.log(1)');
  built = await buildApp({ cfg: testConfig({ STATIC_DIR: dir }), logger: false });
  await built.app.ready();
});
afterAll(async () => {
  await built.app.close();
  rmSync(dir, { recursive: true, force: true });
});

const get = (url: string) => built.app.inject({ method: 'GET', url });

describe('single-origin static serving', () => {
  it('serves the PWA at / with no-cache', async () => {
    const r = await get('/');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('PWA');
    expect(r.headers['cache-control']).toBe('no-cache');
  });
  it('serves t.html for /t/:tagCode', async () => {
    const r = await get('/t/AbC123xyz');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('GUEST');
    expect(r.headers['cache-control']).toBe('no-cache');
  });
  it('hashed assets are immutable, sw.js is no-cache', async () => {
    const a = await get('/assets/main-ABC123.js');
    expect(a.statusCode).toBe(200);
    expect(a.headers['cache-control']).toContain('immutable');
    expect((await get('/sw.js')).headers['cache-control']).toBe('no-cache');
  });
  it('SPA fallback for unknown app routes only', async () => {
    const r = await get('/cashier/pos');
    expect(r.statusCode).toBe(200);
    expect(r.body).toContain('PWA');
    expect((await get('/assets/missing.js')).statusCode).toBe(404);
  });
  it('API paths keep JSON 404 and real routes', async () => {
    const nf = await get('/v1/does-not-exist');
    expect(nf.statusCode).toBe(404);
    expect(nf.json().error?.code ?? nf.json().code).toBe('NOT_FOUND');
    const h = await get('/healthz');
    expect(h.json()).toEqual({ ok: true });
    expect((await built.app.inject({ method: 'POST', url: '/nope' })).statusCode).toBe(404);
  });
});
