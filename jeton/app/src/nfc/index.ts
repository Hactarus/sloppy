import { Capacitor } from '@capacitor/core'
import { CapacitorNfcService } from './capacitor'
import { MockNfcService } from './mock'
import { WebNfcService } from './web'
import type { NfcService } from './types'
import { MOCK_TAGS } from '../api/mockData'

export function createMockNfc(): MockNfcService {
  return new MockNfcService(MOCK_TAGS.map((t) => ({ uid: t.uid, url: `https://jeton.example/t/${t.tag_code}` })))
}

/** capacitor (native app) > Web NFC (Android Chrome) > mock (desktop dev, keyboard shortcuts). VITE_NFC=mock forces the mock. */
export async function createNfc(): Promise<NfcService> {
  if (import.meta.env.VITE_NFC === 'mock') return createMockNfc()
  if (Capacitor.isNativePlatform()) return new CapacitorNfcService()
  const web = new WebNfcService()
  if (await web.isAvailable()) return web
  return createMockNfc()
}
