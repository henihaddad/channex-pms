import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  alos,
  channelMix,
  compare,
  forecast,
  kpis,
  median,
  pace,
  pickup,
  shiftDate,
  type DailyFact,
} from "./kpis.js";
import {
  cancellationSpike,
  lowOccupancy,
  noisyTypes,
  statementMismatch,
  zeroBookingChannel,
} from "./alerts.js";

const fact = (over: Partial<DailyFact> = {}): DailyFact => ({
  date: "2026-05-01",
  roomsAvailable: 10,
  roomsSold: 7,
  roomRevenueMinor: 70000,
  totalRevenueMinor: 80000,
  commissionMinor: 7000,
  withheldTaxMinor: 1000,
  bookingsCreated: 4,
  cancellations: 1,
  arrivals: 3,
  noShows: 0,
  directNights: 2,
  ...over,
});
const arbFact = fc
  .record({
    day: fc.integer({ min: 1, max: 28 }),
    roomsAvailable: fc.integer({ min: 0, max: 50 }),
    soldRatio: fc.double({ min: 0, max: 1, noNaN: true }),
    adr: fc.integer({ min: 0, max: 40000 }),
    extras: fc.integer({ min: 0, max: 20000 }),
    commissionBps: fc.integer({ min: 0, max: 2000 }),
    bookings: fc.integer({ min: 0, max: 10 }),
    cancellations: fc.integer({ min: 0, max: 3 }),
    arrivals: fc.integer({ min: 0, max: 10 }),
    noShows: fc.integer({ min: 0, max: 2 }),
  })
  .map((x) => {
    const sold = Math.min(x.roomsAvailable, Math.round(x.roomsAvailable * x.soldRatio));
    const room = sold * x.adr;
    return fact({
      date: `2026-05-${String(x.day).padStart(2, "0")}`,
      roomsAvailable: x.roomsAvailable,
      roomsSold: sold,
      roomRevenueMinor: room,
      totalRevenueMinor: room + x.extras,
      commissionMinor: Math.round((room * x.commissionBps) / 10_000),
      withheldTaxMinor: 0,
      bookingsCreated: x.bookings,
      cancellations: Math.min(x.cancellations, x.bookings),
      arrivals: x.arrivals,
      noShows: Math.min(x.noShows, x.arrivals),
      directNights: Math.min(sold, 1),
    });
  });

describe("KPI dictionary as code", () => {
  it("occupancy, ADR, RevPAR and net ADR follow the definitions exactly", () => {
    const k = kpis([fact()]);
    expect(k.occupancyBps).toBe(7000);
    expect(k.adrMinor).toBe(10000);
    expect(k.revparMinor).toBe(7000);
    expect(k.trevparMinor).toBe(8000);
    expect(k.netAdrMinor).toBe(Math.round((70000 - 7000 - 1000) / 7));
    expect(k.cancellationRateBps).toBe(2500);
    expect(k.directShareBps).toBe(Math.round((2 * 10_000) / 7));
    expect(kpis([]).occupancyBps).toBeNull();
    expect(alos(21, 4)).toBe(5.3);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([])).toBeNull();
  });

  it("the same facts give the same occupancy whether aggregated per day, per range or in any order (spec 11 §11.6)", () => {
    fc.assert(
      fc.property(fc.array(arbFact, { minLength: 1, maxLength: 40 }), (rows) => {
        const all = kpis(rows);
        const shuffled = kpis([...rows].reverse());
        expect(shuffled).toEqual(all);
        const sold = rows.reduce((a, r) => a + r.roomsSold, 0);
        const avail = rows.reduce((a, r) => a + r.roomsAvailable, 0);
        expect(all.occupancyBps).toBe(avail > 0 ? Math.round((sold * 10_000) / avail) : null);
        // RevPAR = occupancy × ADR, within rounding
        if (all.adrMinor !== null && all.occupancyBps !== null && all.revparMinor !== null)
          expect(
            Math.abs(all.revparMinor - (all.adrMinor * all.occupancyBps) / 10_000),
          ).toBeLessThanOrEqual(all.adrMinor / 10_000 + 1);
        // splitting the range and recombining totals is lossless
        const half = Math.floor(rows.length / 2);
        const a = kpis(rows.slice(0, half));
        const b = kpis(rows.slice(half));
        expect(a.roomsSold + b.roomsSold).toBe(all.roomsSold);
        expect(a.roomRevenueMinor + b.roomRevenueMinor).toBe(all.roomRevenueMinor);
      }),
      { numRuns: 300 },
    );
  });

  it("pickup counts nights gained between snapshots; pace is unavailable until STLY snapshots exist", () => {
    const snaps = [
      { stayDate: "2026-06-10", snapshotDate: "2026-05-01", roomsSold: 3, roomRevenueMinor: 30000 },
      { stayDate: "2026-06-10", snapshotDate: "2026-05-08", roomsSold: 5, roomRevenueMinor: 52000 },
      { stayDate: "2026-06-11", snapshotDate: "2026-05-08", roomsSold: 2, roomRevenueMinor: 20000 },
    ];
    expect(pickup(snaps, { from: "2026-06-01", to: "2026-07-01" }, "2026-05-08", 7)).toEqual({
      nights: 4,
      revenueMinor: 42000,
      baselineDate: "2026-05-01",
    });
    const p = pace(snaps, { from: "2026-06-01", to: "2026-07-01" }, "2026-05-08");
    expect(p.available).toBe(false);
    expect(p.otbNights).toBe(7);
    const withLastYear = [
      ...snaps,
      { stayDate: "2025-06-10", snapshotDate: "2025-05-08", roomsSold: 4, roomRevenueMinor: 40000 },
    ];
    expect(
      pace(withLastYear, { from: "2026-06-01", to: "2026-07-01" }, "2026-05-08"),
    ).toMatchObject({ available: true, otbNights: 7, stlyNights: 4, deltaBps: 7500 });
    expect(
      forecast({
        otbNights: 7,
        pickupLast7: 4,
        daysOut: 30,
        cancellationRateBps: 1000,
        roomsAvailable: 30,
      }),
    ).toEqual({ nights: 22, occupancyBps: 7333 });
    expect(shiftDate("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("channel mix, compare and alert rules", () => {
    const mix = channelMix([
      {
        channel: "booking_com",
        nights: 6,
        revenueMinor: 60000,
        commissionMinor: 9000,
        commissionEstimated: false,
      },
      {
        channel: "direct",
        nights: 4,
        revenueMinor: 44000,
        commissionMinor: 0,
        commissionEstimated: false,
      },
    ]);
    expect(mix[0]!.nightShareBps).toBe(6000);
    expect(mix[1]!.netAdrMinor).toBe(11000);
    const c = compare(kpis([fact()]), kpis([fact({ roomsSold: 5, roomRevenueMinor: 50000 })]));
    expect(c.roomsSold).toBe(4000);
    expect(
      lowOccupancy({
        propertyId: "p",
        propertyTitle: "P",
        date: "2026-05-09",
        occupancyBps: 3000,
        daysOut: 6,
      })?.type,
    ).toBe("low_occupancy");
    expect(
      lowOccupancy({
        propertyId: "p",
        propertyTitle: "P",
        date: "2026-05-30",
        occupancyBps: 3000,
        daysOut: 20,
      }),
    ).toBeNull();
    expect(
      zeroBookingChannel({
        connectionId: "c",
        propertyId: "p",
        propertyTitle: "P",
        channel: "airbnb",
        lastBookingAt: "2026-04-01T00:00:00Z",
        activeSince: "2026-01-01T00:00:00Z",
        now: "2026-05-01T00:00:00Z",
      })?.severity,
    ).toBe("critical");
    expect(
      zeroBookingChannel({
        connectionId: "c",
        propertyId: "p",
        propertyTitle: "P",
        channel: "airbnb",
        lastBookingAt: null,
        activeSince: "2026-01-01T00:00:00Z",
        now: "2026-05-01T00:00:00Z",
      }),
    ).toBeNull();
    expect(
      cancellationSpike({
        propertyId: "p",
        propertyTitle: "P",
        channel: "expedia",
        recentRateBps: 3000,
        baselineRateBps: 1000,
        recentBookings: 8,
      }),
    ).not.toBeNull();
    expect(
      cancellationSpike({
        propertyId: "p",
        propertyTitle: "P",
        channel: "expedia",
        recentRateBps: 3000,
        baselineRateBps: 1000,
        recentBookings: 2,
      }),
    ).toBeNull();
    expect(
      statementMismatch({
        statementId: "s",
        propertyId: "p",
        propertyTitle: "P",
        period: "2026-04",
        statementMinor: 100,
        reportMinor: 100,
      }),
    ).toBeNull();
    expect(
      noisyTypes([
        { type: "low_occupancy", raised: 20, actioned: 1 },
        { type: "sync_degraded", raised: 20, actioned: 10 },
      ]),
    ).toEqual(["low_occupancy"]);
  });
});
