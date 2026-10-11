import { useCallback, useEffect, useState } from 'react'
import { api, asApiError } from '../api/client'
import { useApp } from '../app/state'
import type { Device, Item, Staff, Role } from '../api/types'
import { errorText, useI18n } from '../i18n'
import { ICONS, iconFor } from '../lib/icons'
import { uuidv7 } from '../lib/uuid'

type Tab = 'catalog' | 'devices' | 'staff' | 'reports' | 'exports'
const VAT = ['FOOD', 'DRINK_SOFT', 'ALCOHOL', 'ICE_CREAM', 'MERCH', 'ZERO'] as const
const ROLES: Role[] = ['vendor', 'cashier', 'admin', 'auditor']
const DATASETS = ['journal', 'postings', 'orders', 'order_lines', 'topups', 'cashouts', 'tips', 'tips_payouts', 'vat_daily', 'fec', 'accounting', 'z_reports', 'flags'] as const

export function Admin({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n()
  const [tab, setTab] = useState<Tab>(readOnly ? 'reports' : 'catalog')
  const tabs: Tab[] = ['catalog', 'devices', 'staff', 'reports', 'exports']
  return (
    <div className="panel admin">
      <h2>{t('admin.title')} {readOnly && <small className="muted">({t('admin.readonly')})</small>}</h2>
      <div className="tabs wrap">{tabs.map((k) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(`admin.${k}` as 'admin.catalog')}</button>)}</div>
      {tab === 'catalog' && <CatalogAdmin readOnly={readOnly} />}
      {tab === 'devices' && <Devices readOnly={readOnly} />}
      {tab === 'staff' && <StaffAdmin readOnly={readOnly} />}
      {tab === 'reports' && <Reports />}
      {tab === 'exports' && <Exports />}
    </div>
  )
}

function useMsg() {
  const { lang } = useI18n()
  const [msg, setMsg] = useState<string | null>(null)
  return { msg, ok: (m: string) => setMsg('✔ ' + m), fail: (e: unknown) => setMsg('✖ ' + errorText(lang, asApiError(e))), node: msg && <p role="status" className="notice">{msg}</p> }
}

function CatalogAdmin({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n()
  const { catalog, refreshCatalog } = useApp()
  const m = useMsg()
  const [edit, setEdit] = useState<Item | null>(null)
  const [standName, setStandName] = useState('')
  const [catName, setCatName] = useState('')
  if (!catalog) return <p>{t('common.loading')}</p>
  const evId = catalog.event.id
  const unvalidated = catalog.vat_rates.some((r) => !r.validated)

  const save = async (it: Item) => {
    const r = await api.PUT('/events/{event_id}/items/{item_id}', { params: { path: { event_id: evId, item_id: it.id } }, body: it })
    if (r.data) { m.ok(t('admin.saved')); setEdit(null); await refreshCatalog() } else m.fail(r.error)
  }
  const addStand = async () => {
    if (!standName.trim()) return
    const id = uuidv7()
    const r = await api.PUT('/events/{event_id}/stands/{stand_id}', { params: { path: { event_id: evId, stand_id: id } }, body: { id, name: standName.trim(), kind: 'stand' } })
    if (r.data) { setStandName(''); m.ok(t('admin.saved')); await refreshCatalog() } else m.fail(r.error)
  }
  const addCat = async () => {
    if (!catName.trim()) return
    const id = uuidv7()
    const r = await api.PUT('/events/{event_id}/categories/{category_id}', { params: { path: { event_id: evId, category_id: id } }, body: { id, name: catName.trim() } })
    if (r.data) { setCatName(''); m.ok(t('admin.saved')); await refreshCatalog() } else m.fail(r.error)
  }
  const blank = (): Item => ({ id: uuidv7(), stand_id: catalog.stands[0]?.id ?? '', category_id: catalog.categories[0]?.id ?? '', name: '', price_tokens: 1, vat_category: 'FOOD', active: true, icon: 'beer', color: '#2E7DD1' })

  return (
    <>
      {m.node}
      {unvalidated && <p className="notice">⚠ {t('admin.unvalidated')}</p>}
      <p className="muted">{t('admin.catalogVersion', { v: catalog.catalog_version })}</p>
      <h3>{t('admin.stands')}</h3>
      <ul>{catalog.stands.map((s) => <li key={s.id}>{s.name} <small className="muted">({s.kind})</small></li>)}</ul>
      {!readOnly && <div className="row"><input aria-label={t('admin.stand')} value={standName} onChange={(e) => setStandName(e.target.value)} /><button className="btn sec" onClick={() => void addStand()}>{t('common.add')}</button></div>}
      <h3>{t('admin.categories')}</h3>
      <ul>{catalog.categories.map((c) => <li key={c.id}>{c.name}</li>)}</ul>
      {!readOnly && <div className="row"><input aria-label={t('admin.category')} value={catName} onChange={(e) => setCatName(e.target.value)} /><button className="btn sec" onClick={() => void addCat()}>{t('common.add')}</button></div>}
      <h3>{t('admin.items')}</h3>
      {!readOnly && <button className="btn sec" onClick={() => setEdit(blank())}>+ {t('admin.newItem')}</button>}
      <table><tbody>
        {catalog.items.map((i) => (
          <tr key={i.id} className={i.active === false ? 'inactive' : ''}>
            <td>{iconFor(i.icon)}</td><td>{i.name}</td><td>{i.price_tokens} ◎</td><td>{i.vat_category}</td>
            <td>{!readOnly && <button className="btn sec" onClick={() => setEdit({ ...i })}>{t('common.edit')}</button>}</td>
          </tr>
        ))}
      </tbody></table>
      {edit && <ItemForm item={edit} catalog={catalog} onSave={save} onClose={() => setEdit(null)} />}
    </>
  )
}

function ItemForm({ item, catalog, onSave, onClose }: { item: Item; catalog: NonNullable<ReturnType<typeof useApp>['catalog']>; onSave(i: Item): void; onClose(): void }) {
  const { t } = useI18n()
  const [i, setI] = useState(item)
  const set = <K extends keyof Item>(k: K, v: Item[K]) => setI((x) => ({ ...x, [k]: v }))
  const nm = (l: 'fr' | 'nl' | 'en', v: string) => setI((x) => ({ ...x, name_i18n: { ...x.name_i18n, [l]: v } }))
  return (
    <div className="overlay"><form className="dialog scroll" onSubmit={(e) => { e.preventDefault(); onSave({ ...i, price_cents: undefined, name_i18n: Object.fromEntries(Object.entries(i.name_i18n ?? {}).filter(([, v]) => v)) }) }}>
      <label>{t('common.name')}<input required value={i.name} onChange={(e) => set('name', e.target.value)} /></label>
      {(['fr', 'nl', 'en'] as const).map((l) => <label key={l}>{l.toUpperCase()}<input value={i.name_i18n?.[l] ?? ''} onChange={(e) => nm(l, e.target.value)} /></label>)}
      <label>{t('admin.price')}<input type="number" min={1} required value={i.price_tokens} onChange={(e) => set('price_tokens', Math.max(1, Math.floor(Number(e.target.value))))} /></label>
      <label>{t('admin.vat')}<select value={i.vat_category} onChange={(e) => set('vat_category', e.target.value as Item['vat_category'])}>{VAT.map((v) => <option key={v}>{v}</option>)}</select></label>
      <label>{t('admin.stand')}<select value={i.stand_id} onChange={(e) => set('stand_id', e.target.value)}>{catalog.stands.filter((s) => s.kind === 'stand').map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>{t('admin.category')}<select value={i.category_id} onChange={(e) => set('category_id', e.target.value)}>{catalog.categories.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
      <label>{t('admin.icon')}<select value={i.icon ?? ''} onChange={(e) => set('icon', e.target.value)}>{Object.keys(ICONS).map((k) => <option key={k} value={k}>{ICONS[k]} {k}</option>)}</select></label>
      <label>{t('admin.color')}<input type="color" value={i.color ?? '#2E7DD1'} onChange={(e) => set('color', e.target.value)} /></label>
      <label>{t('admin.minAge')}<input type="number" min={0} max={99} value={i.min_age ?? ''} onChange={(e) => set('min_age', e.target.value ? Number(e.target.value) : null)} /></label>
      <label className="check"><input type="checkbox" checked={i.active !== false} onChange={(e) => set('active', e.target.checked)} /> {t('common.active')}</label>
      <div className="row"><button className="btn pay">{t('common.save')}</button><button type="button" className="btn sec" onClick={onClose}>{t('common.cancel')}</button></div>
    </form></div>
  )
}

function Devices({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n()
  const { catalog } = useApp()
  const m = useMsg()
  const evId = catalog?.event.id
  const [list, setList] = useState<Device[]>([])
  const [kind, setKind] = useState<'terminal' | 'cashdesk' | 'console'>('terminal')
  const [stand, setStand] = useState('')
  const [training, setTraining] = useState(false)
  const [code, setCode] = useState<{ code: string; expires_at: string } | null>(null)
  const load = useCallback(async () => { if (evId) { const r = await api.GET('/events/{event_id}/devices', { params: { path: { event_id: evId } } }); if (r.data) setList(r.data.items) } }, [evId])
  useEffect(() => { void load() }, [load])
  if (!evId) return null
  const mk = async () => {
    const r = await api.POST('/events/{event_id}/enrollment-codes', { params: { path: { event_id: evId } }, body: { kind, stand_id: kind === 'console' ? null : stand || catalog!.stands[0].id, training } })
    if (r.data) setCode(r.data); else m.fail(r.error)
  }
  const revoke = async (id: string) => { const r = await api.POST('/devices/{device_id}/revoke', { params: { path: { device_id: id } }, body: {} }); if (r.data) await load(); else m.fail(r.error) }
  return (
    <>
      {m.node}
      {!readOnly && (
        <div className="row wrap">
          <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option>terminal</option><option>cashdesk</option><option>console</option></select>
          <select value={stand} onChange={(e) => setStand(e.target.value)}>{catalog!.stands.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          <label className="check"><input type="checkbox" checked={training} onChange={(e) => setTraining(e.target.checked)} /> {t('admin.training')}</label>
          <button className="btn sec" onClick={() => void mk()}>{t('admin.newCode')}</button>
        </div>
      )}
      {code && <div className="codebox"><div className="muted">{t('admin.code')}</div><div className="huge" data-testid="enrol-code">{code.code}</div><div className="muted">{t('admin.expires', { t: new Date(code.expires_at).toLocaleTimeString() })}</div></div>}
      <table><tbody>{list.map((d) => (
        <tr key={d.id} className={d.revoked_at ? 'inactive' : ''}><td>{d.name}{d.training ? ' 🧪' : ''}</td><td>{d.kind}</td><td>{d.revoked_at ? t('admin.revoked') : (!readOnly && <button className="btn sec" onClick={() => void revoke(d.id)}>{t('admin.revoke')}</button>)}</td></tr>
      ))}</tbody></table>
    </>
  )
}

function StaffAdmin({ readOnly }: { readOnly: boolean }) {
  const { t } = useI18n()
  const { catalog } = useApp()
  const m = useMsg()
  const evId = catalog?.event.id
  const [list, setList] = useState<Staff[]>([])
  const [name, setName] = useState('')
  const [role, setRole] = useState<Role>('vendor')
  const [pin, setPin] = useState('')
  const load = useCallback(async () => { if (evId) { const r = await api.GET('/events/{event_id}/staff', { params: { path: { event_id: evId } } }); if (r.data) setList(r.data.items) } }, [evId])
  useEffect(() => { void load() }, [load])
  const add = async () => {
    const id = uuidv7()
    const r = await api.PUT('/staff/{staff_id}', { params: { path: { staff_id: id } }, body: { display_name: name, role, pin, event_ids: evId ? [evId] : [] } })
    if (r.data) { setName(''); setPin(''); m.ok(t('admin.saved')); await load() } else m.fail(r.error)
  }
  return (
    <>
      {m.node}
      <table><tbody>{list.map((s) => <tr key={s.id} className={s.active ? '' : 'inactive'}><td>{s.display_name}</td><td>{t(`role.${s.role}` as 'role.admin')}</td></tr>)}</tbody></table>
      {!readOnly && (
        <div className="row wrap">
          <input aria-label={t('common.name')} placeholder={t('common.name')} value={name} onChange={(e) => setName(e.target.value)} />
          <select value={role} aria-label={t('admin.role')} onChange={(e) => setRole(e.target.value as Role)}>{ROLES.map((r) => <option key={r} value={r}>{t(`role.${r}` as 'role.admin')}</option>)}</select>
          <input aria-label={t('admin.pin')} placeholder={t('admin.pin')} inputMode="numeric" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 8))} />
          <button className="btn sec" disabled={!name || pin.length < 4} onClick={() => void add()}>{t('admin.newStaff')}</button>
        </div>
      )}
    </>
  )
}

function Reports() {
  const { t } = useI18n()
  const { catalog, session } = useApp()
  const evId = catalog?.event.id
  const [out, setOut] = useState<{ title: string; data: unknown } | null>(null)
  const m = useMsg()
  if (!evId) return null
  const run = async (title: string, p: Promise<{ data?: unknown; error?: unknown }>) => { const r = await p; if (r.data) setOut({ title, data: r.data }); else m.fail(r.error) }
  const path = { event_id: evId }
  const today = new Date().toISOString().slice(0, 10)
  return (
    <>
      {m.node}
      <div className="col">
        <button className="btn sec" onClick={() => void run(t('admin.report.liability'), api.GET('/events/{event_id}/reports/liability', { params: { path } }))}>{t('admin.report.liability')}</button>
        <button className="btn sec" onClick={() => void run(t('admin.report.sales'), api.GET('/events/{event_id}/reports/sales', { params: { path, query: { group_by: 'item' } } }))}>{t('admin.report.sales')}</button>
        <button className="btn sec" onClick={() => void run(t('admin.report.topups'), api.GET('/events/{event_id}/reports/topups', { params: { path } }))}>{t('admin.report.topups')}</button>
        <button className="btn sec" onClick={() => void run(t('admin.report.tips'), api.GET('/events/{event_id}/reports/tips', { params: { path } }))}>{t('admin.report.tips')}</button>
        <button className="btn sec" onClick={() => void run(t('admin.report.z'), api.GET('/events/{event_id}/reports/z', { params: { path, query: { stand_id: session?.stand_id ?? catalog!.stands[0].id, business_date: today } } }))}>{t('admin.report.z')}</button>
      </div>
      {out && <><h3>{out.title}</h3><pre className="json" data-testid="report">{JSON.stringify(out.data, null, 2)}</pre></>}
    </>
  )
}

function Exports() {
  const { t } = useI18n()
  const { catalog } = useApp()
  const m = useMsg()
  const evId = catalog?.event.id
  if (!evId) return null
  const dl = async (dataset: (typeof DATASETS)[number]) => {
    const r = await api.GET('/events/{event_id}/exports/{dataset}', { params: { path: { event_id: evId, dataset }, query: {} }, parseAs: 'blob' })
    if (r.data) {
      const url = URL.createObjectURL(r.data as Blob)
      const a = document.createElement('a')
      a.href = url; a.download = `${catalog!.event.name}-${dataset}.csv`; a.click()
      setTimeout(() => URL.revokeObjectURL(url), 5000)
    } else m.fail(r.error)
  }
  return (
    <>
      {m.node}
      <div className="col">{DATASETS.map((d) => <button key={d} className="btn sec" onClick={() => void dl(d)}>{t('admin.csv')} · {d}</button>)}</div>
    </>
  )
}
