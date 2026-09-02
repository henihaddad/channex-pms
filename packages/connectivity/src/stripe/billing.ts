import type {
  BillingCustomer,
  BillingInvoiceResult,
  BillingInvoiceState,
  BillingPaymentMethod,
  BillingProvider,
  InvoiceDraft,
} from "@pms/core";
import type { HttpTransport } from "../transport/http.js";

/**
 * Stripe Billing as the reference BillingProvider (spec 12 §12.5): customers, a
 * default payment method, one invoice per period built from our own usage lines
 * (BILL-2: the invoice the customer sees is the draft we computed), collected
 * automatically with the idempotency key. REST over the HttpTransport port; no SDK.
 */
export class StripeBillingProvider implements BillingProvider {
  readonly kind = "stripe_billing";
  constructor(
    private readonly http: HttpTransport,
    private readonly secretKey: string,
  ) {}

  private headers(idempotencyKey?: string): Record<string, string> {
    return {
      authorization: `Bearer ${this.secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
    };
  }

  async ensureCustomer(input: {
    orgId: string;
    name: string;
    email: string;
    country: string;
    vatId: string | null;
    customerRef: string | null;
  }): Promise<BillingCustomer> {
    const form = new URLSearchParams({
      name: input.name,
      email: input.email,
      "address[country]": input.country,
      "metadata[org_id]": input.orgId,
    });
    if (input.vatId) {
      form.set("tax_id_data[0][type]", "eu_vat");
      form.set("tax_id_data[0][value]", input.vatId);
    }
    const res = await this.http.request({
      method: "POST",
      path: input.customerRef ? `/v1/customers/${input.customerRef}` : "/v1/customers",
      headers: this.headers(input.customerRef ? undefined : `customer:${input.orgId}`),
      body: form.toString(),
    });
    const o = (res.body ?? {}) as { id?: string; error?: { message?: string } };
    if (res.status >= 400 || !o.id)
      throw new Error(o.error?.message ?? `stripe ${String(res.status)}`);
    return { customerRef: o.id };
  }

  async attachPaymentMethod(
    customerRef: string,
    methodToken: string,
  ): Promise<BillingPaymentMethod> {
    const attach = await this.http.request({
      method: "POST",
      path: `/v1/payment_methods/${methodToken}/attach`,
      headers: this.headers(),
      body: new URLSearchParams({ customer: customerRef }).toString(),
    });
    const pm = (attach.body ?? {}) as {
      id?: string;
      card?: { brand?: string; last4?: string };
      error?: { message?: string };
    };
    if (attach.status >= 400 || !pm.id)
      throw new Error(pm.error?.message ?? `stripe ${String(attach.status)}`);
    await this.http.request({
      method: "POST",
      path: `/v1/customers/${customerRef}`,
      headers: this.headers(),
      body: new URLSearchParams({ "invoice_settings[default_payment_method]": pm.id }).toString(),
    });
    return { methodRef: pm.id, brand: pm.card?.brand ?? "card", last4: pm.card?.last4 ?? "" };
  }

  async charge(input: {
    customerRef: string;
    draft: InvoiceDraft;
    idempotencyKey: string;
    description: string;
  }): Promise<BillingInvoiceResult> {
    // 1. the invoice shell, 2. one item per line, 3. finalize + pay
    const created = await this.http.request({
      method: "POST",
      path: "/v1/invoices",
      headers: this.headers(`${input.idempotencyKey}:invoice`),
      body: new URLSearchParams({
        customer: input.customerRef,
        currency: input.draft.currency.toLowerCase(),
        collection_method: "charge_automatically",
        auto_advance: "false",
        description: input.description,
        "metadata[period_from]": input.draft.period.from,
        "metadata[period_to]": input.draft.period.to,
        "metadata[peak_units]": String(input.draft.peakUnits),
        ...(input.draft.vat.reverseCharge ? { "metadata[reverse_charge]": "true" } : {}),
      }).toString(),
    });
    const inv = (created.body ?? {}) as { id?: string; error?: { message?: string } };
    if (created.status >= 400 || !inv.id)
      return {
        invoiceRef: "",
        state: "void",
        pdfUrl: null,
        failureReason: inv.error?.message ?? "invoice not created",
      };
    const items = [
      ...input.draft.lines,
      ...(input.draft.vat.amountMinor > 0
        ? [
            {
              key: "vat",
              description: input.draft.vat.note,
              quantity: 1,
              unitMinor: input.draft.vat.amountMinor,
              amountMinor: input.draft.vat.amountMinor,
            },
          ]
        : []),
    ];
    for (const [i, line] of items.entries())
      await this.http.request({
        method: "POST",
        path: "/v1/invoiceitems",
        headers: this.headers(`${input.idempotencyKey}:line:${String(i)}`),
        body: new URLSearchParams({
          customer: input.customerRef,
          invoice: inv.id,
          currency: input.draft.currency.toLowerCase(),
          amount: String(line.amountMinor),
          description: `${line.description}${line.quantity > 1 ? ` × ${String(line.quantity)}` : ""}`,
        }).toString(),
      });
    await this.http.request({
      method: "POST",
      path: `/v1/invoices/${inv.id}/finalize`,
      headers: this.headers(`${input.idempotencyKey}:finalize`),
      body: "",
    });
    const paid = await this.http.request({
      method: "POST",
      path: `/v1/invoices/${inv.id}/pay`,
      headers: this.headers(`${input.idempotencyKey}:pay`),
      body: "",
    });
    return toResult(inv.id, paid.status, paid.body);
  }

  async retry(invoiceRef: string): Promise<BillingInvoiceResult> {
    const res = await this.http.request({
      method: "POST",
      path: `/v1/invoices/${invoiceRef}/pay`,
      headers: this.headers(),
      body: "",
    });
    return toResult(invoiceRef, res.status, res.body);
  }
}

function toResult(id: string, status: number, body: unknown): BillingInvoiceResult {
  const o = (body ?? {}) as {
    id?: string;
    status?: string;
    invoice_pdf?: string;
    error?: { message?: string; code?: string };
  };
  const state: BillingInvoiceState =
    o.status === "paid"
      ? "paid"
      : o.status === "void"
        ? "void"
        : o.status === "uncollectible"
          ? "uncollectible"
          : o.status === "draft"
            ? "draft"
            : "open";
  return {
    invoiceRef: o.id ?? id,
    state: status >= 400 ? "open" : state,
    pdfUrl: o.invoice_pdf ?? null,
    ...(status >= 400
      ? { failureReason: o.error?.message ?? o.error?.code ?? `stripe ${String(status)}` }
      : {}),
  };
}
