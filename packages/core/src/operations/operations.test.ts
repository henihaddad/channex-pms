import { describe, expect, it } from "vitest";
import fc from "fast-check";
import {
  checklistBlockers,
  planTurnovers,
  reconcileTasks,
  taskKey,
  transitionTask,
} from "./turnover.js";
import { dueEscalations, localToInstant, suggestRoute } from "./routing.js";
import {
  credentialActionForDiff,
  credentialWindow,
  FakeLockProvider,
  maskCredential,
} from "./access.js";
import {
  cancellationFee,
  folioBalance,
  invoiceNumber,
  planDailyClose,
  settleDeposit,
  touristTax,
} from "./billing.js";
import { autoAssign } from "./assignment.js";
import { checkSellable, directBookingChange, directBookingRevision } from "./staff-booking.js";
import type { ExistingTask, Stay } from "./types.js";
import { Id } from "../shared/id.js";

const day = (n: number) => `2026-10-${String(n).padStart(2, "0")}`;
const arbStay = fc
  .record({
    bookingId: fc.uuid(),
    unitId: fc.constantFrom("u1", "u2", "u3"),
    start: fc.integer({ min: 1, max: 20 }),
    len: fc.integer({ min: 1, max: 6 }),
    status: fc.constantFrom("new", "modified", "cancelled"),
  })
  .map((s) => ({
    bookingId: s.bookingId,
    unitId: s.unitId,
    arrivalDate: day(s.start),
    departureDate: day(s.start + s.len),
    status: s.status,
  }));

describe("turnover planning (OPS-1, OPS-3)", () => {
  it("every active stay ends in a departure or changeover task; same-day iff another stay arrives that day on the unit", () => {
    fc.assert(
      fc.property(fc.array(arbStay, { maxLength: 8 }), (stays) => {
        const tasks = planTurnovers(stays);
        const active = stays.filter((s) => s.status !== "cancelled");
        for (const s of active) {
          const t = tasks.find(
            (x) =>
              x.unitId === s.unitId &&
              x.date === s.departureDate &&
              (x.type === "departure" || x.type === "changeover"),
          );
          expect(t).toBeDefined();
          const arrives = active.some(
            (o) =>
              o.unitId === s.unitId &&
              o.arrivalDate === s.departureDate &&
              o.bookingId !== s.bookingId,
          );
          expect(t!.isSameDay).toBe(arrives);
        }
        expect(new Set(tasks.map(taskKey)).size).toBe(tasks.length);
        expect(planTurnovers(stays)).toEqual(tasks);
      }),
    );
  });
  it("same-day changeovers get a hard window before check-in and mid-stay cleans follow the cadence", () => {
    const stays: Stay[] = [
      {
        bookingId: "a",
        unitId: "u",
        arrivalDate: "2026-10-01",
        departureDate: "2026-10-04",
        status: "new",
      },
      {
        bookingId: "b",
        unitId: "u",
        arrivalDate: "2026-10-04",
        departureDate: "2026-10-12",
        status: "new",
      },
    ];
    const tasks = planTurnovers(stays, {
      midStayCadenceNights: 3,
      checkInTime: "15:00",
      cleanMinutes: 120,
      travelMinutes: 30,
    });
    const change = tasks.find((t) => t.type === "changeover")!;
    expect(change).toMatchObject({
      date: "2026-10-04",
      isSameDay: true,
      windowFrom: "10:00",
      windowTo: "14:30",
      departingBookingId: "a",
      arrivingBookingId: "b",
    });
    expect(tasks.filter((t) => t.type === "mid_stay").map((t) => t.date)).toEqual([
      "2026-10-07",
      "2026-10-10",
    ]);
  });
  it("re-planning creates, cancels and reports changed windows; finished tasks are untouched", () => {
    const stays: Stay[] = [
      {
        bookingId: "a",
        unitId: "u",
        arrivalDate: "2026-10-01",
        departureDate: "2026-10-04",
        status: "new",
      },
    ];
    const first = planTurnovers(stays).map((t, i) => ({
      ...t,
      id: String(i),
      state: "assigned" as const,
      assigneeId: "c1",
    }));
    const moved = planTurnovers([{ ...stays[0]!, departureDate: "2026-10-06" }]);
    const r = reconcileTasks(first, moved);
    expect(r.create.map((t) => t.date)).toEqual(["2026-10-06"]);
    expect(r.cancel.map((t) => t.date)).toEqual(["2026-10-04"]);
    const done: ExistingTask[] = first.map((t) => ({ ...t, state: "done" }));
    expect(reconcileTasks(done, moved).cancel).toEqual([]);
    const sameDay = planTurnovers([
      ...stays,
      {
        bookingId: "b",
        unitId: "u",
        arrivalDate: "2026-10-04",
        departureDate: "2026-10-05",
        status: "new",
      },
    ]);
    const r2 = reconcileTasks(first, sameDay);
    expect(r2.create.map((t) => t.type)).toEqual(["changeover", "departure"]);
    expect(r2.cancel.map((t) => t.type)).toEqual(["departure"]);
  });
  it("task state machine and checklist enforcement", () => {
    expect(transitionTask("assigned", "accepted").ok).toBe(true);
    expect(transitionTask("planned", "done").ok).toBe(false);
    expect(transitionTask("inspected", "on_site").ok).toBe(false);
    const items = [
      { key: "beds", label: "Beds", requiresPhoto: true },
      { key: "bins", label: "Bins", requiresPhoto: false },
    ];
    expect(
      checklistBlockers(items, [
        { key: "beds", done: true },
        { key: "bins", done: true },
      ]),
    ).toEqual(['"Beds" needs a photo']);
    expect(
      checklistBlockers(items, [
        { key: "beds", done: true, photoRef: "p" },
        { key: "bins", done: true },
      ]),
    ).toEqual([]);
  });
});

describe("routing and escalation (OPS-2, OPS-4)", () => {
  it("orders each cleaner's day by deadline and geography and never exceeds capacity", () => {
    const tasks = [
      { id: "t1", lat: 38.71, lng: -9.13, deadline: "2026-10-04T14:00:00Z", durationMinutes: 90 },
      { id: "t2", lat: 38.72, lng: -9.14, deadline: "2026-10-04T12:00:00Z", durationMinutes: 90 },
      { id: "t3", lat: 38.75, lng: -9.2, deadline: "2026-10-04T16:00:00Z", durationMinutes: 90 },
      { id: "t4", lat: 38.7, lng: -9.1, deadline: "2026-10-04T18:00:00Z", durationMinutes: 400 },
    ];
    const workers = [
      { id: "w1", lat: 38.71, lng: -9.13, startsAt: "2026-10-04T09:00:00Z", capacityMinutes: 300 },
      { id: "w2", lat: 38.75, lng: -9.2, startsAt: "2026-10-04T09:00:00Z", capacityMinutes: 300 },
    ];
    const r = suggestRoute(tasks, workers);
    expect(r.unassigned).toEqual(["t4"]);
    for (const p of r.plans) {
      expect(p.stops.map((s) => s.sequence)).toEqual(p.stops.map((_, i) => i + 1));
      expect(
        p.stops.reduce((a, s) => a + s.travelMinutesEstimate, 0) + p.stops.length * 90,
      ).toBeLessThanOrEqual(300);
    }
    expect(r.plans.flatMap((p) => p.stops).every((s) => !s.late)).toBe(true);
  });
  it("escalates unassigned same-day changeovers by time left", () => {
    const base: ExistingTask & { timezone: string } = {
      id: "t",
      unitId: "u",
      date: "2026-10-04",
      type: "changeover",
      windowFrom: "10:00",
      windowTo: "14:30",
      isSameDay: true,
      departingBookingId: "a",
      arrivingBookingId: "b",
      state: "planned",
      assigneeId: null,
      timezone: "Europe/Lisbon",
    };
    const deadline = localToInstant("2026-10-04", "14:30", "Europe/Lisbon");
    expect(new Date(deadline).toISOString()).toBe("2026-10-04T13:30:00.000Z");
    expect(dueEscalations([base], new Date(deadline - 7 * 3_600_000).toISOString())).toEqual([]);
    expect(dueEscalations([base], new Date(deadline - 5 * 3_600_000).toISOString())[0]?.level).toBe(
      "coordinator",
    );
    expect(dueEscalations([base], new Date(deadline - 2 * 3_600_000).toISOString())[0]?.level).toBe(
      "property_manager",
    );
    expect(
      dueEscalations([{ ...base, assigneeId: "c" }], new Date(deadline - 3_600_000).toISOString()),
    ).toEqual([]);
    expect(
      dueEscalations([{ ...base, isSameDay: false }], new Date(deadline - 3_600_000).toISOString()),
    ).toEqual([]);
  });
});

describe("access credentials (INV-14)", () => {
  it("window brackets the stay in the property zone; cancellation revokes, moved dates reissue", async () => {
    const w = credentialWindow({
      arrivalDate: "2026-10-04",
      departureDate: "2026-10-06",
      timezone: "Europe/Lisbon",
    });
    expect(w).toEqual({
      validFrom: "2026-10-04T13:00:00.000Z",
      validTo: "2026-10-06T10:00:00.000Z",
    });
    const noDiff = {
      first: false,
      statusChanged: null,
      datesChanged: null,
      amountChanged: true,
      nightsAdded: [],
      nightsRemoved: [],
      mappingState: "mapped" as const,
    };
    expect(credentialActionForDiff(noDiff, true)).toBe("none");
    expect(
      credentialActionForDiff({ ...noDiff, statusChanged: { from: "new", to: "cancelled" } }, true),
    ).toBe("revoke");
    expect(
      credentialActionForDiff(
        {
          ...noDiff,
          datesChanged: {
            from: { arrival: "2026-10-04", departure: "2026-10-06" },
            to: { arrival: "2026-10-04", departure: "2026-10-07" },
          },
        },
        true,
      ),
    ).toBe("reissue");
    expect(
      credentialActionForDiff(
        { ...noDiff, statusChanged: { from: "new", to: "cancelled" } },
        false,
      ),
    ).toBe("none");
    const lock = new FakeLockProvider(() => 0.5);
    const issued = await lock.issue({
      unitRef: "u",
      bookingId: "b",
      window: w,
      type: "smart_lock",
    });
    expect(issued.value).toMatch(/^\d{6}$/);
    expect(maskCredential(issued.value)).toBe("••••" + issued.value.slice(-2));
    expect(issued.providerRef).toBe("fake-lock:u:1");
  });
});

describe("folios, tax, deposits, daily close (spec 08 §8.9)", () => {
  it("tourist tax honours exemptions and caps; balance sums charges minus captured payments", () => {
    const tax = touristTax(
      { perPersonPerNightMinor: 200, exemptUnderAge: 13, maxNights: 7 },
      { arrivalDate: "2026-10-01", departureDate: "2026-10-11", guestAges: [40, 38, 10, null] },
    );
    expect(tax).toEqual({ amountMinor: 200 * 7 * 3, nightsCharged: 7, personsCharged: 3 });
    const lines = [
      {
        id: Id.next(),
        kind: "room" as const,
        description: "n",
        date: "2026-10-01",
        amountMinor: 10000,
      },
      {
        id: Id.next(),
        kind: "tourist_tax" as const,
        description: "t",
        date: "2026-10-01",
        amountMinor: 400,
      },
    ];
    const payments = [
      {
        id: Id.next(),
        method: "card" as const,
        amountMinor: 5000,
        receivedAt: "x",
        state: "captured" as const,
      },
      {
        id: Id.next(),
        method: "card" as const,
        amountMinor: 30000,
        receivedAt: "x",
        state: "held" as const,
      },
    ];
    expect(folioBalance(lines, payments)).toEqual({
      chargesMinor: 10400,
      paidMinor: 5000,
      heldMinor: 30000,
      balanceMinor: 5400,
    });
    const cap = settleDeposit(payments[1]!, "capture", "broken lamp");
    expect(cap.ok && cap.value.state).toBe("captured");
    expect(settleDeposit(payments[0]!, "release", "x").ok).toBe(false);
    expect(settleDeposit(payments[1]!, "release", "").ok).toBe(false);
  });
  it("cancellation fees and invoice numbers", () => {
    const stay = { arrivalDate: "2026-10-10", totalMinor: 30000, firstNightMinor: 10000 };
    expect(
      cancellationFee(
        { type: "flexible", freeUntilDaysBefore: 3, lateFeePercent: 50 },
        stay,
        "2026-10-01",
      ),
    ).toBe(0);
    expect(
      cancellationFee(
        { type: "flexible", freeUntilDaysBefore: 3, lateFeePercent: 50 },
        stay,
        "2026-10-09",
      ),
    ).toBe(15000);
    expect(cancellationFee({ type: "non_refundable" }, stay, "2026-09-01")).toBe(30000);
    expect(cancellationFee({ type: "first_night" }, stay, "2026-09-01")).toBe(10000);
    expect(invoiceNumber("ALF", 2026, 7)).toBe("ALF-2026-000007");
  });
  it("daily close posts each night once and flags unbalanced departed folios", () => {
    const nights = [
      {
        bookingRoomId: "r1",
        bookingId: "b1",
        date: "2026-10-04",
        amountMinor: 100,
        description: "Room",
      },
      {
        bookingRoomId: "r2",
        bookingId: "b2",
        date: "2026-10-04",
        amountMinor: 200,
        description: "Room",
      },
      {
        bookingRoomId: "r3",
        bookingId: "b3",
        date: "2026-10-05",
        amountMinor: 300,
        description: "Room",
      },
    ];
    const first = planDailyClose({
      businessDate: "2026-10-04",
      nights,
      existingPostingKeys: new Set(),
      departedUnbalanced: [
        { bookingId: "b0", balanceMinor: 0 },
        { bookingId: "b9", balanceMinor: 50 },
      ],
    });
    expect(first.postings.map((p) => p.line.postingKey)).toEqual([
      "room:r1:2026-10-04",
      "room:r2:2026-10-04",
    ]);
    expect(first.flags).toEqual([{ bookingId: "b9", balanceMinor: 50 }]);
    const again = planDailyClose({
      businessDate: "2026-10-04",
      nights,
      existingPostingKeys: new Set(first.postings.map((p) => p.line.postingKey!)),
      departedUnbalanced: [],
    });
    expect(again.postings).toEqual([]);
  });
});

describe("auto-assignment (spec 08 §8.4)", () => {
  it("keeps an already assigned free unit, prefers tight gaps, warns on mismatches, skips out-of-order units", () => {
    const units = [
      {
        id: "A",
        roomTypeId: "rt",
        attributes: { pets: true },
        status: "clean",
        busy: [{ from: "2026-10-01", to: "2026-10-03", bookingId: "x" }],
      },
      { id: "B", roomTypeId: "rt", attributes: { pets: false }, status: "clean", busy: [] },
      { id: "C", roomTypeId: "rt", attributes: { pets: true }, status: "out_of_order", busy: [] },
    ];
    const r = autoAssign(
      [
        {
          bookingId: "b1",
          bookingRoomId: "r1",
          roomTypeId: "rt",
          checkinDate: "2026-10-03",
          checkoutDate: "2026-10-05",
          wants: { pets: true },
        },
      ],
      units,
    );
    expect(r[0]).toEqual({ bookingRoomId: "r1", unitId: "A", warnings: [] });
    const r2 = autoAssign(
      [
        {
          bookingId: "b2",
          bookingRoomId: "r2",
          roomTypeId: "rt",
          checkinDate: "2026-10-02",
          checkoutDate: "2026-10-04",
          wants: { pets: true },
          currentUnitId: "A",
        },
      ],
      units,
    );
    expect(r2[0]?.unitId).toBe("B");
    expect(r2[0]?.warnings).toContain("moved from the previously assigned unit");
    expect(r2[0]?.warnings).toContain("unit lacks pets=true");
    const r3 = autoAssign(
      [
        {
          bookingId: "b3",
          bookingRoomId: "r3",
          roomTypeId: "rt",
          checkinDate: "2026-10-01",
          checkoutDate: "2026-10-02",
        },
        {
          bookingId: "b4",
          bookingRoomId: "r4",
          roomTypeId: "rt",
          checkinDate: "2026-10-01",
          checkoutDate: "2026-10-02",
        },
      ],
      units,
    );
    expect(r3.map((x) => x.unitId)).toEqual(["B", null]);
  });
});

describe("staff booking on the single creation path (spec 08 §8.11, BE-2)", () => {
  const cells = (
    over: Partial<
      Record<
        string,
        Partial<{
          rate: number;
          stopSell: boolean;
          closedToArrival: boolean;
          closedToDeparture: boolean;
          minStay: number;
          maxStay: number;
        }>
      >
    > = {},
  ) =>
    Array.from({ length: 10 }, (_, i) => ({
      ratePlanId: "rp",
      date: day(i + 1),
      values: { rate: 10000, minStay: 1, ...over[day(i + 1)] },
    }));
  const avail = new Map(Array.from({ length: 10 }, (_, i) => [day(i + 1), 1]));
  it("prices from nightly rates and refuses restricted stays with reasons", () => {
    const ok = checkSellable({
      arrivalDate: day(2),
      departureDate: day(5),
      rateCells: cells(),
      availability: avail,
    });
    expect(ok).toMatchObject({ ok: true, totalMinor: 30000 });
    expect(
      checkSellable({
        arrivalDate: day(2),
        departureDate: day(5),
        rateCells: cells({ [day(3)]: { stopSell: true } }),
        availability: avail,
      }).reasons,
    ).toEqual([`stop sell on ${day(3)}`]);
    expect(
      checkSellable({
        arrivalDate: day(2),
        departureDate: day(3),
        rateCells: cells({ [day(2)]: { minStay: 2 } }),
        availability: avail,
      }).reasons,
    ).toEqual(["minimum stay 2 nights"]);
    expect(
      checkSellable({
        arrivalDate: day(2),
        departureDate: day(4),
        rateCells: cells({ [day(2)]: { closedToArrival: true } }),
        availability: avail,
      }).reasons,
    ).toContain(`closed to arrival on ${day(2)}`);
    expect(
      checkSellable({
        arrivalDate: day(2),
        departureDate: day(4),
        rateCells: cells(),
        availability: new Map([...avail, [day(3), 0]]),
      }).reasons,
    ).toEqual([`no availability on ${day(3)}`]);
  });
  it("never sells a stay that violates a restriction or an unavailable night (property)", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 8 }),
        fc.integer({ min: 1, max: 4 }),
        fc.array(
          fc.record({
            d: fc.integer({ min: 1, max: 10 }),
            stop: fc.boolean(),
            av: fc.integer({ min: 0, max: 2 }),
            min: fc.integer({ min: 1, max: 4 }),
          }),
          { maxLength: 10 },
        ),
        (start, len, mods) => {
          const over: Record<string, Partial<{ stopSell: boolean; minStay: number }>> = {};
          const av = new Map(avail);
          for (const m of mods) {
            over[day(m.d)] = { stopSell: m.stop, minStay: m.min };
            av.set(day(m.d), m.av);
          }
          const arrival = day(start);
          const departure = day(Math.min(start + len, 11));
          const r = checkSellable({
            arrivalDate: arrival,
            departureDate: departure,
            rateCells: cells(over),
            availability: av,
          });
          if (r.ok) {
            for (let i = start; i < Math.min(start + len, 11); i++) {
              expect(over[day(i)]?.stopSell ?? false).toBe(false);
              expect(av.get(day(i))).toBeGreaterThan(0);
            }
            expect(over[arrival]?.minStay ?? 1).toBeLessThanOrEqual(
              Math.min(start + len, 11) - start,
            );
          }
        },
      ),
    );
  });
  it("produces a revision that the normal apply path understands, and later changes keep the booking id", () => {
    const check = checkSellable({
      arrivalDate: day(2),
      departureDate: day(4),
      rateCells: cells(),
      availability: avail,
    });
    const r = directBookingRevision(
      {
        bookingId: "abc12345",
        propertyId: "p",
        roomTypeId: "rt",
        ratePlanId: "rp",
        arrivalDate: day(2),
        departureDate: day(4),
        currency: "EUR",
        occupancy: { adults: 2, children: 0, infants: 0 },
        customer: { name: "Ana", surname: "Silva" },
        source: "staff",
        nowIso: "2026-09-02T10:00:00Z",
      },
      check,
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value).toMatchObject({
      bookingId: "staff:abc12345",
      systemId: "staff:abc12345:1",
      amount: 20000,
      otaName: "staff",
      rooms: [{ roomTypeId: "rt", days: { [day(2)]: 10000, [day(3)]: 10000 } }],
    });
    const cancel = directBookingChange(r.value, {
      status: "cancelled",
      nowIso: "2026-09-03T10:00:00Z",
      sequence: 2,
    });
    expect(cancel).toMatchObject({
      bookingId: "staff:abc12345",
      systemId: "staff:abc12345:2",
      status: "cancelled",
      amount: 0,
    });
    expect(
      directBookingRevision(
        {
          bookingId: "x",
          propertyId: "p",
          roomTypeId: "rt",
          ratePlanId: "rp",
          arrivalDate: day(2),
          departureDate: day(4),
          currency: "EUR",
          occupancy: { adults: 1, children: 0, infants: 0 },
          customer: { name: "", surname: "S" },
          source: "staff",
          nowIso: "x",
        },
        check,
      ).ok,
    ).toBe(false);
  });
});
