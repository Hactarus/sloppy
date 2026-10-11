import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useApp } from '../app/state'
import { errorText, localName, useI18n } from '../i18n'
import { iconFor } from '../lib/icons'
import { formatEuro } from '../lib/money'
import { feedback } from '../lib/feedback'
import { Result } from '../ui/Result'
import * as B from './basket'
import { payOrder, type PayResult } from './pay'
import { NfcError } from '../nfc/types'
import type { Item } from '../api/types'

const BASKET_KEY = 'jeton.basket'
const LAST_KEY = 'last_order'
const LONG_PRESS_MS = 500
const SWIPE_PX = 40

function loadBasket(): B.Basket {
  try { const v = localStorage.getItem(BASKET_KEY); if (v) return JSON.parse(v) as B.Basket } catch { /* ignore */ }
  return B.emptyBasket()
}

type PosResult = PayResult | { ok: false; reason: 'notjeton' | 'nfc' }
type Phase =
  | { k: 'idle' }
  | { k: 'age'; age: number }
  | { k: 'armed' }
  | { k: 'result'; res: PosResult; keep: boolean }

export function localeOf(l: string) { return l === 'fr' ? 'fr-BE' : l === 'nl' ? 'nl-BE' : 'en-BE' }

export function Pos() {
  const { t, lang } = useI18n()
  const { catalog, session, queue, nfc, refreshCatalog, refreshCounts, device } = useApp()
  const [basket, setBasket] = useState<B.Basket>(loadBasket)
  const [undo, setUndo] = useState<B.Basket | null>(null)
  const [last, setLast] = useState<{ lines: { item_id: string; qty: number }[]; tip: number } | null>(null)
  const [cat, setCat] = useState<string>('all')
  const [phase, setPhase] = useState<Phase>({ k: 'idle' })
  const [qtyFor, setQtyFor] = useState<Item | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const abort = useRef<AbortController | null>(null)

  const standId = session?.stand_id ?? device?.stand_id ?? null
  const items = useMemo(() => (catalog?.items ?? []).filter((i) => i.active !== false && (!standId || i.stand_id === standId)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [catalog, standId])
  const categories = useMemo(() => (catalog?.categories ?? []).filter((c) => items.some((i) => i.category_id === c.id)).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)), [catalog, items])
  const ev = catalog?.event
  const tipRules: B.TipRules = { enabled: ev?.tips_enabled ?? false, maxTokens: ev?.tip_max_tokens ?? 10, maxPercent: ev?.tip_max_percent ?? 50 }
  const itemsTok = B.itemsTotal(basket, items)
  const total = itemsTok + basket.tip
  const maxTip = B.maxTip(itemsTok, tipRules)
  const presets = (ev?.tip_presets_tokens ?? [1, 2]).slice(0, 2)

  useEffect(() => { localStorage.setItem(BASKET_KEY, JSON.stringify(basket)) }, [basket])
  useEffect(() => { void queue.kvGet<{ lines: { item_id: string; qty: number }[]; tip: number }>(LAST_KEY).then((v) => v && setLast(v)) }, [queue])
  // Drop items that disappeared after a catalog refresh; re-clamp tip when the total shrinks.
  useEffect(() => {
    if (!catalog) return
    setBasket((b) => {
      const p = B.pruneUnavailable(b, catalog.items)
      return B.clampTip(p.basket, B.itemsTotal(p.basket, catalog.items), tipRules)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catalog])
  useEffect(() => { if (!undo) return; const id = setTimeout(() => setUndo(null), 4000); return () => clearTimeout(id) }, [undo])

  const change = useCallback((fn: (b: B.Basket) => B.Basket, sound: 'tick' | 'remove' = 'tick') => {
    setBasket((b) => {
      const nb = fn(b)
      return B.clampTip(nb, B.itemsTotal(nb, items), tipRules)
    })
    feedback[sound]()
    setNotice(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, ev])

  const clearAll = () => { if (B.isEmpty(basket)) return; setUndo(basket); change(B.clear, 'remove') }
  const repeat = () => { if (last) change(() => B.fromOrderLines(last.lines, 0)) }

  const startPay = () => {
    if (B.isEmpty(basket)) return
    const age = B.needsAgeCheck(basket, items)
    if (age) setPhase({ k: 'age', age })
    else void arm(false)
  }

  async function arm(ageConfirmed: boolean) {
    if (!session || !catalog || !standId) return
    const ctl = new AbortController()
    abort.current = ctl
    setPhase({ k: 'armed' })
    feedback.armed()
    let tag
    try {
      tag = await nfc.readTag(ctl.signal)
    } catch (e) {
      if (e instanceof NfcError && e.code === 'CANCELLED') { setPhase({ k: 'idle' }); return }
      feedback.failure()
      setPhase({ k: 'result', res: { ok: false, reason: 'nfc' }, keep: true })
      return
    }
    if (!tag.tagCode) { feedback.failure(); setPhase({ k: 'result', res: { ok: false, reason: 'notjeton' }, keep: true }); return }
    const lines = B.toOrderLines(basket, items.map((i) => i.id))
    const res = await payOrder(queue, {
      stand_id: standId, staff_id: session.staff.id, tag: { tag_code: tag.tagCode, uid: tag.uid }, lines, tip_tokens: basket.tip, totalTokens: total,
      age_check_confirmed: ageConfirmed, catalogVersion: catalog.catalog_version, offlineCap: ev?.offline_cap_tokens ?? 10,
    })
    if (res.ok) {
      feedback.success()
      const snapshot = { lines, tip: basket.tip }
      await queue.kvSet(LAST_KEY, snapshot)
      setLast(snapshot)
      setBasket(B.emptyBasket())
      void refreshCounts()
    } else {
      feedback.failure()
      if (res.reason === 'api' && res.error.code === 'PRICE_MISMATCH') {
        await refreshCatalog()
        setNotice(t('pos.prices'))
      }
    }
    setPhase({ k: 'result', res, keep: !res.ok })
  }

  const cancel = () => { abort.current?.abort(); setPhase({ k: 'idle' }) }
  const done = useCallback(() => setPhase({ k: 'idle' }), [])

  const shown = cat === 'all' ? items : items.filter((i) => i.category_id === cat)
  const ph = phase

  return (
    <div className="pos">
      {categories.length > 1 && (
        <div className="chips" role="tablist">
          <button className={`chip ${cat === 'all' ? 'on' : ''}`} onClick={() => setCat('all')}>{t('pos.all')}</button>
          {categories.map((c) => (
            <button key={c.id} className={`chip ${cat === c.id ? 'on' : ''}`} onClick={() => setCat(c.id)}>{localName(c, lang)}</button>
          ))}
        </div>
      )}
      {notice && <div className="notice" role="status">{notice}</div>}
      <div className="grid" data-testid="grid">
        {shown.length === 0 && <p className="muted">{t('pos.noItems')}</p>}
        {shown.map((it) => (
          <Tile key={it.id} item={it} qty={basket.lines[it.id] ?? 0} name={localName(it, lang)}
            onInc={() => change((b) => B.add(b, it.id))} onDec={() => change((b) => B.dec(b, it.id), 'remove')} onLong={() => setQtyFor(it)} unit={t('common.tokens', { n: it.price_tokens })} />
        ))}
      </div>

      <div className="dock">
        <div className="row">
          <button className="btn sec" onClick={clearAll} disabled={B.isEmpty(basket)}>{t('pos.clear')}</button>
          <button className="btn sec" onClick={repeat} disabled={!last}>{t('pos.repeat')}</button>
          {tipRules.enabled && presets.map((p) => (
            <button key={p} className={`btn chipbtn ${basket.tip === p ? 'on' : ''}`} aria-pressed={basket.tip === p} disabled={p > maxTip && basket.tip !== p}
              onClick={() => change((b) => B.toggleTip(b, p))}>{t('pos.tip')} +{p}</button>
          ))}
        </div>
        <div className="totalbar" data-testid="totalbar">
          <span>{t('pos.total')}</span>
          <strong data-testid="total">{total}</strong>
          <span className="muted">{formatEuro(total * (ev?.token_price_cents ?? 200), localeOf(lang))}</span>
        </div>
        <button className="btn pay" disabled={B.isEmpty(basket)} onClick={startPay}>{B.isEmpty(basket) ? t('pos.empty') : `${t('pos.pay')} ${total}`}</button>
      </div>

      {undo && <button className="snack" onClick={() => { setBasket(undo); setUndo(null) }}>{t('pos.undo')}</button>}

      {qtyFor && <QtyPad item={qtyFor} name={localName(qtyFor, lang)} current={basket.lines[qtyFor.id] ?? 0}
        onSet={(q) => { change((b) => B.setQty(b, qtyFor.id, q)); setQtyFor(null) }} onClose={() => setQtyFor(null)} />}

      {ph.k === 'age' && (
        <div className="overlay"><div className="dialog">
          <p className="big">{t('pos.age', { age: ph.age })}</p>
          <button className="btn pay" onClick={() => void arm(true)}>{t('pos.ageYes')}</button>
          <button className="btn sec" onClick={() => setPhase({ k: 'idle' })}>{t('common.cancel')}</button>
        </div></div>
      )}

      {ph.k === 'armed' && (
        <div className="overlay armed" data-testid="armed">
          <div className="nfc-ring" aria-hidden>)))</div>
          <p className="big">{t('pos.arm')}</p>
          <p className="huge">{total}</p>
          <button className="btn sec" onClick={cancel}>{t('common.cancel')}</button>
        </div>
      )}

      {ph.k === 'result' && <PayResultView res={ph.res} total={total} onDone={done} />}
    </div>
  )
}

function PayResultView({ res, total, onDone }: { res: PosResult; total: number; onDone(): void }) {
  const { t, lang } = useI18n()
  if (res.ok && res.mode === 'online') {
    return (
      <Result ok title={t('pos.paid')} ms={1500} onDone={onDone}>
        <div className="huge">{total}</div>
        <div>{t('pos.newBalance', { n: res.order.balance_tokens })}</div>
        {res.order.receipt_no != null && <div className="muted">{t('pos.receipt', { n: res.order.receipt_no })}</div>}
      </Result>
    )
  }
  if (res.ok) {
    return (
      <Result ok title={t('pos.paid')} ms={1500} onDone={onDone}>
        <div className="huge">{total}</div>
        <div>{t('pos.savedOffline')}</div>
        <div className="muted">{t('pos.ref', { ref: res.provisional_ref })}</div>
      </Result>
    )
  }
  let msg: string
  if (res.reason === 'api') msg = errorText(lang, res.error)
  else if (res.reason === 'offline_cap') msg = t('err.offlineCap', { spent: res.spentOffline, cap: res.cap })
  else if (res.reason === 'notjeton') msg = t('pos.notJeton')
  else if (res.reason === 'network') msg = t('err.network')
  else msg = t('pos.nfcOff')
  return <Result ok={false} title={t('pos.failed')} ms={3000} onDone={onDone} hint={t('pos.tapToClose')}>{msg}</Result>
}

function Tile({ item, qty, name, unit, onInc, onDec, onLong }: { item: Item; qty: number; name: string; unit: string; onInc(): void; onDec(): void; onLong(): void }) {
  const st = useRef<{ x: number; y: number; timer?: ReturnType<typeof setTimeout>; long: boolean; moved: boolean } | null>(null)
  const down = (e: React.PointerEvent) => {
    const s: NonNullable<typeof st.current> = { x: e.clientX, y: e.clientY, long: false, moved: false }
    s.timer = setTimeout(() => { s.long = true; onLong() }, LONG_PRESS_MS)
    st.current = s
  }
  const move = (e: React.PointerEvent) => {
    const s = st.current
    if (!s) return
    if (Math.abs(e.clientX - s.x) > 12 || Math.abs(e.clientY - s.y) > 12) { s.moved = true; clearTimeout(s.timer) }
  }
  const up = (e: React.PointerEvent) => {
    const s = st.current
    st.current = null
    if (!s) return
    clearTimeout(s.timer)
    if (s.long) return
    const dx = e.clientX - s.x
    if (dx < -SWIPE_PX && Math.abs(dx) > Math.abs(e.clientY - s.y)) { if (qty > 0) onDec(); return }
    if (!s.moved) onInc()
  }
  const cancel = () => { if (st.current) clearTimeout(st.current.timer); st.current = null }
  return (
    <div className={`tile ${qty > 0 ? 'sel' : ''}`} style={{ borderColor: item.color ?? undefined }} role="button" tabIndex={0} aria-label={`${name} ${unit}`}
      data-testid={`tile-${item.id}`} onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={cancel} onPointerLeave={cancel}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onInc() } else if (e.key === 'Backspace' || e.key === '-') onDec() }}
      onContextMenu={(e) => e.preventDefault()}>
      <span className="ic" aria-hidden>{iconFor(item.icon)}</span>
      <span className="nm">{name}</span>
      <span className="pr">{item.price_tokens} ◎</span>
      {qty > 0 && (
        <button className="badge" aria-label={`-1 ${name} (${qty})`} data-testid={`badge-${item.id}`}
          onPointerDown={(e) => e.stopPropagation()} onPointerUp={(e) => e.stopPropagation()}
          onClick={(e) => { e.stopPropagation(); onDec() }}>{qty}</button>
      )}
    </div>
  )
}

function QtyPad({ item, name, current, onSet, onClose }: { item: Item; name: string; current: number; onSet(q: number): void; onClose(): void }) {
  const { t } = useI18n()
  const [v, setV] = useState(String(current || ''))
  const press = (d: string) => setV((x) => (x + d).replace(/^0+/, '').slice(0, 2))
  return (
    <div className="overlay"><div className="dialog" data-testid="qtypad">
      <p className="big">{iconFor(item.icon)} {name}</p>
      <p className="huge" data-testid="qtyval">{v || '0'}</p>
      <div className="numpad">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => <button key={d} className="btn sec" onClick={() => press(d)}>{d}</button>)}
        <button className="btn sec" onClick={() => setV('')}>C</button>
        <button className="btn sec" onClick={() => press('0')}>0</button>
        <button className="btn pay" onClick={() => onSet(Number(v || 0))}>OK</button>
      </div>
      <button className="btn sec" onClick={onClose}>{t('common.cancel')}</button>
    </div></div>
  )
}
