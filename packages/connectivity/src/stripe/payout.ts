import type { PayoutOutcome, PayoutProvider, PayoutRequest } from "@pms/core";
import type { HttpTransport } from "../transport/http.js";

/**
 * Stripe Connect transfers as the reference PayoutProvider (spec 17 §17.4).
 * Written against the REST API over the HttpTransport port so it needs no SDK
 * and is unit-tested with a fake transport bound to api.stripe.com. `destinationRef`
 * is the connected account id (acct_…); nothing else about the owner's bank is stored.
 */
export class StripeConnectPayoutProvider implements PayoutProvider {
  readonly kind = "stripe_connect";
  constructor(
    private readonly http: HttpTransport,
    private readonly secretKey: string,
  ) {}

  async createTransfer(req: PayoutRequest): Promise<PayoutOutcome> {
    const form = new URLSearchParams({
      amount: String(req.amountMinor),
      currency: req.currency.toLowerCase(),
      destination: req.destinationRef,
      description: req.description,
      "metadata[payout_id]": req.payoutId,
      "metadata[owner_id]": req.ownerId,
    });
    const res = await this.http.request({
      method: "POST",
      path: "/v1/transfers",
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/x-www-form-urlencoded",
        "idempotency-key": req.idempotencyKey,
      },
      body: form.toString(),
    });
    return toOutcome(res.status, res.body);
  }

  async getTransfer(providerRef: string): Promise<PayoutOutcome> {
    const res = await this.http.request({
      method: "GET",
      path: `/v1/transfers/${providerRef}`,
      headers: { authorization: `Bearer ${this.secretKey}` },
    });
    return toOutcome(res.status, res.body);
  }
}

function toOutcome(status: number, body: unknown): PayoutOutcome {
  const o = (body ?? {}) as {
    id?: string;
    reversed?: boolean;
    error?: { message?: string; code?: string };
  };
  if (status >= 400 || !o.id)
    return {
      providerRef: o.id ?? "",
      state: "failed",
      failureReason: o.error?.message ?? o.error?.code ?? `stripe ${String(status)}`,
    };
  // a Stripe transfer to a connected account settles immediately; a reversal is the failure case
  return {
    providerRef: o.id,
    state: o.reversed ? "failed" : "paid",
    ...(o.reversed ? { failureReason: "reversed" } : {}),
  };
}

/** A transport for Stripe's form-encoded REST API: bodies are sent as given, responses parsed as JSON. */
export function stripeTransport(
  baseUrl = "https://api.stripe.com",
  fetchImpl: typeof fetch = fetch,
): HttpTransport {
  return {
    async request(req) {
      const init: RequestInit = { method: req.method, headers: { ...req.headers } };
      if (req.body !== undefined)
        init.body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);
      const res = await fetchImpl(`${baseUrl}${req.path}`, init);
      const text = await res.text();
      let body: unknown = null;
      try {
        body = text ? JSON.parse(text) : null;
      } catch {
        body = text;
      }
      return { status: res.status, headers: Object.fromEntries(res.headers.entries()), body };
    },
  };
}
