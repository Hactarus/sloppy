import { lazy, Suspense, useState } from 'react'
import { useApp, apiMode } from '../app/state'
import { LANGS, setLang, useI18n } from '../i18n'
import { storage } from '../api/storage'
import { Pos } from '../pos/Pos'
const Cashier = lazy(() => import('./Cashier').then((m) => ({ default: m.Cashier })))
const Enroll = lazy(() => import('./Enroll').then((m) => ({ default: m.Enroll })))
const Admin = lazy(() => import('./Admin').then((m) => ({ default: m.Admin })))

type Screen = 'pos' | 'cashier' | 'enroll' | 'admin'

export function SyncPill() {
  const { t } = useI18n()
  const { status, syncNow } = useApp()
  let txt: string | null = null
  let cls = 'warn'
  if (status.syncing) { txt = t('pill.syncing') }
  else if (status.rejected > 0) { txt = '⚠ ' + t('pill.rejected', { n: status.rejected }); cls = 'bad' }
  else if (!status.online) { txt = '☁✖ ' + (status.pending ? t('pill.offline', { n: status.pending }) : t('pill.offlineEmpty')) }
  else if (status.pending > 0) { txt = '☁ ' + t('pill.pending', { n: status.pending }) }
  if (!txt) return null
  return <button className={`pill ${cls}`} data-testid="pill" onClick={() => void syncNow()}>{txt}</button>
}

export function Shell() {
  const { t, lang } = useI18n()
  const app = useApp()
  const role = app.session!.role
  const allowed: Screen[] = role === 'vendor' ? ['pos'] : role === 'cashier' ? ['cashier', 'enroll'] : role === 'admin' ? ['pos', 'cashier', 'enroll', 'admin'] : ['admin']
  const [screen, setScreen] = useState<Screen>(allowed[0])
  const [menu, setMenu] = useState(false)
  const ev = app.catalog?.event
  const standName = app.catalog?.stands.find((s) => s.id === app.session?.stand_id)?.name

  return (
    <div className="shell">
      {app.session!.training && <div className="banner training" role="status">⚠ {t('banner.training')}</div>}
      {apiMode === 'mock' && <div className="banner mock">{t('banner.mock')}</div>}
      <header>
        <span className="who">{standName ?? ev?.name ?? 'Jeton'} · {app.session!.staff.display_name}</span>
        <SyncPill />
        <button className="icon" aria-label="menu" onClick={() => setMenu(!menu)}>☰</button>
      </header>
      {menu && (
        <div className="menu">
          {LANGS.map((l) => <button key={l} className={l === lang ? 'on' : ''} onClick={() => setLang(l)}>{l.toUpperCase()}</button>)}
          <button onClick={() => { storage.setMute(!storage.getMute()); setMenu(false) }}>🔊 {t('common.mute')}</button>
          <button onClick={() => app.logout()}>{t('common.logout')}</button>
        </div>
      )}
      {ev?.be_gks_required && (screen === 'pos' || screen === 'cashier') && <div className="banner gks">{t('banner.gks')}</div>}
      <main>
        {screen === 'pos' && <Pos />}
        <Suspense fallback={<p className="panel">{t('common.loading')}</p>}>
          {screen === 'cashier' && <Cashier />}
          {screen === 'enroll' && <Enroll />}
          {screen === 'admin' && <Admin readOnly={role === 'auditor'} />}
        </Suspense>
      </main>
      {allowed.length > 1 && (
        <nav>
          {allowed.map((s) => <button key={s} className={s === screen ? 'on' : ''} onClick={() => setScreen(s)}>{t(`nav.${s}` as 'nav.pos')}</button>)}
        </nav>
      )}
    </div>
  )
}
