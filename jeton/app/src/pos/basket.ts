import type { Item } from '../api/types'

/** Pure basket logic: itemId -> qty. All amounts are integer tokens. */
export type Lines = Readonly<Record<string, number>>
export interface Basket { lines: Lines; tip: number }

export const MAX_QTY = 99
export const emptyBasket = (): Basket => ({ lines: {}, tip: 0 })

export function add(b: Basket, id: string, n = 1): Basket {
  const q = Math.min(MAX_QTY, (b.lines[id] ?? 0) + n)
  return { ...b, lines: { ...b.lines, [id]: q } }
}

export function dec(b: Basket, id: string): Basket {
  const q = (b.lines[id] ?? 0) - 1
  return setQty(b, id, q)
}

export function setQty(b: Basket, id: string, qty: number): Basket {
  const q = Math.max(0, Math.min(MAX_QTY, Math.floor(qty)))
  const lines = { ...b.lines }
  if (q === 0) delete lines[id]
  else lines[id] = q
  return { ...b, lines }
}

export const clear = (): Basket => emptyBasket()

export function itemsTotal(b: Basket, items: readonly Pick<Item, 'id' | 'price_tokens'>[]): number {
  const price = new Map(items.map((i) => [i.id, i.price_tokens]))
  let t = 0
  for (const [id, q] of Object.entries(b.lines)) t += (price.get(id) ?? 0) * q
  return t
}

export const count = (b: Basket) => Object.values(b.lines).reduce((a, q) => a + q, 0)
export const isEmpty = (b: Basket) => count(b) === 0

export interface TipRules { enabled: boolean; maxTokens: number; maxPercent: number }

/** Largest tip allowed for an items total (caps: tip_max_tokens and tip_max_percent of the order). */
export function maxTip(itemsTokens: number, r: TipRules): number {
  if (!r.enabled) return 0
  return Math.max(0, Math.min(r.maxTokens, Math.floor((itemsTokens * r.maxPercent) / 100)))
}

/** Toggle a preset: pressing the active one clears it (tip is never pre-selected, default 0). */
export function toggleTip(b: Basket, value: number): Basket {
  return { ...b, tip: b.tip === value ? 0 : value }
}

/** Re-apply caps after the basket changed (tip silently reduced to the allowed maximum). */
export function clampTip(b: Basket, itemsTokens: number, r: TipRules): Basket {
  const m = maxTip(itemsTokens, r)
  return b.tip > m ? { ...b, tip: m } : b
}

export const totalTokens = (b: Basket, items: readonly Pick<Item, 'id' | 'price_tokens'>[]) => itemsTotal(b, items) + b.tip

export function toOrderLines(b: Basket, order: readonly string[]): { item_id: string; qty: number }[] {
  const idx = new Map(order.map((id, i) => [id, i]))
  return Object.entries(b.lines)
    .sort(([a], [c]) => (idx.get(a) ?? 1e9) - (idx.get(c) ?? 1e9))
    .map(([item_id, qty]) => ({ item_id, qty }))
}

/** Drop lines whose item no longer exists/active (after a catalog refresh). Returns the new basket and whether anything changed. */
export function pruneUnavailable(b: Basket, items: readonly Pick<Item, 'id' | 'active'>[]): { basket: Basket; changed: boolean } {
  const ok = new Set(items.filter((i) => i.active !== false).map((i) => i.id))
  const lines = Object.fromEntries(Object.entries(b.lines).filter(([id]) => ok.has(id)))
  const changed = Object.keys(lines).length !== Object.keys(b.lines).length
  return { basket: changed ? { ...b, lines } : b, changed }
}

export function fromOrderLines(lines: { item_id: string; qty: number }[], tip = 0): Basket {
  return { lines: Object.fromEntries(lines.map((l) => [l.item_id, l.qty])), tip }
}

export function needsAgeCheck(b: Basket, items: readonly Pick<Item, 'id' | 'min_age'>[]): number | null {
  let max: number | null = null
  const byId = new Map(items.map((i) => [i.id, i]))
  for (const id of Object.keys(b.lines)) {
    const a = byId.get(id)?.min_age
    if (a && (max === null || a > max)) max = a
  }
  return max
}
