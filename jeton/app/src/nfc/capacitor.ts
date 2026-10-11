import { registerPlugin } from '@capacitor/core'
import { NfcError, type NfcService, type NfcTag, type WriteOptions } from './types'
import { bytesToHex, hexToBytes, parseNdefMessage, toNfcTag } from './ndef'

/** Contract of the Kotlin plugin in android-plugins/nfc (class JetonNfcPlugin, name "JetonNfc"). */
export interface JetonNfcPlugin {
  isAvailable(): Promise<{ available: boolean; enabled: boolean }>
  /** Enables reader mode and resolves on the next tag. Rejects with code CANCELLED after cancel(). */
  readTag(): Promise<RawTag>
  cancel(): Promise<void>
  /** Waits for a tag, writes NDEF URI (0x04 prefix), reads back, optionally applies NTAG protection. */
  writeUri(o: { url: string; protection?: { pwd: string; pack: string; auth0: number; prot: number; authlim?: number } | null }): Promise<
    RawTag & { readbackOk: boolean; passwordProtected: boolean }
  >
}

export interface RawTag {
  uid: string // hex
  chipType?: string
  signature?: string | null
  /** Raw NDEF message bytes (hex) as stored on the tag, empty if none. */
  ndefHex: string
}

export const JetonNfc = registerPlugin<JetonNfcPlugin>('JetonNfc')

function toTag(r: RawTag): NfcTag {
  const records = r.ndefHex ? parseNdefMessage(hexToBytes(r.ndefHex)) : []
  return toNfcTag(r.uid, records, { chipType: r.chipType as NfcTag['chipType'], signature: r.signature ?? null })
}

export class CapacitorNfcService implements NfcService {
  readonly kind = 'capacitor' as const
  readonly capabilities = { read: true, write: true, uid: true, pwdAuth: true }

  async isAvailable() {
    try {
      const r = await JetonNfc.isAvailable()
      return r.available && r.enabled
    } catch {
      return false
    }
  }

  async readTag(signal?: AbortSignal, _opts?: { keep?: boolean }): Promise<NfcTag> {
    const onAbort = () => void JetonNfc.cancel()
    signal?.addEventListener('abort', onAbort)
    try {
      return toTag(await JetonNfc.readTag())
    } catch (e) {
      const code = (e as { code?: string }).code
      throw new NfcError(code === 'CANCELLED' || signal?.aborted ? 'CANCELLED' : 'READ_FAILED', (e as Error).message)
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }

  async writeTag(opts: WriteOptions, signal?: AbortSignal) {
    const onAbort = () => void JetonNfc.cancel()
    signal?.addEventListener('abort', onAbort)
    try {
      const r = await JetonNfc.writeUri({ url: opts.url, protection: opts.protection ?? null })
      return { tag: toTag(r), readbackOk: r.readbackOk, passwordProtected: r.passwordProtected }
    } catch (e) {
      throw new NfcError(signal?.aborted ? 'CANCELLED' : 'WRITE_FAILED', (e as Error).message)
    } finally {
      signal?.removeEventListener('abort', onAbort)
    }
  }
}

export { bytesToHex }
