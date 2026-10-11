import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { AppProvider } from './app/state'
import { OfflineQueue } from './offline/queue'
import { createNfc } from './nfc'
import { apiMode } from './api/client'
import { MockNfcService } from './nfc/mock'
import './styles.css'

/** Short per-install tag used in provisional receipt refs ("T42-000187"); not a legal number. */
function deviceTag(): string {
  let v = localStorage.getItem('jeton.devtag')
  if (!v) { v = 'T' + String(1 + Math.floor(Math.random() * 99)); localStorage.setItem('jeton.devtag', v) }
  return v
}

async function boot() {
  const [queue, nfc] = await Promise.all([OfflineQueue.open('jeton', deviceTag()), createNfc()])
  if (nfc instanceof MockNfcService) nfc.installKeyboard()
  if (apiMode === 'mock') {
    // dev helper: window.jetonMock.offline(true) simulates a dead network for the mock API
    void import('./api/mock').then((m) => { (window as unknown as Record<string, unknown>).jetonMock = { offline: m.setMockOffline, reset: m.resetMock, state: m.mockState } })
  }
  createRoot(document.getElementById('root')!).render(
    <StrictMode><AppProvider queue={queue} nfc={nfc}><App /></AppProvider></StrictMode>,
  )
  if ('serviceWorker' in navigator && import.meta.env.PROD && !location.protocol.startsWith('capacitor')) {
    void navigator.serviceWorker.register('./sw.js').catch(() => undefined)
  }
}
void boot()
