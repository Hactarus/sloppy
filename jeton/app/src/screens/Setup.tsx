import { useState } from 'react'
import { api, asApiError } from '../api/client'
import { useApp } from '../app/state'
import { errorText, useI18n } from '../i18n'

export function Setup() {
  const { t, lang } = useI18n()
  const app = useApp()
  const [code, setCode] = useState('')
  const [name, setName] = useState('Terminal')
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true); setErr(null)
    try {
      const r = await api.POST('/auth/devices/enroll', { body: { enrollment_code: code.toUpperCase().trim(), device_name: name, platform: /android/i.test(navigator.userAgent) ? 'android' : 'web', app_version: '1.0.0' } })
      if (r.data) app.setDevice({ device_id: r.data.device_id, device_token: r.data.device_token, event_id: r.data.event_id, stand_id: r.data.stand_id ?? null, kind: r.data.kind, training: r.data.training })
      else setErr(errorText(lang, asApiError(r.error)))
    } catch { setErr(t('err.network')) }
    setBusy(false)
  }
  return (
    <form className="panel" onSubmit={submit}>
      <h1>{t('setup.title')}</h1>
      <label>{t('setup.code')}<input autoFocus value={code} maxLength={8} autoCapitalize="characters" onChange={(e) => setCode(e.target.value)} /></label>
      <label>{t('setup.name')}<input value={name} onChange={(e) => setName(e.target.value)} /></label>
      {err && <p className="error" role="alert">✖ {err}</p>}
      <button className="btn pay" disabled={busy || code.trim().length !== 8}>{t('setup.go')}</button>
      <p className="muted">mock API codes: C... cash desk, A... console, X... training, other = waiter. PINs: Anna 1111, Bob 2222, Admin 9999</p>
    </form>
  )
}
