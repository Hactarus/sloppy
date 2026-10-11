import { useCallback, useEffect, useRef, useState } from 'react'
import { api, asApiError } from '../api/client'
import { useApp } from '../app/state'
import { errorText, useI18n } from '../i18n'
import { uuidv7 } from '../lib/uuid'
import { feedback } from '../lib/feedback'
import { NfcError } from '../nfc/types'

function toProtection(p: { pwd?: string; pack?: string; auth0?: number; prot?: number; authlim?: number } | undefined | null) {
  return p && p.pwd && p.pack ? { pwd: p.pwd, pack: p.pack, auth0: p.auth0 ?? 4, prot: p.prot ?? 0, authlim: p.authlim } : null
}

type Step = 'read' | 'register' | 'write' | 'verify' | 'confirm'
interface Entry { code: string; ok: boolean; note?: string }

export function Enroll() {
  const { t, lang } = useI18n()
  const { nfc, catalog } = useApp()
  const [target, setTarget] = useState(1000)
  const [done, setDone] = useState(0)
  const [running, setRunning] = useState(false)
  const [step, setStep] = useState<Step | null>(null)
  const [log, setLog] = useState<Entry[]>([])
  const [warn, setWarn] = useState(false)
  const stop = useRef<AbortController | null>(null)
  const fails = useRef(new Map<string, number>())

  // Start the counter at the number of already active tags of the event.
  useEffect(() => {
    const ev = catalog?.event.id
    if (!ev) return
    let n = 0
    void (async () => {
      let cursor: string | undefined
      for (let i = 0; i < 20; i++) {
        const r = await api.GET('/events/{event_id}/tags', { params: { path: { event_id: ev }, query: { limit: 200, cursor } } }).catch(() => null)
        if (!r?.data) return
        n += r.data.items.filter((x) => x.tag_status === 'active').length
        if (!r.data.next_cursor) break
        cursor = r.data.next_cursor
      }
      setDone(n)
    })()
  }, [catalog?.event.id])

  const one = useCallback(async (signal: AbortSignal) => {
    setStep('read')
    const tag = await nfc.readTag(signal, { keep: true })
    if (!tag.uid) throw new Error('NO_UID')
    setStep('register')
    const reg = await api.POST('/tags/enroll', { body: { client_tx_id: uuidv7(), uid: tag.uid, chip_type: tag.chipType ?? 'other', signature: tag.signature ?? null } })
    if (!reg.data) {
      const e = asApiError(reg.error)
      setLog((l) => [{ code: tag.uid.slice(-4), ok: false, note: errorText(lang, e) }, ...l])
      return false
    }
    const key = reg.data.tag_code
    setStep('write')
    const w = await nfc.writeTag({ url: reg.data.ndef_url, protection: toProtection(reg.data.protection) }, signal)
    setStep('verify')
    if (w.tag.uid !== tag.uid || !w.readbackOk) {
      const n = (fails.current.get(key) ?? 0) + 1
      fails.current.set(key, n)
      setLog((l) => [{ code: key.slice(-4), ok: false, note: n >= 2 ? t('enroll.reject') : t('enroll.fail') }, ...l])
      return false
    }
    setStep('confirm')
    const c = await api.POST('/tags/{tag_code}/confirm', { params: { path: { tag_code: key } }, body: { client_tx_id: uuidv7(), uid: tag.uid, readback_ok: true, password_protected: w.passwordProtected } })
    if (!c.data) {
      setLog((l) => [{ code: key.slice(-4), ok: false, note: errorText(lang, asApiError(c.error)) }, ...l])
      return false
    }
    if (reg.data.protection && !w.passwordProtected) setWarn(true)
    setLog((l) => [{ code: key.slice(-4), ok: true }, ...l].slice(0, 30))
    return true
  }, [nfc, lang, t])

  const loop = async () => {
    const ctl = new AbortController()
    stop.current = ctl
    setRunning(true)
    let count = done
    while (!ctl.signal.aborted && count < target) {
      try {
        const ok = await one(ctl.signal)
        if (ok) { count++; setDone(count); feedback.success() } else feedback.failure()
      } catch (e) {
        if (e instanceof NfcError && e.code === 'CANCELLED') break
        feedback.failure()
        setLog((l) => [{ code: '----', ok: false, note: (e as Error).message }, ...l])
        await new Promise((r) => setTimeout(r, 500))
      }
    }
    setRunning(false)
    setStep(null)
  }
  const pause = () => stop.current?.abort()
  useEffect(() => () => stop.current?.abort(), [])

  const pct = Math.min(100, Math.round((done / target) * 100))
  return (
    <div className="panel enroll">
      <h2>{t('enroll.title')}</h2>
      <div className="counter huge" data-testid="counter">{done} / {target}</div>
      <div className="bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${pct}%` }} /></div>
      <p className="big" data-testid="stepline">{running ? (step ? t(`enroll.step.${step}` as 'enroll.step.read') : t('enroll.next')) : ''}</p>
      {warn && <p className="notice">⚠ {t('enroll.noPwd')}</p>}
      <label>{t('enroll.target')}<input inputMode="numeric" value={target} disabled={running} onChange={(e) => setTarget(Number(e.target.value.replace(/\D/g, '')) || 0)} className="narrow" /></label>
      {running ? <button className="btn sec" onClick={pause}>{t('enroll.pause')}</button> : <button className="btn pay" onClick={() => void loop()}>{t('enroll.start')}</button>}
      <h3>{t('enroll.last')}</h3>
      <ul className="log">{log.map((e, i) => <li key={i} className={e.ok ? 'okc' : 'koc'}>{e.ok ? '✔' : '✖'} …{e.code} {e.ok ? t('enroll.ok') : e.note}</li>)}</ul>
    </div>
  )
}
