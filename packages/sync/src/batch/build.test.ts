import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LocalDate, type RateCell, type RestrictionValues, type AvailabilityCell } from "@pms/core";
import { buildAvailabilityBatch, buildRestrictionBatch } from "./build.js";
import {
  applyAvailabilityEntries,
  applyRestrictionEntries,
  diffAri,
  emptyState,
  stateFromCells,
} from "./apply.js";

const EPOCH = LocalDate.of(2026, 1, 5); // a Monday
const dateArb = fc.integer({ min: 0, max: 120 }).map((n) => EPOCH.plusDays(n).toString());

const valuesArb: fc.Arbitrary<RestrictionValues> = fc
  .record(
    {
      rate: fc.constantFrom(9000, 12000, 15000),
      rates: fc.constantFrom({ 1: 9000, 2: 12000 }, { 1: 8000, 2: 12000 }),
      minStay: fc.constantFrom(1, 2, 3),
      maxStay: fc.constantFrom(0, 7),
      closedToArrival: fc.boolean(),
      stopSell: fc.boolean(),
    },
    { requiredKeys: [] },
  )
  .filter((v) => Object.keys(v).length > 0);

const cellsArb: fc.Arbitrary<RateCell[]> = fc
  .array(
    fc.record({ ratePlanId: fc.constantFrom("rp-a", "rp-b"), date: dateArb, values: valuesArb }),
    { maxLength: 80 },
  )
  .map((cells) => {
    // one cell per (plan, date): merge duplicates deterministically (last wins), like a pending-cell set
    const m = new Map<string, RateCell>();
    for (const c of cells) {
      const k = `${c.ratePlanId}|${c.date}`;
      const prev = m.get(k);
      m.set(k, prev ? { ...c, values: { ...prev.values, ...c.values } } : c);
    }
    return [...m.values()];
  });

function stateEquals(a: ReturnType<typeof emptyState>, b: ReturnType<typeof emptyState>): boolean {
  const d = diffAri(a, b);
  return d.restrictions.length === 0 && d.availability.length === 0;
}

describe("restriction batch builder", () => {
  it("applying the batch to an empty state reproduces the cells exactly (spec 05 §5.4.3 determinism)", () => {
    fc.assert(
      fc.property(cellsArb, (cells) => {
        const chunks = buildRestrictionBatch(cells, { maxEntries: 7 });
        const state = emptyState();
        for (const c of chunks) applyRestrictionEntries(state, c);
        expect(stateEquals(state, stateFromCells(cells))).toBe(true);
        for (const c of chunks) expect(c.length).toBeLessThanOrEqual(7);
      }),
      { numRuns: 300 },
    );
  });

  it("never needs more entries than one per cell per field, and compresses seasons dramatically", () => {
    fc.assert(
      fc.property(cellsArb, (cells) => {
        const n = buildRestrictionBatch(cells).flat().length;
        const naive = cells.reduce((acc, c) => acc + Object.keys(c.values).length, 0);
        expect(n).toBeLessThanOrEqual(Math.max(naive, 0));
      }),
    );
    const year: RateCell[] = [];
    for (let i = 0; i < 365; i++) {
      const d = EPOCH.plusDays(i);
      const weekend = d.dayOfWeek >= 6;
      year.push({
        ratePlanId: "rp",
        date: d.toString(),
        values: { rate: weekend ? 15000 : 10000, minStay: i >= 180 && i < 200 ? 3 : 1 },
      });
    }
    const entries = buildRestrictionBatch(year).flat();
    expect(entries.length).toBeLessThanOrEqual(5); // weekday split for rate (2) + base/override for minStay (2), merged where ranges coincide
    const state = applyRestrictionEntries(emptyState(), entries);
    expect(stateEquals(state, stateFromCells(year))).toBe(true);
  });

  it("is deterministic and groups by rate plan", () => {
    const cells: RateCell[] = [
      { ratePlanId: "b", date: "2026-03-02", values: { rate: 100 } },
      { ratePlanId: "a", date: "2026-03-01", values: { rate: 100 } },
      { ratePlanId: "a", date: "2026-03-02", values: { rate: 100 } },
    ];
    const one = buildRestrictionBatch(cells);
    const two = buildRestrictionBatch([...cells].reverse());
    expect(one).toEqual(two);
    expect(one.flat().map((e) => e.ratePlanId)).toEqual(["a", "b"]);
    expect(one.flat().find((e) => e.ratePlanId === "a")).toMatchObject({
      dateFrom: "2026-03-01",
      dateTo: "2026-03-02",
      rate: 100,
    });
  });
});

describe("availability batch builder", () => {
  const availArb: fc.Arbitrary<AvailabilityCell[]> = fc
    .array(
      fc.record({
        roomTypeId: fc.constantFrom("rt-1", "rt-2"),
        date: dateArb,
        availability: fc.integer({ min: 0, max: 5 }),
      }),
      { maxLength: 60 },
    )
    .map((cells) => [...new Map(cells.map((c) => [`${c.roomTypeId}|${c.date}`, c])).values()]);

  it("round-trips through apply", () => {
    fc.assert(
      fc.property(availArb, (cells) => {
        const state = emptyState();
        for (const c of buildAvailabilityBatch(cells, { maxEntries: 5 }))
          applyAvailabilityEntries(state, c);
        expect(stateEquals(state, stateFromCells([], cells))).toBe(true);
      }),
      { numRuns: 200 },
    );
  });
});

describe("diffAri", () => {
  it("is empty for equal states and symmetric in what it reports", () => {
    fc.assert(
      fc.property(cellsArb, cellsArb, (a, b) => {
        const sa = stateFromCells(a);
        const sb = stateFromCells(b);
        expect(diffAri(sa, sa)).toEqual({ restrictions: [], availability: [] });
        expect(diffAri(sa, sb).restrictions).toEqual(diffAri(sb, sa).restrictions);
      }),
    );
  });
});
