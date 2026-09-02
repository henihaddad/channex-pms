import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { draftInvoice, LAUNCH_PLANS, peakUnits, tieredAmount, vatFor, prorate } from "./plans.js";
import { consoleAccess, dunningStep, nextTenantState, syncRunsIn } from "./lifecycle.js";
import { QUOTA_EXEMPT, quotaCheck } from "./quotas.js";
import { pluginRetryDelayMs, pluginWants } from "./plugins.js";
import type { TenantEvent, TenantState, UsageRecord, WorkKind } from "./types.js";

const growth = LAUNCH_PLANS[1]!;
const day = (i: number) => `2026-06-${String(i).padStart(2, "0")}`;
const JUNE = { from: "2026-06-01", to: "2026-07-01" };

describe("metering and pricing (spec 12 §12.5, BILL-2)", () => {
  it("bills the peak inside the period and ignores records outside it", () => {
    fc.assert(
      fc.property(
        fc.array(fc.integer({ min: 0, max: 500 }), { minLength: 1, maxLength: 30 }),
        (units) => {
          const records: UsageRecord[] = units.map((u, i) => ({
            orgId: "o",
            date: day(i + 1),
            activeUnits: u,
            properties: 1,
            users: 1,
          }));
          records.push({
            orgId: "o",
            date: "2026-07-03",
            activeUnits: 9999,
            properties: 1,
            users: 1,
          });
          expect(peakUnits(records, JUNE)).toBe(Math.max(...units));
        },
      ),
    );
  });

  it("tiers are marginal and the lines add up to the amount", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 5000 }), (units) => {
        const r = tieredAmount(growth, units);
        expect(r.lines.reduce((s, l) => s + l.amountMinor, 0)).toBe(r.amountMinor);
        expect(r.lines.reduce((s, l) => s + l.quantity, 0)).toBe(units);
        // never more than the first tier price for every unit
        expect(r.amountMinor).toBeLessThanOrEqual(units * growth.tiers[0]!.unitMinor);
      }),
    );
    expect(tieredAmount(growth, 60).amountMinor).toBe(50 * 800 + 10 * 650);
  });

  it("VAT: domestic rate, EU B2B reverse charge, EU consumer OSS, rest of world out of scope", () => {
    expect(vatFor("PT", { country: "PT", vatId: null }, 10_000)).toMatchObject({
      rateBps: 2300,
      amountMinor: 2300,
    });
    expect(vatFor("PT", { country: "DE", vatId: "DE123456789" }, 10_000)).toMatchObject({
      amountMinor: 0,
      reverseCharge: true,
    });
    expect(vatFor("PT", { country: "DE", vatId: null }, 10_000)).toMatchObject({
      rateBps: 1900,
      amountMinor: 1900,
    });
    expect(vatFor("PT", { country: "US", vatId: null }, 10_000)).toMatchObject({
      amountMinor: 0,
      reverseCharge: false,
    });
  });

  it("an invoice is explainable: lines sum to the subtotal, VAT on top, annual discount off the units", () => {
    const records = [12, 40, 33].map((u, i) => ({
      orgId: "o",
      date: day(i + 1),
      activeUnits: u,
      properties: 3,
      users: 2,
    }));
    const inv = draftInvoice({
      plan: growth,
      records,
      period: JUNE,
      addOns: ["priority_support"],
      annual: true,
      sellerCountry: "PT",
      customer: { country: "ES", vatId: "ESB12345678" },
    });
    expect(inv.peakUnits).toBe(40);
    expect(inv.lines.reduce((s, l) => s + l.amountMinor, 0)).toBe(inv.subtotalMinor);
    expect(inv.subtotalMinor).toBe(40 * 800 - Math.round((40 * 800 * 1500) / 10_000) + 9900);
    expect(inv.vat.reverseCharge).toBe(true);
    expect(inv.totalMinor).toBe(inv.subtotalMinor);
  });

  it("proration charges only the days left", () => {
    expect(prorate(3000, JUNE, "2026-06-16")).toBe(1500);
    expect(prorate(3000, JUNE, "2026-07-01")).toBe(0);
  });
});

describe("tenant lifecycle (spec 12 §12.3)", () => {
  const STATES: TenantState[] = [
    "trial",
    "active",
    "past_due",
    "suspended",
    "expired",
    "offboarding",
  ];
  const EVENTS: TenantEvent[] = [
    "plan_chosen",
    "trial_ended",
    "payment_failed",
    "payment_recovered",
    "dunning_exhausted",
    "reactivated",
    "offboarding_requested",
    "retention_expired",
    "purged",
  ];
  it("follows the diagram and never leaves offboarding", () => {
    expect(nextTenantState("trial", "plan_chosen")).toBe("active");
    expect(nextTenantState("active", "payment_failed")).toBe("past_due");
    expect(nextTenantState("past_due", "dunning_exhausted")).toBe("suspended");
    expect(nextTenantState("suspended", "reactivated")).toBe("active");
    expect(nextTenantState("trial", "payment_failed")).toBeNull();
    for (const e of EVENTS) expect(nextTenantState("offboarding", e)).toBeNull();
  });
  it("sync keeps running in every state that still holds data; the console closes on suspension", () => {
    for (const s of STATES) expect(syncRunsIn(s)).toBe(s !== "offboarding");
    expect(consoleAccess("suspended")).toBe("billing_only");
    expect(consoleAccess("past_due")).toBe("full");
  });
  it("dunning retries on days 3, 5, 7 and suspends after the 14-day grace", () => {
    expect(dunningStep("2026-06-01", 0, "2026-06-02")).toEqual({ kind: "none" });
    expect(dunningStep("2026-06-01", 0, "2026-06-04")).toEqual({
      kind: "retry",
      attempt: 1,
      dueOn: "2026-06-04",
    });
    expect(dunningStep("2026-06-01", 2, "2026-06-08")).toEqual({
      kind: "retry",
      attempt: 3,
      dueOn: "2026-06-08",
    });
    expect(dunningStep("2026-06-01", 3, "2026-06-10")).toEqual({
      kind: "grace",
      suspendOn: "2026-06-22",
    });
    expect(dunningStep("2026-06-01", 3, "2026-06-22")).toEqual({ kind: "suspend" });
  });
});

describe("quotas (QUOTA-1)", () => {
  const KINDS: WorkKind[] = [
    "ari.push",
    "booking.ingest",
    "booking.ack",
    "webhook.ingest",
    "reconcile",
    "report",
    "export",
    "bulk",
    "message.send",
    "api.read",
    "api.write",
  ];
  it("never throttles connectivity, whatever the overage", () => {
    fc.assert(
      fc.property(
        fc.record({
          properties: fc.integer({ min: 0, max: 10_000 }),
          rooms: fc.integer({ min: 0, max: 100_000 }),
          users: fc.integer({ min: 0, max: 1000 }),
          apiRequestsLastMinute: fc.integer({ min: 0, max: 100_000 }),
          webhookEndpoints: fc.integer({ min: 0, max: 100 }),
          storageMb: fc.integer({ min: 0, max: 1_000_000 }),
        }),
        fc.constantFrom(...KINDS),
        (usage, kind) => {
          const d = quotaCheck(LAUNCH_PLANS[0]!.quotas, usage, kind);
          if (QUOTA_EXEMPT.has(kind)) expect(d.allow).toBe(true);
        },
      ),
    );
  });
  it("warns at 80 % and throttles reports past the limit", () => {
    const base = {
      properties: 8,
      rooms: 0,
      users: 0,
      apiRequestsLastMinute: 0,
      webhookEndpoints: 0,
      storageMb: 0,
    };
    expect(quotaCheck(LAUNCH_PLANS[0]!.quotas, base, "report")).toMatchObject({
      allow: true,
      warnings: ["properties at 8/10"],
    });
    expect(
      quotaCheck(LAUNCH_PLANS[0]!.quotas, { ...base, properties: 11 }, "report"),
    ).toMatchObject({ allow: false });
    expect(quotaCheck(LAUNCH_PLANS[0]!.quotas, { ...base, properties: 11 }, "api.read").allow).toBe(
      true,
    );
  });
});

describe("plugins (ADR-0004)", () => {
  it("matches prefixes and backs off exponentially with a cap", () => {
    expect(pluginWants({ events: ["booking."] }, "booking.revision_applied")).toBe(true);
    expect(pluginWants({ events: ["statement.sent"] }, "booking.revision_applied")).toBe(false);
    expect([1, 2, 3, 4, 5, 6].map(pluginRetryDelayMs)).toEqual(
      [1, 2, 4, 8, 16, 16].map((m) => m * 60_000),
    );
  });
});
