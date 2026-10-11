import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './schema'
import { storage } from './storage'
import type { ApiError } from './types'
import { getApiBase, getApiMode, resolveBase } from './settings'

/** 'mock' (in-memory fake, default in `vite dev`) or 'real' (default in production builds). */
const MODE = getApiMode() // runtime setting (device storage) with the build-time default; changing it reloads the app

export const apiMode = MODE

/** Paths that need no auth / only the device token. */
const NO_AUTH = [/\/auth\/devices\/enroll$/, /\/health$/, /\/public\//]
const DEVICE_ONLY = [/\/auth\/staff$/, /\/auth\/login$/]

const auth: Middleware = {
  onRequest({ request }) {
    const path = new URL(request.url).pathname
    if (NO_AUTH.some((r) => r.test(path))) return request
    const dev = storage.getDevice()
    const ses = storage.getSession()
    let token: string | undefined
    if (DEVICE_ONLY.some((r) => r.test(path))) token = dev?.device_token
    else if (/\/sync\/batch$/.test(path)) token = dev?.device_token ?? ses?.jwt // JWT may have expired offline (ADR 0002)
    else token = ses?.jwt
    if (token) request.headers.set('Authorization', `Bearer ${token}`)
    return request
  },
}

let mockFetch: typeof fetch | undefined
async function appFetch(input: Request): Promise<Response> {
  if (MODE === 'mock') {
    if (!mockFetch) mockFetch = (await import('./mock')).mockFetch // code-split: not loaded in real mode
    return mockFetch(input)
  }
  // The server URL is read per request so it can be changed at runtime.
  const target = resolveBase(getApiBase()) + new URL(input.url).pathname.replace(/^\/v1(?=\/)/, '') + new URL(input.url).search
  return fetch(new Request(target, input))
}

export const api = createClient<paths>({ baseUrl: 'http://jeton.invalid/v1', fetch: appFetch as typeof fetch })
api.use(auth)

/** True for failures where the request may not have reached the server (offline, DNS, 502-504). */
export function isNetworkFailure(err: unknown, status?: number): boolean {
  if (err instanceof TypeError) return true
  if (status !== undefined && [0, 502, 503, 504].includes(status)) return true
  return false
}

export function asApiError(e: unknown): ApiError | null {
  if (e && typeof e === 'object' && 'code' in e && 'message' in e) return e as ApiError
  return null
}
