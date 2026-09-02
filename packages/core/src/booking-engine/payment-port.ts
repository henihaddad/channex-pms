/** Spec 10 §10.4: card data never touches our servers; the provider hands us tokens and intents. */
export interface PaymentIntentRequest {
  amountMinor: number;
  currency: string;
  /** A provider token from hosted fields, never a PAN. */
  paymentMethodToken: string;
  capture: "automatic" | "manual";
  description: string;
  idempotencyKey: string;
  metadata: Record<string, string>;
}
export type PaymentIntentStatus = "succeeded" | "requires_action" | "requires_capture" | "failed";
export interface PaymentIntent {
  intentId: string;
  status: PaymentIntentStatus;
  /** For SCA: what the browser must do next; opaque to us. */
  nextAction?: string;
  failureReason?: string;
}
export interface PaymentProvider {
  readonly kind: string;
  createIntent(req: PaymentIntentRequest): Promise<PaymentIntent>;
  /** After 3-D Secure completes in the browser. */
  confirmIntent(intentId: string): Promise<PaymentIntent>;
  capture(intentId: string, amountMinor?: number): Promise<PaymentIntent>;
  refund(
    intentId: string,
    amountMinor: number,
    idempotencyKey: string,
  ): Promise<{ refundId: string; status: "succeeded" | "failed" }>;
}

/**
 * In-memory provider for tests and the demo: a token containing "decline" fails,
 * one containing "3ds" needs an action first, everything else succeeds. Idempotent per key.
 */
export class FakePaymentProvider implements PaymentProvider {
  readonly kind = "fake";
  readonly intents = new Map<string, PaymentIntent & { req: PaymentIntentRequest }>();
  readonly refunds: Array<{ intentId: string; amountMinor: number }> = [];
  private seq = 0;
  async createIntent(req: PaymentIntentRequest): Promise<PaymentIntent> {
    const existing = [...this.intents.values()].find(
      (i) => i.req.idempotencyKey === req.idempotencyKey,
    );
    if (existing) return strip(existing);
    this.seq += 1;
    const intentId = `pi_fake_${String(this.seq).padStart(4, "0")}`;
    const status: PaymentIntentStatus = req.paymentMethodToken.includes("decline")
      ? "failed"
      : req.paymentMethodToken.includes("3ds")
        ? "requires_action"
        : req.capture === "manual"
          ? "requires_capture"
          : "succeeded";
    const intent = {
      intentId,
      status,
      req,
      ...(status === "failed" ? { failureReason: "card_declined" } : {}),
      ...(status === "requires_action" ? { nextAction: "3ds:fake" } : {}),
    };
    this.intents.set(intentId, intent);
    return strip(intent);
  }
  async confirmIntent(intentId: string): Promise<PaymentIntent> {
    const i = this.intents.get(intentId);
    if (!i) return { intentId, status: "failed", failureReason: "unknown intent" };
    if (i.status === "requires_action")
      i.status = i.req.capture === "manual" ? "requires_capture" : "succeeded";
    return strip(i);
  }
  async capture(intentId: string): Promise<PaymentIntent> {
    const i = this.intents.get(intentId);
    if (!i) return { intentId, status: "failed", failureReason: "unknown intent" };
    if (i.status === "requires_capture") i.status = "succeeded";
    return strip(i);
  }
  async refund(
    intentId: string,
    amountMinor: number,
  ): Promise<{ refundId: string; status: "succeeded" | "failed" }> {
    this.refunds.push({ intentId, amountMinor });
    return { refundId: `re_fake_${String(this.refunds.length)}`, status: "succeeded" };
  }
}
const strip = (i: PaymentIntent & { req?: PaymentIntentRequest }): PaymentIntent => ({
  intentId: i.intentId,
  status: i.status,
  ...(i.nextAction ? { nextAction: i.nextAction } : {}),
  ...(i.failureReason ? { failureReason: i.failureReason } : {}),
});
