import { createHash, createHmac, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export const sha256 = (data: string | Buffer): Buffer => createHash('sha256').update(data).digest();
export const sha256hex = (data: string | Buffer): string => sha256(data).toString('hex');

/** Canonical JSON: sorted keys, no whitespace; undefined dropped. Input to idempotency request hashes. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v) ?? 'null';
  if (v instanceof Date) return JSON.stringify(v.toISOString());
  if (Array.isArray(v)) return '[' + v.map((x) => canonicalJson(x === undefined ? null : x)).join(',') + ']';
  const o = v as Record<string, unknown>;
  const keys = Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalJson(o[k])).join(',') + '}';
}

/** Request hash used both for the idempotency table and for journal.request_hash. */
export function requestHash(operation: string, body: unknown): Buffer {
  return sha256(operation + '\n' + canonicalJson(body));
}

export function hmacSha256(key: string | Buffer, data: string | Buffer): Buffer {
  return createHmac('sha256', key).update(data).digest();
}

/** NTAG password parameters, derived from the UID so that no per-tag secret is stored (ADR 0001). */
export function ntagProtection(masterKeyHex: string, uidHex: string): { pwd: string; pack: string } {
  const mac = hmacSha256(Buffer.from(masterKeyHex, 'hex'), Buffer.concat([Buffer.from('pwd'), Buffer.from(uidHex, 'hex')]));
  return { pwd: mac.subarray(0, 4).toString('hex').toUpperCase(), pack: mac.subarray(4, 6).toString('hex').toUpperCase() };
}

/** Pseudonymised UID for exports: HMAC-SHA256(pepper, uid). */
export function uidPseudonym(pepper: string, uidHex: string): string {
  return hmacSha256(pepper, Buffer.from(uidHex, 'hex')).toString('hex');
}

function key32(k: string): Buffer {
  const b = /^[0-9a-fA-F]{64}$/.test(k) ? Buffer.from(k, 'hex') : Buffer.from(k, 'base64');
  if (b.length !== 32) throw new Error('CONTACT_ENC_KEY must be 32 bytes (64 hex chars or base64)');
  return b;
}

/** AES-256-GCM: iv(12) | tag(16) | ciphertext. */
export function encryptJson(keyStr: string, value: unknown): Buffer {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', key32(keyStr), iv);
  const ct = Buffer.concat([c.update(JSON.stringify(value), 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]);
}
export function decryptJson<T = unknown>(keyStr: string, blob: Buffer): T {
  const d = createDecipheriv('aes-256-gcm', key32(keyStr), blob.subarray(0, 12));
  d.setAuthTag(blob.subarray(12, 28));
  return JSON.parse(Buffer.concat([d.update(blob.subarray(28)), d.final()]).toString('utf8')) as T;
}
