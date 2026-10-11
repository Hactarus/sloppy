/** UUIDv7 (RFC 9562): 48-bit unix ms timestamp + 74 random bits. Used for every client_tx_id. */
export function uuidv7(now: number = Date.now(), rnd?: Uint8Array): string {
  const b = rnd ?? crypto.getRandomValues(new Uint8Array(16))
  let t = now
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256
    t = Math.floor(t / 256)
  }
  b[6] = (b[6] & 0x0f) | 0x70
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}
