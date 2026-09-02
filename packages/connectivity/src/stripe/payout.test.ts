import { describe, expect, it } from "vitest";
import type { HttpRequest, HttpResponse, HttpTransport } from "../transport/http.js";
import { StripeConnectPayoutProvider } from "./payout.js";

class FakeStripe implements HttpTransport {
  requests: HttpRequest[] = [];
  reversed = false;
  fail = false;
  async request(req: HttpRequest): Promise<HttpResponse> {
    this.requests.push(req);
    if (this.fail)
      return {
        status: 400,
        headers: {},
        body: { error: { code: "balance_insufficient", message: "Insufficient funds" } },
      };
    return {
      status: 200,
      headers: {},
      body: { id: "tr_123", reversed: this.reversed, amount: 12345 },
    };
  }
}
const req = {
  payoutId: "p1",
  ownerId: "o1",
  destinationRef: "acct_1ABC",
  amountMinor: 12345,
  currency: "EUR",
  description: "Owner statement",
  idempotencyKey: "payout:p1",
};

describe("StripeConnectPayoutProvider", () => {
  it("posts a form-encoded transfer with the idempotency key and maps success to paid", async () => {
    const http = new FakeStripe();
    const p = new StripeConnectPayoutProvider(http, "sk_test_x");
    expect(await p.createTransfer(req)).toEqual({ providerRef: "tr_123", state: "paid" });
    const r = http.requests[0]!;
    expect(r.method).toBe("POST");
    expect(r.path).toBe("/v1/transfers");
    expect(r.headers?.["idempotency-key"]).toBe("payout:p1");
    expect(r.headers?.authorization).toBe("Bearer sk_test_x");
    expect(String(r.body)).toContain("amount=12345&currency=eur&destination=acct_1ABC");
    expect(String(r.body)).not.toContain("iban");
  });
  it("maps API errors and reversals to failed with the reason", async () => {
    const http = new FakeStripe();
    const p = new StripeConnectPayoutProvider(http, "sk");
    http.fail = true;
    expect(await p.createTransfer(req)).toMatchObject({
      state: "failed",
      failureReason: "Insufficient funds",
    });
    http.fail = false;
    http.reversed = true;
    expect(await p.getTransfer("tr_123")).toEqual({
      providerRef: "tr_123",
      state: "failed",
      failureReason: "reversed",
    });
  });
});
