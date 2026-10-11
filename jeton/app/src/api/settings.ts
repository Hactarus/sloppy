/** Runtime server settings (stored on the device). Build-time VITE_API_MODE / VITE_API_BASE are only the defaults. */
export type ApiMode = 'mock' | 'real'
const K = { mode: 'jeton.apiMode', base: 'jeton.apiBase' }

export const BUILD_MODE: ApiMode = (import.meta.env.VITE_API_MODE as ApiMode | undefined) ?? (import.meta.env.DEV ? 'mock' : 'real')
export const BUILD_BASE: string = import.meta.env.VITE_API_BASE ?? '/v1'

/** Normalises user input: trims, adds https:// when no scheme, appends /v1 when no path, strips trailing slashes. Returns null if invalid. */
export function normalizeBaseUrl(input: string): string | null {
  let s = input.trim()
  if (!s) return null
  if (s.startsWith('/')) return s.replace(/\/+$/, '') || null // same-origin path (web builds)
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s
  let u: URL
  try { u = new URL(s) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  if (!u.hostname) return null
  const path = u.pathname.replace(/\/+$/, '')
  return u.origin + (path === '' ? '/v1' : path)
}

function read(k: string): string | null { try { return localStorage.getItem(k) } catch { return null } }

export function getApiMode(): ApiMode {
  const v = read(K.mode)
  return v === 'mock' || v === 'real' ? v : BUILD_MODE
}
export function getApiBase(): string {
  const v = read(K.base)
  return (v && normalizeBaseUrl(v)) || BUILD_BASE
}
/** True if the user stored their own server URL. */
export function hasCustomBase(): boolean { return !!read(K.base) }
export function setApiMode(m: ApiMode | null) { if (m) localStorage.setItem(K.mode, m); else localStorage.removeItem(K.mode) }
/** Stores a normalised URL (or clears it with null/empty to fall back to the build default). Returns false if invalid. */
export function setApiBase(input: string | null): boolean {
  if (!input || !input.trim()) { localStorage.removeItem(K.base); return true }
  const n = normalizeBaseUrl(input)
  if (!n) return false
  localStorage.setItem(K.base, n)
  return true
}
/** Resolve a (possibly relative) base against the page origin. */
export function resolveBase(base: string): string {
  return new URL(base, globalThis.location?.origin ?? 'http://localhost').toString().replace(/\/$/, '')
}
