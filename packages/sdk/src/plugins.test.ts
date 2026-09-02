import { describe, expect, it } from "vitest";
import { signPluginDelivery, verifyPluginDelivery } from "./plugins.js";

describe("plugin delivery signatures", () => {
  it("round-trips, rejects tampering and stale timestamps", async () => {
    const body = JSON.stringify({ type: "booking.revision_applied", id: "e1" });
    const sig = await signPluginDelivery("s3cret", "1760000000", body);
    expect(sig).toMatch(/^v1=[0-9a-f]{64}$/);
    expect(
      await verifyPluginDelivery({
        secret: "s3cret",
        body,
        signature: sig,
        timestamp: "1760000000",
        nowSeconds: 1760000010,
      }),
    ).toEqual({ ok: true });
    expect(
      await verifyPluginDelivery({
        secret: "s3cret",
        body: body + " ",
        signature: sig,
        timestamp: "1760000000",
        nowSeconds: 1760000010,
      }),
    ).toEqual({ ok: false, reason: "bad signature" });
    expect(
      await verifyPluginDelivery({
        secret: "other",
        body,
        signature: sig,
        timestamp: "1760000000",
        nowSeconds: 1760000010,
      }),
    ).toEqual({ ok: false, reason: "bad signature" });
    expect(
      await verifyPluginDelivery({
        secret: "s3cret",
        body,
        signature: sig,
        timestamp: "1760000000",
        nowSeconds: 1760001000,
      }),
    ).toEqual({ ok: false, reason: "stale" });
  });
});
