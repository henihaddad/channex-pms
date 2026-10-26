import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { parseMinor, parseRateImportCsv, splitCsvLine } from "./csv.js";
import { importRates, planRateImport, railBreach } from "./service.js";
import { FakeRateImportProvider } from "./fake.js";
import type { RateImportRow, RestrictionValues } from "../index.js";

const NOW = "2026-10-01T09:00:00Z";
const base = {
  mapping: new Map([["L1", "rp1"]]),
  horizonEnd: "2027-09-30",
  nowIso: NOW,
};
const row = (
  date: string,
  priceMinor: number,
  over: Partial<RateImportRow> = {},
): RateImportRow => ({
  date,
  listingRef: "L1",
  priceMinor,
  ...over,
});
const cells = (entries: Array<[string, RestrictionValues]>) => new Map(entries);

describe("reading what an engine exported (spec 06 §6.7)", () => {
  it("splits quoted fields, semicolons and tabs", () => {
    expect(splitCsvLine('a,"1,200.00",c')).toEqual(["a", "1,200.00", "c"]);
    expect(splitCsvLine("a;b;c")).toEqual(["a", "b", "c"]);
    expect(splitCsvLine('x,"say ""hi""",z')).toEqual(["x", 'say "hi"', "z"]);
  });

  it("reads money as minor units, never as a float (rule 4)", () => {
    expect(parseMinor("120")).toBe(12000);
    expect(parseMinor("120.50")).toBe(12050);
    expect(parseMinor("120,5")).toBe(12050);
    expect(parseMinor("1,200.00")).toBe(120000);
    expect(parseMinor("1.200,00")).toBe(120000);
    expect(parseMinor("€120.99")).toBe(12099);
    expect(parseMinor("0.07")).toBe(7);
    expect(parseMinor("")).toBeNull();
    expect(parseMinor("n/a")).toBeNull();
    // the classic float bug: 0.1 + 0.2 arithmetic never happens because we read digits
    expect(parseMinor("8.11")).toBe(811);
    // a trailing group of exactly three digits is a thousands separator, not decimals
    expect(parseMinor("1.005")).toBe(100500);
    expect(parseMinor("1.0056")).toBeNull();
    expect(parseMinor("12.34.56")).toBeNull();
  });

  it("never loses or gains a cent on a two-decimal amount", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 9_999_999 }),
        fc.integer({ min: 0, max: 99 }),
        (whole, cents) => {
          const text = `${String(whole)}.${String(cents).padStart(2, "0")}`;
          expect(parseMinor(text)).toBe(whole * 100 + cents);
        },
      ),
      { numRuns: 300 },
    );
  });

  it("matches columns by alias and reports every unusable line with its number", () => {
    const csv = [
      "Date,Listing ID,Recommended Price,Min Stay",
      "2026-10-04,L1,120.00,2",
      "2026-10-05,L1,€130,",
      "04/10/2026,L1,120,",
      "2026-10-06,L1,not-a-price,",
      "2026-10-07,L1,-5,",
      "2026-10-08,L1,100,0",
      "2026-10-04,L1,999,",
    ].join("\n");
    const r = parseRateImportCsv(csv);
    expect(r.columns).toEqual({
      date: "date",
      listingRef: "listing_id",
      price: "recommended_price",
      minStay: "min_stay",
    });
    expect(r.rows).toEqual([
      { date: "2026-10-04", listingRef: "L1", priceMinor: 12000, minStay: 2 },
      { date: "2026-10-05", listingRef: "L1", priceMinor: 13000 },
    ]);
    expect(r.errors).toEqual([
      'line 4: "04/10/2026" is not a YYYY-MM-DD date',
      'line 5: "not-a-price" is not a price',
      "line 6: a negative price (-5)",
      'line 7: "0" is not a minimum stay',
      'line 8: 2026-10-04 appears twice for "L1"',
    ]);
  });

  it("says plainly when the file is not a rate export", () => {
    expect(parseRateImportCsv("").errors).toEqual(["the file is empty"]);
    expect(parseRateImportCsv("foo,bar\n1,2").errors[0]).toMatch(/no date column/);
    expect(parseRateImportCsv("date,notes\n2026-10-04,hi").errors[0]).toMatch(/no price column/);
  });
});

describe("guard rails are absolute (YR-2)", () => {
  it("names the rail a price breaks", () => {
    expect(railBreach(12000, 10000, {})).toBeNull();
    expect(railBreach(-1, undefined, {})).toBe("a negative price");
    expect(railBreach(5000, undefined, { floorMinor: 9000 })).toMatch(/below the floor/);
    expect(railBreach(50000, undefined, { ceilingMinor: 40000 })).toMatch(/above the ceiling/);
    expect(railBreach(13000, 10000, { maxChangeBps: 2500 })).toMatch(/30 % move/);
    expect(railBreach(12500, 10000, { maxChangeBps: 2500 })).toBeNull();
    // with no current price there is no move to measure
    expect(railBreach(99999, undefined, { maxChangeBps: 1 })).toBeNull();
  });

  it("refuses rather than clamping, and says why", () => {
    const plan = planRateImport(
      {
        ...base,
        rows: [row("2026-10-04", 2000), row("2026-10-05", 12000)],
        guardRails: { floorMinor: 9000 },
      },
      cells([["rp1|2026-10-04", { rate: 10000 }]]),
    );
    expect(plan.cellCount).toBe(1);
    expect(plan.changes).toEqual([
      { ratePlanId: "rp1", date: "2026-10-05", values: { rate: 12000 } },
    ]);
    expect(plan.refused).toHaveLength(1);
    expect(plan.refused[0]!.reason).toMatch(/below the floor/);
    // the refused cell keeps its old price exactly
    expect(plan.changes.some((c) => c.date === "2026-10-04")).toBe(false);
  });

  it("applies a refused row only on an explicit override, and records it as a warning", () => {
    const plan = planRateImport(
      {
        ...base,
        rows: [row("2026-10-04", 2000)],
        guardRails: { floorMinor: 9000 },
        override: true,
      },
      cells([["rp1|2026-10-04", { rate: 10000 }]]),
    );
    expect(plan.cellCount).toBe(1);
    expect(plan.refused).toEqual([]);
    expect(plan.warnings[0]).toMatch(/guard rail overridden: below the floor/);
  });
});

describe("planning an import (spec 06 §6.5b)", () => {
  it("writes the delta and an inverse that restores the cell exactly (BULK-2)", () => {
    const before: RestrictionValues = { rate: 10000, minStay: 2, stopSell: false };
    const plan = planRateImport(
      { ...base, rows: [row("2026-10-04", 12000, { minStay: 3 })] },
      cells([["rp1|2026-10-04", before]]),
    );
    expect(plan.changes[0]!.values).toEqual({ rate: 12000, minStay: 3 });
    expect(plan.inverse[0]!.values).toEqual({ rate: 10000, minStay: 2 });
    expect(plan.samples[0]).toMatchObject({ ratePlanId: "rp1", date: "2026-10-04" });
  });

  it("skips a night the engine prices exactly as it already is", () => {
    const plan = planRateImport(
      { ...base, rows: [row("2026-10-04", 10000)] },
      cells([["rp1|2026-10-04", { rate: 10000 }]]),
    );
    expect(plan.cellCount).toBe(0);
    expect(plan.changes).toEqual([]);
  });

  it("reports a listing it cannot map instead of guessing a rate plan", () => {
    const plan = planRateImport(
      { ...base, rows: [row("2026-10-04", 12000, { listingRef: "unknown" })] },
      cells([]),
    );
    expect(plan.cellCount).toBe(0);
    expect(plan.unmapped).toHaveLength(1);
    expect(plan.warnings[0]).toMatch(/1 listing\(s\) the engine prices are not mapped/);
  });

  it("leaves nights outside the seeded horizon and in the past alone", () => {
    const plan = planRateImport(
      {
        ...base,
        rows: [row("2027-10-01", 12000), row("2026-09-30", 12000), row("2026-10-01", 12000)],
      },
      cells([]),
    );
    expect(plan.outsideHorizon.map((r) => r.date)).toEqual(["2027-10-01", "2026-09-30"]);
    expect(plan.changes.map((c) => c.date)).toEqual(["2026-10-01"]);
  });

  it("YR-5: a cell a human edited inside the hold window is left alone", () => {
    const input = {
      ...base,
      rows: [row("2026-10-04", 12000), row("2026-10-05", 12000)],
      manualEditedAt: new Map([
        ["rp1|2026-10-04", "2026-10-01T06:00:00Z"], // 3 h ago
        ["rp1|2026-10-05", "2026-09-28T06:00:00Z"], // 3 days ago
      ]),
    };
    const plan = planRateImport(input, cells([]));
    expect(plan.held.map((r) => r.date)).toEqual(["2026-10-04"]);
    expect(plan.changes.map((c) => c.date)).toEqual(["2026-10-05"]);
    expect(plan.warnings.some((w) => w.includes("48 h hold"))).toBe(true);
    // a shorter hold lets the engine back in
    expect(planRateImport({ ...input, holdHours: 1 }, cells([])).held).toEqual([]);
  });

  it("the inverse always restores every touched cell, whatever the engine sent", () => {
    const anyCells = fc.dictionary(
      fc.constantFrom("2026-10-02", "2026-10-03", "2026-10-04"),
      fc.record({ rate: fc.integer({ min: 1, max: 50000 }) }),
      { maxKeys: 3 },
    );
    fc.assert(
      fc.property(
        anyCells,
        fc.array(
          fc.record({
            date: fc.constantFrom("2026-10-02", "2026-10-03", "2026-10-04"),
            priceMinor: fc.integer({ min: 0, max: 50000 }),
          }),
          { maxLength: 3 },
        ),
        (current, sent) => {
          const seen = new Set<string>();
          const rows = sent
            .filter((s) => !seen.has(s.date) && seen.add(s.date))
            .map((s) => row(s.date, s.priceMinor));
          const map = new Map(
            Object.entries(current).map(([d, v]) => [`rp1|${d}`, v as RestrictionValues]),
          );
          const plan = planRateImport({ ...base, rows }, map);
          // applying changes then the inverse returns every cell to what it was
          const after = new Map(map);
          for (const c of plan.changes)
            after.set(`rp1|${c.date}`, { ...after.get(`rp1|${c.date}`), ...c.values });
          for (const c of plan.inverse)
            after.set(`rp1|${c.date}`, { ...after.get(`rp1|${c.date}`), ...c.values });
          for (const [key, value] of map) expect(after.get(key)).toEqual(value);
        },
      ),
      { numRuns: 200 },
    );
  });
});

describe("pulling from a configured engine", () => {
  const rows = [row("2026-10-04", 12000), row("2026-10-05", 13000), row("2027-12-01", 14000)];

  it("asks for the window, clamped to the horizon, and plans what came back", async () => {
    const provider = new FakeRateImportProvider(rows);
    const plan = await importRates(
      provider,
      { ...base, propertyRef: "P1", from: "2026-10-01", to: "2028-01-01" },
      cells([]),
    );
    expect(provider.calls).toEqual([{ propertyRef: "P1", from: "2026-10-01", to: "2027-09-30" }]);
    expect(plan.provider).toBe("fake");
    expect(plan.fetched).toBe(2);
    expect(plan.changes.map((c) => c.date)).toEqual(["2026-10-04", "2026-10-05"]);
  });

  it("asks for nothing when the window is entirely past the horizon", async () => {
    const provider = new FakeRateImportProvider(rows);
    const plan = await importRates(
      provider,
      { ...base, propertyRef: "P1", from: "2027-10-01", to: "2028-01-01" },
      cells([]),
    );
    expect(provider.calls).toEqual([]);
    expect(plan.fetched).toBe(0);
    expect(plan.cellCount).toBe(0);
  });
});
