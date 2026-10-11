import { buildUriNdef, wrapTlv, parseNdefMessage, parseTagUrl, normalizeUid, bytesToHex, hexToBytes, decodeUriPayload, TAG_CODE_RE, UID_RE } from './ndef'

const CODE = '0123456789ABCDEFGHJ0'

describe('tag url / uid parsing', () => {
  it('extracts tag_code from the NDEF URL', () => {
    expect(parseTagUrl(`https://jeton.example/t/${CODE}`)).toBe(CODE)
    expect(parseTagUrl(`jeton.example/t/${CODE.toLowerCase()}`)).toBe(CODE)
    expect(parseTagUrl(`https://jeton.example/t/${CODE}?x=1`)).toBe(CODE)
  })
  it('rejects foreign or malformed urls (last char must be 0 or G, no I L O U)', () => {
    expect(parseTagUrl('https://example.com/')).toBeNull()
    expect(parseTagUrl('https://jeton.example/t/0123456789ABCDEFGHJ1')).toBeNull()
    expect(parseTagUrl('https://jeton.example/t/0123456789ABCDEFGHIL')).toBeNull()
    expect(parseTagUrl('https://jeton.example/t/SHORT')).toBeNull()
    expect(TAG_CODE_RE.test('1234567890ABCDEFGHJG')).toBe(true)
  })
  it('normalizes Web NFC serial numbers', () => {
    expect(normalizeUid('04:a1:b2:c3:d4:e5:f6')).toBe('04A1B2C3D4E5F6')
    expect(UID_RE.test(normalizeUid('04:a1:b2:c3:d4:e5:f6'))).toBe(true)
    expect(UID_RE.test('04A1')).toBe(false)
  })
  it('hex helpers roundtrip', () => {
    expect(bytesToHex([4, 0xa1, 255])).toBe('04A1FF')
    expect(Array.from(hexToBytes('04A1FF'))).toEqual([4, 0xa1, 255])
  })
})

describe('NDEF URI record (docs/nfc-tags.md section 2)', () => {
  const url = `https://jeton.example/t/${CODE}`
  it('builds D1 01 <len> 55 04 <rest>', () => {
    const m = buildUriNdef(url)
    expect(Array.from(m.slice(0, 5))).toEqual([0xd1, 0x01, 1 + (url.length - 8), 0x55, 0x04])
    expect(new TextDecoder().decode(m.slice(5))).toBe(`jeton.example/t/${CODE}`)
  })
  it('payload length = 1 + 36 for jeton.example/t/<code> (docs/nfc-tags.md says 37+1, off by one)', () => {
    expect(buildUriNdef(url)[2]).toBe(37)
  })
  it('wraps in TLV 03 <len> ... FE', () => {
    const m = buildUriNdef(url)
    const t = wrapTlv(m)
    expect(t[0]).toBe(0x03); expect(t[1]).toBe(m.length); expect(t[t.length - 1]).toBe(0xfe)
  })
  it('parses back to the same https URL', () => {
    const recs = parseNdefMessage(buildUriNdef(url))
    expect(recs).toEqual([{ type: 'url', value: url }])
  })
  it('rejects non-https and over-long urls', () => {
    expect(() => buildUriNdef('http://x/t/1')).toThrow()
    expect(() => buildUriNdef('https://' + 'a'.repeat(300))).toThrow()
  })
  it('decodes other identifier codes', () => {
    expect(decodeUriPayload(new Uint8Array([0x03, ...new TextEncoder().encode('a.b')]))).toBe('http://a.b')
  })
  it('parses a text record and ignores unknown', () => {
    const text = new Uint8Array([0xd1, 0x01, 0x04, 0x54, 0x02, 0x65, 0x6e, 0x68]) // "h", lang "en"
    expect(parseNdefMessage(text)).toEqual([{ type: 'text', value: 'h' }])
  })
})
