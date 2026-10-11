import { api, isNetworkFailure } from '../api/client'
import type { SyncItem } from '../api/types'
import { uuidv7 } from '../lib/uuid'
import type { OfflineQueue, QueuedOp } from './queue'

export interface SyncOutcome { applied: number; duplicates: number; rejected: number; remaining: number; offline: boolean; flagged: Record<string, string[]> }

/** Items are sent strictly in creation order, <= 200 per request (ADR 0002). */
export async function syncPending(q: OfflineQueue, batchSize = 200): Promise<SyncOutcome> {
  const out: SyncOutcome = { applied: 0, duplicates: 0, rejected: 0, remaining: 0, offline: false, flagged: {} }
  for (;;) {
    const pending = (await q.pending()).sort((a, b) => a.seq! - b.seq!)
    out.remaining = pending.length
    if (pending.length === 0) break
    const chunk = pending.slice(0, batchSize)
    const items: SyncItem[] = chunk.map(toSyncItem)
    let res
    try {
      res = await api.POST('/sync/batch', { body: { batch_id: uuidv7(), items } })
    } catch (e) {
      if (isNetworkFailure(e)) { out.offline = true; break }
      throw e
    }
    if (res.error || !res.data) {
      const status = res.response.status
      if (status === 413 && batchSize > 1) { batchSize = Math.max(1, Math.floor(batchSize / 2)); continue }
      if (isNetworkFailure(undefined, status) || status === 401 || status === 429) { out.offline = isNetworkFailure(undefined, status); break }
      break // keep items; surfaced through the pill (never drop silently)
    }
    for (const r of res.data.results) {
      if (r.status === 'applied') out.applied++
      else if (r.status === 'duplicate') out.duplicates++
      if (r.status === 'rejected') {
        out.rejected++
        await q.markRejected(r.client_tx_id, r.error)
      } else {
        if (r.flags?.length) out.flagged[r.client_tx_id] = r.flags
        await q.remove(r.client_tx_id)
      }
    }
  }
  const left = await q.pending()
  out.remaining = left.length
  if (left.length === 0) await q.clearSpent() // cap window restarts once the server knows everything
  return out
}

function toSyncItem(op: QueuedOp): SyncItem {
  return { type: op.type, staff_id: op.staff_id, provisional_ref: op.provisional_ref, payload: op.payload as unknown as SyncItem['payload'] }
}
