import { api, asApiError, isNetworkFailure } from '../api/client'
import type { ApiError, Order, OrderRequest } from '../api/types'
import { offlineCapAllows, newTxId, type OfflineQueue } from '../offline/queue'

export type PayResult =
  | { ok: true; mode: 'online'; order: Order; replayed: boolean }
  | { ok: true; mode: 'offline'; provisional_ref: string; spentOffline: number; cap: number }
  | { ok: false; reason: 'api'; error: ApiError }
  | { ok: false; reason: 'offline_cap'; cap: number; spentOffline: number; required: number }
  | { ok: false; reason: 'network' }

export interface PayInput {
  stand_id: string
  staff_id: string
  tag: { tag_code: string; uid: string }
  lines: { item_id: string; qty: number }[]
  tip_tokens: number
  totalTokens: number
  age_check_confirmed: boolean
  catalogVersion: number
  offlineCap: number
  /** Reuse across retries of the same payment (idempotency). */
  client_tx_id?: string
  /** Reuse together with client_tx_id: a replay must carry an identical body or the server answers DUPLICATE_TX. */
  client_created_at?: string
}

/**
 * Charge a tag. Online-first: POST /orders. On connection failure (or navigator offline) the order is queued with the SAME
 * client_tx_id (safe even if the server did receive it - replay is idempotent), after enforcing the per-tag offline cap.
 */
export async function payOrder(q: OfflineQueue, p: PayInput, online = navigator.onLine): Promise<PayResult> {
  const body: OrderRequest = {
    client_tx_id: p.client_tx_id ?? newTxId(),
    stand_id: p.stand_id,
    tag: p.tag,
    lines: p.lines,
    tip_tokens: p.tip_tokens,
    age_check_confirmed: p.age_check_confirmed,
    expected_total_tokens: p.totalTokens,
    expected_catalog_version: p.catalogVersion,
    client_created_at: p.client_created_at ?? new Date().toISOString(),
  }
  if (online) {
    try {
      const r = await api.POST('/orders', { body })
      if (r.data) return { ok: true, mode: 'online', order: r.data, replayed: r.response.headers.get('Idempotent-Replayed') === 'true' }
      if (!isNetworkFailure(undefined, r.response.status)) {
        const e = asApiError(r.error)
        return { ok: false, reason: 'api', error: e ?? { code: 'INTERNAL_ERROR', message: 'unknown', request_id: '', retryable: false } }
      }
    } catch (e) {
      if (!isNetworkFailure(e)) throw e
    }
  }
  // Offline path
  const spent = await q.spent(p.tag.tag_code)
  if (!offlineCapAllows(spent, p.totalTokens, p.offlineCap)) return { ok: false, reason: 'offline_cap', cap: p.offlineCap, spentOffline: spent, required: p.totalTokens }
  const op = await q.enqueue({ type: 'order', staff_id: p.staff_id, payload: body as unknown as Record<string, unknown> & { client_tx_id: string } })
  await q.addSpent(p.tag.tag_code, p.totalTokens)
  return { ok: true, mode: 'offline', provisional_ref: op.provisional_ref!, spentOffline: spent + p.totalTokens, cap: p.offlineCap }
}
