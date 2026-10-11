import { detectLang, format, translate, errorText } from './index'
import { en } from './en'
import { fr } from './fr'
import { nl } from './nl'
import { strings } from '../guest/strings'

describe('i18n', () => {
  it('detects FR/NL/EN with EN fallback', () => {
    expect(detectLang('fr-BE')).toBe('fr'); expect(detectLang('nl-NL')).toBe('nl'); expect(detectLang('de-DE')).toBe('en')
  })
  it('plural + substitution', () => {
    expect(format(en['common.tokens'], { n: 1 })).toBe('1 token')
    expect(format(en['common.tokens'], { n: 5 })).toBe('5 tokens')
    expect(translate('fr', 'pos.newBalance', { n: 3 })).toContain('3')
  })
  it('all dictionaries have the same keys and no empty values', () => {
    const k = Object.keys(en).sort()
    expect(Object.keys(fr).sort()).toEqual(k); expect(Object.keys(nl).sort()).toEqual(k)
    for (const d of [en, fr, nl]) for (const v of Object.values(d)) expect(String(v).length).toBeGreaterThan(0)
    expect(Object.keys(strings.fr).sort()).toEqual(Object.keys(strings.en).sort())
    expect(Object.keys(strings.nl).sort()).toEqual(Object.keys(strings.en).sort())
  })
  it('translates API errors by code, with details, and falls back for unknown codes', () => {
    expect(errorText('en', { code: 'INSUFFICIENT_BALANCE', details: { balance_tokens: 2, required_tokens: 6 } })).toContain('Not enough')
    expect(errorText('fr', { code: 'TAG_BLOCKED' })).toBe('Badge bloqué')
    expect(errorText('en', { code: 'SOMETHING_NEW' })).toContain('SOMETHING_NEW')
  })
})
