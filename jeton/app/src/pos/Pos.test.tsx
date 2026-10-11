import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { AppProvider } from '../app/state'
import { Pos } from './Pos'
import { OfflineQueue } from '../offline/queue'
import { MockNfcService } from '../nfc/mock'
import { createMockNfc } from '../nfc'
import { mockState, resetMock, setMockOffline } from '../api/mock'
import { STAND_BAR } from '../api/mockData'
import { storage } from '../api/storage'
import { setLang } from '../i18n'

const STAFF = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0a01'
let q: OfflineQueue
let nfc: MockNfcService

async function setup() {
  resetMock()
  setLang('en')
  storage.setDevice({ device_id: 'd', device_token: 'dvc_x', event_id: mockState.catalog.event.id, stand_id: STAND_BAR, kind: 'terminal', training: false })
  storage.setSession({ jwt: 'jwt', expires_at: new Date(Date.now() + 36e5).toISOString(), session: { staff: { id: STAFF, display_name: 'Anna', role: 'vendor' }, device_id: 'd', event_id: mockState.catalog.event.id, stand_id: STAND_BAR, role: 'vendor', training: false } })
  localStorage.setItem('jeton.catalog', JSON.stringify(mockState.catalog))
  q = await OfflineQueue.open(`ui-${Math.random()}`, 'T1')
  nfc = createMockNfc()
  render(<AppProvider queue={q} nfc={nfc} syncIntervalMs={60000}><Pos /></AppProvider>)
}

const pils = () => mockState.catalog.items[0] // 1 token, min_age 16
const cola = () => mockState.catalog.items[2] // 1 token
const triple = () => mockState.catalog.items[1] // 2 tokens, min_age 16
const tile = (id: string) => screen.getByTestId(`tile-${id}`)
const tap = (el: Element) => { fireEvent.pointerDown(el, { clientX: 10, clientY: 10 }); fireEvent.pointerUp(el, { clientX: 10, clientY: 10 }) }
const total = () => screen.getByTestId('total').textContent

describe('Waiter POS', () => {
  it('one tap per item, badge tap removes one, total updates', async () => {
    await setup()
    tap(tile(cola().id)); tap(tile(cola().id)); tap(tile(triple().id))
    expect(total()).toBe('4')
    expect(within(tile(cola().id)).getByTestId(`badge-${cola().id}`)).toHaveTextContent('2')
    fireEvent.click(screen.getByTestId(`badge-${cola().id}`))
    expect(total()).toBe('3')
    fireEvent.click(screen.getByTestId(`badge-${cola().id}`))
    expect(screen.queryByTestId(`badge-${cola().id}`)).toBeNull()
  })

  it('swipe left = -1, swipe on empty tile does nothing', async () => {
    await setup()
    tap(tile(cola().id)); tap(tile(cola().id))
    fireEvent.pointerDown(tile(cola().id), { clientX: 200, clientY: 10 })
    fireEvent.pointerUp(tile(cola().id), { clientX: 100, clientY: 12 })
    expect(total()).toBe('1')
    fireEvent.pointerDown(tile(triple().id), { clientX: 200, clientY: 10 })
    fireEvent.pointerUp(tile(triple().id), { clientX: 100, clientY: 10 })
    expect(total()).toBe('1')
  })

  it('long press opens the quantity pad and sets the quantity', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    await setup()
    fireEvent.pointerDown(tile(cola().id), { clientX: 10, clientY: 10 })
    act(() => { vi.advanceTimersByTime(600) })
    fireEvent.pointerUp(tile(cola().id), { clientX: 10, clientY: 10 })
    expect(total()).toBe('0') // long press does not add
    fireEvent.click(screen.getByText('4')); fireEvent.click(screen.getByText('OK'))
    expect(total()).toBe('4')
    vi.useRealTimers()
  })

  it('Clear with Undo, and Repeat last after a paid order', async () => {
    await setup()
    tap(tile(cola().id)); tap(tile(cola().id))
    fireEvent.click(screen.getByText('Clear'))
    expect(total()).toBe('0')
    fireEvent.click(screen.getByText('Undo'))
    expect(total()).toBe('2')
    expect(screen.getByText('Repeat last')).toBeDisabled()
    // pay
    fireEvent.click(screen.getByText(/^PAY/))
    await screen.findByTestId('armed')
    await waitFor(() => expect(nfc.waiting).toBe(1))
    act(() => nfc.tapIndex(0))
    await screen.findByTestId('result')
    expect(screen.getByText(/New balance: 22/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('Repeat last')).toBeEnabled())
    await waitFor(() => expect(screen.queryByTestId('result')).toBeNull(), { timeout: 3000 }) // auto reset
    expect(total()).toBe('0')
    fireEvent.click(screen.getByText('Repeat last'))
    expect(total()).toBe('2')
  })

  it('tip is optional (default 0), toggles, and is capped', async () => {
    await setup()
    tap(tile(cola().id)) // 1 token => max tip 0 (50%)
    expect(screen.getByText('Tip +1')).toBeDisabled()
    tap(tile(cola().id)); tap(tile(cola().id)) // 3 tokens => max tip 1
    expect(total()).toBe('3')
    fireEvent.click(screen.getByText('Tip +1'))
    expect(total()).toBe('4')
    fireEvent.click(screen.getByText('Tip +1'))
    expect(total()).toBe('3')
  })

  it('failed payment shows the red cross with a localised reason and keeps the basket', async () => {
    await setup()
    tap(tile(cola().id))
    fireEvent.click(screen.getByText(/^PAY/))
    await waitFor(() => expect(nfc.waiting).toBe(1))
    act(() => nfc.tapIndex(2)) // balance 0
    const r = await screen.findByTestId('result')
    expect(r).toHaveClass('ko')
    expect(r).toHaveTextContent('Not enough tokens (balance 0, needs 1)')
    expect(r).toHaveTextContent('✖')
    fireEvent.click(r)
    expect(total()).toBe('1')
  })

  it('clone/uid mismatch is refused with a clear message', async () => {
    await setup()
    tap(tile(cola().id))
    fireEvent.click(screen.getByText(/^PAY/))
    await waitFor(() => expect(nfc.waiting).toBe(1))
    act(() => nfc.tap({ uid: '04DEADBEEF0000', url: nfc.chips[0].url }))
    expect(await screen.findByTestId('result')).toHaveTextContent(/possible copy/)
  })

  it('age-restricted items ask for confirmation before arming NFC', async () => {
    await setup()
    tap(tile(pils().id))
    fireEvent.click(screen.getByText(/^PAY/))
    expect(screen.getByText('Age check 16+ done?')).toBeInTheDocument()
    expect(screen.queryByTestId('armed')).toBeNull()
    fireEvent.click(screen.getByText('Yes, checked'))
    await screen.findByTestId('armed')
  })

  it('offline: queues, shows saved-offline result and enforces the cap', async () => {
    await setup()
    setMockOffline(true)
    for (let i = 0; i < 3; i++) tap(tile(cola().id))
    fireEvent.click(screen.getByText(/^PAY/))
    await waitFor(() => expect(nfc.waiting).toBe(1))
    act(() => nfc.tapIndex(0))
    expect(await screen.findByTestId('result')).toHaveTextContent(/Saved offline/)
    expect(await q.pending()).toHaveLength(1)
    await waitFor(() => expect(screen.queryByTestId('result')).toBeNull(), { timeout: 3000 })
    // 8 more tokens would exceed the cap of 10
    for (let i = 0; i < 8; i++) tap(tile(cola().id))
    fireEvent.click(screen.getByText(/^PAY/))
    await waitFor(() => expect(nfc.waiting).toBe(1))
    act(() => nfc.tapIndex(0))
    expect(await screen.findByTestId('result')).toHaveTextContent(/Offline limit reached: 3 of 10/)
    expect(await q.pending()).toHaveLength(1)
    setMockOffline(false)
  })
})
