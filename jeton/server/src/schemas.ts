/** Request bodies (zod) of the write operations; mirror components/schemas of api/openapi.yaml. */
import { z } from 'zod';
import { zClientMeta, zConsumptionMode, zDate, zReason, zTagRef, zTagUid, zUuid, zVatCategory } from './http.js';

export const PaymentMethod = z.enum(['cash', 'sumup_card', 'sumup_online', 'wero', 'bancontact', 'promo', 'other']);
export const CashoutMethod = z.enum(['cash', 'sumup_card', 'sumup_online', 'wero', 'bancontact', 'bank_transfer', 'other']);

const meta = z.object(zClientMeta);

export const TopupRequest = meta.extend({
  client_tx_id: zUuid,
  tag: zTagRef,
  cashdesk_id: zUuid.nullish(),
  payment_method: PaymentMethod,
  amount_cents: z.number().int().min(0),
  external_ref: z.string().max(200).nullish(),
  manual: z.boolean().default(false),
  terms_version: z.string().max(100).nullish(),
});
export type TopupRequest = z.output<typeof TopupRequest>;

export const OrderRequest = meta.extend({
  client_tx_id: zUuid,
  stand_id: zUuid,
  tag: zTagRef,
  lines: z.array(z.object({ item_id: zUuid, qty: z.number().int().min(1).max(99), unit_price_tokens: z.number().int().min(1).optional() })).min(1).max(100),
  tip_tokens: z.number().int().min(0).default(0),
  consumption_mode: zConsumptionMode.nullish(),
  age_check_confirmed: z.boolean().default(false),
  expected_total_tokens: z.number().int().min(1).optional(),
  expected_catalog_version: z.number().int().optional(),
});
export type OrderRequest = z.output<typeof OrderRequest>;

export const RefundOrderRequest = meta.extend({
  client_tx_id: zUuid,
  reason_code: zReason,
  lines: z.array(z.object({ line_no: z.number().int().min(1), qty: z.number().int().min(1) })).optional(),
  include_tip: z.boolean().default(false),
});
export type RefundOrderRequest = z.output<typeof RefundOrderRequest>;

export const CashoutRequest = meta.extend({
  client_tx_id: zUuid,
  tag: zTagRef,
  tokens: z.number().int().min(1).nullish(),
  method: CashoutMethod,
  external_ref: z.string().max(200).nullish(),
  reason_code: zReason,
  contact: z
    .object({ name: z.string().max(100).optional(), email: z.string().email().optional(), iban: z.string().max(34).optional() })
    .nullish(),
});
export type CashoutRequest = z.output<typeof CashoutRequest>;

export const CashMovementRequest = meta.extend({
  client_tx_id: zUuid,
  cashdesk_id: zUuid,
  session_id: zUuid.nullish(),
  movement: z.enum(['float_in', 'pay_in', 'pay_out', 'drop']),
  amount_cents: z.number().int().min(1),
  reason_code: zReason,
});
export type CashMovementRequest = z.output<typeof CashMovementRequest>;

export const OpenSessionRequest = z.object({ client_tx_id: zUuid, cashdesk_id: zUuid, opening_float_cents: z.number().int().min(0) });
export const CloseSessionRequest = z.object({
  client_tx_id: zUuid,
  counted_breakdown: z.record(z.string().regex(/^\d+$/), z.number().int().min(0)),
});

export const PspSettlementRequest = z.object({
  client_tx_id: zUuid,
  method: z.enum(['sumup_card', 'sumup_online', 'wero', 'bancontact', 'other']),
  payout_ref: z.string().min(1).max(200),
  payout_date: zDate,
  lines: z
    .array(z.object({ psp_ref: z.string().min(1), gross_cents: z.number().int().min(1), fee_cents: z.number().int().min(0) }))
    .min(1),
});

export const TipsPayoutRequest = z.object({
  client_tx_id: zUuid,
  stand_id: zUuid,
  cashdesk_id: zUuid,
  recipient_staff_id: zUuid.nullish(),
  tokens: z.number().int().min(1),
  method: z.enum(['cash', 'bank_transfer', 'donation']),
  ack_ref: z.string().max(100).nullish(),
});

export const ReverseJournalRequest = z.object({ client_tx_id: zUuid, reason_code: zReason, note: z.string().max(500).nullish() });
export const CloseEventRequest = z.object({
  client_tx_id: zUuid,
  tips_disposition: z.enum(['payout_done', 'none_outstanding', 'assigned_to_donation']),
});
export const CheckoutRequest = z.object({
  client_tx_id: zUuid,
  tag: zTagRef,
  cashdesk_id: zUuid.nullish(),
  amount_cents: z.number().int().min(1),
});
export const SealZRequest = z.object({ client_tx_id: zUuid, stand_id: zUuid, business_date: zDate });

export const EnrollTagRequest = z.object({
  client_tx_id: zUuid,
  uid: zTagUid,
  chip_type: z.enum(['ntag213', 'ntag215', 'ntag216', 'ntag424dna', 'mifare_ultralight', 'other']),
  signature: z.string().regex(/^[0-9A-F]{64}$/).nullish(),
});
export const ConfirmTagRequest = z.object({ client_tx_id: zUuid, uid: zTagUid, readback_ok: z.boolean(), password_protected: z.boolean().optional() });
export const SetTagStatusRequest = z.object({ client_tx_id: zUuid, status: z.enum(['active', 'blocked']), reason_code: zReason });
export const ReplaceTagRequest = z.object({ client_tx_id: zUuid, new_tag: zTagRef, old_uid: zTagUid.nullish(), reason_code: zReason });

export const SyncItem = z.object({
  type: z.string().min(1).max(40),
  staff_id: zUuid,
  provisional_ref: z.string().max(40).optional(),
  payload: z.record(z.string(), z.unknown()),
});
export const SyncBatchRequest = z.object({ batch_id: zUuid, items: z.array(SyncItem).min(1) });

export const VatCategory = zVatCategory;
