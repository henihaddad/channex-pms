import { describe, expect, it } from "vitest";
import { tenantMonthlyMinor } from "./plans.js";

describe("tenantMonthlyMinor (spec 12 §12.5)", () => {
  const tiers = [
    { fromUnits: 1, unitMinor: 900 },
    { fromUnits: 51, unitMinor: 700 },
  ];
  it("prices the active units marginally for a billed tenant", () => {
    expect(tenantMonthlyMinor({ state: "active", planTiers: tiers, activeUnits: 7 })).toBe(6300);
    expect(tenantMonthlyMinor({ state: "past_due", planTiers: tiers, activeUnits: 52 })).toBe(
      50 * 900 + 2 * 700,
    );
  });
  it("counts nothing for a trial, a suspended tenant or one without a plan", () => {
    expect(tenantMonthlyMinor({ state: "trial", planTiers: tiers, activeUnits: 7 })).toBe(0);
    expect(tenantMonthlyMinor({ state: "suspended", planTiers: tiers, activeUnits: 7 })).toBe(0);
    expect(tenantMonthlyMinor({ state: "active", planTiers: null, activeUnits: 7 })).toBe(0);
  });
});
