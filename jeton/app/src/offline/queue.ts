import type { components } from '../api/schema'
import { openDb, tx } from './db'
import { uuidv7 } from '../lib/uuid'

export type OpType = 'order' | 'order_refund' | 'cashout' | 'cash_movement'
export type OpStatus = 'pending' | 'rejected'

export interface QueuedOp {
  seq?: number
  client_tx_id: string
  type: OpType
  staff_id: string
  provisional_ref?: string
  /** Body of the matching online endpoint, with client_tx_id and client_created_at. */
  payload: Record<string, unknown> & { client_tx_id: string }
  status: OpStatus
  created_at: string
  error?: components['schemas']['Error']
  flags?: string[]
}

export class OfflineQueue {
  private constructor(private db: IDBDatabase, private deviceTag: string) {}

  static async open(name = 'jeton', deviceTag = 'D1') {
    return new OfflineQueue(await openDb(name), deviceTag)
  }

  async enqueue(o: { type: OpType; staff_id: string; payload: Record<string, unknown> & { client_tx_id: string }; provisional_ref?: string }): Promise<QueuedOp> {
    const n = await this.nextCounter()
    const op: QueuedOp = {
      client_tx_id: o.payload.client_tx_id,
      type: o.type,
      staff_id: o.staff_id,
      provisional_ref: o.provisional_ref ?? `${this.deviceTag}-${String(n).padStart(6, '0')}`,
      // The payload is stored byte-identical to what the online attempt sent (idempotent replay needs an identical body);
      // the provisional ref travels in SyncItem.provisional_ref only.
      payload: { ...o.payload, client_created_at: (o.payload.client_created_at as string) ?? new Date().toISOString() },
      status: 'pending',
      created_at: new Date().toISOString(),
    }
    await tx(this.db, 'ops', 'readwrite', (t) => t.objectStore('ops').add(op))
    return op
  }

  private async nextCounter(): Promise<number> {
    const cur = (await this.kvGet<number>('provisional_counter')) ?? 0
    await this.kvSet('provisional_counter', cur + 1)
    return cur + 1
  }

  async all(): Promise<QueuedOp[]> {
    return tx(this.db, 'ops', 'readonly', (t) => t.objectStore('ops').getAll())
  }
  async pending() { return (await this.all()).filter((o) => o.status === 'pending') }
  async rejected() { return (await this.all()).filter((o) => o.status === 'rejected') }

  async remove(clientTxId: string) {
    const op = await this.byTx(clientTxId)
    if (op?.seq !== undefined) await tx(this.db, 'ops', 'readwrite', (t) => t.objectStore('ops').delete(op.seq!))
  }
  async markRejected(clientTxId: string, error?: QueuedOp['error']) {
    const op = await this.byTx(clientTxId)
    if (!op) return
    await tx(this.db, 'ops', 'readwrite', (t) => t.objectStore('ops').put({ ...op, status: 'rejected', error }))
  }
  async setFlags(clientTxId: string, flags: string[]) {
    const op = await this.byTx(clientTxId)
    if (op) await tx(this.db, 'ops', 'readwrite', (t) => t.objectStore('ops').put({ ...op, flags }))
  }
  private async byTx(id: string): Promise<QueuedOp | undefined> {
    return tx(this.db, 'ops', 'readonly', (t) => t.objectStore('ops').index('client_tx_id').get(id))
  }

  // -- offline spend per tag (per device) ------------------------------------------------------------------------------------
  async spent(tagCode: string): Promise<number> {
    const r = await tx<{ tokens: number } | undefined>(this.db, 'spend', 'readonly', (t) => t.objectStore('spend').get(tagCode))
    return r?.tokens ?? 0
  }
  async addSpent(tagCode: string, tokens: number) {
    const cur = await this.spent(tagCode)
    await tx(this.db, 'spend', 'readwrite', (t) => t.objectStore('spend').put({ tag_code: tagCode, tokens: cur + tokens }))
  }
  async clearSpent() { await tx(this.db, 'spend', 'readwrite', (t) => t.objectStore('spend').clear()) }

  // -- kv ------------------------------------------------------------------------------------------------------------------
  async kvGet<T>(key: string): Promise<T | undefined> {
    const r = await tx<{ value: T } | undefined>(this.db, 'kv', 'readonly', (t) => t.objectStore('kv').get(key))
    return r?.value
  }
  async kvSet(key: string, value: unknown) { await tx(this.db, 'kv', 'readwrite', (t) => t.objectStore('kv').put({ key, value })) }
  close() { this.db.close() }
}

export const newTxId = () => uuidv7()

/** Offline cap: may `total` more tokens be spent on this tag without server contact? */
export function offlineCapAllows(spentSoFar: number, total: number, cap: number): boolean {
  return spentSoFar + total <= cap
}
