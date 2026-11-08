import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LocalDate } from "../shared/local-date.js";
import {
  seasonNights,
  seasonOn,
  seasonPrices,
  summariseMonths,
  validateSeason,
} from "./seasons.js";

describe("seasons (spec 06 §6.6)", () => {
  it("accepts a named season of non-overlapping ranges", () => {
    expect(
      validateSeason({
        name: "Shoulder",
        ranges: [
          { from: "2027-04-01", to: "2027-06-14" },
          { from: "2027-09-16", to: "2027-12-20" },
        ],
        colour: "#5eead4",
      }),
    ).toEqual([]);
  });

  it("says what is wrong in words", () => {
    const errors = validateSeason({
      name: " ",
      ranges: [
        { from: "2027-06-15", to: "2027-06-01" },
        { from: "2027-02-30", to: "2027-03-01" },
      ],
      colour: "teal",
    });
    expect(errors).toContain("Give the season a name.");
    expect(errors).toContain("Pick a colour like #94a3b8.");
    expect(errors).toContain("Dates must be real nights.");
    expect(errors.some((e) => e.includes("ends before it starts"))).toBe(true);
    expect(validateSeason({ name: "x", ranges: [] })).toContain(
      "Add at least one range of nights.",
    );
    expect(
      validateSeason({
        name: "x",
        ranges: [
          { from: "2027-01-01", to: "2027-01-10" },
          { from: "2027-01-10", to: "2027-01-12" },
        ],
      }).some((e) => e.includes("overlaps")),
    ).toBe(true);
  });

  it("finds the season of a night and counts its nights in a window", () => {
    const high = { name: "High", ranges: [{ from: "2027-06-15", to: "2027-09-15" }] };
    expect(seasonOn("2027-06-15", [high])?.name).toBe("High");
    expect(seasonOn("2027-09-16", [high])).toBeUndefined();
    expect(seasonNights(high.ranges, "2027-09-01", "2027-12-31")).toBe(15);
    expect(seasonNights(high.ranges, "2026-01-01", "2026-12-31")).toBe(0);
  });

  it("counts every night of a range exactly once, inclusive of both ends", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400 }), fc.integer({ min: 0, max: 300 }), (a, len) => {
        const from = LocalDate.parse("2026-11-01").plusDays(a);
        const to = from.plusDays(len);
        expect(
          seasonNights([{ from: from.toString(), to: to.toString() }], "2000-01-01", "2100-01-01"),
        ).toBe(len + 1);
      }),
    );
  });

  it("summarises each month: booked over sellable, and the mean price rounded half up", () => {
    const months = summariseMonths([
      { date: "2026-11-29", sellable: 1, booked: 1, rateMinor: 11_800 },
      { date: "2026-11-30", sellable: 1, booked: 0, rateMinor: 11_801 },
      { date: "2026-12-01", sellable: 0, booked: 0 },
    ]);
    expect(months).toEqual([
      { month: "2026-11", occupancy: 0.5, averageRateMinor: 11_801, nights: 2 },
      { month: "2026-12", occupancy: null, averageRateMinor: null, nights: 1 },
    ]);
  });

  it("keeps occupancy between 0 and 1 whatever the counts", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            sellable: fc.integer({ min: -2, max: 10 }),
            booked: fc.integer({ min: -2, max: 12 }),
          }),
          { minLength: 1, maxLength: 31 },
        ),
        (rows) => {
          const [m] = summariseMonths(
            rows.map((r, i) => ({ ...r, date: `2026-12-${String(i + 1).padStart(2, "0")}` })),
          );
          if (m!.occupancy !== null) {
            expect(m!.occupancy).toBeGreaterThanOrEqual(0);
            expect(m!.occupancy).toBeLessThanOrEqual(1);
          }
        },
      ),
    );
  });

  it("reads a season's prices from its nights: weeknight and weekend medians, usual minimum stay", () => {
    // Thu 10 Jun 2027 .. Mon 14 Jun 2027
    const nights = [
      { date: "2027-06-10", sellable: 1, booked: 0, rateMinor: 11_800, minStay: 2 },
      { date: "2027-06-11", sellable: 1, booked: 0, rateMinor: 14_000, minStay: 2 },
      { date: "2027-06-12", sellable: 1, booked: 0, rateMinor: 15_000, minStay: 3 },
      { date: "2027-06-13", sellable: 1, booked: 0, rateMinor: 11_800, minStay: 2 },
      { date: "2027-06-14", sellable: 1, booked: 0, rateMinor: 9_900 },
    ];
    expect(seasonPrices(nights, [{ from: "2027-06-10", to: "2027-06-13" }])).toEqual({
      weekdayMinor: 11_800,
      weekendMinor: 14_000,
      minStay: 2,
    });
    expect(seasonPrices(nights, [{ from: "2028-01-01", to: "2028-01-02" }])).toEqual({
      weekdayMinor: null,
      weekendMinor: null,
      minStay: null,
    });
  });
});
