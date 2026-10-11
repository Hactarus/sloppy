import { uuidv7 } from './uuid'

describe('uuidv7', () => {
  it('has version 7 and RFC variant', () => {
    const u = uuidv7()
    expect(u).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })
  it('embeds the timestamp and sorts by time', () => {
    const a = uuidv7(1_700_000_000_000)
    const b = uuidv7(1_700_000_000_001)
    expect(a.replace(/-/g, '').slice(0, 12)).toBe((1_700_000_000_000).toString(16).padStart(12, '0'))
    expect(a < b).toBe(true)
  })
  it('is unique', () => {
    const s = new Set(Array.from({ length: 1000 }, () => uuidv7()))
    expect(s.size).toBe(1000)
  })
})
