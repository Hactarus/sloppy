import * as B from './basket'

const items = [
  { id: 'a', price_tokens: 1, active: true, min_age: 16 },
  { id: 'b', price_tokens: 3, active: true },
  { id: 'c', price_tokens: 2, active: false },
]
const rules: B.TipRules = { enabled: true, maxTokens: 10, maxPercent: 50 }

describe('basket', () => {
  it('one tap = +1, badge tap = -1, removes at zero', () => {
    let b = B.emptyBasket()
    b = B.add(b, 'a'); b = B.add(b, 'a'); b = B.add(b, 'b')
    expect(b.lines).toEqual({ a: 2, b: 1 })
    b = B.dec(b, 'a'); expect(b.lines.a).toBe(1)
    b = B.dec(b, 'a'); expect(b.lines).toEqual({ b: 1 })
    b = B.dec(b, 'zzz'); expect(b.lines).toEqual({ b: 1 })
  })
  it('is immutable', () => {
    const b0 = B.emptyBasket(); const b1 = B.add(b0, 'a')
    expect(b0.lines).toEqual({}); expect(b1).not.toBe(b0)
  })
  it('setQty clamps to 0..99 and floors', () => {
    expect(B.setQty(B.emptyBasket(), 'a', 150).lines.a).toBe(99)
    expect(B.setQty(B.add(B.emptyBasket(), 'a'), 'a', 0).lines).toEqual({})
    expect(B.setQty(B.emptyBasket(), 'a', -3).lines).toEqual({})
    expect(B.setQty(B.emptyBasket(), 'a', 2.9).lines.a).toBe(2)
    expect(B.add(B.setQty(B.emptyBasket(), 'a', 99), 'a').lines.a).toBe(99)
  })
  it('totals are integer tokens incl. tip, unknown items count 0', () => {
    let b = B.setQty(B.setQty(B.emptyBasket(), 'a', 2), 'b', 2)
    expect(B.itemsTotal(b, items)).toBe(8)
    b = { ...b, tip: 2 }
    expect(B.totalTokens(b, items)).toBe(10)
    expect(B.itemsTotal(B.add(B.emptyBasket(), 'ghost'), items)).toBe(0)
  })
  it('tip is never pre-selected, toggles, and respects tokens/percent caps', () => {
    expect(B.emptyBasket().tip).toBe(0)
    let b = B.toggleTip(B.emptyBasket(), 1); expect(b.tip).toBe(1)
    b = B.toggleTip(b, 1); expect(b.tip).toBe(0)
    expect(B.maxTip(1, rules)).toBe(0) // 50% of 1 token floors to 0
    expect(B.maxTip(4, rules)).toBe(2)
    expect(B.maxTip(100, rules)).toBe(10)
    expect(B.maxTip(100, { ...rules, enabled: false })).toBe(0)
  })
  it('clampTip lowers the tip when the basket shrinks', () => {
    const b = { lines: { a: 4 }, tip: 2 }
    const smaller = B.dec(B.dec(b, 'a'), 'a')
    expect(B.clampTip(smaller, B.itemsTotal(smaller, items), rules).tip).toBe(1)
  })
  it('order lines follow display order; repeat-last roundtrip', () => {
    const b = B.setQty(B.setQty(B.emptyBasket(), 'b', 1), 'a', 3)
    const lines = B.toOrderLines(b, ['a', 'b'])
    expect(lines).toEqual([{ item_id: 'a', qty: 3 }, { item_id: 'b', qty: 1 }])
    expect(B.fromOrderLines(lines).lines).toEqual(b.lines)
    expect(B.fromOrderLines(lines).tip).toBe(0)
  })
  it('prunes inactive/removed items', () => {
    const b = B.setQty(B.setQty(B.emptyBasket(), 'a', 1), 'c', 1)
    const r = B.pruneUnavailable(b, items)
    expect(r.changed).toBe(true); expect(r.basket.lines).toEqual({ a: 1 })
    expect(B.pruneUnavailable(r.basket, items).changed).toBe(false)
  })
  it('age check returns the highest min age in the basket', () => {
    expect(B.needsAgeCheck(B.add(B.emptyBasket(), 'b'), items)).toBeNull()
    expect(B.needsAgeCheck(B.add(B.add(B.emptyBasket(), 'b'), 'a'), items)).toBe(16)
  })
})
