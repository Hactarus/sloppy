import { useEffect, useRef, useState } from 'react'
import { api, asApiError, isNetworkFailure } from '../api/client'
import { useApp } from '../app/state'
import type { PaymentMethod, ReasonCode, TagInfo, WalletEntry } from '../api/types'
import { errorText, useI18n } from '../i18n'
import { formatEuro } from '../lib/money'
import { uuidv7 } from '../lib/uuid'
import { feedback } from '../lib/feedback'
import { Result } from '../ui/Result'
import { localeOf } from '../pos/Pos'

const METHODS: PaymentMethod[] = ['cash', 'sumup_card', 'sumup_online', 'wero', 'bancontact']
const CASHOUT_METHODS = ['cash', 'sumup_card', 'wero', 'bancontact', 'other'] as const
const REASONS: ReasonCode[] = ['customer_request', 'cashier_error', 'duplicate', 'chargeback', 'psp_failed', 'event_cancelled', 'other']
const PRESETS = [5, 10, 20]

type Msg = { ok: boolean; text: string; sub?: string } | null

export function Cashier() {
  const { t, lang } = useI18n()
  const { nfc, catalog, status, session } = useApp()
  const ev = catalog?.event
  const price = ev?.token_price_cents ?? 200
  const [tag, setTag] = useState<{ info: TagInfo; uid: string } | null>(null)
  const [tab, setTab] = useState<'topup' | 'refund'>('topup')
  const [tokens, setTokens] = useState(10)
  const [custom, setCustom] = useState('')
  const [method, setMethod] = useState<PaymentMethod>('cash')
  const [ref, setRef] = useState('')
  const [msg, setMsg] = useState<Msg>(null)
  const [busy, setBusy] = useState(false)
  const [history, setHistory] = useState<WalletEntry[]>([])
  const [reason, setReason] = useState<ReasonCode>('customer_request')
  const [cashTokens, setCashTokens] = useState('')
  const [cashMethod, setCashMethod] = useState<(typeof CASHOUT_METHODS)[number]>('cash')
  const [waiting, setWaiting] = useState(false)
  const ctl = useRef<AbortController | null>(null)
  const txid = useRef<string>(uuidv7()) // stable across retries of the same confirm tap

  const nonCash = method !== 'cash'
  const promoAllowed = session?.role === 'admin'
  const methods = promoAllowed ? [...METHODS, 'promo' as PaymentMethod] : METHODS

  const err = (e: unknown) => ({ ok: false, text: errorText(lang, asApiError(e)) })

  const scan = async () => {
    ctl.current?.abort()
    const c = new AbortController()
    ctl.current = c
    setWaiting(true)
    try {
      const nt = await nfc.readTag(c.signal)
      if (!nt.tagCode) { feedback.failure(); setMsg({ ok: false, text: t('pos.notJeton') }); return }
      const r = await api.GET('/tags/{tag_code}', { params: { path: { tag_code: nt.tagCode }, query: { uid: nt.uid } } })
      if (r.data) {
        setTag({ info: r.data, uid: nt.uid })
        txid.current = uuidv7()
        const h = await api.GET('/tags/{tag_code}/transactions', { params: { path: { tag_code: nt.tagCode }, query: { limit: 10 } } })
        setHistory(h.data?.items ?? [])
      } else { feedback.failure(); setMsg(err(r.error)) }
    } catch (e) {
      if (isNetworkFailure(e)) setMsg({ ok: false, text: t('err.network') })
    } finally { setWaiting(false) }
  }

  useEffect(() => { void scan(); return () => ctl.current?.abort() /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [])

  const n = custom ? Number(custom) : tokens
  const valid = Number.isInteger(n) && n > 0 && n <= (ev?.max_topup_tokens ?? 50)
  const refOk = !nonCash || ref.trim().length > 0

  const topup = async () => {
    if (!tag || !valid || !refOk) return
    setBusy(true)
    try {
      const r = await api.POST('/topups', { body: {
        client_tx_id: txid.current, tag: { tag_code: tag.info.tag_code, uid: tag.uid }, payment_method: method, amount_cents: n * price,
        external_ref: nonCash ? ref.trim() : null, manual: nonCash && method !== 'promo', terms_version: ev?.terms_version ?? null, client_created_at: new Date().toISOString(),
      } })
      if (r.data) { feedback.success(); setMsg({ ok: true, text: t('cash.done'), sub: `+${r.data.tokens} → ${t('common.tokens', { n: r.data.balance_tokens })}` }) }
      else { feedback.failure(); setMsg(err(r.error)) }
    } catch (e) { feedback.failure(); setMsg({ ok: false, text: isNetworkFailure(e) ? t('cash.onlineOnly') : String(e) }) }
    setBusy(false)
  }

  const refundSale = async (e: WalletEntry) => {
    if (!e.document_id) return
    setBusy(true)
    try {
      const r = await api.POST('/orders/{order_id}/refunds', { params: { path: { order_id: e.document_id } }, body: { client_tx_id: uuidv7(), reason_code: reason, client_created_at: new Date().toISOString() } })
      if (r.data) { feedback.success(); setMsg({ ok: true, text: t('cash.refundDone'), sub: t('pos.newBalance', { n: r.data.balance_tokens }) }) }
      else { feedback.failure(); setMsg(err(r.error)) }
    } catch { setMsg({ ok: false, text: t('cash.onlineOnly') }) }
    setBusy(false)
  }

  const cashout = async () => {
    if (!tag) return
    setBusy(true)
    const k = cashTokens ? Number(cashTokens) : null
    try {
      const r = await api.POST('/cashouts', { body: { client_tx_id: uuidv7(), tag: { tag_code: tag.info.tag_code, uid: tag.uid }, tokens: k, method: cashMethod, reason_code: reason, external_ref: ref || null, client_created_at: new Date().toISOString() } })
      if (r.data) { feedback.success(); setMsg({ ok: true, text: t('cash.refundDone'), sub: `${formatEuro(r.data.amount_cents, localeOf(lang))} · ${t('pos.newBalance', { n: r.data.balance_tokens })}` }) }
      else { feedback.failure(); setMsg(err(r.error)) }
    } catch { setMsg({ ok: false, text: t('cash.onlineOnly') }) }
    setBusy(false)
  }

  const reset = () => { setMsg(null); setTag(null); setRef(''); setCustom(''); setHistory([]); void scan() }

  return (
    <div className="cashier panel">
      {!status.online && <div className="notice" role="status">☁✖ {t('cash.onlineOnly')}</div>}
      {!tag && (
        <div className="tapbox">
          <div className="nfc-ring" aria-hidden>)))</div>
          <p className="big">{waiting ? t('cash.tap') : t('pos.reading')}</p>
          <button className="btn sec" onClick={() => void scan()}>{t('common.retry')}</button>
        </div>
      )}
      {tag && (
        <>
          <div className="tagcard" data-testid="tagcard">
            <div>…{tag.info.tag_code.slice(-4)}</div>
            <div className="huge" data-testid="balance">{tag.info.balance_tokens}</div>
            <div className="muted">{t('common.tokens', { n: tag.info.balance_tokens })} · {formatEuro(tag.info.balance_tokens * price, localeOf(lang))}</div>
            {tag.info.wallet_status === 'blocked' && <div className="error">⛔ {t('err.TAG_BLOCKED')}</div>}
          </div>
          <div className="tabs">
            <button className={tab === 'topup' ? 'on' : ''} onClick={() => setTab('topup')}>{t('cash.tab.topup')}</button>
            <button className={tab === 'refund' ? 'on' : ''} onClick={() => setTab('refund')}>{t('cash.tab.refund')}</button>
          </div>
          {tab === 'topup' && (
            <>
              <div className="row wrap">
                {PRESETS.map((p) => <button key={p} className={`btn chipbtn big ${!custom && tokens === p ? 'on' : ''}`} onClick={() => { setTokens(p); setCustom('') }}>{p}</button>)}
                <input aria-label={t('cash.custom')} placeholder={t('cash.custom')} inputMode="numeric" value={custom} onChange={(e) => setCustom(e.target.value.replace(/\D/g, '').slice(0, 3))} className="narrow" />
              </div>
              <p className="muted">{t('cash.limits', { max: ev?.max_balance_tokens ?? 100 })}</p>
              <div className="row wrap" role="radiogroup" aria-label={t('cash.method')}>
                {methods.map((m) => <button key={m} role="radio" aria-checked={method === m} className={`btn chipbtn ${method === m ? 'on' : ''}`} onClick={() => setMethod(m)}>{t(`method.${m}` as 'method.cash')}</button>)}
              </div>
              {nonCash && <label>{t('cash.ref')}<input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={200} /></label>}
              <button className="btn pay" disabled={busy || !valid || !refOk || !status.online} onClick={() => void topup()}>{valid ? t('cash.confirm', { n, eur: formatEuro(n * price, localeOf(lang)) }) : t('cash.confirm', { n: '?', eur: '' })}</button>
            </>
          )}
          {tab === 'refund' && (
            <>
              <label>{t('cash.reason')}<select value={reason} onChange={(e) => setReason(e.target.value as ReasonCode)}>{REASONS.map((r) => <option key={r} value={r}>{t(`reason.${r}` as 'reason.other')}</option>)}</select></label>
              <h3>{t('cash.history')}</h3>
              {history.filter((h) => h.kind === 'sale' && h.document_id).length === 0 && <p className="muted">{t('cash.noSales')}</p>}
              {history.filter((h) => h.kind === 'sale' && h.document_id).map((h) => (
                <div key={h.journal_seq} className="row between"><span>{new Date(h.at).toLocaleTimeString()} · {h.delta_tokens}</span>
                  <button className="btn sec" disabled={busy} onClick={() => void refundSale(h)}>{t('cash.refundOrder')}</button></div>
              ))}
              <h3>{t('cash.cashout')}</h3>
              <div className="row wrap">
                <input aria-label={t('cash.tokens')} placeholder={t('cash.cashoutAll')} inputMode="numeric" value={cashTokens} onChange={(e) => setCashTokens(e.target.value.replace(/\D/g, ''))} className="narrow" />
                <select value={cashMethod} onChange={(e) => setCashMethod(e.target.value as typeof cashMethod)}>{CASHOUT_METHODS.map((m) => <option key={m} value={m}>{t(`method.${m}` as 'method.cash')}</option>)}</select>
              </div>
              <button className="btn pay" disabled={busy || !status.online || tag.info.balance_tokens <= 0} onClick={() => void cashout()}>
                {t('cash.pay', { n: cashTokens || tag.info.balance_tokens, eur: formatEuro((cashTokens ? Number(cashTokens) : tag.info.balance_tokens) * price, localeOf(lang)) })}</button>
            </>
          )}
          <button className="btn link" onClick={reset}>{t('common.cancel')}</button>
        </>
      )}
      {msg && <Result ok={msg.ok} title={msg.ok ? '' : t('pos.failed')} ms={msg.ok ? 1500 : 3000} onDone={msg.ok ? reset : () => setMsg(null)}><div className="big">{msg.text}</div>{msg.sub && <div>{msg.sub}</div>}</Result>}
    </div>
  )
}
