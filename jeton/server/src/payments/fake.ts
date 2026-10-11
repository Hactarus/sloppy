import { randomUUID } from 'node:crypto';
import type { CheckoutInfo, CreateCheckoutInput, PaymentProvider } from './provider.js';

/** In-memory provider for tests and local development. `pay()` simulates the guest paying on the hosted page. */
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;
  readonly checkouts = new Map<string, CheckoutInfo>();
  failCreate = false;

  async createCheckout(i: CreateCheckoutInput): Promise<CheckoutInfo> {
    if (this.failCreate) throw new Error('fake provider down');
    const id = 'fake_' + randomUUID();
    const c: CheckoutInfo = { id, status: 'PENDING', amountCents: i.amountCents, currency: 'EUR', reference: i.reference, hostedUrl: `https://pay.example/checkout/${id}` };
    this.checkouts.set(id, c);
    return { ...c };
  }
  async getCheckout(id: string): Promise<CheckoutInfo> {
    const c = this.checkouts.get(id);
    if (!c) throw new Error('unknown checkout');
    return { ...c };
  }
  extractCheckoutId(body: unknown): string | null {
    const b = body as { id?: unknown; checkout_id?: unknown } | null;
    const v = b?.id ?? b?.checkout_id;
    return typeof v === 'string' ? v : null;
  }
  pay(id: string, tx = 'TX' + id.slice(-8).toUpperCase()): void {
    const c = this.checkouts.get(id)!;
    c.status = 'PAID';
    c.transactionCode = tx;
  }
  fail(id: string): void {
    this.checkouts.get(id)!.status = 'FAILED';
  }
}
