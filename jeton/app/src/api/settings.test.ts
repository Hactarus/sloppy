import { beforeEach, describe, expect, it } from 'vitest'
import { BUILD_BASE, BUILD_MODE, getApiBase, getApiMode, hasCustomBase, normalizeBaseUrl, resolveBase, setApiBase, setApiMode } from './settings'

describe('server URL setting', () => {
  beforeEach(() => localStorage.clear())
  it('normalises input', () => {
    expect(normalizeBaseUrl('api.example.org')).toBe('https://api.example.org/v1')
    expect(normalizeBaseUrl(' http://192.168.1.5:3000/ ')).toBe('http://192.168.1.5:3000/v1')
    expect(normalizeBaseUrl('https://x.org/api/v1/')).toBe('https://x.org/api/v1')
    expect(normalizeBaseUrl('/v1/')).toBe('/v1')
  })
  it('rejects garbage', () => {
    expect(normalizeBaseUrl('')).toBeNull()
    expect(normalizeBaseUrl('ftp://x.org')).toBeNull()
    expect(normalizeBaseUrl('http://')).toBeNull()
  })
  it('defaults to the build-time values', () => {
    expect(getApiBase()).toBe(BUILD_BASE)
    expect(getApiMode()).toBe(BUILD_MODE)
    expect(hasCustomBase()).toBe(false)
  })
  it('stores, overrides and clears', () => {
    expect(setApiBase('srv.example.org')).toBe(true)
    expect(getApiBase()).toBe('https://srv.example.org/v1')
    expect(hasCustomBase()).toBe(true)
    expect(setApiBase('ftp://nope')).toBe(false)
    expect(getApiBase()).toBe('https://srv.example.org/v1')
    setApiBase('')
    expect(getApiBase()).toBe(BUILD_BASE)
  })
  it('stores demo mode', () => {
    setApiMode('mock'); expect(getApiMode()).toBe('mock')
    setApiMode('real'); expect(getApiMode()).toBe('real')
    setApiMode(null); expect(getApiMode()).toBe(BUILD_MODE)
  })
  it('resolves relative bases', () => {
    expect(resolveBase('https://a.b/v1')).toBe('https://a.b/v1')
    expect(resolveBase('/v1')).toMatch(/\/v1$/)
  })
})
