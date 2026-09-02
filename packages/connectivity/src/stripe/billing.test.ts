import { describe, expect, it } from "vitest";
import type { InvoiceDraft } from "@pms/core";
import type { HttpRequest, HttpResponse, HttpTransport } from "../transport/http.js";
import { StripeBillingProvider } from "./billing.js";

class FakeStripe implements HttpTransport {
  requests: HttpRequest[] = [];
  payStatus = "paid";
  async request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    if (req.path === "/v1/customers") return { status: 200, headers: {}, body: { id: "cus_1" } };
    if (req.path.endsWith("/attach"))
      return {
        status: 200,
        headers: {},
        body: { id: "pm_1", card: { brand: "visa", last4: "4242" } },
      };
    if (req.path === "/v1/invoices")
      return { status: 200, headers: {}, body: { id: "in_1", status: "draft" } };
    if (req.path.endsWith("/pay"))
      return this.payStatus === "paid"
        ? {
            status: 200,
            headers: {},
            body: { id: "in_1", status: "paid", invoice_pdf: "https://pdf" },
          }
        : {
            status: 402,
            headers: {},
            body: {
              error: { code: "card_declined", message: "Your card was declined." },
              id: "in_1",
              status: "open",
            },
          };
    return { status: 200, headers: {}, body: { id: "x" } };
  }
}
const draft: InvoiceDraft = {
  currency: "EUR",
  period: { from: "2026-06-01", to: "2026-07-01" },
  peakUnits: 40,
  lines: [
    {
      key: "units:1",
      description: "Active units 1–50",
      quantity: 40,
      unitMinor: 800,
      amountMinor: 32000,
    },
    {
      key: "addon:priority_support",
      description: "Priority support",
      quantity: 1,
      unitMinor: 9900,
      amountMinor: 9900,
    },
  ],
  subtotalMinor: 41900,
  vat: { rateBps: 2300, amountMinor: 9637, reverseCharge: false, note: "VAT 23 % (PT)" },
  totalMinor: 51537,
};

describe("StripeBillingProvider", () => {
  it("creates the customer with tax id, attaches the method as default, invoices line by line and pays under idempotency keys", async () => {
    const http = new FakeStripe();
    const p = new StripeBillingProvider(http, "sk_test_x");
    expect(
      await p.ensureCustomer({
        orgId: "org1",
        name: "Direct Co",
        email: "b@x.io",
        country: "PT",
        vatId: "PT123",
        customerRef: null,
      }),
    ).toEqual({ customerRef: "cus_1" });
    expect(String(http.requests[0]!.body)).toContain("tax_id_data%5B0%5D%5Bvalue%5D=PT123");
    expect(await p.attachPaymentMethod("cus_1", "pm_tok")).toEqual({
      methodRef: "pm_1",
      brand: "visa",
      last4: "4242",
    });
    expect(String(http.requests[2]!.body)).toContain("default_payment_method%5D=pm_1");
    const r = await p.charge({
      customerRef: "cus_1",
      draft,
      idempotencyKey: "inv:org1:2026-06",
      description: "June",
    });
    expect(r).toEqual({ invoiceRef: "in_1", state: "paid", pdfUrl: "https://pdf" });
    const items = http.requests.filter((q) => q.path === "/v1/invoiceitems");
    expect(items).toHaveLength(3);
    expect(String(items[2]!.body)).toContain("amount=9637");
    expect(items.map((q) => q.headers?.["idempotency-key"])).toEqual([
      "inv:org1:2026-06:line:0",
      "inv:org1:2026-06:line:1",
      "inv:org1:2026-06:line:2",
    ]);
    expect(http.requests.some((q) => q.path === "/v1/invoices/in_1/finalize")).toBe(true);
    expect(
      http.requests.every((q) => !/\d{13,19}/.test(typeof q.body === "string" ? q.body : "")),
    ).toBe(true);
  });
  it("a declined collection leaves the invoice open with the reason, and retry pays it later", async () => {
    const http = new FakeStripe();
    http.payStatus = "open";
    const p = new StripeBillingProvider(http, "sk_test_x");
    const r = await p.charge({
      customerRef: "cus_1",
      draft,
      idempotencyKey: "k",
      description: "d",
    });
    expect(r).toMatchObject({
      invoiceRef: "in_1",
      state: "open",
      failureReason: "Your card was declined.",
    });
    http.payStatus = "paid";
    expect(await p.retry("in_1")).toMatchObject({ state: "paid" });
  });
});
