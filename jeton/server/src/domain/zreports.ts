import type { Q, Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { uuidv7 } from '../util/ids.js';
import { Actor, assertStandAccess, loadEvent, loadStand, runIdempotent } from './common.js';
import { buildZContent, zPayload, zRowDto } from './reports.js';

export function sealZ(app: AppCtx, a: Actor, body: { client_tx_id: string; stand_id: string; business_date: string }) {
  return runIdempotent(app, a, { operation: 'z.seal', clientTxId: body.client_tx_id, body }, async (tx) => {
    const ev = await loadEvent(tx, a.eventId);
    const st = await loadStand(tx, a.eventId, body.stand_id);
    assertStandAccess(a, body.stand_id);
    if (a.role === 'cashier' && st.kind === 'stand') throw new AppError('FORBIDDEN', 'Cashiers seal cash desk reports only');
    const ex = await tx<Row[]>`SELECT 1 FROM z_reports WHERE stand_id = ${body.stand_id} AND business_date = ${body.business_date}::date`;
    if (ex.length) throw new AppError('Z_ALREADY_SEALED', 'A Z-report already exists for this stand and day');
    const pend = await tx<Row[]>`SELECT id FROM devices WHERE stand_id = ${body.stand_id} AND revoked_at IS NULL AND NOT training AND pending_offline_ops > 0`;
    if (pend.length) throw new AppError('PENDING_OFFLINE_OPERATIONS', 'Synchronise the offline operations of this stand first', { devices: pend.length });
    if (st.kind === 'cashdesk') {
      const v = await tx<Row[]>`SELECT 1 FROM cashdesk_sessions WHERE cashdesk_id = ${body.stand_id} AND closed_at IS NOT NULL AND variance_cents <> 0 AND ack_at IS NULL`;
      if (v.length) throw new AppError('CASH_VARIANCE_UNACKNOWLEDGED', 'An admin must acknowledge the cash variance first');
    }
    const z = await buildZContent(tx, a.eventId, body.stand_id, body.business_date);
    const id = uuidv7();
    await tx`INSERT INTO z_reports(id, event_id, stand_id, business_date, period_start, period_end, first_receipt_no, last_receipt_no, payload, sealed_by)
             VALUES (${id}, ${a.eventId}, ${body.stand_id}, ${body.business_date}::date, ${z.periodStart}, ${z.periodEnd}, ${z.firstReceipt}, ${z.lastReceipt},
                     ${zPayload(z.content)}, ${a.staffId})`;
    const row = (await tx<Row[]>`SELECT * FROM z_reports WHERE id = ${id}`)[0]!;
    // anchor the chain head (the contract says it is e-mailed to the organizer; the notifier abstracts the transport)
    await tx`INSERT INTO chain_anchors(event_id, seq, hash, method, reference) VALUES (${a.eventId}, ${row.chain_seq}, ${row.chain_hash}, 'z_seal', ${id})`;
    const org = (await tx<Row[]>`SELECT contact_email FROM organizers WHERE id = ${ev.organizer_id}`)[0];
    app.notifier.anchor({ eventId: a.eventId, organizerEmail: org?.contact_email ?? null, seq: row.chain_seq, hashHex: Buffer.from(row.chain_hash).toString('hex'), reason: 'z_seal' })
      .catch((e) => app.log.warn({ err: String(e) }, 'anchor notification failed'));
    return { status: 201, body: zRowDto(row) };
  });
}

export async function listZ(tx: Q, eventId: string, standId: string | null) {
  const rows = await tx<Row[]>`SELECT * FROM z_reports WHERE event_id = ${eventId} AND (${standId}::uuid IS NULL OR stand_id = ${standId}) ORDER BY z_seq`;
  return { items: rows.map(zRowDto) };
}
