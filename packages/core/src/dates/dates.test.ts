import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LocalDate } from "./local-date.js";
import { DateRange } from "./date-range.js";

const EPOCH = LocalDate.of(2020, 1, 1);
const offset = fc.integer({ min: 0, max: 5000 });
const date = offset.map((n) => EPOCH.plusDays(n));
const range = fc
  .tuple(offset, fc.integer({ min: 1, max: 60 }))
  .map(([s, len]) => DateRange.of(EPOCH.plusDays(s), EPOCH.plusDays(s + len)));

describe("LocalDate", () => {
  it("parses and prints ISO dates only", () => {
    expect(LocalDate.parse("2026-08-21").toString()).toBe("2026-08-21");
    expect(() => LocalDate.parse("2026-02-30")).toThrow();
    expect(() => LocalDate.parse("21/08/2026")).toThrow();
    expect(() => LocalDate.parse("2026-08-21T00:00:00Z")).toThrow();
  });

  it("handles month and year boundaries and leap days", () => {
    expect(LocalDate.parse("2024-02-28").plusDays(1).toString()).toBe("2024-02-29");
    expect(LocalDate.parse("2025-02-28").plusDays(1).toString()).toBe("2025-03-01");
    expect(LocalDate.parse("2026-12-31").plusDays(1).toString()).toBe("2027-01-01");
    expect(LocalDate.parse("2026-01-01").minusDays(1).toString()).toBe("2025-12-31");
  });

  it("plusDays and daysUntil agree", () => {
    fc.assert(
      fc.property(date, fc.integer({ min: -3000, max: 3000 }), (d, n) => {
        expect(d.daysUntil(d.plusDays(n))).toBe(n);
        expect(d.plusDays(n).minusDays(n).equals(d)).toBe(true);
      }),
    );
  });

  it("orders consistently with ISO strings", () => {
    fc.assert(
      fc.property(date, date, (a, b) => {
        const byString = a.toString() < b.toString() ? -1 : a.toString() > b.toString() ? 1 : 0;
        expect(a.compare(b)).toBe(byString);
      }),
    );
  });

  it("knows ISO weekdays", () => {
    expect(LocalDate.parse("2026-09-02").dayOfWeek).toBe(3); // Wednesday
    expect(LocalDate.parse("2026-09-06").dayOfWeek).toBe(7); // Sunday
  });
});

describe("DateRange", () => {
  it("is half-open: check-out night is not included", () => {
    const stay = DateRange.parse("2026-08-10", "2026-08-13");
    expect(stay.nights()).toBe(3);
    expect(stay.contains(LocalDate.parse("2026-08-10"))).toBe(true);
    expect(stay.contains(LocalDate.parse("2026-08-12"))).toBe(true);
    expect(stay.contains(LocalDate.parse("2026-08-13"))).toBe(false);
    expect([...stay.dates()].map(String)).toEqual(["2026-08-10", "2026-08-11", "2026-08-12"]);
  });

  it("rejects empty and inverted ranges", () => {
    expect(() => DateRange.parse("2026-08-10", "2026-08-10")).toThrow(RangeError);
    expect(() => DateRange.parse("2026-08-11", "2026-08-10")).toThrow(RangeError);
  });

  it("back-to-back stays do not overlap but are adjacent", () => {
    const a = DateRange.parse("2026-08-10", "2026-08-13");
    const b = DateRange.parse("2026-08-13", "2026-08-15");
    expect(a.overlaps(b)).toBe(false);
    expect(a.isAdjacentTo(b)).toBe(true);
    expect(a.intersect(b)).toBeNull();
  });

  it("nights equals the number of dates yielded", () => {
    fc.assert(
      fc.property(range, (r) => {
        expect([...r.dates()]).toHaveLength(r.nights());
      }),
    );
  });

  it("contains matches [start, end)", () => {
    fc.assert(
      fc.property(range, date, (r, d) => {
        const expected = !d.isBefore(r.start) && d.isBefore(r.end);
        expect(r.contains(d)).toBe(expected);
      }),
    );
  });

  it("overlap is symmetric and agrees with intersect", () => {
    fc.assert(
      fc.property(range, range, (a, b) => {
        expect(a.overlaps(b)).toBe(b.overlaps(a));
        const i = a.intersect(b);
        expect(i !== null).toBe(a.overlaps(b));
        if (i) {
          const j = b.intersect(a);
          expect(j && i.equals(j)).toBe(true);
          for (const d of i.dates()) {
            expect(a.contains(d) && b.contains(d)).toBe(true);
          }
        }
      }),
    );
  });
});
