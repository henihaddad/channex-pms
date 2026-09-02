import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  activeHoldsByDate,
  holdExpiry,
  icsFor,
  promoDiscount,
  quote,
  searchOffers,
  accessRevealOpen,
} from "./search.js";
import type { Offer, PromoCode, SearchableRoomType } from "./types.js";

const day = (i: number) => `2026-06-${String(i).padStart(2, "0")}`;
const arbCell = fc.record({
  rate: fc.option(fc.integer({ min: 1000, max: 30000 }), { nil: undefined }),
  stopSell: fc.boolean(),
  closedToArrival: fc.boolean(),
  closedToDeparture: fc.boolean(),
  minStay: fc.option(fc.integer({ min: 1, max: 4 }), { nil: undefined }),
  maxStay: fc.option(fc.integer({ min: 1, max: 6 }), { nil: undefined }),
});
const arbRoomType = fc.record({
  cells: fc.array(arbCell, { minLength: 20, maxLength: 20 }),
  availability: fc.array(fc.integer({ min: 0, max: 3 }), { minLength: 20, maxLength: 20 }),
  holds: fc.array(
    fc.record({
      start: fc.integer({ min: 1, max: 18 }),
      nights: fc.integer({ min: 1, max: 3 }),
      rooms: fc.integer({ min: 1, max: 2 }),
      expired: fc.boolean(),
    }),
    { maxLength: 4 },
  ),
});
const arbQuery = fc.record({
  start: fc.integer({ min: 1, max: 15 }),
  nights: fc.integer({ min: 1, max: 5 }),
  adults: fc.integer({ min: 1, max: 4 }),
});

function build(rt: {
  cells: Array<{
    rate?: number | undefined;
    stopSell: boolean;
    closedToArrival: boolean;
    closedToDeparture: boolean;
    minStay?: number | undefined;
    maxStay?: number | undefined;
  }>;
  availability: number[];
  holds: Array<{ start: number; nights: number; rooms: number; expired: boolean }>;
}): { roomType: SearchableRoomType; held: Map<string, number> } {
  const holds = rt.holds.map((h, i) => ({
    roomTypeId: "rt",
    arrivalDate: day(h.start),
    departureDate: day(h.start + h.nights),
    rooms: h.rooms,
    expiresAt: h.expired ? "2026-05-01T00:00:00Z" : "2026-12-01T00:00:00Z",
    state: "held",
    id: String(i),
  }));
  const held = activeHoldsByDate(holds, "rt", "2026-05-15T00:00:00Z");
  const availability = new Map<string, number>();
  for (let i = 1; i <= 20; i++)
    availability.set(day(i), Math.max(0, (rt.availability[i - 1] ?? 0) - (held.get(day(i)) ?? 0)));
  const cells = rt.cells.map((c, i) => ({
    ratePlanId: "rp",
    date: day(i + 1),
    values: {
      ...(c.rate !== undefined ? { rate: c.rate } : {}),
      stopSell: c.stopSell,
      closedToArrival: c.closedToArrival,
      closedToDeparture: c.closedToDeparture,
      ...(c.minStay ? { minStay: c.minStay } : {}),
      ...(c.maxStay ? { maxStay: c.maxStay } : {}),
    },
  }));
  return {
    roomType: {
      roomTypeId: "rt",
      title: "Room",
      maxOccupancy: 4,
      availability,
      ratePlans: [
        {
          ratePlanId: "rp",
          title: "Standard",
          currency: "EUR",
          directOnly: false,
          mealPlan: null,
          cells,
        },
      ],
    },
    held,
  };
}

describe("direct search (BE-2, BE-4, BE-5)", () => {
  it("never returns a stay that violates a restriction or lands on a booked or held night (spec 15 M7 exit)", () => {
    fc.assert(
      fc.property(arbRoomType, arbQuery, (rt, q) => {
        const { roomType, held } = build(rt);
        const arrival = day(q.start);
        const departure = day(q.start + q.nights);
        const offers = searchOffers("p", [roomType], {
          arrivalDate: arrival,
          departureDate: departure,
          adults: q.adults,
          children: 0,
        });
        for (const o of offers) {
          for (let i = q.start; i < q.start + q.nights; i++) {
            const cell = rt.cells[i - 1]!;
            expect(cell.rate).toBeDefined();
            expect(cell.stopSell).toBe(false);
            if (cell.maxStay) expect(cell.maxStay).toBeGreaterThanOrEqual(q.nights);
            // rooms left after bookings and live holds
            expect((rt.availability[i - 1] ?? 0) - (held.get(day(i)) ?? 0)).toBeGreaterThanOrEqual(
              1,
            );
          }
          expect(rt.cells[q.start - 1]!.closedToArrival).toBe(false);
          expect(rt.cells[q.start + q.nights - 2]!.closedToDeparture).toBe(false);
          const minStay = rt.cells[q.start - 1]!.minStay ?? 0;
          expect(minStay).toBeLessThanOrEqual(q.nights);
          expect(o.roomMinor).toBe(Object.values(o.nightly).reduce((a, b) => a + b, 0));
          expect(Object.keys(o.nightly)).toHaveLength(q.nights);
        }
      }),
      { numRuns: 500 },
    );
  });

  it("occupancy pricing uses the per-occupancy rate when the plan has one; a party over the maximum is not offered", () => {
    const cells = [1, 2].map((i) => ({
      ratePlanId: "rp",
      date: day(i),
      values: { rate: 10000, rates: { 1: 8000, 2: 10000, 3: 12000 } },
    }));
    const rt: SearchableRoomType = {
      roomTypeId: "rt",
      title: "Suite",
      maxOccupancy: 3,
      availability: new Map([
        [day(1), 2],
        [day(2), 2],
      ]),
      ratePlans: [
        {
          ratePlanId: "rp",
          title: "Std",
          currency: "EUR",
          directOnly: true,
          mealPlan: "breakfast",
          cells,
        },
      ],
    };
    const q = { arrivalDate: day(1), departureDate: day(3), children: 0 };
    expect(searchOffers("p", [rt], { ...q, adults: 1 })[0]!.roomMinor).toBe(16000);
    expect(searchOffers("p", [rt], { ...q, adults: 3 })[0]!.roomMinor).toBe(24000);
    expect(searchOffers("p", [rt], { ...q, adults: 4 })).toHaveLength(0);
  });

  it("quotes itemise room, extras, discount, VAT and city tax and state what is due now (BE-1)", () => {
    const offer: Offer = {
      propertyId: "p",
      roomTypeId: "rt",
      roomTypeTitle: "R",
      ratePlanId: "rp",
      ratePlanTitle: "S",
      currency: "EUR",
      nights: 3,
      nightly: { a: 10000, b: 10000, c: 10000 },
      roomMinor: 30000,
      available: 1,
      directOnly: false,
      mealPlan: null,
    };
    const promo: PromoCode = {
      code: "SUMMER10",
      kind: "percent",
      value: 10,
      validFrom: null,
      validTo: null,
      stayFrom: null,
      stayTo: null,
      minNights: 2,
      maxUses: null,
      uses: 0,
      singleUse: false,
      active: true,
      propertyId: null,
    };
    const qte = quote({
      offer,
      adults: 2,
      children: 1,
      extras: [
        { extra: { id: "b", name: "Breakfast", priceMinor: 1000, per: "person" }, quantity: 1 },
        { extra: { id: "p", name: "Parking", priceMinor: 1500, per: "night" }, quantity: 1 },
      ],
      promo,
      taxes: { vatBps: 1000, cityTaxPerPersonNightMinor: 200, cityTaxMaxNights: 7 },
      guarantee: { kind: "deposit_percent", percentBps: 3000 },
      nowIso: "2026-05-01T00:00:00Z",
      arrivalDate: "2026-06-01",
      departureDate: "2026-06-04",
    });
    expect(qte.extrasMinor).toBe(3000 + 4500);
    expect(qte.discountMinor).toBe(3000);
    const taxable = 30000 - 3000 + 7500;
    expect(qte.vatMinor).toBe(Math.round(taxable * 0.1));
    expect(qte.cityTaxMinor).toBe(200 * 2 * 3);
    expect(qte.totalMinor).toBe(taxable + qte.vatMinor + qte.cityTaxMinor);
    expect(qte.dueNowMinor).toBe(Math.round(qte.totalMinor * 0.3));
    expect(qte.promoCode).toBe("SUMMER10");
    expect(
      promoDiscount(
        { ...promo, minNights: 5 },
        offer,
        { arrivalDate: "2026-06-01", departureDate: "2026-06-04" },
        "2026-05-01T00:00:00Z",
      ).reason,
    ).toMatch(/nights/);
    expect(
      promoDiscount(
        { ...promo, singleUse: true, uses: 1 },
        offer,
        { arrivalDate: "2026-06-01", departureDate: "2026-06-04" },
        "2026-05-01T00:00:00Z",
      ).discountMinor,
    ).toBe(0);
    expect(
      quote({
        offer,
        adults: 2,
        children: 0,
        extras: [],
        promo: null,
        taxes: { vatBps: 0, cityTaxPerPersonNightMinor: 0, cityTaxMaxNights: null },
        guarantee: { kind: "pay_at_property" },
        nowIso: "2026-05-01T00:00:00Z",
        arrivalDate: "2026-06-01",
        departureDate: "2026-06-04",
      }).dueNowMinor,
    ).toBe(0);
  });

  it("holds expire after 15 minutes; the access code reveals inside its window; the .ics is well-formed", () => {
    expect(holdExpiry("2026-06-01T10:00:00.000Z")).toBe("2026-06-01T10:15:00.000Z");
    expect(
      accessRevealOpen("2026-06-01T10:00:00Z", "2026-06-01T15:00:00Z", "2026-06-04T11:00:00Z", 24),
    ).toBe(true);
    expect(
      accessRevealOpen("2026-05-30T10:00:00Z", "2026-06-01T15:00:00Z", "2026-06-04T11:00:00Z", 24),
    ).toBe(false);
    expect(
      accessRevealOpen("2026-06-05T10:00:00Z", "2026-06-01T15:00:00Z", "2026-06-04T11:00:00Z", 24),
    ).toBe(false);
    const ics = icsFor({
      uid: "b1@pms",
      propertyTitle: "Sea View",
      address: "Rua A, Lisboa",
      arrivalDate: "2026-06-01",
      departureDate: "2026-06-04",
      checkInTime: "15:00",
      checkOutTime: "11:00",
      reference: "ABC123",
      portalUrl: "https://x/guest/t",
    });
    expect(ics).toContain("DTSTART:20260601T150000");
    expect(ics).toContain("DTEND:20260604T110000");
    expect(ics).toContain("LOCATION:Rua A\\, Lisboa");
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
  });
});
