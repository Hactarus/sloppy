import type { NdefRecord } from './types'

/** NDEF URI identifier codes (NFC Forum URI RTD). Only the ones that matter here are expanded. */
const URI_PREFIX = [
  '', 'http://www.', 'https://www.', 'http://', 'https://', 'tel:', 'mailto:',
]

export const TAG_CODE_RE = /^[0-9A-HJKMNP-TV-Z]{19}[0G]$/
export const UID_RE = /^([0-9A-F]{8}|[0-9A-F]{14}|[0-9A-F]{20})$/

/** Extract tag_code from `https://host/t/<code>` (also accepts a bare path or host without scheme). */
export function parseTagUrl(url: string): string | null {
  const m = /\/t\/([0-9A-Za-z]{20})(?:[/?#]|$)/.exec(url)
  if (!m) return null
  const code = m[1].toUpperCase()
  return TAG_CODE_RE.test(code) ? code : null
}

export function normalizeUid(raw: string): string {
  return raw.replace(/[^0-9a-fA-F]/g, '').toUpperCase()
}

/** Encode "04:a1:b2" / "04a1b2" / byte array -> upper-case hex. */
export function bytesToHex(bytes: ArrayLike<number>): string {
  return Array.from(bytes as ArrayLike<number> as number[], (x) => (x & 0xff).toString(16).padStart(2, '0')).join('').toUpperCase()
}

export function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

/** Decode one NDEF well-known URI record payload (first byte = identifier code). */
export function decodeUriPayload(payload: Uint8Array): string {
  const prefix = URI_PREFIX[payload[0]] ?? ''
  return prefix + new TextDecoder().decode(payload.subarray(1))
}

/** Parse a raw NDEF message (as stored in the TLV) into simple records. */
export function parseNdefMessage(msg: Uint8Array): NdefRecord[] {
  const out: NdefRecord[] = []
  let i = 0
  while (i < msg.length) {
    const hdr = msg[i++]
    const sr = (hdr & 0x10) !== 0
    const il = (hdr & 0x08) !== 0
    const tnf = hdr & 0x07
    const typeLen = msg[i++]
    let payLen: number
    if (sr) payLen = msg[i++]
    else {
      payLen = (msg[i] << 24) | (msg[i + 1] << 16) | (msg[i + 2] << 8) | msg[i + 3]
      i += 4
    }
    const idLen = il ? msg[i++] : 0
    const type = new TextDecoder().decode(msg.subarray(i, i + typeLen))
    i += typeLen + idLen
    const payload = msg.subarray(i, i + payLen)
    i += payLen
    if (tnf === 1 && type === 'U') out.push({ type: 'url', value: decodeUriPayload(payload) })
    else if (tnf === 1 && type === 'T') out.push({ type: 'text', value: new TextDecoder().decode(payload.subarray(1 + (payload[0] & 0x3f))) })
    else out.push({ type: 'unknown', value: bytesToHex(payload) })
    if (hdr & 0x40) break // ME
  }
  return out
}

/**
 * Build the NDEF message for one URI record using identifier code 0x04 ("https://") as in docs/nfc-tags.md.
 * `url` must start with https://.
 */
export function buildUriNdef(url: string): Uint8Array {
  if (!url.startsWith('https://')) throw new Error('only https:// URLs are written to tags')
  const rest = new TextEncoder().encode(url.slice('https://'.length))
  const payloadLen = 1 + rest.length
  if (payloadLen > 255) throw new Error('URL too long for a short record')
  const out = new Uint8Array(4 + payloadLen)
  out[0] = 0xd1 // MB ME SR TNF=1
  out[1] = 0x01
  out[2] = payloadLen
  out[3] = 0x55 // 'U'
  out[4] = 0x04
  out.set(rest, 5)
  return out
}

/** Wrap an NDEF message in the Type 2 TLV: 03 <len> <msg> FE (short length form < 255). */
export function wrapTlv(msg: Uint8Array): Uint8Array {
  if (msg.length >= 0xff) throw new Error('message too long for short TLV')
  const out = new Uint8Array(msg.length + 3)
  out[0] = 0x03
  out[1] = msg.length
  out.set(msg, 2)
  out[out.length - 1] = 0xfe
  return out
}

/** Capability container byte 2 (size/8) per chip, see docs/nfc-tags.md. */
export const CC_SIZE_BYTE: Record<string, number> = { ntag213: 0x12, ntag215: 0x3e, ntag216: 0x6d }

export function toNfcTag(uid: string, records: NdefRecord[], extra: { chipType?: any; signature?: string | null } = {}) {
  const url = records.find((r) => r.type === 'url')
  return { uid: normalizeUid(uid), records, tagCode: url ? parseTagUrl(url.value) : null, ...extra }
}
