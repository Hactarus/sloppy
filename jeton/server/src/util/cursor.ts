import { AppError } from '../errors.js';

export function encodeCursor(v: unknown): string {
  return Buffer.from(JSON.stringify(v), 'utf8').toString('base64url');
}
export function decodeCursor<T>(c: string | undefined): T | null {
  if (!c) return null;
  try {
    return JSON.parse(Buffer.from(c, 'base64url').toString('utf8')) as T;
  } catch {
    throw new AppError('VALIDATION_ERROR', 'Invalid cursor', { fields: [{ path: 'cursor', issue: 'invalid' }] });
  }
}
