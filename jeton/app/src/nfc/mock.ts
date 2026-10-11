import { NfcError, type NfcService, type NfcTag, type WriteOptions } from './types'
import { parseTagUrl, toNfcTag } from './ndef'

export interface MockChip { uid: string; url: string | null }

/**
 * Desktop mock. A tap is simulated with `tap()` or the keyboard (see installKeyboard):
 * digits 1..9 tap the Nth fake chip, `n` taps a brand-new blank chip, `x` taps a chip whose UID does not match its URL (clone test).
 */
export class MockNfcService implements NfcService {
  readonly kind = 'mock' as const
  readonly capabilities = { read: true, write: true, uid: true, pwdAuth: true }
  private waiters: ((c: MockChip) => void)[] = []
  /** Chip currently in the field (like a tag resting on the phone) for FIELD_MS; consumed by reads/writes. */
  private field: MockChip | null = null
  private fieldTimer?: ReturnType<typeof setTimeout>
  static FIELD_MS = 4000
  private blankCounter = 0

  constructor(public chips: MockChip[]) {}

  async isAvailable() { return true }

  /** Present a chip to the reader. If nobody waits, the tap is dropped (like a real reader). */
  tap(chip: MockChip) {
    const w = this.waiters.shift()
    if (w) { w(chip); this.holdField(chip) }
  }
  private holdField(chip: MockChip) {
    this.field = chip
    clearTimeout(this.fieldTimer)
    this.fieldTimer = setTimeout(() => (this.field = null), MockNfcService.FIELD_MS)
  }
  release() { this.field = null; clearTimeout(this.fieldTimer) }
  tapIndex(i: number) { if (this.chips[i]) this.tap(this.chips[i]) }
  tapBlank() {
    this.blankCounter++
    const uid = '04' + (0xb1a000 + this.blankCounter).toString(16).toUpperCase().padStart(6, '0') + '5A7C81'
    const chip = { uid, url: null }
    this.chips.push(chip)
    this.tap(chip)
  }
  get waiting() { return this.waiters.length }

  private wait(signal?: AbortSignal): Promise<MockChip> {
    if (this.field && !signal?.aborted) return Promise.resolve(this.field)
    return new Promise((resolve, reject) => {
      const w = (c: MockChip) => resolve(c)
      this.waiters.push(w)
      signal?.addEventListener('abort', () => {
        this.waiters = this.waiters.filter((x) => x !== w)
        reject(new NfcError('CANCELLED'))
      })
      if (signal?.aborted) {
        this.waiters = this.waiters.filter((x) => x !== w)
        reject(new NfcError('CANCELLED'))
      }
    })
  }

  private toTag(c: MockChip): NfcTag {
    return toNfcTag(c.uid, c.url ? [{ type: 'url', value: c.url }] : [], { chipType: 'ntag215', signature: '00'.repeat(32) })
  }

  async readTag(signal?: AbortSignal, opts?: { keep?: boolean }) {
    const c = await this.wait(signal)
    if (!opts?.keep) this.release()
    return this.toTag(c)
  }

  async writeTag(opts: WriteOptions, signal?: AbortSignal) {
    const chip = await this.wait(signal)
    if (!parseTagUrl(opts.url)) throw new NfcError('WRITE_FAILED', 'not a jeton url')
    chip.url = opts.url
    this.release()
    return { tag: this.toTag(chip), readbackOk: true, passwordProtected: !!opts.protection }
  }

  /** Install global key handler; returns a disposer. */
  installKeyboard(target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window) {
    const h = (e: Event) => {
      const k = (e as KeyboardEvent).key
      const el = (e as KeyboardEvent).target as HTMLElement | null
      if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return
      if (/^[1-9]$/.test(k)) this.tapIndex(Number(k) - 1)
      else if (k === 'n') this.tapBlank()
      else if (k === 'x' && this.chips[0]) this.tap({ uid: '04DEADBEEF0000', url: this.chips[0].url })
    }
    target.addEventListener('keydown', h)
    return () => target.removeEventListener('keydown', h)
  }
}
