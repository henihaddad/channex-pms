import { describe, expect, it } from "vitest";
import {
  FakeClock,
  type ConnectivityProvider,
  type PushResult,
  ThrottleError,
  TransientError,
} from "@pms/core";
import { MemoryCircuitBreaker, TokenBucket } from "./limiter.js";
import { MemoryAriStore } from "./memory-store.js";
import { pushProperty, type PushContext } from "./pipeline.js";
import { RetryLater } from "./ports.js";

function harness(provider: Partial<ConnectivityProvider>, opts: { verify?: number } = {}) {
  const clock = new FakeClock("2026-09-01T00:00:00Z");
  const store = new MemoryAriStore();
  // sleeping advances the fake clock so a drained bucket refills instead of spinning
  const limiter = new TokenBucket(clock, {
    baseRatePerSecond: 100,
    burst: 100,
    sleep: async (ms) => {
      clock.advance({ milliseconds: ms });
    },
  });
  const breaker = new MemoryCircuitBreaker(clock, { failureThreshold: 2, cooldownMs: 1000 });
  const ctx: PushContext = {
    orgId: "org",
    propertyId: "prop",
    provider: provider as ConnectivityProvider,
    store,
    limiter,
    breaker,
    clock,
    meta: { dedupeKey: "k", requestId: "r" },
    verifySampleRate: opts.verify ?? 0,
  };
  return { clock, store, limiter, breaker, ctx };
}

const okPush = async (b: { entries: unknown[] }): Promise<PushResult> => ({
  accepted: b.entries.length,
  rejected: [],
  warnings: [],
  taskIds: [],
});

describe("pushProperty", () => {
  it("pushes pending cells, marks them synced with the mirror, and is a no-op afterwards", async () => {
    const calls: string[] = [];
    const { store, ctx } = harness({
      pushAvailability: async (b) => {
        calls.push("avail");
        return okPush(b);
      },
      pushRatesAndRestrictions: async (b) => {
        calls.push("restr");
        return okPush(b);
      },
    });
    store.setRate("rp", "2026-10-01", { rate: 100 });
    store.setRate("rp", "2026-10-02", { rate: 100 });
    store.setAvailability("rt", "2026-10-01", 1);
    const s = await pushProperty(ctx);
    expect(s).toMatchObject({ batches: 2, accepted: 2, rejected: 0 });
    expect(calls).toEqual(["avail", "restr"]); // money-losing lane first
    expect(store.states()).toMatchObject({ synced: 3, pending: 0 });
    expect(store.rate.get("rate|rp|2026-10-01")?.synced).toEqual({ rate: 100 });
    expect((await pushProperty(ctx)).skipped).toBe("nothing_pending");
  });

  it("maps per-entry rejections to failed cells that do not retry until edited", async () => {
    const { store, ctx } = harness({
      pushAvailability: okPush,
      pushRatesAndRestrictions: async (b) => {
        const rejected = b.entries.flatMap((e, index) =>
          (e.rate ?? 0) < 0 ? [{ index, reason: "rate: below minimum", field: "rate" }] : [],
        );
        return {
          accepted: b.entries.length - rejected.length,
          rejected,
          warnings: [],
          taskIds: [],
        };
      },
    });
    store.setRate("rp", "2026-10-01", { rate: -5 });
    store.setRate("rp", "2026-10-05", { rate: 100 });
    const s = await pushProperty(ctx);
    expect(s.rejected).toBe(1);
    expect(store.rate.get("rate|rp|2026-10-01")?.state).toBe("failed");
    expect(store.rate.get("rate|rp|2026-10-05")?.state).toBe("synced");
    expect((await pushProperty(ctx)).skipped).toBe("nothing_pending");
    store.setRate("rp", "2026-10-01", { rate: 5 });
    expect((await pushProperty(ctx)).accepted).toBe(1);
  });

  it("a rejection naming a property the provider does not know yet retries instead of failing", async () => {
    // Channex answers this way to a push that lands right after provisioning created the objects
    let calls = 0;
    const { store, ctx } = harness({
      pushAvailability: okPush,
      pushRatesAndRestrictions: async (b) => {
        calls += 1;
        if (calls === 1)
          return {
            accepted: 0,
            rejected: b.entries.map((_, index) => ({
              index,
              reason: "property_id: Not found property for this change",
              field: "property_id",
            })),
            warnings: [],
            taskIds: [],
          };
        return okPush(b);
      },
    });
    store.setRate("rp", "2026-10-01", { rate: 100 });
    store.setRate("rp", "2026-10-02", { rate: 100 });
    await expect(pushProperty(ctx)).rejects.toBeInstanceOf(RetryLater);
    expect(store.states().pending).toBe(2);
    expect(store.rate.get("rate|rp|2026-10-01")?.lastError).toBeUndefined();
    // the two days compress into one range entry; both cells end up synced
    expect((await pushProperty(ctx)).rejected).toBe(0);
    expect(store.states().synced).toBe(2);
  });

  it("on 429 halves the rate, reverts cells to pending and asks for a retry", async () => {
    let n = 0;
    const { store, ctx, limiter } = harness({
      pushAvailability: okPush,
      pushRatesAndRestrictions: async (b) => {
        if (n++ === 0) throw new ThrottleError(2000);
        return okPush(b);
      },
    });
    store.setRate("rp", "2026-10-01", { rate: 100 });
    await expect(pushProperty(ctx)).rejects.toBeInstanceOf(RetryLater);
    expect(limiter.currentRate("org")).toBe(50);
    expect(store.states().pending).toBe(1);
    expect((await pushProperty(ctx)).accepted).toBe(1);
  });

  it("opens the breaker after repeated transient failures and probes after the cooldown", async () => {
    let fail = true;
    const { store, ctx, clock, breaker } = harness({
      pushAvailability: okPush,
      pushRatesAndRestrictions: async (b) => {
        if (fail) throw new TransientError("503");
        return okPush(b);
      },
    });
    store.setRate("rp", "2026-10-01", { rate: 100 });
    await expect(pushProperty(ctx)).rejects.toBeInstanceOf(RetryLater);
    await expect(pushProperty(ctx)).rejects.toBeInstanceOf(RetryLater);
    expect(breaker.state("org")).toBe("open");
    await expect(pushProperty(ctx)).rejects.toThrow(/breaker open/);
    clock.advance({ seconds: 2 });
    expect(breaker.state("org")).toBe("half_open");
    fail = false;
    expect((await pushProperty(ctx)).accepted).toBe(1);
    expect(breaker.state("org")).toBe("closed");
    expect(store.states().synced).toBe(1);
  });

  it("an edit during flight keeps the newer version pending (CAL-3, CX-5)", async () => {
    const { store, ctx } = harness({
      pushAvailability: okPush,
      pushRatesAndRestrictions: async (b) => {
        store.setRate("rp", "2026-10-01", { rate: 999 });
        return okPush(b);
      },
    });
    store.setRate("rp", "2026-10-01", { rate: 100 });
    await pushProperty(ctx);
    const row = store.rate.get("rate|rp|2026-10-01")!;
    expect(row.state).toBe("pending");
    expect(row.values).toEqual({ rate: 999 });
    expect(row.version).toBe(2);
  });

  it("sampled read-back marks drifted cells conflicted so they re-enter the pipeline", async () => {
    const { store, ctx } = harness(
      {
        pushAvailability: okPush,
        pushRatesAndRestrictions: okPush,
        readAri: async () => ({
          availability: [{ roomTypeId: "rt", date: "2026-10-01", availability: 0 }],
          restrictions: [{ ratePlanId: "rp", date: "2026-10-01", rate: 100 }],
        }),
      },
      { verify: 1 },
    );
    ctx.random = () => 0;
    store.setRate("rp", "2026-10-01", { rate: 100 });
    store.setAvailability("rt", "2026-10-01", 1);
    const s = await pushProperty(ctx);
    expect(s.verified).toBe(true);
    expect(s.driftCells).toBe(1);
    expect(store.availability.get("availability|rt|2026-10-01")?.state).toBe("conflicted");
    expect((await pushProperty(ctx)).accepted).toBe(1);
  });
});
