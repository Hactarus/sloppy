/** Stable error codes of the contract (ErrorCode enum) and their HTTP status. */
export const ERROR_STATUS = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  TOKEN_EXPIRED: 401,
  INVALID_CREDENTIALS: 401,
  DEVICE_REVOKED: 401,
  FORBIDDEN: 403,
  STAND_MISMATCH: 403,
  NOT_FOUND: 404,
  TAG_NOT_FOUND: 404,
  EVENT_NOT_FOUND: 404,
  DUPLICATE_TX: 409,
  TAG_UID_MISMATCH: 409,
  TAG_NOT_ACTIVE: 409,
  TAG_ALREADY_ENROLLED: 409,
  INSUFFICIENT_BALANCE: 409,
  PRICE_MISMATCH: 409,
  ITEM_UNAVAILABLE: 409,
  EVENT_NOT_OPEN: 409,
  EVENT_CLOSED: 409,
  EVENT_FIELD_LOCKED: 409,
  EXTERNAL_REF_ALREADY_USED: 409,
  REFUND_EXCEEDS_ORIGINAL: 409,
  REFUND_WINDOW_CLOSED: 409,
  REFUND_METHOD_LIMIT: 409,
  ALREADY_REVERSED: 409,
  REVERSAL_NOT_ALLOWED: 409,
  FLAG_ALREADY_RESOLVED: 409,
  Z_ALREADY_SEALED: 409,
  PENDING_OFFLINE_OPERATIONS: 409,
  CASH_VARIANCE_UNACKNOWLEDGED: 409,
  TIPS_OUTSTANDING: 409,
  CLOSE_PRECONDITION_FAILED: 409,
  SESSION_ALREADY_OPEN: 409,
  SESSION_CLOSED: 409,
  TRAINING_MODE_MISMATCH: 409,
  ENROLLMENT_CODE_INVALID: 410,
  PAYLOAD_TOO_LARGE: 413,
  INVALID_AMOUNT: 422,
  LIMIT_EXCEEDED: 422,
  TIP_TOO_HIGH: 422,
  TIP_DISABLED: 422,
  AGE_CHECK_REQUIRED: 422,
  ITEM_NOT_FOUND: 422,
  EXTERNAL_REF_REQUIRED: 422,
  VAT_RATE_NOT_FOUND: 422,
  OFFLINE_NOT_ALLOWED: 422,
  TAG_BLOCKED: 423,
  RATE_LIMITED: 429,
  PIN_LOCKED: 429,
  INTERNAL_ERROR: 500,
  LEDGER_INTEGRITY_ERROR: 500,
  SERVICE_UNAVAILABLE: 503,
  /** Not part of the contract enum: used for operations that are declared but not implemented. */
  NOT_IMPLEMENTED: 501,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;

const RETRYABLE: ReadonlySet<ErrorCode> = new Set(['RATE_LIMITED', 'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR']);

export class AppError extends Error {
  readonly status: number;
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
    this.status = ERROR_STATUS[code];
  }
  get retryable(): boolean {
    return RETRYABLE.has(this.code);
  }
}

export interface ErrorBody {
  code: string;
  message: string;
  request_id: string;
  retryable: boolean;
  details?: Record<string, unknown>;
}

export function errorBody(e: AppError, requestId: string): ErrorBody {
  const body: ErrorBody = { code: e.code, message: e.message, request_id: requestId, retryable: e.retryable };
  if (e.details) body.details = e.details;
  return body;
}

interface PgLikeError {
  code?: string;
  message?: string;
  detail?: string;
  constraint_name?: string;
  table_name?: string;
}

/**
 * Translate PostgreSQL errors raised by the ledger schema (SQLSTATE JT001..JT011, see db/README and ADR 0003)
 * into contract errors. Unknown errors return null (the caller maps them to INTERNAL_ERROR).
 */
export function mapPgError(err: unknown): AppError | null {
  const e = err as PgLikeError;
  if (!e || typeof e.code !== 'string') return null;
  const msg = e.message ?? '';
  switch (e.code) {
    case 'JT001':
      return new AppError('DUPLICATE_TX', 'client_tx_id already used with a different request');
    case 'JT002': {
      let details: Record<string, unknown> | undefined;
      const i = msg.indexOf('{');
      if (i >= 0) {
        try {
          const j = JSON.parse(msg.slice(i)) as { balance: number; required: number };
          details = { balance_tokens: j.balance, required_tokens: j.required };
        } catch {
          /* ignore */
        }
      }
      return new AppError('INSUFFICIENT_BALANCE', 'Balance too low', details);
    }
    case 'JT003':
      return /closed/i.test(msg)
        ? new AppError('EVENT_CLOSED', 'Event is closed')
        : new AppError('EVENT_NOT_OPEN', 'Event is not open');
    case 'JT004':
      if (/immutable/i.test(msg)) return new AppError('EVENT_FIELD_LOCKED', 'Field is immutable once the event has ledger entries');
      return new AppError('INTERNAL_ERROR', 'Journal rejected: ' + msg);
    case 'JT006':
      return new AppError('EVENT_NOT_FOUND', 'Unknown event');
    case 'JT007':
      return new AppError('VAT_RATE_NOT_FOUND', msg.replace(/^VAT_RATE_NOT_FOUND: /, 'No VAT rate: '));
    case 'JT008':
      return new AppError('TAG_NOT_FOUND', 'Unknown tag');
    case 'JT009':
    case 'JT010':
      return new AppError('LEDGER_INTEGRITY_ERROR', 'Ledger integrity error');
    case 'JT011':
      return new AppError('TRAINING_MODE_MISMATCH', 'Training and production data cannot be mixed');
    case 'JT005':
      return new AppError('INTERNAL_ERROR', 'Append-only violation: ' + msg);
    case '40P01': // deadlock
    case '40001': // serialization failure
    case '57P03': // cannot connect now
    case '53300': // too many connections
      return new AppError('SERVICE_UNAVAILABLE', 'Temporarily unavailable, retry');
    default:
      return null;
  }
}

export function isUniqueViolation(err: unknown, constraintLike?: string): boolean {
  const e = err as PgLikeError;
  if (!e || e.code !== '23505') return false;
  return constraintLike ? (e.constraint_name ?? '').includes(constraintLike) : true;
}
