/* Public balance page: no framework, no cookies, no storage. Renders with textContent only (no innerHTML). */
import { strings, type Lang } from './strings'
import type { PublicTagPage } from '../api/types'

const BASE = import.meta.env.VITE_API_BASE ?? '/v1'
const getRoot = () => document.getElementById('a')!

function pickLang(): Lang {
  const l = (navigator.language || 'en').slice(0, 2)
  return l === 'fr' || l === 'nl' ? l : 'en'
}
const lang = pickLang()
const T = strings[lang] as Record<string, string>
document.documentElement.lang = lang
const f = (k: string, v: Record<string, string> = {}) => (T[k] ?? k).replace(/\{(\w+)\}/g, (_m, n: string) => v[n] ?? '')

function el(tag: string, cls?: string, text?: string): HTMLElement {
  const e = document.createElement(tag)
  if (cls) e.className = cls
  if (text !== undefined) e.textContent = text
  return e
}

export function parseCode(path: string): string | null {
  const m = /^\/t\/([0-9A-Za-z]{20})\/?$/.exec(path)
  return m ? m[1].toUpperCase() : null
}

export function render(d: PublicTagPage, locale = lang) {
  const root = getRoot()
  const eur = (c: number) => new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(c / 100)
  const date = (s: string) => new Date(s).toLocaleDateString(locale)
  root.replaceChildren()
  root.append(el('h1', undefined, f('title')))
  root.append(el('div', 'n', String(d.balance_tokens)), el('div', undefined, f('tokens')))
  root.append(el('div', 'm', f('worth', { eur: eur(d.balance_cents ?? d.balance_tokens * d.token_price_cents) })))
  if (d.status === 'blocked') root.append(el('p', 'neg', '⛔ ' + f('blocked')))
  const card = el('div', 'c')
  card.append(el('strong', undefined, f('recent')))
  const ul = el('ul')
  if (!d.recent.length) ul.append(el('li', undefined, f('none')))
  for (const r of d.recent) {
    const li = el('li')
    const left = el('span', undefined, `${f(r.kind)}${r.stand_name ? ' · ' + r.stand_name : ''}`)
    const items = r.items?.map((i) => `${i.qty}× ${i.name}`).join(', ')
    if (items) left.append(el('div', 'm', items))
    li.append(left, el('span', r.delta_tokens < 0 ? 'neg' : 'pos', (r.delta_tokens > 0 ? '+' : '') + r.delta_tokens))
    ul.append(li)
  }
  card.append(ul)
  root.append(card)
  const ev = d.event
  const foot = el('div', 'm')
  foot.append(el('div', undefined, [ev.name, ev.organizer_name].filter(Boolean).join(' · ')))
  if (ev.policy_version) foot.append(el('div', undefined, f('policy', { v: ev.policy_version })))
  if (ev.refundable_until) foot.append(el('div', undefined, f('refundUntil', { d: date(ev.refundable_until) })))
  if (ev.expiry_at) foot.append(el('div', undefined, f('expires', { d: date(ev.expiry_at) })))
  if (ev.privacy_url && /^https:\/\//.test(ev.privacy_url)) {
    const a = el('a', undefined, f('privacy')) as HTMLAnchorElement
    a.href = ev.privacy_url
    a.rel = 'noopener noreferrer'
    foot.append(a)
  }
  root.append(foot)
}

async function main() {
  const root = getRoot()
  const code = parseCode(location.pathname)
  if (!code) return void root.replaceChildren(el('h1', undefined, f('notFound')))
  let doFetch: typeof fetch = fetch
  if (import.meta.env.VITE_API_MODE === 'mock' || (import.meta.env.DEV && import.meta.env.VITE_API_MODE !== 'real')) {
    doFetch = (await import('../api/mock')).mockFetch
  }
  try {
    const r = await doFetch(`${BASE}/public/tags/${code}`, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer' })
    if (r.status === 404) return void root.replaceChildren(el('h1', undefined, f('notFound')))
    if (!r.ok) throw new Error(String(r.status))
    render((await r.json()) as PublicTagPage)
  } catch {
    root.replaceChildren(el('p', undefined, f('error')))
  }
}
if (typeof document !== 'undefined' && !import.meta.env.VITEST) void main()
