/** Money is integer euro cents. Formatting only; never do float arithmetic on amounts. */
export function formatEuro(cents: number, locale = 'fr-BE'): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  const s = `${Math.floor(abs / 100)},${String(abs % 100).padStart(2, '0')}`
  return new Intl.NumberFormat(locale, { style: 'currency', currency: 'EUR' }).format(Number(s.replace(',', '.')) * (sign ? -1 : 1))
}
