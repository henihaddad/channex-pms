import type { InvoiceDraft } from "./types.js";

/** Spec 12 §12.5: Stripe Billing behind a port so another processor can be substituted. */
export interface BillingCustomer {
  customerRef: string;
}
export interface BillingPaymentMethod {
  methodRef: string;
  brand: string;
  last4: string;
}
export type BillingInvoiceState = "draft" | "open" | "paid" | "uncollectible" | "void";
export interface BillingInvoiceResult {
  invoiceRef: string;
  state: BillingInvoiceState;
  /** Hosted PDF, when the provider renders one. */
  pdfUrl: string | null;
  failureReason?: string;
}

export interface BillingProvider {
  readonly kind: string;
  ensureCustomer(input: {
    orgId: string;
    name: string;
    email: string;
    country: string;
    vatId: string | null;
    customerRef: string | null;
  }): Promise<BillingCustomer>;
  /**
   * Start a card setup for the customer: the browser confirms it with the hosted field,
   * which is where a European card answers its one 3-D Secure challenge, so the invoices
   * that follow are charged off-session without another one.
   */
  startCardSetup(customerRef: string): Promise<{ clientSecret: string }>;
  /** A provider token from hosted fields; never a PAN. */
  attachPaymentMethod(customerRef: string, methodToken: string): Promise<BillingPaymentMethod>;
  /** Create and try to collect an invoice for one period; idempotent per key. */
  charge(input: {
    customerRef: string;
    draft: InvoiceDraft;
    idempotencyKey: string;
    description: string;
  }): Promise<BillingInvoiceResult>;
  /** Dunning retry of an open invoice. */
  retry(invoiceRef: string): Promise<BillingInvoiceResult>;
}

/** In-memory provider: tokens containing "decline" fail; `settle()` pays every open invoice. */
export class FakeBillingProvider implements BillingProvider {
  readonly kind = "fake";
  readonly customers = new Map<string, { name: string; email: string }>();
  readonly methods = new Map<string, BillingPaymentMethod>();
  readonly invoices = new Map<
    string,
    BillingInvoiceResult & { customerRef: string; total: number }
  >();
  private seq = 0;
  /** Simulate an outage on the next charge (BILL-1 tests). */
  failNext = false;
  async ensureCustomer(input: {
    orgId: string;
    name: string;
    email: string;
    customerRef: string | null;
  }) {
    const ref = input.customerRef ?? `cus_fake_${input.orgId.slice(0, 8)}`;
    this.customers.set(ref, { name: input.name, email: input.email });
    return { customerRef: ref };
  }
  async startCardSetup(customerRef: string): Promise<{ clientSecret: string }> {
    return { clientSecret: `seti_fake_${customerRef}_secret_fake` };
  }
  async attachPaymentMethod(
    customerRef: string,
    methodToken: string,
  ): Promise<BillingPaymentMethod> {
    const m = {
      methodRef: `pm_${methodToken}`,
      brand: methodToken.includes("amex") ? "amex" : "visa",
      last4: methodToken.slice(-4),
    };
    this.methods.set(customerRef, m);
    return m;
  }
  async charge(input: {
    customerRef: string;
    draft: InvoiceDraft;
    idempotencyKey: string;
  }): Promise<BillingInvoiceResult> {
    if (this.failNext) {
      this.failNext = false;
      throw new Error("billing provider unavailable");
    }
    const existing = [...this.invoices.entries()].find(([k]) => k === input.idempotencyKey);
    if (existing) return strip(existing[1]);
    this.seq += 1;
    const method = this.methods.get(input.customerRef);
    const declined = !method || method.methodRef.includes("decline");
    const inv = {
      invoiceRef: `in_fake_${String(this.seq).padStart(4, "0")}`,
      state: (input.draft.totalMinor === 0
        ? "paid"
        : declined
          ? "open"
          : "paid") as BillingInvoiceState,
      pdfUrl: null,
      customerRef: input.customerRef,
      total: input.draft.totalMinor,
      ...(declined && input.draft.totalMinor > 0
        ? { failureReason: method ? "card_declined" : "no_payment_method" }
        : {}),
    };
    this.invoices.set(input.idempotencyKey, inv);
    return strip(inv);
  }
  async retry(invoiceRef: string): Promise<BillingInvoiceResult> {
    const entry = [...this.invoices.values()].find((i) => i.invoiceRef === invoiceRef);
    if (!entry)
      return { invoiceRef, state: "void", pdfUrl: null, failureReason: "unknown invoice" };
    const method = this.methods.get(entry.customerRef);
    if (method && !method.methodRef.includes("decline")) {
      entry.state = "paid";
      delete entry.failureReason;
    }
    return strip(entry);
  }
  /** Every open invoice gets paid (a card update in the test). */
  settle(): void {
    for (const i of this.invoices.values()) if (i.state === "open") i.state = "paid";
  }
}
const strip = (i: BillingInvoiceResult): BillingInvoiceResult => ({
  invoiceRef: i.invoiceRef,
  state: i.state,
  pdfUrl: i.pdfUrl,
  ...(i.failureReason ? { failureReason: i.failureReason } : {}),
});
