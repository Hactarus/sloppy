import { NfcError, type NfcService, type NfcTag, type WriteOptions } from './types'
import { buildUriNdef, normalizeUid, toNfcTag } from './ndef'

/* Minimal Web NFC typings (not in lib.dom). */
interface WebNdefRecord { recordType: string; data?: DataView; encoding?: string }
interface WebNdefReadingEvent extends Event { serialNumber: string; message: { records: WebNdefRecord[] } }
interface WebNdefReader extends EventTarget {
  scan(o?: { signal?: AbortSignal }): Promise<void>
  write(msg: { records: { recordType: string; data: string }[] }, o?: { signal?: AbortSignal; overwrite?: boolean }): Promise<void>
}
declare const NDEFReader: { new (): WebNdefReader } | undefined

function decodeRecords(records: WebNdefRecord[]) {
  const dec = new TextDecoder()
  return records.map((r) => {
    const text = r.data ? dec.decode(r.data) : ''
    if (r.recordType === 'url') return { type: 'url' as const, value: text }
    if (r.recordType === 'text') return { type: 'text' as const, value: text }
    return { type: 'unknown' as const, value: text }
  })
}

export class WebNfcService implements NfcService {
  readonly kind = 'web' as const
  /** Web NFC: no raw commands => no PWD_AUTH, no READ_SIG; UID is the serialNumber. */
  readonly capabilities = { read: true, write: true, uid: true, pwdAuth: false }

  async isAvailable() {
    return typeof NDEFReader !== 'undefined' && window.isSecureContext
  }

  readTag(signal?: AbortSignal, _opts?: { keep?: boolean }): Promise<NfcTag> {
    if (typeof NDEFReader === 'undefined') return Promise.reject(new NfcError('UNSUPPORTED'))
    const reader = new NDEFReader()
    const ctl = new AbortController()
    signal?.addEventListener('abort', () => ctl.abort())
    return new Promise<NfcTag>((resolve, reject) => {
      const done = () => ctl.abort()
      reader.addEventListener('reading', (e) => {
        const ev = e as WebNdefReadingEvent
        done()
        resolve(toNfcTag(normalizeUid(ev.serialNumber ?? ''), decodeRecords(ev.message.records)))
      })
      reader.addEventListener('readingerror', () => {
        done()
        reject(new NfcError('READ_FAILED'))
      })
      ctl.signal.addEventListener('abort', () => {
        if (signal?.aborted) reject(new NfcError('CANCELLED'))
      })
      reader.scan({ signal: ctl.signal }).catch((err: Error) => {
        reject(new NfcError(err.name === 'NotAllowedError' ? 'PERMISSION' : 'READ_FAILED', err.message))
      })
    })
  }

  async writeTag(opts: WriteOptions, signal?: AbortSignal) {
    if (typeof NDEFReader === 'undefined') throw new NfcError('UNSUPPORTED')
    buildUriNdef(opts.url) // validates https + length
    const tag = await this.readTag(signal) // identify the chip first (UID needed by caller)
    const w = new NDEFReader()
    try {
      await w.write({ records: [{ recordType: 'url', data: opts.url }] }, { signal, overwrite: true })
    } catch (e) {
      throw new NfcError('WRITE_FAILED', (e as Error).message)
    }
    // Read back: scan again, tag is usually still in the field.
    const back = new AbortController()
    const timer = setTimeout(() => back.abort(), 2500)
    let readbackOk = false
    let after: NfcTag = tag
    try {
      after = await this.readTag(back.signal)
      readbackOk = after.records.some((r) => r.type === 'url' && r.value.replace(/^https:\/\//, '') === opts.url.replace(/^https:\/\//, ''))
    } catch {
      readbackOk = false
    } finally {
      clearTimeout(timer)
    }
    return { tag: after.uid ? after : tag, readbackOk, passwordProtected: false }
  }
}
