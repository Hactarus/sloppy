/**
 * Integration tests run against a REAL PostgreSQL 16.
 *  - TEST_DATABASE_URL_OWNER set  : use that server (needs CREATEDB / CREATEROLE); a fresh database is created and dropped.
 *  - otherwise                    : a scratch cluster is initdb'ed in a temp dir on a free port (as user `postgres` via runuser when root).
 * Migrations are applied by the same runner as production (src/migrate.ts), then the runtime role jeton_api is created.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, chmodSync, readdirSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir, userInfo } from 'node:os';
import { join } from 'node:path';
import postgres from 'postgres';
import { migrate, ensureRuntimeRole } from '../src/migrate.js';
import { loadConfig } from '../src/config.js';

function freePort(): Promise<number> {
  return new Promise((res, rej) => {
    const s = createServer();
    s.listen(0, '127.0.0.1', () => {
      const p = (s.address() as { port: number }).port;
      s.close(() => res(p));
    });
    s.on('error', rej);
  });
}

function pgBin(): string {
  const env = process.env.PG_BIN;
  if (env) return env;
  const r = spawnSync('pg_config', ['--bindir'], { encoding: 'utf8' });
  if (r.status === 0 && existsSync(join(r.stdout.trim(), 'initdb'))) return r.stdout.trim();
  const base = '/usr/lib/postgresql';
  if (existsSync(base)) {
    const v = readdirSync(base).sort().reverse().find((d) => existsSync(join(base, d, 'bin', 'initdb')));
    if (v) return join(base, v, 'bin');
  }
  throw new Error('PostgreSQL binaries not found: set PG_BIN or TEST_DATABASE_URL_OWNER');
}

export default async function setup(project: { provide?: (k: string, v: unknown) => void }) {
  let cleanup: () => Promise<void> = async () => {};
  let adminUrl = process.env.TEST_DATABASE_URL_OWNER;
  let host = '127.0.0.1';
  let port = 0;

  if (!adminUrl) {
    const bin = pgBin();
    const dir = mkdtempSync(join(tmpdir(), 'jeton-pg-'));
    port = await freePort();
    const asRoot = userInfo().uid === 0;
    const run = (cmd: string, args: string[]) => {
      if (asRoot) execFileSync('runuser', ['-u', 'postgres', '--', join(bin, cmd), ...args], { stdio: 'pipe' });
      else execFileSync(join(bin, cmd), args, { stdio: 'pipe' });
    };
    if (asRoot) {
      execFileSync('chown', ['postgres', dir]);
    }
    chmodSync(dir, 0o700);
    run('initdb', ['-D', join(dir, 'data'), '-A', 'trust', '-U', 'postgres', '-E', 'UTF8']);
    run('pg_ctl', ['-D', join(dir, 'data'), '-o', `-p ${port} -k ${dir} -c listen_addresses=127.0.0.1 -c fsync=off -c synchronous_commit=off -c full_page_writes=off -c max_connections=200`, '-l', join(dir, 'log'), '-w', 'start']);
    adminUrl = `postgres://postgres@127.0.0.1:${port}/postgres`;
    cleanup = async () => {
      try {
        run('pg_ctl', ['-D', join(dir, 'data'), '-m', 'immediate', 'stop']);
      } catch { /* already stopped */ }
      rmSync(dir, { recursive: true, force: true });
    };
  }

  const dbName = 'jeton_test_' + Math.random().toString(36).slice(2, 10);
  const admin = postgres(adminUrl, { max: 1, onnotice: () => {} });
  await admin.unsafe(`CREATE DATABASE ${dbName}`);
  await admin.end();
  const u = new URL(adminUrl);
  u.pathname = '/' + dbName;
  const ownerUrl = u.toString();
  const runtime = new URL(ownerUrl);
  runtime.username = 'jeton_api';
  runtime.password = 'jeton_api_test';
  const cfg = loadConfig({}, {});
  await migrate(ownerUrl, cfg.MIGRATIONS_DIR);
  await ensureRuntimeRole(ownerUrl, runtime.toString());

  process.env.DATABASE_URL_OWNER = ownerUrl;
  process.env.DATABASE_URL = runtime.toString();
  project.provide?.('urls', { ownerUrl, runtimeUrl: runtime.toString() });

  return async () => {
    if (process.env.TEST_DATABASE_URL_OWNER) {
      const a = postgres(adminUrl!, { max: 1, onnotice: () => {} });
      await a.unsafe(`DROP DATABASE IF EXISTS ${dbName} WITH (FORCE)`);
      await a.end();
    }
    await cleanup();
  };
}
