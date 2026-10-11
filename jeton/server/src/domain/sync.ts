import type { z, ZodType } from 'zod';
import type { Row } from '../db.js';
import { AppError, errorBody } from '../errors.js';
import type { AppCtx } from '../context.js';
import type { Principal } from '../auth/principal.js';
import type { Role } from '../contract.js';
import { parse } from '../http.js';
import { CashMovementRequest, CashoutRequest, OrderRequest, RefundOrderRequest, SyncItem } from '../schemas.js';
import { Actor, IdemOutcome, runIdempotent } from './common.js';
import { executeOrder, executeRefund } from './orders.js';
import { executeCashMovement, executeCashout } from './cash.js';
import { zUuid } from '../http.js';

const ROLES: Record<string, Role[]> = {
  order: ['admin', 'vendor'],
  order_refund: ['admin', 'vendor', 'cashier'],
  cashout: ['admin', 'cashier'],
  cash_movement: ['admin', 'cashier'],
};
const SyncRefund = RefundOrderRequest.extend({ order_id: zUuid });

export interface SyncResult {
  client_tx_id: string;
  status: 'applied' | 'duplicate' | 'rejected';
  result?: unknown;
  flags?: string[];
  error?: unknown;
}

async function flagsForSeq(app: AppCtx, eventId: string, result: any): Promise<string[]> {
  if (Array.isArray(result?.flags) && result.flags.length) return result.flags;
  const seq = result?.journal_seq;
  if (typeof seq !== 'number') return [];
  const r = await app.sql<Row[]>`SELECT f.flag FROM ledger_flags f JOIN journal j ON j.id = f.journal_id WHERE j.event_id = ${eventId} AND j.seq = ${seq} ORDER BY f.id`;
  return r.map((x) => x.flag);
}

export async function syncBatch(app: AppCtx, p: Principal, requestId: string, items: Array<z.output<typeof SyncItem>>): Promise<SyncResult[]> {
  const capTracker = new Map<string, number>();
  const results: SyncResult[] = [];
  const staffCache = new Map<string, Row | null>();

  for (const item of items) {
    const rawTx = (item.payload as { client_tx_id?: unknown }).client_tx_id;
    const txId = typeof rawTx === 'string' ? rawTx : '';
    const reject = (e: AppError): SyncResult => ({ client_tx_id: txId, status: 'rejected', error: errorBody(e, requestId) });
    try {
      const roles = ROLES[item.type];
      if (!roles) throw new AppError('OFFLINE_NOT_ALLOWED', `Operation type "${item.type}" cannot be synchronised from offline`);
      let staff = staffCache.get(item.staff_id);
      if (staff === undefined) {
        staff = (await app.sql<Row[]>`
          SELECT s.id, s.role FROM staff s JOIN staff_events se ON se.staff_id = s.id AND se.event_id = ${p.eventId}
           WHERE s.id = ${item.staff_id} AND s.active AND s.purged_at IS NULL`)[0] ?? null;
        staffCache.set(item.staff_id, staff);
      }
      if (!staff) throw new AppError('FORBIDDEN', 'Unknown or inactive staff member for this event');
      if (!roles.includes(staff.role)) throw new AppError('FORBIDDEN', `Role ${staff.role} cannot perform ${item.type}`);
      if (!item.payload.client_created_at) {
        throw new AppError('VALIDATION_ERROR', 'client_created_at is required for offline items', { fields: [{ path: 'payload/client_created_at', issue: 'required' }] });
      }
      const a: Actor = {
        deviceId: p.deviceId, deviceKind: p.deviceKind, standId: p.standId, eventId: p.eventId, training: p.training, staffId: staff.id, role: staff.role,
      };
      let out: IdemOutcome;
      // provisional_ref is not part of the idempotency hash: an item replayed online or offline is the same request
      const withRef = <T extends { provisional_ref?: string }>(b: T): T => ({ ...b, provisional_ref: b.provisional_ref ?? item.provisional_ref });
      switch (item.type) {
        case 'order': {
          const b = parse(OrderRequest as ZodType<z.output<typeof OrderRequest>>, item.payload, 'payload');
          out = await runIdempotent(app, a, { operation: 'order', clientTxId: b.client_tx_id, body: b }, (tx) =>
            executeOrder(tx, app, a, b, { capTracker, provisionalRef: item.provisional_ref }));
          break;
        }
        case 'order_refund': {
          const { order_id, ...rest } = parse(SyncRefund, item.payload, 'payload');
          out = await runIdempotent(app, a, { operation: 'order.refund:' + order_id, clientTxId: rest.client_tx_id, body: rest }, (tx) =>
            executeRefund(tx, app, a, order_id, withRef(rest), true));
          break;
        }
        case 'cashout': {
          const b = parse(CashoutRequest, item.payload, 'payload');
          out = await runIdempotent(app, a, { operation: 'cashout', clientTxId: b.client_tx_id, body: b }, (tx) => executeCashout(tx, app, a, b, true));
          break;
        }
        default: {
          const b = parse(CashMovementRequest, item.payload, 'payload');
          out = await runIdempotent(app, a, { operation: 'cash_movement', clientTxId: b.client_tx_id, body: b }, (tx) => executeCashMovement(tx, app, a, b, true));
        }
      }
      results.push({
        client_tx_id: txId, status: out.replayed ? 'duplicate' : 'applied', result: out.body,
        flags: out.replayed ? [] : await flagsForSeq(app, p.eventId, out.body),
      });
    } catch (e) {
      if (e instanceof AppError && e.status < 500) results.push(reject(e));
      else throw e;
    }
  }
  return results;
}
