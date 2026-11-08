import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  channelBucket,
  dominantCurrency,
  isoWeek,
  monthsEnding,
  revenueByMonth,
  sumByCurrency,
  weeklyOccupancy,
} from "./financials.js";

describe("channelBucket", () => {
  it("reads our own sources as direct before matching 'booking'", () => {
    expect(channelBucket("booking_engine")).toBe("direct");
    expect(channelBucket(null)).toBe("direct");
    expect(channelBucket("Staff")).toBe("direct");
    expect(channelBucket("BookingCom")).toBe("booking_com");
    expect(channelBucket("Booking.com")).toBe("booking_com");
    expect(channelBucket("Airbnb")).toBe("airbnb");
    expect(channelBucket("Expedia")).toBe("other");
  });
});

describe("sumByCurrency", () => {
  it("never adds two currencies and orders the largest first", () => {
    expect(
      sumByCurrency([
        { currency: "EUR", minor: 100 },
        { currency: "ZAR", minor: 45_000 },
        { currency: "EUR", minor: 250 },
        { currency: "USD", minor: 0 },
      ]),
    ).toEqual([
      { currency: "ZAR", minor: 45_000 },
      { currency: "EUR", minor: 350 },
    ]);
  });

  it("rejects fractional minor units", () => {
    expect(() => sumByCurrency([{ currency: "EUR", minor: 1.5 }])).toThrow();
  });

  it("keeps each currency's total equal to the sum of its rows", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            currency: fc.constantFrom("EUR", "ZAR", "USD"),
            minor: fc.integer({ min: -1_000_000, max: 1_000_000 }),
          }),
        ),
        (rows) => {
          const out = sumByCurrency(rows);
          for (const c of ["EUR", "ZAR", "USD"]) {
            const want = rows.filter((r) => r.currency === c).reduce((a, r) => a + r.minor, 0);
            expect(out.find((o) => o.currency === c)?.minor ?? 0).toBe(want);
          }
        },
      ),
    );
  });

  it("picks the dominant currency by absolute amount", () => {
    expect(
      dominantCurrency(
        [
          { currency: "EUR", minor: -500 },
          { currency: "ZAR", minor: 100 },
        ],
        "USD",
      ),
    ).toBe("EUR");
    expect(dominantCurrency([], "USD")).toBe("USD");
  });
});

describe("monthsEnding", () => {
  it("crosses a year boundary", () => {
    expect(monthsEnding("2026-02", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("revenueByMonth", () => {
  it("buckets channels, ignores other currencies and fills empty months", () => {
    const out = revenueByMonth(
      [
        { month: "2026-10", channel: "Airbnb", currency: "EUR", revenueMinor: 1000 },
        { month: "2026-10", channel: "direct", currency: "EUR", revenueMinor: 500 },
        { month: "2026-10", channel: "BookingCom", currency: "ZAR", revenueMinor: 9999 },
        { month: "2026-11", channel: "Expedia", currency: "EUR", revenueMinor: 200 },
      ],
      ["2026-09", "2026-10", "2026-11"],
      "EUR",
    );
    expect(out.map((m) => m.totalMinor)).toEqual([0, 1500, 200]);
    expect(out[1]!.buckets).toEqual({ airbnb: 1000, booking_com: 0, direct: 500, other: 0 });
    expect(out[2]!.buckets.other).toBe(200);
  });
});

describe("isoWeek / weeklyOccupancy", () => {
  it("follows ISO-8601 at the year boundary", () => {
    expect(isoWeek("2026-01-01")).toMatchObject({ year: 2026, week: 1, monday: "2025-12-29" });
    expect(isoWeek("2027-01-01")).toMatchObject({ year: 2026, week: 53 });
    expect(isoWeek("2026-11-08")).toMatchObject({ week: 45, monday: "2026-11-02" });
  });

  it("adds rooms across days and properties before dividing", () => {
    const out = weeklyOccupancy([
      { date: "2026-11-02", roomsAvailable: 2, roomsSold: 1 },
      { date: "2026-11-03", roomsAvailable: 2, roomsSold: 2 },
      { date: "2026-11-09", roomsAvailable: 0, roomsSold: 0 },
    ]);
    expect(out).toEqual([
      { week: 45, monday: "2026-11-02", roomsAvailable: 4, roomsSold: 3, occupancyBps: 7500 },
      { week: 46, monday: "2026-11-09", roomsAvailable: 0, roomsSold: 0, occupancyBps: null },
    ]);
  });
});
