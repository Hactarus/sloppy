import { OfflineQueue, offlineCapAllows } from './queue'
import { syncPending } from './sync'
import { payOrder } from '../pos/pay'
import { mockState, resetMock, setMockOffline } from '../api/mock'
import { MOCK_TAGS, STAND_BAR } from '../api/mockData'
import { storage } from '../api/storage'
import { uuidv7 } from '../lib/uuid'

let n = 0
async function mkQueue() { return OfflineQueue.open(`test-${++n}-${Math.random()}`, 'T7') }
const STAFF = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a01'
const tag = (i = 0) => ({ tag_code: MOCK_TAGS[i].tag_code, uid: MOCK_TAGS[i].uid })
const input = (over: Partial<Parameters<typeof payOrder>[1]> = {}) => {
  const it = mockState.catalog.items[0] // 1 token
  return { stand_id: STAND_BAR, staff_id: STAFF, tag: tag(), lines: [{ item_id: it.id, qty: 2 }], tip_tokens: 0, totalTokens: 2, age_check_confirmed: true,
    catalogVersion: mockState.catalog.catalog_version, offlineCap: 10, ...over }
}

beforeEach(() => {
  resetMock()
  storage.setDevice({ device_id: 'd', device_token: 'dvc_x', event_id: mockState.catalog.event.id, stand_id: STAND_BAR, kind: 'terminal', training: false })
  storage.setSession({ jwt: 'jwt_x', expires_at: new Date(Date.now() + 3600e3).toISOString(), session: { staff: { id: STAFF, display_name: 'A', role: 'vendor' }, device_id: 'd', event_id: 'e', role: 'vendor', training: false } })
})

describe('offline cap', () => {
  it('allows up to and including the cap', () => {
    expect(offlineCapAllows(0, 10, 10)).toBe(true)
    expect(offlineCapAllows(8, 3, 10)).toBe(false)
    expect(offlineCapAllows(0, 1, 0)).toBe(false)
  })
})

describe('OfflineQueue', () => {
  it('keeps creation order, provisional refs and survives reopen', async () => {
    const q = await mkQueue()
    const a = await q.enqueue({ type: 'order', staff_id: STAFF, payload: { client_tx_id: uuidv7() } })
    const b = await q.enqueue({ type: 'order', staff_id: STAFF, payload: { client_tx_id: uuidv7() } })
    expect(a.provisional_ref).toBe('T7-000001'); expect(b.provisional_ref).toBe('T7-000002')
    expect((await q.pending()).map((o) => o.client_tx_id)).toEqual([a.client_tx_id, b.client_tx_id])
    expect((await q.pending())[0].payload.client_created_at).toBeTruthy()
  })
  it('refuses a duplicate client_tx_id', async () => {
    const q = await mkQueue()
    const id = uuidv7()
    await q.enqueue({ type: 'order', staff_id: STAFF, payload: { client_tx_id: id } })
    await expect(q.enqueue({ type: 'order', staff_id: STAFF, payload: { client_tx_id: id } })).rejects.toBeTruthy()
  })
  it('tracks offline spend per tag and clears it', async () => {
    const q = await mkQueue()
    await q.addSpent('X', 3); await q.addSpent('X', 4); await q.addSpent('Y', 1)
    expect(await q.spent('X')).toBe(7); expect(await q.spent('Y')).toBe(1); expect(await q.spent('Z')).toBe(0)
    await q.clearSpent(); expect(await q.spent('X')).toBe(0)
  })
})

describe('payOrder', () => {
  it('online: posts the order and returns the new balance', async () => {
    const q = await mkQueue()
    const r = await payOrder(q, input(), true)
    expect(r.ok && r.mode === 'online' && r.order.balance_tokens).toBe(22)
    expect(await q.pending()).toHaveLength(0)
  })
  it('maps business errors by code and does not queue them', async () => {
    const q = await mkQueue()
    const r = await payOrder(q, input({ tag: tag(2), lines: [{ item_id: mockState.catalog.items[0].id, qty: 1 }], totalTokens: 1 }), true)
    expect(r).toMatchObject({ ok: false, reason: 'api', error: { code: 'INSUFFICIENT_BALANCE', details: { balance_tokens: 0, required_tokens: 1 } } })
    expect(await q.pending()).toHaveLength(0)
  })
  it('PRICE_MISMATCH when the catalog changed', async () => {
    const q = await mkQueue()
    const r = await payOrder(q, input({ catalogVersion: 999 }), true)
    expect(r).toMatchObject({ ok: false, error: { code: 'PRICE_MISMATCH' } })
  })
  it('network failure falls back to the queue with the same client_tx_id, then syncs once (idempotent)', async () => {
    const q = await mkQueue()
    setMockOffline(true)
    const r = await payOrder(q, input(), true)
    expect(r).toMatchObject({ ok: true, mode: 'offline', provisional_ref: 'T7-000001', spentOffline: 2 })
    expect(await q.pending()).toHaveLength(1)
    // still offline: sync keeps the item
    expect((await syncPending(q)).offline).toBe(true)
    expect(await q.pending()).toHaveLength(1)
    setMockOffline(false)
    const out = await syncPending(q)
    expect(out).toMatchObject({ applied: 1, rejected: 0, remaining: 0 })
    expect(mockState.wallets.get(MOCK_TAGS[0].tag_code)!.balance).toBe(22)
    expect(await q.spent(MOCK_TAGS[0].tag_code)).toBe(0) // window restarts after full sync
  })
  it('navigator offline skips the network entirely', async () => {
    const q = await mkQueue()
    const r = await payOrder(q, input(), false)
    expect(r).toMatchObject({ ok: true, mode: 'offline' })
    expect(mockState.wallets.get(MOCK_TAGS[0].tag_code)!.balance).toBe(24)
  })
  it('enforces the per-tag offline cap across several orders', async () => {
    const q = await mkQueue()
    for (let i = 0; i < 5; i++) expect(await payOrder(q, input(), false)).toMatchObject({ ok: true })
    const r = await payOrder(q, input(), false)
    expect(r).toEqual({ ok: false, reason: 'offline_cap', cap: 10, spentOffline: 10, required: 2 })
    expect(await q.pending()).toHaveLength(5)
    // another tag is independent
    expect(await payOrder(q, input({ tag: tag(3) }), false)).toMatchObject({ ok: true })
  })
  it('replay of an already-sent order (response lost) is a duplicate on sync, not a double charge', async () => {
    const q = await mkQueue()
    const body = input({ client_tx_id: uuidv7(), client_created_at: '2026-07-18T14:00:00.000Z' })
    const first = await payOrder(q, body, true) // reached the server
    expect(first.ok).toBe(true)
    setMockOffline(true) // client thinks it failed and retries offline with the same id
    await payOrder(q, body, true)
    setMockOffline(false)
    const out = await syncPending(q)
    expect(out.duplicates).toBe(1)
    expect(mockState.wallets.get(MOCK_TAGS[0].tag_code)!.balance).toBe(22)
  })
  it('late overdraw is accepted and flagged by the server, queue entry is removed', async () => {
    const q = await mkQueue()
    mockState.wallets.get(MOCK_TAGS[1].tag_code)!.balance = 1 // another device spent it meanwhile
    await payOrder(q, input({ tag: tag(1) }), false) // 2 tokens
    const out = await syncPending(q)
    expect(out.applied).toBe(1)
    expect(Object.values(out.flagged)[0]).toContain('NEGATIVE_BALANCE')
    expect(mockState.wallets.get(MOCK_TAGS[1].tag_code)!.balance).toBe(-1)
  })
  it('structurally invalid items are marked rejected, never dropped', async () => {
    const q = await mkQueue()
    await payOrder(q, input({ tag: { tag_code: '9999999999ABCDEFGHJ0', uid: '04AABBCCDDEEFF' } }), false)
    const out = await syncPending(q)
    expect(out.rejected).toBe(1)
    expect(await q.rejected()).toHaveLength(1)
    expect((await q.rejected())[0].error?.code).toBe('TAG_NOT_FOUND')
  })
})
