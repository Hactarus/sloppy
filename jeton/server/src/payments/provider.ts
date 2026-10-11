/**
 * Online payment provider abstraction. Card data never touches Jeton: the guest pays on the PSP's hosted page.
 * Implementations: SumUp online checkout (sumup.ts) and an in-memory fake for tests (fake.ts).
 * Wero and Bancontact/Payconiq have no integration yet: they are recorded manually (POST /topups with manual=true + external_ref).
 */
export type CheckoutStatus = 'PENDING' | 'PAID' | 'FAILED' | 'EXPIRED';

export interface CheckoutInfo {
  id: string;
  status: CheckoutStatus;
  amountCents: number;
  currency: string;
  /** Our reference (payment_intents.checkout_reference) echoed by the PSP. */
  reference: string;
  /** PSP transaction code once paid: becomes topups.external_ref. */
  transactionCode?: string | null;
  hostedUrl?: string | null;
}

export interface CreateCheckoutInput {
  amountCents: number;
  reference: string;
  description: string;
  /** Webhook URL (carries our secret token). */
  webhookUrl: string;
  /** Where the guest's browser returns after paying (optional). */
  redirectUrl?: string;
}

export interface PaymentProvider {
  readonly name: 'sumup' | 'fake';
  createCheckout(input: CreateCheckoutInput): Promise<CheckoutInfo>;
  getCheckout(id: string): Promise<CheckoutInfo>;
  /** Extracts the checkout id from a webhook body; null if unrecognised. The body itself is never trusted. */
  extractCheckoutId(body: unknown): string | null;
}
