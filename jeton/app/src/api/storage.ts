/** Device token + staff session persistence. The device token should live in the Android Keystore (Capacitor secure storage) in production; localStorage is the PWA fallback. */
const K = { device: 'jeton.device', jwt: 'jeton.jwt', session: 'jeton.session', lang: 'jeton.lang', mute: 'jeton.mute' }

export interface DeviceInfo { device_id: string; device_token: string; event_id: string; stand_id: string | null; kind: string; training: boolean }
export interface StoredSession { jwt: string; expires_at: string; session: import('./types').Session }

function get<T>(k: string): T | null {
  try { const v = localStorage.getItem(k); return v ? (JSON.parse(v) as T) : null } catch { return null }
}
function set(k: string, v: unknown) { localStorage.setItem(k, JSON.stringify(v)) }

export const storage = {
  getDevice: () => get<DeviceInfo>(K.device),
  setDevice: (d: DeviceInfo | null) => (d ? set(K.device, d) : localStorage.removeItem(K.device)),
  getSession: () => get<StoredSession>(K.session),
  setSession: (s: StoredSession | null) => (s ? set(K.session, s) : localStorage.removeItem(K.session)),
  getLang: () => localStorage.getItem(K.lang),
  setLang: (l: string) => localStorage.setItem(K.lang, l),
  getMute: () => localStorage.getItem(K.mute) === '1',
  setMute: (m: boolean) => localStorage.setItem(K.mute, m ? '1' : '0'),
}
