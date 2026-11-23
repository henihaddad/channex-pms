import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { planRanges } from "./ari-ranges";

const date = fc
  .date({
    min: new Date("2026-01-01T00:00:00Z"),
    max: new Date("2028-12-31T00:00:00Z"),
    noInvalidDate: true,
  })
  .map((d) => d.toISOString().slice(0, 10));
const cell = fc.record({ ratePlanId: fc.constantFrom("a", "b", "c"), date });

describe("planRanges", () => {
  it("covers every cell with exactly one range per plan, no wider than the cells", () => {
    fc.assert(
      fc.property(fc.array(cell, { maxLength: 200 }), (cells) => {
        const ranges = planRanges(cells);
        expect([...ranges.keys()].sort()).toEqual(
          [...new Set(cells.map((c) => c.ratePlanId))].sort(),
        );
        for (const [plan, r] of ranges) {
          const mine = cells.filter((c) => c.ratePlanId === plan).map((c) => c.date);
          for (const d of mine) expect(d >= r.from && d <= r.to).toBe(true);
          expect(mine).toContain(r.from);
          expect(mine).toContain(r.to);
        }
      }),
    );
  });
});
