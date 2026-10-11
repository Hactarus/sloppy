import type { Config } from './config.js';
import type { Q } from './db.js';
import type { Operation } from './contract.js';
import type { PaymentProvider } from './payments/provider.js';

/** Receives the ledger head hash at each Z seal ("e-mailed to the organizer"); default implementation logs it. */
export interface AnchorNotifier {
  anchor(info: { eventId: string; organizerEmail: string | null; seq: number; hashHex: string; reason: string }): Promise<void>;
}

export interface Logger {
  info(o: unknown, msg?: string): void;
  warn(o: unknown, msg?: string): void;
  error(o: unknown, msg?: string): void;
}

/** Everything handlers need; created once in buildApp and injected into route modules. */
export interface AppCtx {
  cfg: Config;
  sql: Q;
  ops: Operation[];
  payments: PaymentProvider;
  notifier: AnchorNotifier;
  log: Logger;
}
