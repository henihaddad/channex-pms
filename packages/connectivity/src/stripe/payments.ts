import type {
  PaymentIntent,
  PaymentIntentRequest,
  PaymentIntentStatus,
  PaymentProvider,
} from "@pms/core";
import type { HttpTransport } from "../transport/http.js";

/**
 * Stripe PaymentIntents as the reference PaymentProvider (spec 10 §10.4). Card data
 * never reaches us: the browser's hosted fields hand over a `pm_…` token and this
 * adapter creates and confirms an intent over the REST API through the HttpTransport
 * port, so it is unit-tested with a fake transport and needs no SDK.
 */
export class StripePaymentProvider implements PaymentProvider {
  readonly kind = "stripe";
  constructor(
    private readonly http: HttpTransport,
    private readonly secretKey: string,
  ) {}

  async createIntent(req: PaymentIntentRequest): Promise<PaymentIntent> {
    const form = new URLSearchParams({
      amount: String(req.amountMinor),
      currency: req.currency.toLowerCase(),
      payment_method: req.paymentMethodToken,
      confirm: "true",
      capture_method: req.capture === "manual" ? "manual" : "automatic",
      description: req.description,
      // SCA: never hand the guest a redirect we cannot bring back into the funnel
      "automatic_payment_methods[enabled]": "true",
      "automatic_payment_methods[allow_redirects]": "never",
    });
    for (const [k, v] of Object.entries(req.metadata)) form.set(`metadata[${k}]`, v);
    const res = await this.http.request({
      method: "POST",
      path: "/v1/payment_intents",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": req.idempotencyKey,
      },
      body: form.toString(),
    });
    return toIntent(res.status, res.body);
  }

  async confirmIntent(intentId: string): Promise<PaymentIntent> {
    const res = await this.http.request({
      method: "POST",
      path: `/v1/payment_intents/${intentId}/confirm`,
      headers: { authorization: `Bearer ${this.secretKey}` },
      body: "",
    });
    return toIntent(res.status, res.body);
  }

  async capture(intentId: string, amountMinor?: number): Promise<PaymentIntent> {
    const form = new URLSearchParams();
    if (amountMinor !== undefined) form.set("amount_to_capture", String(amountMinor));
    const res = await this.http.request({
      method: "POST",
      path: `/v1/payment_intents/${intentId}/capture`,
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });
    return toIntent(res.status, res.body);
  }

  async refund(
    intentId: string,
    amountMinor: number,
    idempotencyKey: string,
  ): Promise<{ refundId: string; status: "succeeded" | "failed" }> {
    const form = new URLSearchParams({ payment_intent: intentId, amount: String(amountMinor) });
    const res = await this.http.request({
      method: "POST",
      path: "/v1/refunds",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": idempotencyKey,
      },
      body: form.toString(),
    });
    const o = (res.body ?? {}) as { id?: string; status?: string };
    return {
      refundId: o.id ?? "",
      status: res.status < 400 && o.id && o.status !== "failed" ? "succeeded" : "failed",
    };
  }
}

interface StripeIntent {
  id?: string;
  status?: string;
  next_action?: { type?: string; redirect_to_url?: { url?: string } };
  last_payment_error?: { message?: string; code?: string };
  error?: { message?: string; code?: string; payment_intent?: StripeIntent };
}

function toIntent(status: number, body: unknown): PaymentIntent {
  const o = (body ?? {}) as StripeIntent;
  // a declined confirm comes back as a 402 whose error carries the intent
  const pi = status >= 400 ? (o.error?.payment_intent ?? o) : o;
  const failure = o.error?.message ?? o.error?.code ?? pi.last_payment_error?.message;
  if (status >= 400 || !pi.id)
    return {
      intentId: pi.id ?? "",
      status: "failed",
      failureReason: failure ?? `stripe ${String(status)}`,
    };
  const mapped: PaymentIntentStatus =
    pi.status === "succeeded"
      ? "succeeded"
      : pi.status === "requires_capture"
        ? "requires_capture"
        : pi.status === "requires_action" || pi.status === "requires_confirmation"
          ? "requires_action"
          : pi.status === "processing"
            ? "requires_action"
            : "failed";
  const next = pi.next_action?.redirect_to_url?.url ?? pi.next_action?.type;
  return {
    intentId: pi.id,
    status: mapped,
    ...(mapped === "requires_action" && next ? { nextAction: next } : {}),
    ...(mapped === "failed" ? { failureReason: failure ?? pi.status ?? "failed" } : {}),
  };
}
