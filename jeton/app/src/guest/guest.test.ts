import { parseCode, render } from './main'

describe('guest page', () => {
  it('parses the tag code from the path', () => {
    expect(parseCode('/t/0123456789ABCDEFGHJ0')).toBe('0123456789ABCDEFGHJ0')
    expect(parseCode('/t/0123456789abcdefghj0/')).toBe('0123456789ABCDEFGHJ0')
    expect(parseCode('/x/abc')).toBeNull()
    expect(parseCode('/t/SHORT')).toBeNull()
  })
  it('renders balance and purchases without injecting HTML or unsafe links', () => {
    document.body.innerHTML = '<main id="a"></main>'
    render({ tag_code: '0123456789ABCDEFGHJ0', balance_tokens: 7, token_price_cents: 200, balance_cents: 1400, status: 'active',
      event: { name: '<img src=x onerror=alert(1)>', privacy_url: 'javascript:alert(1)' },
      recent: [{ at: new Date().toISOString(), kind: 'sale', delta_tokens: -2, items: [{ name: '<b>Pils</b>', qty: 2 }] }] }, 'en')
    const a = document.getElementById('a')!
    expect(a.textContent).toContain('7')
    expect(a.textContent).toContain('<b>Pils</b>')
    expect(a.querySelector('img,b,a')).toBeNull()
  })
  it('links an https privacy url with noopener', () => {
    document.body.innerHTML = '<main id="a"></main>'
    render({ tag_code: '0123456789ABCDEFGHJ0', balance_tokens: 0, token_price_cents: 200, event: { name: 'E', privacy_url: 'https://x.example/p' }, recent: [] }, 'en')
    const a = document.querySelector('a')!
    expect(a.rel).toContain('noopener')
  })
})
