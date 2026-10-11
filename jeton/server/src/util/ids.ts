import { randomBytes, createHash } from 'node:crypto';

/** UUID version 7 (time ordered). */
export function uuidv7(now: number = Date.now()): string {
  const b = randomBytes(16);
  b[0] = (now / 2 ** 40) & 0xff;
  b[1] = (now / 2 ** 32) & 0xff;
  b[2] = (now / 2 ** 24) & 0xff;
  b[3] = (now / 2 ** 16) & 0xff;
  b[4] = (now / 2 ** 8) & 0xff;
  b[5] = now & 0xff;
  b[6] = (b[6]! & 0x0f) | 0x70;
  b[8] = (b[8]! & 0x3f) | 0x80;
  const h = b.toString('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** Deterministic UUID (v8 layout) derived from a seed: used for idempotent derived journals (e.g. breakage at close). */
export function derivedUuid(...parts: string[]): string {
  const h = createHash('sha256').update(parts.join('|')).digest();
  h[6] = (h[6]! & 0x0f) | 0x80;
  h[8] = (h[8]! & 0x3f) | 0x80;
  const x = h.subarray(0, 16).toString('hex');
  return `${x.slice(0, 8)}-${x.slice(8, 12)}-${x.slice(12, 16)}-${x.slice(16, 20)}-${x.slice(20)}`;
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** Crockford base32 of `n` random 5-bit symbols. */
function randomSymbols(n: number): string {
  const bytes = randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += CROCKFORD[bytes[i]! & 31];
  return s;
}

/** Tag code: 96 random bits = 19 symbols (95 bits) + 1 bit => last char is `0` or `G` (ADR 0001). */
export function newTagCode(): string {
  const last = randomBytes(1)[0]! & 1 ? 'G' : '0';
  return randomSymbols(19) + last;
}

/** Enrolment code: 8 Crockford characters (40 bits). */
export function newEnrollmentCode(): string {
  return randomSymbols(8);
}

export const TAG_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{19}[0G]$/;
export const TAG_UID_RE = /^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/;
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
