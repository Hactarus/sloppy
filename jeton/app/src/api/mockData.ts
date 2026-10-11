import type { Catalog, Item } from './types'

export const MOCK_EVENT_ID = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0e00'
export const STAND_BAR = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0001'
export const STAND_FOOD = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0002'
export const STAND_CASH = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0003'
export const CAT_DRINK = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0c01'
export const CAT_FOOD = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0c02'
export const CAT_ICE = '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0c03'

let n = 0
const id = () => `0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f${(0x1000 + ++n).toString(16)}`
const mk = (stand: string, category_id: string, name: string, price_tokens: number, icon: string, vat: Item['vat_category'], color: string, extra: Partial<Item> = {}): Item => ({
  id: id(), stand_id: stand, category_id, name, price_tokens, price_cents: price_tokens * 200, vat_category: vat, icon, color,
  active: true, sort_order: n, default_consumption_mode: 'on_site', ...extra,
})

export const seedItems = (): Item[] => [
  mk(STAND_BAR, CAT_DRINK, 'Pils 25cl', 1, 'beer', 'ALCOHOL', '#F2B705', { min_age: 16, name_i18n: { fr: 'Pils 25cl', nl: 'Pils 25cl', en: 'Lager 25cl' } }),
  mk(STAND_BAR, CAT_DRINK, 'Triple 33cl', 2, 'beers', 'ALCOHOL', '#C77D0A', { min_age: 16 }),
  mk(STAND_BAR, CAT_DRINK, 'Cola', 1, 'cola', 'DRINK_SOFT', '#8B2E2E', { name_i18n: { fr: 'Cola', nl: 'Cola', en: 'Cola' } }),
  mk(STAND_BAR, CAT_DRINK, 'Eau', 1, 'water', 'DRINK_SOFT', '#2E7DD1', { name_i18n: { fr: 'Eau', nl: 'Water', en: 'Water' } }),
  mk(STAND_BAR, CAT_DRINK, 'Vin blanc', 2, 'wine', 'ALCOHOL', '#B5A642', { min_age: 16 }),
  mk(STAND_BAR, CAT_DRINK, 'Cafe', 1, 'coffee', 'DRINK_SOFT', '#6F4E37', { name_i18n: { fr: 'Cafe', nl: 'Koffie', en: 'Coffee' } }),
  mk(STAND_FOOD, CAT_FOOD, 'Frites', 3, 'fries', 'FOOD', '#E0A800', { name_i18n: { fr: 'Frites', nl: 'Frieten', en: 'Fries' } }),
  mk(STAND_FOOD, CAT_FOOD, 'Hot-dog', 3, 'hotdog', 'FOOD', '#C0392B'),
  mk(STAND_FOOD, CAT_FOOD, 'Burger', 5, 'burger', 'FOOD', '#8E5B3A'),
  mk(STAND_FOOD, CAT_FOOD, 'Croque', 3, 'sandwich', 'FOOD', '#A67C52'),
  mk(STAND_FOOD, CAT_ICE, 'Glace', 2, 'icecream', 'ICE_CREAM', '#E88BB4', { name_i18n: { fr: 'Glace', nl: 'IJs', en: 'Ice cream' } }),
  mk(STAND_FOOD, CAT_ICE, 'Gaufre', 3, 'waffle', 'FOOD', '#D9A441', { name_i18n: { fr: 'Gaufre', nl: 'Wafel', en: 'Waffle' } }),
]

export const seedCatalog = (version = 1): Catalog => ({
  catalog_version: version,
  generated_at: new Date().toISOString(),
  event: {
    id: MOCK_EVENT_ID, organizer_id: '0197a1b2-7c3d-7e4f-8a9b-0c1d2e3f0f00', name: 'Kermesse de demonstration', country: 'BE',
    timezone: 'Europe/Brussels', token_price_cents: 200, offline_cap_tokens: 10, max_balance_tokens: 100, max_topup_tokens: 50,
    vat_regime: 'standard', voucher_type: 'multi_purpose', be_gks_required: true, tips_enabled: true, tip_presets_tokens: [1, 2, 5],
    tip_max_tokens: 10, tip_max_percent: 50, status: 'open', catalog_version: version, policy_version: 'policy-2026-07', terms_version: 'tos-2026-07',
  } as Catalog['event'],
  stands: [
    { id: STAND_BAR, name: 'Bar', kind: 'stand', active: true, sort_order: 1 },
    { id: STAND_FOOD, name: 'Cuisine', kind: 'stand', active: true, sort_order: 2 },
    { id: STAND_CASH, name: 'Caisse', kind: 'cashdesk', active: true, sort_order: 3 },
  ],
  categories: [
    { id: CAT_DRINK, name: 'Boissons', name_i18n: { fr: 'Boissons', nl: 'Dranken', en: 'Drinks' }, active: true, sort_order: 1 },
    { id: CAT_FOOD, name: 'Repas', name_i18n: { fr: 'Repas', nl: 'Maaltijden', en: 'Food' }, active: true, sort_order: 2 },
    { id: CAT_ICE, name: 'Desserts', name_i18n: { fr: 'Desserts', nl: 'Desserts', en: 'Desserts' }, active: true, sort_order: 3 },
  ],
  items: seedItems(),
  vat_rates: [
    { country: 'BE', category_code: 'FOOD', consumption_mode: 'on_site', rate_bp: 1200, valid_from: '2026-01-01', validated: true },
    { country: 'BE', category_code: 'DRINK_SOFT', consumption_mode: 'on_site', rate_bp: 2100, valid_from: '2026-01-01', validated: false },
    { country: 'BE', category_code: 'ALCOHOL', consumption_mode: 'on_site', rate_bp: 2100, valid_from: '2026-01-01', validated: true },
  ],
})

/** Tags that exist in the mock backend; the mock NFC service exposes the same chips (keys 1..5). */
export const MOCK_TAGS = [
  { tag_code: '0123456789ABCDEFGHJ0', uid: '04A1B2C3D4E5F6', balance: 24 },
  { tag_code: '1234567890ABCDEFGHJG', uid: '04A1B2C3D4E5F7', balance: 3 },
  { tag_code: '2345678901ABCDEFGHJ0', uid: '04A1B2C3D4E5F8', balance: 0 },
  { tag_code: '3456789012ABCDEFGHJG', uid: '04A1B2C3D4E5F9', balance: 60 },
  { tag_code: '4567890123ABCDEFGHJ0', uid: '04A1B2C3D4E5FA', balance: 12 },
]
