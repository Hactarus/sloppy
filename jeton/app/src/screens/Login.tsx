import { useEffect, useState } from 'react'
import { api, asApiError } from '../api/client'
import { useApp } from '../app/state'
import type { StaffPublic } from '../api/types'
import { errorText, useI18n } from '../i18n'

export function Login() {
  const { t, lang } = useI18n()
  const app = useApp()
  const [staff, setStaff] = useState<StaffPublic[]>([])
  const [sel, setSel] = useState<StaffPublic | null>(null)
  const [pin, setPin] = useState('')
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    api.GET('/auth/staff').then((r) => r.data && setStaff(r.data.items)).catch(() => setErr(t('err.network')))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const submit = async (p: string) => {
    if (!sel) return
    setErr(null)
    try {
      const r = await api.POST('/auth/login', { body: { staff_id: sel.id, pin: p } })
      if (r.data) app.login({ jwt: r.data.access_token, expires_at: r.data.expires_at, session: r.data.session })
      else { setErr(errorText(lang, asApiError(r.error))); setPin('') }
    } catch { setErr(t('err.network')) }
  }
  const press = (d: string) => {
    const p = (pin + d).slice(0, 8)
    setPin(p)
  }

  if (!sel) {
    return (
      <div className="panel">
        <h1>{t('login.title')}</h1>
        {staff.map((s) => <button key={s.id} className="btn sec big" onClick={() => setSel(s)}>{s.display_name} <small>{t(`role.${s.role}` as 'role.admin')}</small></button>)}
        {err && <p className="error" role="alert">✖ {err}</p>}
        <button className="btn link" onClick={() => app.setDevice(null)}>{t('login.reset')}</button>
      </div>
    )
  }
  return (
    <div className="panel">
      <h1>{sel.display_name}</h1>
      <div className="pin" aria-label={t('login.pin')} data-testid="pin">{'●'.repeat(pin.length) || '—'}</div>
      <div className="numpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} className="btn sec" onClick={() => press(d)}>{d}</button>)}
        <button className="btn sec" onClick={() => { setSel(null); setPin('') }}>←</button>
        <button className="btn sec" onClick={() => press('0')}>0</button>
        <button className="btn pay" disabled={pin.length < 4} onClick={() => void submit(pin)}>{t('login.go')}</button>
      </div>
      {err && <p className="error" role="alert">✖ {err}</p>}
    </div>
  )
}
