import type { Q, Row } from '../db.js';
import { AppError } from '../errors.js';
import { eventDto } from './admin.js';
import { loadEvent } from './common.js';

export const itemDto = (i: Row, price: number) => ({
  id: i.id, stand_id: i.stand_id, category_id: i.category_id, name: i.name, name_i18n: i.name_i18n, price_tokens: i.price_tokens,
  price_cents: i.price_tokens * price, vat_category: i.vat_category, default_consumption_mode: i.default_consumption_mode, min_age: i.min_age,
  allergens: i.allergens, icon: i.icon, color: i.color, active: i.active, sort_order: i.sort_order,
});
const standDto = (s: Row) => ({ id: s.id, name: s.name, name_i18n: s.name_i18n, kind: s.kind, active: s.active, sort_order: s.sort_order });
const catDto = (c: Row) => ({ id: c.id, name: c.name, name_i18n: c.name_i18n, active: c.active, sort_order: c.sort_order });
export const vatRateDto = (r: Row) => ({
  country: r.country, category_code: r.category_code, consumption_mode: r.consumption_mode, rate_bp: r.rate_bp, valid_from: r.valid_from,
  valid_to: r.valid_to, label: r.label, legal_code: r.legal_code, validated: r.validated, validated_by: r.validated_by,
});

export async function catalogSnapshot(tx: Q, eventId: string, includeInactive: boolean) {
  const ev = await loadEvent(tx, eventId);
  const stands = await tx<Row[]>`SELECT * FROM stands WHERE event_id = ${eventId} AND (${includeInactive} OR active) ORDER BY sort_order, name`;
  const cats = await tx<Row[]>`SELECT * FROM categories WHERE event_id = ${eventId} AND (${includeInactive} OR active) ORDER BY sort_order, name`;
  const items = await tx<Row[]>`SELECT * FROM items WHERE event_id = ${eventId} AND (${includeInactive} OR active) ORDER BY sort_order, name`;
  const rates = await tx<Row[]>`SELECT * FROM vat_rates WHERE country = ${ev.country} ORDER BY category_code, consumption_mode, valid_from`;
  return {
    version: ev.catalog_version as number,
    body: {
      event: await eventDto(tx, ev),
      catalog_version: ev.catalog_version,
      stands: stands.map(standDto),
      categories: cats.map(catDto),
      items: items.map((i) => itemDto(i, ev.token_price_cents)),
      vat_rates: rates.map(vatRateDto),
      generated_at: new Date(),
    },
  };
}

async function assertEditable(tx: Q, eventId: string): Promise<Row> {
  const ev = await loadEvent(tx, eventId);
  if (ev.status === 'closed') throw new AppError('EVENT_CLOSED', 'Event is closed');
  return ev;
}

export async function putStand(tx: Q, eventId: string, id: string, b: Row) {
  await assertEditable(tx, eventId);
  const cur = (await tx<Row[]>`SELECT * FROM stands WHERE id = ${id}`)[0];
  if (cur && cur.event_id !== eventId) throw new AppError('NOT_FOUND', 'Unknown stand');
  if (cur && b.kind !== cur.kind) throw new AppError('VALIDATION_ERROR', 'stand kind cannot change', { fields: [{ path: 'kind', issue: 'immutable' }] });
  const r = cur
    ? await tx<Row[]>`UPDATE stands SET name = ${b.name}, name_i18n = ${tx.json(b.name_i18n ?? {})}, active = ${b.active ?? true}, sort_order = ${b.sort_order ?? 0} WHERE id = ${id} RETURNING *`
    : await tx<Row[]>`INSERT INTO stands(id, event_id, name, name_i18n, kind, active, sort_order)
                      VALUES (${id}, ${eventId}, ${b.name}, ${tx.json(b.name_i18n ?? {})}, ${b.kind}, ${b.active ?? true}, ${b.sort_order ?? 0}) RETURNING *`;
  return { created: !cur, body: standDto(r[0]!) };
}

export async function putCategory(tx: Q, eventId: string, id: string, b: Row) {
  await assertEditable(tx, eventId);
  const cur = (await tx<Row[]>`SELECT * FROM categories WHERE id = ${id}`)[0];
  if (cur && cur.event_id !== eventId) throw new AppError('NOT_FOUND', 'Unknown category');
  const r = cur
    ? await tx<Row[]>`UPDATE categories SET name = ${b.name}, name_i18n = ${tx.json(b.name_i18n ?? {})}, active = ${b.active ?? true}, sort_order = ${b.sort_order ?? 0} WHERE id = ${id} RETURNING *`
    : await tx<Row[]>`INSERT INTO categories(id, event_id, name, name_i18n, active, sort_order)
                      VALUES (${id}, ${eventId}, ${b.name}, ${tx.json(b.name_i18n ?? {})}, ${b.active ?? true}, ${b.sort_order ?? 0}) RETURNING *`;
  return { created: !cur, body: catDto(r[0]!) };
}

export async function putItem(tx: Q, eventId: string, id: string, b: Row) {
  const ev = await assertEditable(tx, eventId);
  const st = await tx<Row[]>`SELECT 1 FROM stands WHERE id = ${b.stand_id} AND event_id = ${eventId} AND kind = 'stand'`;
  const ct = await tx<Row[]>`SELECT 1 FROM categories WHERE id = ${b.category_id} AND event_id = ${eventId}`;
  if (!st[0] || !ct[0]) throw new AppError('NOT_FOUND', 'Unknown stand or category');
  const cur = (await tx<Row[]>`SELECT * FROM items WHERE id = ${id}`)[0];
  if (cur && cur.event_id !== eventId) throw new AppError('NOT_FOUND', 'Unknown item');
  const v = [b.name, tx.json(b.name_i18n ?? {}), b.price_tokens, b.vat_category, b.default_consumption_mode ?? 'on_site', b.min_age ?? null,
    tx.array(b.allergens ?? []), b.icon ?? null, b.color ?? null, b.sort_order ?? 0, b.active ?? true] as const;
  const r = cur
    ? await tx<Row[]>`UPDATE items SET stand_id = ${b.stand_id}, category_id = ${b.category_id}, name = ${v[0]}, name_i18n = ${v[1]}, price_tokens = ${v[2]},
                        vat_category = ${v[3]}, default_consumption_mode = ${v[4]}, min_age = ${v[5]}, allergens = ${v[6]}, icon = ${v[7]}, color = ${v[8]},
                        sort_order = ${v[9]}, active = ${v[10]} WHERE id = ${id} RETURNING *`
    : await tx<Row[]>`INSERT INTO items(id, event_id, stand_id, category_id, name, name_i18n, price_tokens, vat_category, default_consumption_mode, min_age,
                                         allergens, icon, color, sort_order, active)
                      VALUES (${id}, ${eventId}, ${b.stand_id}, ${b.category_id}, ${v[0]}, ${v[1]}, ${v[2]}, ${v[3]}, ${v[4]}, ${v[5]}, ${v[6]}, ${v[7]}, ${v[8]}, ${v[9]}, ${v[10]}) RETURNING *`;
  return { created: !cur, body: itemDto(r[0]!, ev.token_price_cents) };
}

export async function listVatRates(tx: Q, q: { country?: string; on?: string }) {
  const rows = await tx<Row[]>`SELECT * FROM vat_rates WHERE (${q.country ?? null}::text IS NULL OR country = ${q.country ?? null})
                               AND (${q.on ?? null}::date IS NULL OR (valid_from <= ${q.on ?? null}::date AND (valid_to IS NULL OR valid_to >= ${q.on ?? null}::date)))
                               ORDER BY country, category_code, consumption_mode, valid_from`;
  return { items: rows.map(vatRateDto) };
}

export async function validateVatRates(tx: Q, b: { validated_by: string; rates: Array<{ country: string; category_code: string; consumption_mode: string; valid_from: string }> }) {
  let n = 0;
  for (const r of b.rates) {
    const u = await tx<Row[]>`UPDATE vat_rates SET validated = true, validated_by = ${b.validated_by}, validated_at = now()
                               WHERE country = ${r.country} AND category_code = ${r.category_code} AND consumption_mode = ${r.consumption_mode} AND valid_from = ${r.valid_from}::date
                               RETURNING 1`;
    n += u.length;
  }
  return { updated: n };
}
