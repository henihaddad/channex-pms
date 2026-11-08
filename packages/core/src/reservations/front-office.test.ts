import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { LocalDate } from "../shared/local-date.js";
import {
  bookingBalance,
  checkinFormState,
  revisionEvent,
  splitFullName,
  spreadTotal,
  stayPhase,
  stayStatus,
} from "./front-office.js";

const base = {
  status: "new",
  paymentCollect: null,
  totalMinor: 24_000,
  roomChargesMinor: 0,
  otherChargesMinor: 0,
  paidMinor: 0,
};

describe("bookingBalance", () => {
  it("owes the total before the daily close posts the room", () => {
    expect(bookingBalance(base)).toEqual({ kind: "due", dueMinor: 24_000 });
  });
  it("adds extras on top of the room, and is paid once the money is in", () => {
    expect(bookingBalance({ ...base, otherChargesMinor: 3_000, paidMinor: 24_000 })).toEqual({
      kind: "due",
      dueMinor: 3_000,
    });
    expect(bookingBalance({ ...base, otherChargesMinor: 3_000, paidMinor: 27_000 })).toEqual({
      kind: "paid",
    });
  });
  it("posted room revenue above the booked total is what is owed", () => {
    expect(bookingBalance({ ...base, roomChargesMinor: 26_000, paidMinor: 24_000 })).toEqual({
      kind: "due",
      dueMinor: 2_000,
    });
  });
  it("a channel-collected booking owes only what was charged here", () => {
    expect(bookingBalance({ ...base, paymentCollect: "ota" })).toEqual({ kind: "ota" });
    expect(
      bookingBalance({
        ...base,
        paymentCollect: "ota",
        roomChargesMinor: 24_000,
        otherChargesMinor: 1_200,
      }),
    ).toEqual({ kind: "due", dueMinor: 1_200 });
  });
  it("a cancelled booking owes its fees only", () => {
    expect(bookingBalance({ ...base, status: "cancelled" })).toEqual({ kind: "none" });
    expect(bookingBalance({ ...base, status: "cancelled", otherChargesMinor: 8_000 })).toEqual({
      kind: "due",
      dueMinor: 8_000,
    });
  });
  it("never reports a due amount that is not positive, in whole minor units", () => {
    fc.assert(
      fc.property(
        fc.constantFrom("new", "modified", "cancelled"),
        fc.constantFrom(null, "ota", "property"),
        fc.nat(1_000_000),
        fc.nat(1_000_000),
        fc.integer({ min: -50_000, max: 200_000 }),
        fc.nat(2_000_000),
        (status, paymentCollect, totalMinor, roomChargesMinor, otherChargesMinor, paidMinor) => {
          const b = bookingBalance({
            status,
            paymentCollect,
            totalMinor,
            roomChargesMinor,
            otherChargesMinor,
            paidMinor,
          });
          if (b.kind === "due") {
            expect(b.dueMinor).toBeGreaterThan(0);
            expect(Number.isInteger(b.dueMinor)).toBe(true);
          }
        },
      ),
    );
  });
});

describe("stayStatus", () => {
  const s = {
    status: "new",
    mappingState: "mapped",
    unassignedRooms: 0,
    unacknowledged: false,
    stayStates: ["expected"],
  };
  it("reads in the order a manager acts on", () => {
    expect(stayStatus(s)).toBe("confirmed");
    expect(stayStatus({ ...s, stayStates: ["checked_in"] })).toBe("checked_in");
    expect(stayStatus({ ...s, stayStates: ["checked_out", "checked_out"] })).toBe("checked_out");
    expect(stayStatus({ ...s, stayStates: ["no_show"] })).toBe("no_show");
    expect(stayStatus({ ...s, unacknowledged: true, stayStates: ["checked_in"] })).toBe("changed");
    expect(stayStatus({ ...s, unassignedRooms: 1, unacknowledged: true })).toBe("needs_room");
    expect(stayStatus({ ...s, mappingState: "unmapped_room" })).toBe("needs_room");
    expect(stayStatus({ ...s, status: "cancelled", unassignedRooms: 1 })).toBe("cancelled");
  });
});

describe("stayPhase", () => {
  it("places today against a half-open stay", () => {
    expect(stayPhase("2026-11-03", "2026-11-14", "2026-11-17")).toEqual({
      kind: "arrives",
      inDays: 11,
    });
    expect(stayPhase("2026-11-14", "2026-11-14", "2026-11-17")).toEqual({
      kind: "arrives",
      inDays: 0,
    });
    expect(stayPhase("2026-11-15", "2026-11-14", "2026-11-17")).toEqual({
      kind: "in_house",
      nightsLeft: 2,
    });
    expect(stayPhase("2026-11-17", "2026-11-14", "2026-11-17")).toEqual({ kind: "departs_today" });
    expect(stayPhase("2026-11-20", "2026-11-14", "2026-11-17")).toEqual({
      kind: "departed",
      daysAgo: 3,
    });
  });
  it("is in house on every night of the stay and on no other", () => {
    const start = LocalDate.parse("2026-01-01");
    fc.assert(
      fc.property(fc.nat(400), fc.integer({ min: 1, max: 30 }), fc.nat(450), (a, n, t) => {
        const arrival = start.plusDays(a).toString();
        const departure = start.plusDays(a + n).toString();
        const today = start.plusDays(t).toString();
        const p = stayPhase(today, arrival, departure);
        const night = t >= a && t < a + n;
        expect(p.kind === "in_house" || (p.kind === "arrives" && p.inDays === 0)).toBe(night);
      }),
    );
  });
});

describe("checkinFormState", () => {
  it("counts the booker as listed once the form is saved", () => {
    expect(checkinFormState({ completedAt: null, guestsListed: 0, guestsExpected: 2 })).toEqual({
      kind: "not_started",
      listed: 0,
    });
    expect(
      checkinFormState({ completedAt: "2026-11-01T10:00:00Z", guestsListed: 0, guestsExpected: 1 }),
    ).toEqual({ kind: "done", listed: 1 });
    expect(
      checkinFormState({ completedAt: "2026-11-01T10:00:00Z", guestsListed: 1, guestsExpected: 3 }),
    ).toEqual({ kind: "missing_guests", missing: 2, listed: 1 });
    expect(
      checkinFormState({ completedAt: "2026-11-01T10:00:00Z", guestsListed: 2, guestsExpected: 2 }),
    ).toEqual({ kind: "done", listed: 2 });
  });
});

describe("splitFullName", () => {
  it("keeps the first word as the given name and the rest as the surname", () => {
    expect(splitFullName("Ana Silva")).toEqual({ name: "Ana", surname: "Silva" });
    expect(splitFullName("  Maria do  Carmo Silva ")).toEqual({
      name: "Maria",
      surname: "do Carmo Silva",
    });
    expect(splitFullName("Madonna")).toBeNull();
    expect(splitFullName("   ")).toBeNull();
  });
});

describe("revisionEvent", () => {
  const diff = {
    first: false,
    statusChanged: null,
    datesChanged: null,
    amountChanged: false,
    nightsAdded: [],
    nightsRemoved: [],
    mappingState: "mapped" as const,
  };
  const r = {
    revisionType: "modified",
    amountMinor: 37_500,
    previousAmountMinor: 26_500,
    guests: 2,
    previousGuests: 2,
  };
  it("names the one change that matters", () => {
    expect(revisionEvent({ ...r, diff: { ...diff, first: true }, previousGuests: null })).toEqual({
      kind: "booked",
    });
    expect(revisionEvent({ ...r, revisionType: "cancelled", diff })).toEqual({ kind: "cancelled" });
    const dates = {
      from: { arrival: "2026-11-14", departure: "2026-11-16" },
      to: { arrival: "2026-11-14", departure: "2026-11-17" },
    };
    expect(revisionEvent({ ...r, diff: { ...diff, datesChanged: dates } })).toEqual({
      kind: "dates_changed",
      ...dates,
    });
    expect(revisionEvent({ ...r, guests: 2, previousGuests: 1, diff })).toEqual({
      kind: "guests_changed",
      from: 1,
      to: 2,
    });
    expect(revisionEvent({ ...r, diff })).toEqual({
      kind: "amount_changed",
      fromMinor: 26_500,
      toMinor: 37_500,
    });
    expect(revisionEvent({ ...r, previousAmountMinor: 37_500, diff })).toEqual({ kind: "updated" });
  });
});

describe("spreadTotal", () => {
  it("keeps the nights' proportions and sums to the total exactly", () => {
    expect(
      spreadTotal({ "2026-11-21": 11_000, "2026-11-22": 11_000, "2026-11-23": 11_000 }, 37_500),
    ).toEqual({ "2026-11-21": 12_500, "2026-11-22": 12_500, "2026-11-23": 12_500 });
    expect(spreadTotal({}, 1_000)).toEqual({});
  });
  it("never loses or invents a minor unit", () => {
    fc.assert(
      fc.property(
        fc.array(fc.nat(100_000), { minLength: 1, maxLength: 30 }),
        fc.nat(5_000_000),
        (prices, total) => {
          const nightly = Object.fromEntries(
            prices.map((p, i) => [LocalDate.parse("2026-01-01").plusDays(i).toString(), p]),
          );
          const out = spreadTotal(nightly, total);
          expect(Object.values(out).reduce((a, b) => a + b, 0)).toBe(total);
          for (const v of Object.values(out)) {
            expect(Number.isInteger(v)).toBe(true);
            expect(v).toBeGreaterThanOrEqual(0);
          }
        },
      ),
    );
  });
});
