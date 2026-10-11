import { inTx, type Row } from '../db.js';
import { AppError } from '../errors.js';
import type { AppCtx } from '../context.js';
import { Actor, loadEvent } from './common.js';
import { fetchOrders } from './orders.js';

export async function printReceipt(app: AppCtx, a: Actor, type: 'order' | 'topup' | 'cashout', id: string) {
  return inTx(app.sql, async (tx) => {
    const ev = await loadEvent(tx, a.eventId);
    const org = (await tx<Row[]>`SELECT * FROM organizers WHERE id = ${ev.organizer_id}`)[0]!;
    const table = { order: 'orders', topup: 'topups', cashout: 'cashouts' }[type];
    const doc = (await tx<Row[]>`SELECT d.*, st.name AS stand_name FROM ${tx(table)} d JOIN stands st ON st.id = d.stand_id WHERE d.id = ${id} AND d.event_id = ${a.eventId}`)[0];
    if (!doc) throw new AppError('NOT_FOUND', 'Unknown document');
    if (a.role === 'vendor' && a.standId !== doc.stand_id) throw new AppError('STAND_MISMATCH', 'Vendors can only print documents of their own stand');
    const prev = (await tx<Row[]>`SELECT count(*)::int AS n FROM receipt_prints WHERE document_type = ${type} AND document_id = ${id}`)[0]!.n;
    await tx`INSERT INTO receipt_prints(event_id, document_type, document_id, print_kind, staff_id, device_id)
             VALUES (${a.eventId}, ${type}, ${id}, ${prev === 0 ? 'original' : 'duplicata'}, ${a.staffId}, ${a.deviceId})`;

    const mentions: string[] = [];
    if (ev.vat_regime === 'franchise') mentions.push('TVA non applicable / BTW niet van toepassing (regime de franchise)');
    if (ev.vat_regime === 'exempt_event') mentions.push('Exonere de TVA / Vrijgesteld van BTW');
    if (type === 'topup' && ev.voucher_type === 'multi_purpose') mentions.push("bon multi-usage - pas de TVA a l'emission");
    if (ev.country === 'BE' && ev.be_gks_required) mentions.push('Not a fiscal ticket');
    if (ev.policy_version) mentions.push('Refund / expiry policy ' + ev.policy_version);

    const base: Record<string, unknown> = {
      document_type: type, document_id: id, receipt_no: doc.receipt_no, provisional_ref: doc.provisional_ref ?? null, duplicata: prev > 0, print_no: prev + 1,
      training: doc.training,
      issued_by: { legal_name: org.legal_name, enterprise_no: org.enterprise_no, vat_no: org.vat_no, address: org.address },
      event: { name: ev.name, stand_name: doc.stand_name }, at: doc.created_at, legal_mentions: mentions,
    };
    if (type === 'order') {
      const o = (await fetchOrders(tx, [id]))[0] as any;
      return { ...base, lines: o.lines, vat_groups: o.vat_groups, totals: { tokens: o.total_tokens, gross_cents: o.gross_cents, tip_tokens: o.tip_tokens, amount_cents: o.gross_cents, payment_method: 'tokens' }, balance_after_tokens: o.balance_tokens };
    }
    return {
      ...base, lines: [], vat_groups: [],
      totals: { tokens: doc.tokens, amount_cents: doc.amount_cents, payment_method: doc.payment_method }, balance_after_tokens: null,
    };
  });
}
