/**
 * In-memory fake of the Jeton API implementing the generated types. Used for dev and tests (VITE_API_MODE=mock).
 * It is a `fetch` replacement, so the real openapi-fetch client, middleware and error handling are exercised.
 */
import type { components } from './schema'
import { MOCK_TAGS, MOCK_EVENT_ID, seedCatalog, STAND_BAR, STAND_CASH } from './mockData'
import { uuidv7 } from '../lib/uuid'

type S = components['schemas']

export interface MockState {
  catalog: S['Catalog']
  wallets: Map<string, { tag_code: string; uid: string; balance: number; status: 'new' | 'active' | 'blocked'; tag_status: 'pending' | 'active' | 'retired' }>
  staff: (S['Staff'] & { pin: string })[]
  devices: S['Device'][]
  journal: S['WalletEntry'][]
  orders: Map<string, S['Order']>
  txs: Map<string, { body: string; status: number; res: unknown }>
  receiptSeq: Record<string, number>
  seq: number
  offline: boolean
  latencyMs: number
}

export function freshState(): MockState {
  const wallets: MockState['wallets'] = new Map()
  for (const t of MOCK_TAGS) wallets.set(t.tag_code, { tag_code: t.tag_code, uid: t.uid, balance: t.balance, status: t.balance ? 'active' : 'new', tag_status: 'active' })
  return {
    catalog: seedCatalog(),
    wallets,
    staff: [
      { id: '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a01', display_name: 'Anna (bar)', role: 'vendor', staff_type: 'volunteer', active: true, pin: '1111' },
      { id: '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a02', display_name: 'Bob (caisse)', role: 'cashier', staff_type: 'volunteer', active: true, pin: '2222' },
      { id: '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a03', display_name: 'Admin', role: 'admin', staff_type: 'employee', active: true, pin: '9999' },
    ],
    devices: [],
    journal: [],
    orders: new Map(),
    txs: new Map(),
    receiptSeq: {},
    seq: 100,
    offline: false,
    latencyMs: 0,
  }
}

export const mockState: MockState = freshState()
export function resetMock() { Object.assign(mockState, freshState()) }
export function setMockOffline(v: boolean) { mockState.offline = v }

const J = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } })
const err = (status: number, code: string, message = code, details?: Record<string, unknown>) =>
  J(status, { code, message, request_id: 'req_mock', retryable: false, ...(details ? { details } : {}) })

let current: { role: S['Role']; staff: S['StaffPublic']; training: boolean; stand: string | null } | null = null

function authz(req: Request): Response | null {
  const h = req.headers.get('authorization')
  if (!h) return err(401, 'UNAUTHENTICATED')
  return null
}

function tokenFromAuth(req: Request) { return req.headers.get('authorization')?.replace('Bearer ', '') ?? '' }

function receipt(stand: string) { return (mockState.receiptSeq[stand] = (mockState.receiptSeq[stand] ?? 0) + 1) }

function applyOrder(body: S['OrderRequest'], isSync: boolean): { status: number; res: unknown } {
  const w = mockState.wallets.get(body.tag.tag_code)
  if (!w) return { status: 404, res: { code: 'TAG_NOT_FOUND', message: 'Unknown tag', request_id: 'req_mock', retryable: false } }
  const uidBad = w.uid !== body.tag.uid
  if (uidBad && !isSync) return { status: 409, res: { code: 'TAG_UID_MISMATCH', message: 'uid', request_id: 'req_mock', retryable: false } }
  if (w.status === 'blocked' && !isSync) return { status: 423, res: { code: 'TAG_BLOCKED', message: 'blocked', request_id: 'req_mock', retryable: false } }
  const items = new Map(mockState.catalog.items.map((i) => [i.id, i]))
  let tokens = 0
  const lines: S['OrderLine'][] = []
  for (const [n, l] of body.lines.entries()) {
    const it = items.get(l.item_id)
    if (!it || !it.active) return { status: 422, res: { code: 'ITEM_NOT_FOUND', message: 'item', request_id: 'req_mock', retryable: false } }
    if (it.min_age && !body.age_check_confirmed) return { status: 422, res: { code: 'AGE_CHECK_REQUIRED', message: 'age', request_id: 'req_mock', retryable: false } }
    tokens += it.price_tokens * l.qty
    lines.push({ line_no: n + 1, item_id: it.id, item_name: it.name, qty: l.qty, unit_price_tokens: it.price_tokens, tokens: it.price_tokens * l.qty,
      vat_category: it.vat_category, consumption_mode: 'on_site', vat_rate_bp: 2100, gross_cents: it.price_tokens * l.qty * 200 })
  }
  const tip = body.tip_tokens ?? 0
  const ev = mockState.catalog.event
  if (tip > 0 && !isSync && (tip > (ev.tip_max_tokens ?? 10) || tip * 100 > tokens * (ev.tip_max_percent ?? 50))) return { status: 422, res: { code: 'TIP_TOO_HIGH', message: 'tip', request_id: 'req_mock', retryable: false } }
  const total = tokens + tip
  if (!isSync && body.expected_catalog_version !== undefined && body.expected_catalog_version !== mockState.catalog.catalog_version)
    return { status: 409, res: { code: 'PRICE_MISMATCH', message: 'refresh', request_id: 'req_mock', retryable: false, details: { catalog_version: mockState.catalog.catalog_version, total_tokens: total } } }
  if (!isSync && w.balance < total)
    return { status: 409, res: { code: 'INSUFFICIENT_BALANCE', message: 'low', request_id: 'req_mock', retryable: false, details: { balance_tokens: w.balance, required_tokens: total } } }
  w.balance -= total
  if (w.status === 'new') w.status = 'active'
  const order: S['Order'] = {
    id: uuidv7(), kind: 'sale', journal_seq: ++mockState.seq, receipt_no: receipt(body.stand_id), stand_id: body.stand_id, tag_code: w.tag_code, lines,
    items_tokens: tokens, tip_tokens: tip, total_tokens: total, gross_cents: tokens * 200, net_cents: Math.round(tokens * 200 / 1.21), vat_cents: tokens * 200 - Math.round(tokens * 200 / 1.21),
    vat_groups: [], balance_tokens: w.balance, business_date: new Date().toISOString().slice(0, 10), training: current?.training ?? false,
    created_at: new Date().toISOString(), provisional_ref: body.provisional_ref ?? null,
    flags: [...(w.balance < 0 ? ['NEGATIVE_BALANCE'] : []), ...(uidBad ? ['TAG_UID_MISMATCH'] : [])],
  }
  mockState.orders.set(order.id, order)
  mockState.journal.unshift({ journal_seq: order.journal_seq, kind: 'sale', at: order.created_at!, delta_tokens: -total, balance_after_tokens: w.balance, document_id: order.id, stand_name: 'Bar' })
  return { status: 201, res: order }
}

/** Idempotency per client_tx_id (spec: same body => replay 200 + header, different body => 409 DUPLICATE_TX). */
function idem(body: { client_tx_id: string }, run: () => { status: number; res: unknown }): Response {
  const key = body.client_tx_id
  const raw = JSON.stringify(body)
  const prev = mockState.txs.get(key)
  if (prev) {
    if (prev.body !== raw) return err(409, 'DUPLICATE_TX')
    return J(200, prev.res, { 'Idempotent-Replayed': 'true' })
  }
  const r = run()
  if (r.status < 300) mockState.txs.set(key, { body: raw, ...r })
  return J(r.status, r.res)
}

function tagInfo(w: MockState['wallets'] extends Map<string, infer V> ? V : never): S['TagInfo'] {
  return { tag_code: w.tag_code, chip_type: 'ntag215', tag_status: w.tag_status, wallet_status: w.status, balance_tokens: w.balance, balance_cents: w.balance * 200, wallet_id: null, flags: w.balance < 0 ? ['NEGATIVE_BALANCE'] : [] }
}

export const mockFetch: typeof fetch = async (input, init) => {
  const req = input instanceof Request ? input : new Request(input, init)
  if (mockState.latencyMs) await new Promise((r) => setTimeout(r, mockState.latencyMs))
  if (mockState.offline) throw new TypeError('Failed to fetch (mock offline)')
  const url = new URL(req.url)
  const path = url.pathname.replace(/^.*\/v1/, '')
  const m = req.method
  const body = async <T,>() => (await req.json()) as T
  let r: RegExpExecArray | null
  const S_ = mockState

  if (m === 'GET' && path === '/health') return J(200, { status: 'ok', server_time: new Date().toISOString(), version: '1.0.0' })
  if (m === 'POST' && path === '/auth/devices/enroll') {
    const b = await body<S['EnrollDeviceRequest']>()
    if (b.enrollment_code === 'EXPIRED00') return err(410, 'ENROLLMENT_CODE_INVALID')
    const first = b.enrollment_code[0]
    const kind = first === 'C' ? 'cashdesk' : first === 'A' ? 'console' : 'terminal'
    const training = first === 'X'
    const dev: S['Device'] = { id: uuidv7(), name: b.device_name, kind, stand_id: kind === 'cashdesk' ? STAND_CASH : STAND_BAR, platform: b.platform, training, enrolled_at: new Date().toISOString() }
    S_.devices.push(dev)
    return J(201, { device_id: dev.id, device_token: 'dvc_' + uuidv7(), event_id: MOCK_EVENT_ID, stand_id: dev.stand_id, kind, training })
  }
  const bad = authz(req)
  if (bad) {
    if (!path.startsWith('/public/')) return bad
  }
  if (m === 'GET' && path === '/auth/staff') return J(200, { items: S_.staff.filter((s) => s.active).map((s) => ({ id: s.id, display_name: s.display_name, role: s.role })) })
  if (m === 'POST' && path === '/auth/login') {
    const b = await body<S['LoginRequest']>()
    const s = S_.staff.find((x) => x.id === b.staff_id)
    if (!s || s.pin !== b.pin) return err(401, 'INVALID_CREDENTIALS')
    const dtok = tokenFromAuth(req)
    const dev = S_.devices.find(() => true)
    void dtok
    const training = S_.devices.at(-1)?.training ?? false
    const session: S['Session'] = { staff: { id: s.id, display_name: s.display_name, role: s.role }, device_id: dev?.id ?? uuidv7(), event_id: MOCK_EVENT_ID,
      stand_id: s.role === 'cashier' ? STAND_CASH : STAND_BAR, role: s.role, training, server_time: new Date().toISOString() }
    current = { role: s.role, staff: session.staff, training, stand: session.stand_id ?? null }
    return J(200, { access_token: 'jwt_' + uuidv7(), expires_at: new Date(Date.now() + 12 * 3600e3).toISOString(), session })
  }
  if (m === 'GET' && path === '/auth/me') return J(200, { staff: current?.staff, device_id: uuidv7(), event_id: MOCK_EVENT_ID, role: current?.role ?? 'vendor', training: current?.training ?? false })
  if (m === 'GET' && /\/events\/[^/]+\/catalog$/.test(path)) {
    const etag = `"${S_.catalog.catalog_version}"`
    if (req.headers.get('if-none-match') === etag) return new Response(null, { status: 304 })
    return J(200, S_.catalog, { ETag: etag })
  }
  if (m === 'GET' && (r = /^\/tags\/([^/]+)$/.exec(path))) {
    const w = S_.wallets.get(r[1])
    if (!w) return err(404, 'TAG_NOT_FOUND')
    if (w.uid !== url.searchParams.get('uid')) return err(409, 'TAG_UID_MISMATCH')
    if (w.status === 'blocked' && current?.role === 'vendor') return err(423, 'TAG_BLOCKED')
    return J(200, tagInfo(w))
  }
  if (m === 'GET' && (r = /^\/tags\/([^/]+)\/transactions$/.exec(path))) return J(200, { items: S_.journal.slice(0, 20), next_cursor: null })
  if (m === 'POST' && path === '/orders') {
    const b = await body<S['OrderRequest']>()
    return idem(b, () => applyOrder(b, false))
  }
  if (m === 'POST' && (r = /^\/orders\/([^/]+)\/refunds$/.exec(path))) {
    const b = await body<S['RefundOrderRequest']>()
    return idem(b, () => {
      const o = S_.orders.get(r![1])
      if (!o) return { status: 404, res: { code: 'NOT_FOUND', message: 'order', request_id: 'x', retryable: false } }
      const w = S_.wallets.get(o.tag_code)!
      w.balance += o.items_tokens
      const ref: S['Order'] = { ...o, id: uuidv7(), kind: 'refund', refund_of_order_id: o.id, balance_tokens: w.balance, journal_seq: ++S_.seq }
      return { status: 201, res: ref }
    })
  }
  if (m === 'POST' && path === '/topups') {
    const b = await body<S['TopupRequest']>()
    return idem(b, () => {
      const w = S_.wallets.get(b.tag.tag_code)
      if (!w) return { status: 404, res: { code: 'TAG_NOT_FOUND', message: '', request_id: 'x', retryable: false } }
      if (w.uid !== b.tag.uid) return { status: 409, res: { code: 'TAG_UID_MISMATCH', message: '', request_id: 'x', retryable: false } }
      const price = S_.catalog.event.token_price_cents ?? 200
      if (b.amount_cents % price !== 0) return { status: 422, res: { code: 'INVALID_AMOUNT', message: '', request_id: 'x', retryable: false } }
      const tokens = b.amount_cents / price
      if (w.balance + tokens > (S_.catalog.event.max_balance_tokens ?? 100)) return { status: 422, res: { code: 'LIMIT_EXCEEDED', message: '', request_id: 'x', retryable: false, details: { limit: 100, would_be: w.balance + tokens } } }
      if (b.manual && !b.external_ref) return { status: 422, res: { code: 'EXTERNAL_REF_REQUIRED', message: '', request_id: 'x', retryable: false } }
      w.balance += tokens
      w.status = 'active'
      const t: S['Topup'] = { id: uuidv7(), journal_seq: ++S_.seq, receipt_no: receipt(STAND_CASH), tag_code: w.tag_code, payment_method: b.payment_method, external_ref: b.external_ref ?? null,
        amount_cents: b.amount_cents, tokens, token_price_cents: price, balance_tokens: w.balance, business_date: new Date().toISOString().slice(0, 10), vat_cents: 0 }
      S_.journal.unshift({ journal_seq: t.journal_seq, kind: 'topup', at: new Date().toISOString(), delta_tokens: tokens, balance_after_tokens: w.balance })
      return { status: 201, res: t }
    })
  }
  if (m === 'POST' && path === '/cashouts') {
    const b = await body<S['CashoutRequest']>()
    return idem(b, () => {
      const w = S_.wallets.get(b.tag.tag_code)
      if (!w) return { status: 404, res: { code: 'TAG_NOT_FOUND', message: '', request_id: 'x', retryable: false } }
      const tokens = b.tokens ?? w.balance
      if (tokens > w.balance || tokens < 1) return { status: 409, res: { code: 'INSUFFICIENT_BALANCE', message: '', request_id: 'x', retryable: false, details: { balance_tokens: w.balance, required_tokens: tokens } } }
      w.balance -= tokens
      const c: S['Cashout'] = { id: uuidv7(), journal_seq: ++S_.seq, receipt_no: receipt(STAND_CASH), tag_code: w.tag_code, tokens, amount_cents: tokens * 200, method: b.method, balance_tokens: w.balance, business_date: new Date().toISOString().slice(0, 10) }
      S_.journal.unshift({ journal_seq: c.journal_seq, kind: 'cashout', at: new Date().toISOString(), delta_tokens: -tokens, balance_after_tokens: w.balance })
      return { status: 201, res: c }
    })
  }
  if (m === 'POST' && path === '/sync/batch') {
    const b = await body<S['SyncBatchRequest']>()
    const results: S['SyncItemResult'][] = b.items.map((it) => {
      const p = it.payload as S['OrderRequest']
      const prev = S_.txs.get(p.client_tx_id)
      if (prev) return { client_tx_id: p.client_tx_id, status: prev.body === JSON.stringify(p) ? 'duplicate' : 'rejected', result: prev.res as Record<string, unknown> }
      if (it.type !== 'order') return { client_tx_id: p.client_tx_id, status: 'rejected', error: { code: 'VALIDATION_ERROR', message: 'unsupported in mock', request_id: 'x', retryable: false } }
      const r2 = applyOrder(p, true)
      if (r2.status >= 300) return { client_tx_id: p.client_tx_id, status: 'rejected', error: r2.res as S['Error'] }
      S_.txs.set(p.client_tx_id, { body: JSON.stringify(p), ...r2 })
      return { client_tx_id: p.client_tx_id, status: 'applied', result: r2.res as Record<string, unknown>, flags: (r2.res as S['Order']).flags }
    })
    return J(200, { batch_id: b.batch_id, server_time: new Date().toISOString(), results })
  }
  if (m === 'POST' && path === '/tags/enroll') {
    const b = await body<S['EnrollTagRequest']>()
    const existing = [...S_.wallets.values()].find((w) => w.uid === b.uid)
    if (existing && existing.tag_status === 'active') return err(409, 'TAG_ALREADY_ENROLLED')
    const code = existing?.tag_code ?? randomTagCode()
    if (!existing) S_.wallets.set(code, { tag_code: code, uid: b.uid, balance: 0, status: 'new', tag_status: 'pending' })
    return J(existing ? 200 : 201, { tag_code: code, ndef_url: `https://jeton.example/t/${code}`, status: 'pending', signature_verified: b.signature ? true : null,
      protection: b.chip_type.startsWith('ntag21') ? { pwd: 'A1B2C3D4', pack: '9F8E', auth0: 4, prot: 0, authlim: 7 } : undefined })
  }
  if (m === 'POST' && (r = /^\/tags\/([^/]+)\/confirm$/.exec(path))) {
    const b = await body<S['ConfirmTagRequest']>()
    const w = S_.wallets.get(r[1])
    if (!w || w.uid !== b.uid) return err(404, 'TAG_NOT_FOUND')
    if (!b.readback_ok) return err(409, 'VALIDATION_ERROR')
    w.tag_status = 'active'
    return J(200, tagInfo(w))
  }
  if (m === 'GET' && /\/events\/[^/]+\/tags$/.test(path)) return J(200, { items: [...S_.wallets.values()].filter((w) => w.tag_status === 'active').map(tagInfo), next_cursor: null })
  if (m === 'GET' && /\/events\/[^/]+\/devices$/.test(path)) return J(200, { items: S_.devices })
  if (m === 'POST' && /\/events\/[^/]+\/enrollment-codes$/.test(path)) return J(201, { code: 'T' + uuidv7().slice(-7).toUpperCase().replace(/[ILOU]/g, '7'), expires_at: new Date(Date.now() + 15 * 60e3).toISOString() })
  if (m === 'POST' && (r = /^\/devices\/([^/]+)\/revoke$/.exec(path))) {
    const d = S_.devices.find((x) => x.id === r![1])
    if (!d) return err(404, 'NOT_FOUND')
    d.revoked_at = new Date().toISOString()
    return J(200, d)
  }
  if (m === 'GET' && /\/events\/[^/]+\/staff$/.test(path)) return J(200, { items: S_.staff.map(({ pin: _p, ...s }) => s) })
  if (m === 'PUT' && (r = /^\/staff\/([^/]+)$/.exec(path))) {
    const b = await body<S['StaffWrite']>()
    let s = S_.staff.find((x) => x.id === r![1])
    if (!s) { s = { id: r[1], display_name: b.display_name, role: b.role, staff_type: 'volunteer', active: true, pin: b.pin ?? '0000' }; S_.staff.push(s) }
    Object.assign(s, { display_name: b.display_name, role: b.role, active: b.active ?? s.active, pin: b.pin ?? s.pin })
    const { pin: _p, ...pub } = s
    return J(200, pub)
  }
  if (m === 'PUT' && (r = /^\/events\/[^/]+\/items\/([^/]+)$/.exec(path))) {
    const b = await body<S['Item']>()
    const i = S_.catalog.items.findIndex((x) => x.id === r![1])
    const item = { ...b, price_cents: b.price_tokens * 200 }
    if (i < 0) S_.catalog.items.push(item); else S_.catalog.items[i] = item
    S_.catalog.catalog_version++
    ;(S_.catalog.event as { catalog_version: number }).catalog_version = S_.catalog.catalog_version
    return J(i < 0 ? 201 : 200, item)
  }
  if (m === 'PUT' && (r = /^\/events\/[^/]+\/stands\/([^/]+)$/.exec(path))) {
    const b = await body<S['Stand']>()
    const i = S_.catalog.stands.findIndex((x) => x.id === r![1])
    if (i < 0) S_.catalog.stands.push(b); else S_.catalog.stands[i] = b
    S_.catalog.catalog_version++
    return J(i < 0 ? 201 : 200, b)
  }
  if (m === 'PUT' && (r = /^\/events\/[^/]+\/categories\/([^/]+)$/.exec(path))) {
    const b = await body<S['Category']>()
    const i = S_.catalog.categories.findIndex((x) => x.id === r![1])
    if (i < 0) S_.catalog.categories.push(b); else S_.catalog.categories[i] = b
    S_.catalog.catalog_version++
    return J(i < 0 ? 201 : 200, b)
  }
  if (m === 'GET' && /\/reports\/liability$/.test(path)) {
    const tot = [...S_.wallets.values()].reduce((a, w) => a + w.balance, 0)
    return J(200, { as_of: new Date().toISOString(), outstanding_tokens: tot, outstanding_cents: tot * 200, wallets_with_balance: [...S_.wallets.values()].filter((w) => w.balance > 0).length })
  }
  if (m === 'GET' && /\/reports\/sales$/.test(path)) {
    const by = new Map<string, { qty: number; tokens: number }>()
    for (const o of S_.orders.values()) for (const l of o.lines) { const e = by.get(l.item_name) ?? { qty: 0, tokens: 0 }; e.qty += l.qty; e.tokens += l.tokens; by.set(l.item_name, e) }
    const rows = [...by].map(([k, v]) => ({ key: k, label: k, qty: v.qty, tokens: v.tokens, gross_cents: v.tokens * 200, net_cents: 0, vat_cents: 0 }))
    return J(200, { group_by: 'item', rows, totals: { qty: rows.reduce((a, x) => a + x.qty, 0), tokens: rows.reduce((a, x) => a + x.tokens, 0) } })
  }
  if (m === 'GET' && /\/reports\/topups$/.test(path)) return J(200, { by_method: [] })
  if (m === 'GET' && /\/reports\/tips$/.test(path)) return J(200, { group_by: 'stand', rows: [], payable_tokens: 0, paid_tokens: 0 })
  if (m === 'GET' && /\/reports\/z$/.test(path)) return J(200, { event_id: MOCK_EVENT_ID, stand_id: url.searchParams.get('stand_id'), business_date: url.searchParams.get('business_date'), sealed: false, orders_count: S_.orders.size, gross_cents: 0, net_cents: 0, vat_cents: 0, vat_groups: [], tips_tokens: 0 })
  if (m === 'GET' && /\/exports\//.test(path)) return new Response('seq;kind\n1;topup\n', { status: 200, headers: { 'content-type': 'text/csv' } })
  if (m === 'GET' && (r = /^\/public\/tags\/([^/]+)$/.exec(path))) {
    const w = S_.wallets.get(r[1])
    if (!w) return err(404, 'NOT_FOUND')
    return J(200, { tag_code: w.tag_code, status: w.status, balance_tokens: w.balance, balance_cents: w.balance * 200, token_price_cents: 200,
      event: { name: S_.catalog.event.name, organizer_name: 'ASBL Demo', policy_version: 'policy-2026-07', privacy_url: 'https://jeton.example/privacy' },
      recent: [...S_.orders.values()].filter((o) => o.tag_code === w.tag_code).slice(0, 20).map((o) => ({ at: o.created_at!, kind: 'sale', delta_tokens: -o.total_tokens, stand_name: 'Bar', receipt_no: o.receipt_no, items: o.lines.map((l) => ({ name: l.item_name, qty: l.qty })) })) })
  }
  return err(404, 'NOT_FOUND', `mock: no route ${m} ${path}`)
}

const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export function randomTagCode(): string {
  const b = crypto.getRandomValues(new Uint8Array(19))
  return Array.from(b, (x) => B32[x & 31]).join('') + (Math.random() < 0.5 ? '0' : 'G')
}
