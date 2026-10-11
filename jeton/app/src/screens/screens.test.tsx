import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { AppProvider } from '../app/state'
import { Cashier } from './Cashier'
import { Enroll } from './Enroll'
import { OfflineQueue } from '../offline/queue'
import { MockNfcService } from '../nfc/mock'
import { createMockNfc } from '../nfc'
import { mockState, resetMock } from '../api/mock'
import { STAND_CASH } from '../api/mockData'
import { storage } from '../api/storage'
import { setLang } from '../i18n'
import { parseTagUrl } from '../nfc/ndef'

let nfc: MockNfcService
async function setup(ui: React.ReactElement, role: 'cashier' | 'admin' = 'cashier') {
  resetMock(); setLang('en')
  storage.setDevice({ device_id: 'd', device_token: 'dvc_x', event_id: mockState.catalog.event.id, stand_id: STAND_CASH, kind: 'cashdesk', training: false })
  storage.setSession({ jwt: 'jwt', expires_at: new Date(Date.now() + 36e5).toISOString(), session: { staff: { id: 's', display_name: 'Bob', role }, device_id: 'd', event_id: mockState.catalog.event.id, stand_id: STAND_CASH, role, training: false } })
  localStorage.setItem('jeton.catalog', JSON.stringify(mockState.catalog))
  nfc = createMockNfc()
  render(<AppProvider queue={await OfflineQueue.open(`s-${Math.random()}`)} nfc={nfc} syncIntervalMs={60000}>{ui}</AppProvider>)
}

describe('Cashier', () => {
  it('tap tag, top up 10 tokens cash, balance increases', async () => {
    await setup(<Cashier />)
    await waitFor(() => expect(nfc.waiting).toBe(1))
    act(() => nfc.tapIndex(1)) // balance 3
    expect(await screen.findByTestId('balance')).toHaveTextContent('3')
    fireEvent.click(screen.getByText(/Confirm 10 tokens/))
    expect(await screen.findByText(/Top-up done/)).toBeInTheDocument()
    expect(screen.getByText(/13 tokens/)).toBeInTheDocument()
  })
  it('non-cash methods require an external reference', async () => {
    await setup(<Cashier />)
    await waitFor(() => expect(nfc.waiting).toBe(1))
    act(() => nfc.tapIndex(0))
    await screen.findByTestId('balance')
    fireEvent.click(screen.getByText('Wero'))
    expect(screen.getByText(/Confirm 10 tokens/).closest('button')).toBeDisabled()
    fireEvent.change(screen.getByLabelText(/External reference/), { target: { value: 'WERO-123' } })
    expect(screen.getByText(/Confirm 10 tokens/).closest('button')).toBeEnabled()
  })
  it('respects max balance with a localised error', async () => {
    await setup(<Cashier />)
    await waitFor(() => expect(nfc.waiting).toBe(1))
    act(() => nfc.tapIndex(3)) // balance 60
    await screen.findByTestId('balance')
    fireEvent.change(screen.getByLabelText('Custom'), { target: { value: '50' } })
    fireEvent.click(screen.getByText(/Confirm 50 tokens/))
    expect(await screen.findByText(/Limit exceeded/)).toBeInTheDocument()
  })
})

describe('Tag enrolment', () => {
  it('bulk loop writes the NDEF URL, confirms, counts up to the target', async () => {
    await setup(<Enroll />, 'admin')
    const start = Number(screen.getByTestId('counter').textContent!.split('/')[0])
    fireEvent.change(screen.getByLabelText('Target'), { target: { value: String(start + 2) } })
    fireEvent.click(screen.getByText('Start'))
    for (let i = 0; i < 2; i++) {
      await waitFor(() => expect(nfc.waiting).toBeGreaterThan(0))
      act(() => nfc.tapBlank())
      await waitFor(() => expect(screen.getByTestId('counter')).toHaveTextContent(`${start + i + 1} /`))
    }
    const written = nfc.chips.slice(-2)
    for (const c of written) expect(parseTagUrl(c.url!)).toBeTruthy()
    expect([...mockState.wallets.values()].filter((w) => w.tag_status === 'active').length).toBe(5 + 2)
    await waitFor(() => expect(screen.getByText('Start')).toBeInTheDocument())
  })
})
