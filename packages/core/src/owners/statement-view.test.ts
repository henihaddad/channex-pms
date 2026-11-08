import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  statementOtherLines,
  statementReservations,
  type StatementLineLike,
} from "./statement-view.js";

const night = (bookingId: string, date: string, amount: number): StatementLineLike => ({
  kind: "booking_revenue",
  date,
  description: `Ana Silva · Airbnb · night ${date}`,
  amountMinor: amount,
  bookingId,
  basis: { stay: "2026-10-28→2026-11-02" },
});

describe("statementReservations", () => {
  it("groups nights and channel fees per reservation", () => {
    const lines: StatementLineLike[] = [
      night("b2", "2026-10-29", 8800),
      night("b2", "2026-10-28", 8800),
      {
        kind: "ota_commission",
        date: "2026-10-28",
        description: "OTA commission (actual) · Airbnb",
        amountMinor: -264,
        bookingId: "b2",
        basis: {},
      },
      {
        kind: "booking_revenue",
        date: "2026-10-03",
        description: "Chen Wei · Direct · night 2026-10-03",
        amountMinor: 11000,
        bookingId: "b1",
        basis: { stay: "2026-10-03→2026-10-04" },
      },
      {
        kind: "expense",
        date: "2026-10-10",
        description: "cleaning: turnover",
        amountMinor: -4500,
        bookingId: null,
        basis: {},
      },
    ];
    const out = statementReservations(lines);
    expect(out.map((r) => r.bookingId)).toEqual(["b1", "b2"]);
    expect(out[1]).toMatchObject({
      guest: "Ana Silva",
      channel: "Airbnb",
      arrival: "2026-10-28",
      departure: "2026-11-02",
      nights: 2,
      accommodationMinor: 17600,
      channelFeeMinor: -264,
      netMinor: 17336,
    });
    expect(statementOtherLines(lines).map((l) => l.kind)).toEqual(["expense"]);
  });

  it("loses no money: reservations plus other lines sum to every line", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            kind: fc.constantFrom("booking_revenue", "ota_commission", "withheld_tax", "expense"),
            date: fc.constantFrom("2026-10-01", "2026-10-02", "2026-10-03"),
            description: fc.constant("Guest · Airbnb · night 2026-10-01"),
            amountMinor: fc.integer({ min: -100_000, max: 100_000 }),
            bookingId: fc.constantFrom("a", "b", null),
            basis: fc.constant({}),
          }),
        ),
        (lines) => {
          const grouped = statementReservations(lines).reduce((a, r) => a + r.netMinor, 0);
          const other = statementOtherLines(lines).reduce((a, l) => a + l.amountMinor, 0);
          const all = lines.reduce((a, l) => a + l.amountMinor, 0);
          expect(grouped + other).toBe(all);
        },
      ),
    );
  });
});
