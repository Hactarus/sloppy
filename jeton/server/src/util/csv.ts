/** CSV per the contract: UTF-8, `;` separator, header row, integers for amounts, LF line ends. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'boolean') s = v ? 'true' : 'false';
  else if (Buffer.isBuffer(v)) s = v.toString('hex');
  else s = String(v);
  // Neutralise spreadsheet formula injection for text cells that start with = + @ (leave plain negative numbers alone).
  if (typeof v === 'string' && /^[=+@]/.test(s)) s = "'" + s;
  return /[;"\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

export function toCsv(columns: readonly string[], rows: readonly Record<string, unknown>[]): string {
  const lines = [columns.join(';')];
  for (const r of rows) lines.push(columns.map((c) => csvCell(r[c])).join(';'));
  return lines.join('\n') + '\n';
}
