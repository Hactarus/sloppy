import { z } from 'zod';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const bool = z
  .union([z.boolean(), z.string()])
  .transform((v) => (typeof v === 'boolean' ? v : ['1', 'true', 'yes', 'on'].includes(v.toLowerCase())));

const schema = z.object({
  NODE_ENV: z.string().default('development'),
  HOST: z.string().default('0.0.0.0'),
  PORT: z.coerce.number().int().default(3000),
  LOG_LEVEL: z.string().default('info'),
  /** Runtime connection: login role that is a member of jeton_app. Never the table owner. */
  DATABASE_URL: z.string().default('postgres://jeton_api:jeton_api@127.0.0.1:5432/jeton'),
  /** Owner connection: migrations, CLI (seed/create-admin). Never used by the HTTP server. */
  DATABASE_URL_OWNER: z.string().default('postgres://postgres:postgres@127.0.0.1:5432/jeton'),
  DB_POOL_MAX: z.coerce.number().int().default(10),
  MIGRATIONS_DIR: z.string().default(resolve(here, '../../db/migrations')),
  OPENAPI_PATH: z.string().default(resolve(here, '../../api/openapi.yaml')),
  /** HS256 secret of staff JWTs (>= 32 chars). */
  JWT_SECRET: z.string().min(32).default('dev-only-jwt-secret-change-me-0123456789abcdef'),
  JWT_TTL_SECONDS: z.coerce.number().int().default(12 * 3600),
  /** Master key (hex) deriving NTAG passwords: HMAC-SHA256(master, "pwd" || uid). */
  TAG_MASTER_KEY: z.string().default('00112233445566778899aabbccddeeff00112233445566778899aabbccddeeff'),
  /** Pepper for HMAC(uid) in exports. */
  UID_PEPPER: z.string().default('dev-only-uid-pepper'),
  /** 32 byte key (hex or base64) for AES-256-GCM of refund contacts. */
  CONTACT_ENC_KEY: z.string().default('ffeeddccbbaa99887766554433221100ffeeddccbbaa99887766554433221100'),
  PUBLIC_BASE_URL: z.string().default('http://localhost:3000'),
  PRIVACY_URL: z.string().default('http://localhost:3000/privacy'),
  CORS_ORIGINS: z.string().default(''),
  TRUST_PROXY: bool.default(false),
  /** Public balance endpoint rate limit (per IP). */
  PUBLIC_RATE_LIMIT_MAX: z.coerce.number().int().default(30),
  PUBLIC_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().default(30),
  AUTH_RATE_LIMIT_WINDOW_MS: z.coerce.number().int().default(60_000),
  /** Payments */
  PAYMENT_PROVIDER: z.enum(['fake', 'sumup']).default('fake'),
  SUMUP_API_BASE: z.string().default('https://api.sumup.com'),
  SUMUP_API_KEY: z.string().default(''),
  SUMUP_MERCHANT_CODE: z.string().default(''),
  SUMUP_WEBHOOK_SECRET: z.string().default('dev-webhook-secret'),
  SUMUP_RETURN_URL: z.string().default(''),
  /** Directory of the built web app (app/dist). When set, the server also serves the PWA and /t/:tagCode (single origin). */
  STATIC_DIR: z.string().default(''),
  APP_VERSION: z.string().default('1.0.0'),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: Record<string, string | undefined> = process.env, overrides: Partial<Config> = {}): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error('Invalid configuration: ' + JSON.stringify(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`)));
  }
  const cfg = { ...parsed.data, ...overrides };
  if (cfg.NODE_ENV === 'production') {
    const insecure = ['JWT_SECRET', 'TAG_MASTER_KEY', 'UID_PEPPER', 'CONTACT_ENC_KEY', 'SUMUP_WEBHOOK_SECRET'] as const;
    const d = schema.parse({});
    for (const k of insecure) {
      if (cfg[k] === d[k]) throw new Error(`${k} must be set in production`);
    }
  }
  return cfg;
}
