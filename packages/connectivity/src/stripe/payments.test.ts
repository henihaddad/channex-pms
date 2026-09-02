import { describe, expect, it } from "vitest";
import type { HttpRequest, HttpResponse, HttpTransport } from "../transport/http.js";
import { StripePaymentProvider } from "./payments.js";

class FakeStripe implements HttpTransport {
  requests: HttpRequest[] = [];
  next: HttpResponse = { status: 200, headers: {}, body: { id: "pi_1", status: "succeeded" } };
  async request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    return this.next;
  }
}
const req = {
  amountMinor: 24000,
  currency: "EUR",
  paymentMethodToken: "pm_card_visa",
  capture: "automatic" as const,
  description: "Stay at Owner Flat",
  idempotencyKey: "hold:h1",
  metadata: { hold_id: "h1", property_id: "p1" },
};

describe("StripePaymentProvider", () => {
  it("creates and confirms an intent with the token, never a PAN, under the idempotency key", async () => {
    const http = new FakeStripe();
    const p = new StripePaymentProvider(http, "sk_test_x");
    expect(await p.createIntent(req)).toEqual({ intentId: "pi_1", status: "succeeded" });
    const r = http.requests[0]!;
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/v1/payment_intents");
    expect(r.headers?.["idempotency-key"]).toBe("hold:h1");
    expect(String(r.body)).toContain("amount=24000&currency=eur&payment_method=pm_card_visa");
    expect(String(r.body)).toContain("confirm=true");
    expect(String(r.body)).toContain("metadata%5Bhold_id%5D=h1");
    expect(String(r.body)).not.toMatch(/\d{13,19}/);
  });

  it("maps SCA to requires_action with the next step, then confirms", async () => {
    const http = new FakeStripe();
    http.next = {
      status: 200,
      headers: {},
      body: {
        id: "pi_2",
        status: "requires_action",
        next_action: { type: "use_stripe_sdk" },
      },
    };
    const p = new StripePaymentProvider(http, "sk_test_x");
    expect(await p.createIntent(req)).toEqual({
      intentId: "pi_2",
      status: "requires_action",
      nextAction: "use_stripe_sdk",
    });
    http.next = { status: 200, headers: {}, body: { id: "pi_2", status: "succeeded" } };
    expect(await p.confirmIntent("pi_2")).toEqual({ intentId: "pi_2", status: "succeeded" });
    expect(http.requests[1]!.path).toBe("/v1/payment_intents/pi_2/confirm");
  });

  it("surfaces a decline as a recoverable failure carrying Stripe's reason", async () => {
    const http = new FakeStripe();
    http.next = {
      status: 402,
      headers: {},
      body: {
        error: {
          code: "card_declined",
          message: "Your card was declined.",
          payment_intent: { id: "pi_3", status: "requires_payment_method" },
        },
      },
    };
    const p = new StripePaymentProvider(http, "sk_test_x");
    expect(await p.createIntent(req)).toEqual({
      intentId: "pi_3",
      status: "failed",
      failureReason: "Your card was declined.",
    });
  });

  it("refunds by intent with an idempotency key and manual capture captures", async () => {
    const http = new FakeStripe();
    http.next = { status: 200, headers: {}, body: { id: "re_1", status: "succeeded" } };
    const p = new StripePaymentProvider(http, "sk_test_x");
    expect(await p.refund("pi_1", 5000, "refund:b1:1")).toEqual({
      refundId: "re_1",
      status: "succeeded",
    });
    expect(String(http.requests[0]!.body)).toBe("payment_intent=pi_1&amount=5000");
    expect(http.requests[0]!.headers?.["idempotency-key"]).toBe("refund:b1:1");
    http.next = { status: 200, headers: {}, body: { id: "pi_1", status: "succeeded" } };
    expect(await p.capture("pi_1", 24000)).toEqual({ intentId: "pi_1", status: "succeeded" });
    expect(http.requests[1]!.path).toBe("/v1/payment_intents/pi_1/capture");
  });
});
