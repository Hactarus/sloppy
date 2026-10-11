/** Integer-only money helpers. No floats anywhere. */

/** vat = round_half_up(gross * rate_bp / (10000 + rate_bp)); net = gross - vat (ADR 0005). */
export function vatOfGross(grossCents: number, rateBp: number): { net: number; vat: number } {
  if (!Number.isInteger(grossCents) || !Number.isInteger(rateBp) || grossCents < 0 || rateBp < 0) {
    throw new Error('vatOfGross: non-negative integers required');
  }
  const num = BigInt(grossCents) * BigInt(rateBp);
  const den = BigInt(10000 + rateBp);
  const vat = Number((2n * num + den) / (2n * den)); // round half up
  return { vat, net: grossCents - vat };
}

/** "12.34" from 1234 without floating point arithmetic (used for SumUp amounts and the FEC export). */
export function centsToDecimal(cents: number, sep: '.' | ',' = '.'): string {
  const neg = cents < 0;
  const abs = Math.abs(cents);
  const s = `${Math.trunc(abs / 100)}${sep}${String(abs % 100).padStart(2, '0')}`;
  return neg ? '-' + s : s;
}

/** Parse a decimal euro amount (number or string) into cents without float rounding surprises. */
export function decimalToCents(v: number | string): number {
  const s = typeof v === 'number' ? v.toFixed(2) : v;
  const m = /^(-?)(\d+)(?:[.,](\d{1,2}))?$/.exec(s.trim());
  if (!m) throw new Error('invalid decimal amount: ' + String(v));
  const cents = Number(m[2]) * 100 + Number((m[3] ?? '').padEnd(2, '0'));
  return m[1] ? -cents : cents;
}
