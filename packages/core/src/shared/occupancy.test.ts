import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { Occupancy } from "./occupancy.js";

const occ = fc
  .record({
    adults: fc.integer({ min: 1, max: 6 }),
    ages: fc.array(fc.integer({ min: 0, max: 17 }), { maxLength: 4 }),
    infants: fc.integer({ min: 0, max: 2 }),
  })
  .map(({ adults, ages, infants }) => Occupancy.of(adults, ages, infants));

describe("Occupancy", () => {
  it("requires an adult and valid ages", () => {
    expect(() => Occupancy.of(0)).toThrow();
    expect(() => Occupancy.of(1, [18])).toThrow();
    expect(Occupancy.of(2, [7, 3]).childrenAges).toEqual([3, 7]);
  });

  it("persons excludes infants and promoted children move between buckets", () => {
    fc.assert(
      fc.property(occ, fc.integer({ min: 0, max: 18 }), (o, minAge) => {
        expect(o.persons).toBe(o.adults + o.children);
        const { adults, children } = o.countingChildrenAsAdultsFrom(minAge);
        expect(adults + children).toBe(o.persons);
        expect(adults).toBeGreaterThanOrEqual(o.adults);
      }),
    );
  });

  it("fits checks every limit", () => {
    const limits = { maxAdults: 2, maxChildren: 1, maxInfants: 1, maxOccupancy: 3 };
    expect(Occupancy.of(2, [5]).fits(limits)).toBe(true);
    expect(Occupancy.of(2, [5, 6]).fits(limits)).toBe(false);
    expect(Occupancy.of(3).fits(limits)).toBe(false);
    expect(Occupancy.of(1, [], 2).fits(limits)).toBe(false);
  });
});
