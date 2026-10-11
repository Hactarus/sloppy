import { useSyncExternalStore } from 'react'
import { en, type Key } from './en'
import { fr } from './fr'
import { nl } from './nl'
import { storage } from '../api/storage'

export type Lang = 'fr' | 'nl' | 'en'
export const LANGS: Lang[] = ['fr', 'nl', 'en']
const dicts: Record<Lang, Record<Key, string>> = { en, fr, nl }

export function detectLang(nav: string = typeof navigator !== 'undefined' ? navigator.language : 'en'): Lang {
  const l = nav.slice(0, 2).toLowerCase()
  return l === 'fr' || l === 'nl' ? l : 'en'
}

let lang: Lang = (storage.getLang() as Lang | null) ?? detectLang()
const subs = new Set<() => void>()
export function setLang(l: Lang) { lang = l; storage.setLang(l); subs.forEach((f) => f()) }
export const getLang = () => lang

/** Minimal ICU: `{name}` substitution and `{n, plural, one {# x} other {# y}}`. */
export function format(tpl: string, vars: Record<string, string | number> = {}): string {
  let s = tpl.replace(/\{(\w+), plural, one \{([^}]*)\} other \{([^}]*)\}\}/g, (_m, name: string, one: string, other: string) => {
    const n = Number(vars[name] ?? 0)
    return (n === 1 || n === -1 ? one : other).replace('#', String(n))
  })
  s = s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
  return s
}

export function translate(l: Lang, key: Key, vars?: Record<string, string | number>): string {
  return format(dicts[l][key] ?? dicts.en[key] ?? key, vars)
}
export const t = (key: Key, vars?: Record<string, string | number>) => translate(lang, key, vars)

export function useI18n() {
  const l = useSyncExternalStore((cb) => { subs.add(cb); return () => subs.delete(cb) }, () => lang)
  return { lang: l, t: (key: Key, vars?: Record<string, string | number>) => translate(l, key, vars), setLang }
}

/** Localised name of a catalog entity (name_i18n with fallback to name). */
export function localName(o: { name: string; name_i18n?: Partial<Record<Lang, string>> }, l: Lang): string {
  return o.name_i18n?.[l] || o.name
}

/** Translate an API error by its stable `code`, never its message. Unknown codes fall back by HTTP class text. */
export function errorText(l: Lang, e: { code: string; details?: Record<string, unknown> } | null | undefined): string {
  if (!e) return translate(l, 'err.unknown', { code: '?' })
  const key = `err.${e.code}` as Key
  if (key in en) return translate(l, key, (e.details ?? {}) as Record<string, string | number>)
  return translate(l, 'err.unknown', { code: e.code })
}
