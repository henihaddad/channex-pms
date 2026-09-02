import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LocalDate } from "../shared/local-date.js";
import type { RateCell, RestrictionValues } from "./ari.js";
import { applyDerivedOption, derivationChain, deriveCells, descendants } from "./derive.js";
import { expandOccupancyRates } from "./occupancy-pricing.js";
import { applyOps, planBulkUpdate } from "./bulk.js";
import { extendHorizon, seedHorizon } from "./horizon.js";
import { advance, fail, initialProvisioning, isLive } from "./provisioning.js";

describe("derived rate plans", () => {
  it("applies percent and amount modifiers and never goes negative", () => {
    expect(applyDerivedOption(15000, { kind: "percent", direction: "decrease", value: 1000 })).toBe(
      13500,
    );
    expect(applyDerivedOption(15000, { kind: "amount", direction: "increase", value: 2500 })).toBe(
      17500,
    );
    expect(applyDerivedOption(100, { kind: "amount", direction: "decrease", value: 500 })).toBe(0);
  });

  it("derives every parent cell and keeps restrictions", () => {
    const parent: RateCell[] = [
      {
        ratePlanId: "p",
        date: "2026-10-01",
        values: { rate: 10000, minStay: 2, rates: { 1: 8000, 2: 10000 } },
      },
    ];
    const child = deriveCells(parent, "c", { kind: "percent", direction: "decrease", value: 1000 });
    expect(child[0]).toEqual({
      ratePlanId: "c",
      date: "2026-10-01",
      values: { rate: 9000, minStay: 2, rates: { 1: 7200, 2: 9000 } },
    });
  });

  it("enforces INV-6: no cycles, depth at most 3", () => {
    const plans = new Map([
      ["a", { id: "a", parentRatePlanId: null }],
      ["b", { id: "b", parentRatePlanId: "a" }],
      ["c", { id: "c", parentRatePlanId: "b" }],
      ["d", { id: "d", parentRatePlanId: "c" }],
      ["e", { id: "e", parentRatePlanId: "d" }],
    ]);
    expect(derivationChain("d", plans)).toEqual(["c", "b", "a"]);
    expect(() => derivationChain("e", plans)).toThrow(/INV-6/);
    const cyc = new Map([
      ["x", { id: "x", parentRatePlanId: "y" }],
      ["y", { id: "y", parentRatePlanId: "x" }],
    ]);
    expect(() => derivationChain("x", cyc)).toThrow(/ancestor/);
    expect(descendants("a", plans)).toEqual(["b", "c", "d", "e"]);
  });
});

describe("occupancy pricing", () => {
  it("expands base + delta and filters tables to the room's occupancy", () => {
    expect(
      expandOccupancyRates(
        10000,
        { mode: "base_delta", baseOccupancy: 2, extraAdultMinor: 1500, fewerAdultMinor: 1000 },
        4,
      ),
    ).toEqual({ 1: 9000, 2: 10000, 3: 11500, 4: 13000 });
    expect(
      expandOccupancyRates(10000, { mode: "table", rates: { 1: 8000, 2: 10000, 5: 99 } }, 3),
    ).toEqual({ 1: 8000, 2: 10000 });
    expect(expandOccupancyRates(10000, { mode: "flat" }, 3)).toBeUndefined();
  });
});

describe("bulk update planner", () => {
  const current = new Map<string, RestrictionValues>();
  for (let i = 0; i < 60; i++)
    current.set(`rp|${LocalDate.of(2026, 10, 1).plusDays(i).toString()}`, {
      rate: 10000,
      minStay: 1,
    });

  it("dry-runs changes with an inverse that restores the previous values (BULK-1, BULK-2)", () => {
    const plan = planBulkUpdate(
      {
        dateFrom: "2026-10-01",
        dateTo: "2026-10-31",
        days: ["fr", "sa"],
        ratePlanIds: ["rp"],
        ops: [
          { op: "adjust_rate_percent", basisPoints: 2000 },
          { op: "set_min_stay", minStay: 2 },
        ],
        horizonEnd: "2027-12-31",
      },
      current,
    );
    expect(plan.blocked).toEqual([]);
    expect(plan.cellCount).toBe(10); // 5 Fridays + 5 Saturdays in Oct 2026
    expect(plan.changes[0]).toMatchObject({
      ratePlanId: "rp",
      date: "2026-10-02",
      values: { rate: 12000, minStay: 2 },
    });
    expect(plan.inverse[0]).toMatchObject({
      date: "2026-10-02",
      values: { rate: 10000, minStay: 1 },
    });
    // applying changes then inverse is the identity
    fc.assert(
      fc.property(fc.constantFrom(...plan.changes.map((c, i) => i)), (i) => {
        const before = current.get(`rp|${plan.changes[i]!.date}`)!;
        const after = applyOps(before, [
          { op: "adjust_rate_percent", basisPoints: 2000 },
          { op: "set_min_stay", minStay: 2 },
        ]);
        expect({ ...after, ...plan.inverse[i]!.values }).toEqual(before);
      }),
    );
  });

  it("blocks obviously wrong input unless overridden (BULK-4)", () => {
    const bad = planBulkUpdate(
      {
        dateFrom: "2026-10-01",
        dateTo: "2026-10-02",
        ratePlanIds: ["rp"],
        ops: [{ op: "set_rate", rateMinor: 5_000_000 }],
        horizonEnd: "2027-12-31",
      },
      current,
      10000,
    );
    expect(bad.blocked).toEqual(["rate is more than 100× the 90-day median"]);
    expect(bad.cellCount).toBe(0);
    const forced = planBulkUpdate(
      {
        dateFrom: "2026-10-01",
        dateTo: "2026-10-02",
        ratePlanIds: ["rp"],
        ops: [{ op: "set_rate", rateMinor: 5_000_000 }],
        horizonEnd: "2027-12-31",
        override: true,
      },
      current,
      10000,
    );
    expect(forced.cellCount).toBe(2);
    expect(forced.warnings[0]).toMatch(/overridden/);
    expect(
      planBulkUpdate(
        {
          dateFrom: "2026-10-01",
          dateTo: "2028-01-01",
          ratePlanIds: ["rp"],
          ops: [],
          horizonEnd: "2027-12-31",
        },
        current,
      ).blocked[0],
    ).toMatch(/horizon/);
  });

  it("no-op operations produce no changes", () => {
    const plan = planBulkUpdate(
      {
        dateFrom: "2026-10-01",
        dateTo: "2026-10-10",
        ratePlanIds: ["rp"],
        ops: [{ op: "set_rate", rateMinor: 10000 }],
        horizonEnd: "2027-12-31",
      },
      current,
    );
    expect(plan.cellCount).toBe(0);
  });
});

describe("horizon", () => {
  it("seeds N days and extends from the same weekday last year", () => {
    const seeded = seedHorizon("rp", LocalDate.of(2026, 9, 1), 3, { rate: 100 });
    expect(seeded.map((c) => c.date)).toEqual(["2026-09-01", "2026-09-02", "2026-09-03"]);
    const lookup = (d: string) => (d === "2025-09-05" ? { rate: 777 } : undefined); // 364 days before 2026-09-04
    const ext = extendHorizon("rp", LocalDate.of(2026, 9, 3), LocalDate.of(2026, 9, 1), 5, lookup, {
      rate: 100,
    });
    expect(ext.map((c) => [c.date, c.values.rate])).toEqual([
      ["2026-09-04", 777],
      ["2026-09-05", 100],
    ]);
    expect(LocalDate.parse("2026-09-04").dayOfWeek).toBe(LocalDate.parse("2025-09-05").dayOfWeek);
  });
});

describe("provisioning state machine", () => {
  it("advances step by step, records refs, and resumes after a failure (PROV-1, PROV-2)", () => {
    let s = initialProvisioning();
    s = advance(s, { group: "g1" });
    expect(s.step).toBe("property");
    s = fail(s, "503");
    expect(s).toMatchObject({
      step: "property",
      attempts: 1,
      lastError: "503",
      refs: { group: "g1" },
    });
    for (let i = 0; i < 10; i++) s = advance(s);
    expect(isLive(s)).toBe(true);
    expect(s.refs.group).toBe("g1");
  });
});
