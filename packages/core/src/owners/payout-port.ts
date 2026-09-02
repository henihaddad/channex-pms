/** Spec 17 §17.4: moving money to an owner. Stripe Connect is the reference; manual bank transfer is the majority case. */
export interface PayoutRequest {
  payoutId: string;
  ownerId: string;
  /** Provider token or sealed reference; never a plain account number. */
  destinationRef: string;
  amountMinor: number;
  currency: string;
  description: string;
  idempotencyKey: string;
}
export type PayoutState = "pending" | "in_transit" | "paid" | "failed";
export interface PayoutOutcome {
  providerRef: string;
  state: PayoutState;
  failureReason?: string;
}
export interface PayoutProvider {
  readonly kind: string;
  createTransfer(req: PayoutRequest): Promise<PayoutOutcome>;
  /** PAY-2: state changes come from the provider; polling covers missed events. */
  getTransfer(providerRef: string): Promise<PayoutOutcome>;
}

/** In-memory provider for tests and the demo: transfers settle on the next `settle()`; a destination containing "fail" fails. */
export class FakePayoutProvider implements PayoutProvider {
  readonly kind = "fake";
  readonly transfers = new Map<string, PayoutOutcome & { req: PayoutRequest }>();
  private seq = 0;
  async createTransfer(req: PayoutRequest): Promise<PayoutOutcome> {
    const existing = [...this.transfers.values()].find(
      (t) => t.req.idempotencyKey === req.idempotencyKey,
    );
    if (existing) return { providerRef: existing.providerRef, state: existing.state };
    this.seq += 1;
    const providerRef = `tr_fake_${String(this.seq).padStart(4, "0")}`;
    const failed = req.destinationRef.includes("fail");
    const out = {
      providerRef,
      state: failed ? ("failed" as const) : ("in_transit" as const),
      ...(failed ? { failureReason: "account_closed" } : {}),
      req,
    };
    this.transfers.set(providerRef, out);
    return {
      providerRef,
      state: out.state,
      ...(out.failureReason ? { failureReason: out.failureReason } : {}),
    };
  }
  async getTransfer(providerRef: string): Promise<PayoutOutcome> {
    const t = this.transfers.get(providerRef);
    if (!t) return { providerRef, state: "failed", failureReason: "unknown transfer" };
    return {
      providerRef,
      state: t.state,
      ...(t.failureReason ? { failureReason: t.failureReason } : {}),
    };
  }
  /** Time passes: everything in transit is paid. */
  settle(): void {
    for (const t of this.transfers.values()) if (t.state === "in_transit") t.state = "paid";
  }
}
