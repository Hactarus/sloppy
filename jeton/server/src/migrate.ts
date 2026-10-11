import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import postgres from 'postgres';

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Applies db/migrations/*.sql in lexical order, each file in ONE transaction, as the table owner.
 * Applied files are recorded with their SHA-256; a changed, already-applied file aborts (migrations are never rewritten).
 */
export async function migrate(ownerUrl: string, dir: string, log: (m: string) => void = () => {}): Promise<MigrationResult> {
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  const result: MigrationResult = { applied: [], skipped: [] };
  try {
    await sql`CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`;
    // Serialise concurrent migrators (several containers starting at once).
    await sql`SELECT pg_advisory_lock(727274)`;
    try {
      const files = readdirSync(dir).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();
      const done = new Map((await sql<{ name: string; checksum: string }[]>`SELECT name, checksum FROM schema_migrations`).map((r) => [r.name, r.checksum]));
      for (const f of files) {
        const text = readFileSync(join(dir, f), 'utf8');
        const checksum = createHash('sha256').update(text).digest('hex');
        const prev = done.get(f);
        if (prev !== undefined) {
          if (prev !== checksum) throw new Error(`Migration ${f} was modified after being applied (checksum mismatch)`);
          result.skipped.push(f);
          continue;
        }
        log(`applying ${f}`);
        await sql.begin(async (tx) => {
          await tx.unsafe(text);
          await tx`INSERT INTO schema_migrations(name, checksum) VALUES (${f}, ${checksum})`;
        });
        result.applied.push(f);
      }
    } finally {
      await sql`SELECT pg_advisory_unlock(727274)`;
    }
  } finally {
    await sql.end({ timeout: 5 });
  }
  return result;
}

/**
 * Creates (or updates the password of) the runtime login role described by `runtimeUrl` as a member of jeton_app.
 * Needs CREATEROLE on the owner connection; for managed databases create the role by hand (see db/README.md).
 */
export async function ensureRuntimeRole(ownerUrl: string, runtimeUrl: string): Promise<string> {
  const u = new URL(runtimeUrl);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  if (!/^[a-z_][a-z0-9_]*$/.test(user)) throw new Error('runtime role name must match [a-z_][a-z0-9_]*');
  const sql = postgres(ownerUrl, { max: 1, onnotice: () => {} });
  try {
    const exists = await sql`SELECT 1 FROM pg_roles WHERE rolname = ${user}`;
    const pw = sql.unsafe(`'${password.replace(/'/g, "''")}'`);
    if (exists.length === 0) {
      await sql`CREATE ROLE ${sql(user)} LOGIN PASSWORD ${pw} IN ROLE jeton_app`;
    } else {
      await sql`ALTER ROLE ${sql(user)} PASSWORD ${pw}`;
      await sql`GRANT jeton_app TO ${sql(user)}`;
    }
    return user;
  } finally {
    await sql.end({ timeout: 5 });
  }
}
