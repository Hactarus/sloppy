import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { api, apiMode } from '../api/client'
import { storage, type DeviceInfo, type StoredSession } from '../api/storage'
import type { Catalog, Session } from '../api/types'
import { OfflineQueue } from '../offline/queue'
import { syncPending } from '../offline/sync'
import type { NfcService } from '../nfc/types'

export interface SyncStatus { online: boolean; pending: number; rejected: number; syncing: boolean }

export interface AppCtx {
  device: DeviceInfo | null
  setDevice(d: DeviceInfo | null): void
  session: Session | null
  login(s: StoredSession): void
  logout(): void
  catalog: Catalog | null
  refreshCatalog(): Promise<void>
  queue: OfflineQueue
  nfc: NfcService
  status: SyncStatus
  syncNow(): Promise<void>
  refreshCounts(): Promise<void>
}

const Ctx = createContext<AppCtx | null>(null)
export const useApp = () => {
  const c = useContext(Ctx)
  if (!c) throw new Error('AppProvider missing')
  return c
}

const CATALOG_KEY = 'jeton.catalog'
function loadCachedCatalog(): Catalog | null {
  try { const v = localStorage.getItem(CATALOG_KEY); return v ? (JSON.parse(v) as Catalog) : null } catch { return null }
}

export function AppProvider({ queue, nfc, children, syncIntervalMs = 15000 }: { queue: OfflineQueue; nfc: NfcService; children: ReactNode; syncIntervalMs?: number }) {
  const [device, setDeviceState] = useState(storage.getDevice())
  const [session, setSession] = useState<Session | null>(() => {
    const s = storage.getSession()
    return s && new Date(s.expires_at).getTime() > Date.now() ? s.session : null
  })
  const [catalog, setCatalog] = useState<Catalog | null>(loadCachedCatalog)
  const [status, setStatus] = useState<SyncStatus>({ online: navigator.onLine, pending: 0, rejected: 0, syncing: false })
  const syncing = useRef(false)

  const refreshCounts = useCallback(async () => {
    const [p, r] = await Promise.all([queue.pending(), queue.rejected()])
    setStatus((s) => ({ ...s, pending: p.length, rejected: r.length }))
  }, [queue])

  const syncNow = useCallback(async () => {
    if (syncing.current || !storage.getDevice()) return
    syncing.current = true
    setStatus((s) => ({ ...s, syncing: true }))
    try {
      const out = await syncPending(queue)
      setStatus((s) => ({ ...s, online: out.offline ? false : navigator.onLine }))
    } catch { /* keep queue */ }
    syncing.current = false
    setStatus((s) => ({ ...s, syncing: false }))
    await refreshCounts()
  }, [queue, refreshCounts])

  const refreshCatalog = useCallback(async () => {
    const d = storage.getDevice()
    if (!d || !storage.getSession()) return
    try {
      const cached = loadCachedCatalog()
      const r = await api.GET('/events/{event_id}/catalog', {
        params: { path: { event_id: d.event_id }, header: cached ? { 'If-None-Match': `"${cached.catalog_version}"` } : {} },
      })
      if (r.data) {
        localStorage.setItem(CATALOG_KEY, JSON.stringify(r.data))
        setCatalog(r.data)
      }
      setStatus((s) => ({ ...s, online: true }))
    } catch {
      setStatus((s) => ({ ...s, online: false })) // keep the cached catalog
    }
  }, [])

  useEffect(() => {
    void refreshCounts()
    const on = () => { setStatus((s) => ({ ...s, online: true })); void syncNow() }
    const off = () => setStatus((s) => ({ ...s, online: false }))
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    const iv = setInterval(() => { void queue.pending().then((p) => { if (p.length) void syncNow(); else void refreshCounts() }) }, syncIntervalMs)
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); clearInterval(iv) }
  }, [queue, syncNow, refreshCounts, syncIntervalMs])

  useEffect(() => {
    if (!session) return
    void refreshCatalog()
    const iv = setInterval(() => void refreshCatalog(), 5 * 60_000)
    return () => clearInterval(iv)
  }, [session, refreshCatalog])

  const value = useMemo<AppCtx>(() => ({
    device,
    setDevice: (d) => { storage.setDevice(d); setDeviceState(d); if (!d) { storage.setSession(null); setSession(null) } },
    session,
    login: (s) => { storage.setSession(s); setSession(s.session) },
    logout: () => { storage.setSession(null); setSession(null) },
    catalog, refreshCatalog, queue, nfc, status, syncNow, refreshCounts,
  }), [device, session, catalog, refreshCatalog, queue, nfc, status, syncNow, refreshCounts])

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export { apiMode }
