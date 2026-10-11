/** One NFC abstraction for Web NFC, the Capacitor plugin and the desktop mock. */
export interface NdefRecord {
  /** 'url' for well-known URI records (already expanded with the identifier code), 'text', or 'unknown' */
  type: 'url' | 'text' | 'unknown'
  value: string
}

export interface NfcTag {
  /** Hardware UID, upper-case hex without separators (4, 7 or 10 bytes). May be '' with Web NFC on old Chrome. */
  uid: string
  records: NdefRecord[]
  /** Convenience: the tag_code parsed from the first Jeton URL record, if any. */
  tagCode: string | null
  chipType?: 'ntag213' | 'ntag215' | 'ntag216' | 'ntag424dna' | 'mifare_ultralight' | 'other'
  /** NXP originality signature (hex, 64 chars) when the platform could read it. */
  signature?: string | null
}

export interface ProtectionParams {
  pwd: string
  pack: string
  auth0: number
  prot: number
  authlim?: number
}

export interface WriteOptions {
  /** Absolute URL to write (use exactly EnrollTagResponse.ndef_url). */
  url: string
  /** NTAG password protection; only the native plugin can apply it. */
  protection?: ProtectionParams | null
}

export interface WriteResult {
  readbackOk: boolean
  passwordProtected: boolean
}

export interface NfcCapabilities {
  read: boolean
  write: boolean
  /** UID is available (Web NFC: partially) */
  uid: boolean
  pwdAuth: boolean
}

export type NfcErrorCode = 'UNSUPPORTED' | 'CANCELLED' | 'READ_FAILED' | 'WRITE_FAILED' | 'TIMEOUT' | 'PERMISSION'
export class NfcError extends Error {
  constructor(public code: NfcErrorCode, message?: string) {
    super(message ?? code)
  }
}

export interface NfcService {
  readonly kind: 'web' | 'capacitor' | 'mock'
  readonly capabilities: NfcCapabilities
  isAvailable(): Promise<boolean>
  /** `keep`: the tag will be written next, so keep it selected/in the field (mock only; real readers just re-discover the tag in the field). */
  /** Resolves with the next tag presented. Reject with NfcError('CANCELLED') when `signal` aborts. */
  readTag(signal?: AbortSignal, opts?: { keep?: boolean }): Promise<NfcTag>
  /** Wait for a tag and write the URL record (+ optional protection), then read it back. */
  writeTag(opts: WriteOptions, signal?: AbortSignal): Promise<{ tag: NfcTag } & WriteResult>
}
