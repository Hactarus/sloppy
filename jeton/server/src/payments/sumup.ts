import type { CheckoutInfo, CheckoutStatus, CreateCheckoutInput, PaymentProvider } from './provider.js';
import { centsToDecimal, decimalToCents } from '../util/money.js';

export interface SumupOptions {
  apiBase: string;
  apiKey: string;
  merchantCode: string;
  fetchImpl?: typeof fetch;
}

/**
 * SumUp online checkout (https://developer.sumup.com/online-payments/checkouts/hosted-checkout/):
 *   POST /v0.1/checkouts {checkout_reference, amount, currency, merchant_code, description, return_url, redirect_url,
 *                         hosted_checkout: {enabled: true}}  -> {id, status: PENDING, hosted_checkout_url, ...}
 *   GET  /v0.1/checkouts/{id}                                -> {status: PENDING|PAID|FAILED, amount, transactions: [{transaction_code}]}
 * `return_url` receives the webhook; the body is only used to find the checkout id, the status is always re-read with GET.
 * Amounts are decimal euros in the SumUp API; conversions go through string arithmetic (no float rounding).
 */
export class SumupProvider implements PaymentProvider {
  readonly name = 'sumup' as const;
  private readonly f: typeof fetch;
  constructor(private readonly o: SumupOptions) {
    this.f = o.fetchImpl ?? fetch;
  }

  private async call(method: string, path: string, body?: unknown): Promise<any> {
    const res = await this.f(this.o.apiBase.replace(/\/$/, '') + path, {
      method,
      headers: { Authorization: `Bearer ${this.o.apiKey}`, 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`SumUp ${method} ${path} -> ${res.status}`);
    return text ? JSON.parse(text) : {};
  }

  private map(c: any): CheckoutInfo {
    const status: CheckoutStatus = c.status === 'PAID' ? 'PAID' : c.status === 'FAILED' ? 'FAILED' : c.status === 'EXPIRED' ? 'EXPIRED' : 'PENDING';
    const tx = Array.isArray(c.transactions) ? c.transactions.find((t: any) => t.status === 'SUCCESSFUL') ?? c.transactions[0] : undefined;
    return {
      id: c.id,
      status,
      amountCents: decimalToCents(c.amount),
      currency: c.currency,
      reference: c.checkout_reference,
      transactionCode: c.transaction_code ?? tx?.transaction_code ?? null,
      hostedUrl: c.hosted_checkout_url ?? null,
    };
  }

  async createCheckout(i: CreateCheckoutInput): Promise<CheckoutInfo> {
    const c = await this.call('POST', '/v0.1/checkouts', {
      checkout_reference: i.reference,
      amount: Number(centsToDecimal(i.amountCents)),
      currency: 'EUR',
      merchant_code: this.o.merchantCode,
      description: i.description,
      return_url: i.webhookUrl,
      redirect_url: i.redirectUrl,
      hosted_checkout: { enabled: true },
    });
    return this.map(c);
  }

  async getCheckout(id: string): Promise<CheckoutInfo> {
    return this.map(await this.call('GET', '/v0.1/checkouts/' + encodeURIComponent(id)));
  }

  extractCheckoutId(body: unknown): string | null {
    const b = body as any;
    const v = b?.payload?.checkout_id ?? b?.id ?? b?.checkout_id;
    return typeof v === 'string' && v.length < 200 ? v : null;
  }
}
