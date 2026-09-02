import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  createProperty,
  FakeClock,
  Id,
  projectRevision,
  diffProjection,
  type Crypto,
  type BookingRevisionPayload,
  type Id as IdT,
} from "@pms/core";
import { createTestDb } from "../testing/index.js";
import type { DbHandle } from "../client.js";
import { withoutTenant, withTenant, type Tx } from "../tenant.js";
import * as s from "../schema/index.js";
import { DrizzlePropertyRepository } from "./properties.js";
import { DrizzleBookingRepository } from "./bookings.js";
import { DrizzleOperationsRepository } from "./operations.js";
import { DrizzleBillingRepository } from "./billing.js";
import { DrizzleReservationRepository } from "./reservations.js";

let handle: DbHandle;
const causeChain = (e: unknown): string => {
  let out = "";
  for (let c: unknown = e; c instanceof Error; c = c.cause) out += c.message + " | ";
  return out;
};
const expectDbError = async (p: Promise<unknown>, re: RegExp) => {
  try {
    await p;
  } catch (e) {
    expect(causeChain(e)).toMatch(re);
    return;
  }
  throw new Error("expected rejection");
};
const ORG = Id.next();
const actor = { type: "user" as const, id: Id.next() };
const clock = new FakeClock("2026-09-01T12:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const run = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(handle.db, { orgId: ORG, actor }, fn);
let propertyId: IdT;
let unitId: IdT;
let roomTypeId: IdT;
let ratePlanId: IdT;
let bookingId = "";

const REV_IDS = Array.from({ length: 6 }, () => Id.next());
function revision(n: number, over: Partial<BookingRevisionPayload> = {}): BookingRevisionPayload {
  return {
    revisionId: REV_IDS[n]!,
    bookingId: "cx-b1",
    systemId: `sys-${String(n)}`,
    propertyId,
    status: "new",
    arrivalDate: "2026-10-04",
    departureDate: "2026-10-07",
    currency: "EUR",
    amount: 30000,
    otaName: "BookingCom",
    otaReservationCode: "ABC123",
    insertedAt: `2026-09-0${String(n)}T10:00:00Z`,
    rooms: [
      {
        roomTypeId,
        ratePlanId,
        checkinDate: "2026-10-04",
        checkoutDate: "2026-10-07",
        days: { "2026-10-04": 10000, "2026-10-05": 10000, "2026-10-06": 10000 },
        occupancy: { adults: 2, children: 0, infants: 0 },
        guests: [{ name: "Ana", surname: "Silva" }],
      },
    ],
    customer: { name: "Ana", surname: "Silva", email: "ana@example.com" },
    services: [],
    taxes: [{ name: "City tax", amount: 600, isInclusive: false, withheldByOta: true }],
    raw: { attributes: { rooms: [{ ota_room_code: "R1", ota_rate_code: "STD" }] } },
    ...over,
  };
}
async function apply(rev: BookingRevisionPayload): Promise<void> {
  await run(async (tx) => {
    const repo = new DrizzleBookingRepository(tx, ORG, crypto);
    const prev = await repo.loadProjection(rev.bookingId);
    const next = projectRevision(rev, prev?.bookingId ?? Id.next());
    const diff = diffProjection(prev, next);
    await repo.applyRevision({
      revision: rev,
      projection: next,
      diff,
      events: [],
      now: clock.now().toString(),
    });
  });
}

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(s.organization)
      .values({ id: ORG, name: "Org", slug: "org-m3", country: "PT", defaultCurrency: "EUR" }),
  );
  await withoutTenant(handle.db, (tx) =>
    tx.insert(s.user).values({
      id: actor.id,
      email: "ops@example.com",
      name: "Ops",
      passwordHash: "x",
      locale: "en",
    }),
  );
  const created = await run((tx) =>
    createProperty(
      {
        repo: new DrizzlePropertyRepository(tx, ORG),
        clock,
        orgId: ORG,
        horizonDays: 60,
        webhookCredentials: async () => ({ token: "t3", secretSealed: "s:x" }),
      },
      { title: "Alfama Loft", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
    ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  unitId = created.value.units[0]!.id;
  roomTypeId = created.value.roomTypes[0]!.id;
  ratePlanId = created.value.ratePlans[0]!.id;
});
afterAll(() => handle.close());

describe("turnover tasks from bookings (OPS-1, OPS-3)", () => {
  it("plans a departure task for a new booking, re-plans on a date change, cancels on cancellation", async () => {
    await apply(revision(1));
    const [b] = await run((tx) => tx.select({ id: s.booking.id }).from(s.booking));
    bookingId = b!.id;
    let r = await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).replan(propertyId, "2026-09-01", "2026-12-31"),
    );
    expect(r).toMatchObject({ created: 1, cancelled: 0 });
    let tasks = await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).tasksForBooking(bookingId),
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({
      date: "2026-10-07",
      type: "departure",
      unitId,
      isSameDay: false,
    });
    await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).assign(tasks[0]!.id, actor.id, null),
    );
    await apply(
      revision(2, {
        status: "modified",
        departureDate: "2026-10-08",
        rooms: [
          {
            ...revision(1).rooms[0]!,
            checkoutDate: "2026-10-08",
            days: { ...revision(1).rooms[0]!.days, "2026-10-07": 10000 },
          },
        ],
      }),
    );
    r = await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).replan(propertyId, "2026-09-01", "2026-12-31"),
    );
    expect(r).toMatchObject({ created: 1, cancelled: 1 });
    tasks = await run((tx) => new DrizzleOperationsRepository(tx, ORG).tasksForBooking(bookingId));
    expect(tasks.map((t) => t.date)).toEqual(["2026-10-08"]);
    // a second booking arriving on the departure day makes it a same-day changeover
    await apply(
      revision(3, {
        bookingId: "cx-b2",
        arrivalDate: "2026-10-08",
        departureDate: "2026-10-10",
        rooms: [
          {
            ...revision(1).rooms[0]!,
            checkinDate: "2026-10-08",
            checkoutDate: "2026-10-10",
            days: { "2026-10-08": 9000, "2026-10-09": 9000 },
          },
        ],
        customer: { name: "Bo", surname: "Lee" },
      }),
    );
    r = await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).replan(propertyId, "2026-09-01", "2026-12-31"),
    );
    const board = await run((tx) => new DrizzleOperationsRepository(tx, ORG).tasksOn("2026-10-08"));
    expect(board.map((t) => [t.type, t.isSameDay])).toEqual([["changeover", true]]);
    expect(board[0]?.windowTo).toBe("14:30");
    const open = await run((tx) => new DrizzleOperationsRepository(tx, ORG).openSameDayTasks());
    expect(open.map((t) => t.id)).toEqual([board[0]!.id]);
  });
  it("blocks reduce availability counts; out-of-order units count too", async () => {
    await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).insertBlock({
        id: Id.next(),
        propertyId,
        roomTypeId,
        unitId,
        dateFrom: "2026-11-01",
        dateTo: "2026-11-03",
        reason: "owner_stay",
        reducesAvailability: true,
      }),
    );
    const counts = await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).blockedCount(
        propertyId,
        roomTypeId,
        "2026-10-31",
        "2026-11-03",
      ),
    );
    expect([...counts.entries()]).toEqual([
      ["2026-11-01", 1],
      ["2026-11-02", 1],
    ]);
    await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).setUnitStatus(unitId, "out_of_order"),
    );
    expect(
      (
        await run((tx) =>
          new DrizzleOperationsRepository(tx, ORG).blockedCount(
            propertyId,
            roomTypeId,
            "2026-11-01",
            "2026-11-01",
          ),
        )
      ).get("2026-11-01"),
    ).toBe(2);
    await run((tx) => new DrizzleOperationsRepository(tx, ORG).setUnitStatus(unitId, "clean"));
    await expect(
      run((tx) =>
        new DrizzleOperationsRepository(tx, ORG).insertBlock({
          id: Id.next(),
          propertyId,
          roomTypeId,
          unitId,
          dateFrom: "2026-11-05",
          dateTo: "2026-11-05",
          reason: "staff",
          reducesAvailability: true,
        }),
      ),
    ).rejects.toThrow();
  });
  it("access credentials are sealed, masked and PAN-shaped values refused (INV-7)", async () => {
    const cid = Id.next();
    await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).insertCredential({
        id: cid,
        propertyId,
        bookingId,
        unitId,
        type: "door_code",
        valueEnc: "s:482910",
        value: "482910",
        window: { validFrom: "2026-10-04T13:00:00Z", validTo: "2026-10-08T10:00:00Z" },
        providerRef: null,
        issuedBy: actor.id,
      }),
    );
    const active = await run((tx) =>
      new DrizzleOperationsRepository(tx, ORG).activeCredentials(bookingId),
    );
    expect(active[0]).toMatchObject({ valueMasked: "••••10", type: "door_code" });
    await expect(
      run((tx) =>
        new DrizzleOperationsRepository(tx, ORG).insertCredential({
          id: Id.next(),
          propertyId,
          bookingId,
          unitId,
          type: "door_code",
          valueEnc: "s:x",
          value: "4111111111111111",
          window: { validFrom: "2026-10-04T13:00:00Z", validTo: "2026-10-08T10:00:00Z" },
          providerRef: null,
          issuedBy: actor.id,
        }),
      ),
    ).rejects.toThrow(/INV-7/);
    await run((tx) => new DrizzleOperationsRepository(tx, ORG).revokeCredential(cid, "test"));
    expect(
      await run((tx) => new DrizzleOperationsRepository(tx, ORG).activeCredentials(bookingId)),
    ).toEqual([]);
  });
});

describe("folios, gapless invoices and daily close (spec 08 §8.9)", () => {
  it("posts room revenue once per night, numbers invoices without gaps, and refuses to edit invoiced lines", async () => {
    const first = await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).closeDay(propertyId, "2026-10-04"),
    );
    expect(first.postedLines).toBe(1);
    const again = await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).closeDay(propertyId, "2026-10-04"),
    );
    expect(again).toMatchObject({ postedLines: 0, runs: 2 });
    const folios = await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).foliosForBooking(bookingId),
    );
    expect(folios[0]?.lines.map((l) => [l.kind, l.amountMinor])).toEqual([["room", 10000]]);
    const folioId = folios[0]!.id;
    await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).addLine(folioId, {
        kind: "tourist_tax",
        description: "City tax",
        date: "2026-10-04",
        amountMinor: 400,
      }),
    );
    await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).addPayment(folioId, {
        method: "card",
        amountMinor: 5000,
      }),
    );
    const held = await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).addPayment(folioId, {
        method: "card",
        amountMinor: 20000,
        state: "held",
      }),
    );
    let f = await run((tx) => new DrizzleBillingRepository(tx, ORG).folio(folioId));
    expect(f?.balance).toEqual({
      chargesMinor: 10400,
      paidMinor: 5000,
      heldMinor: 20000,
      balanceMinor: 5400,
    });
    const inv1 = await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).issueInvoice(folioId, { year: 2026, prefix: "ALF" }),
    );
    expect(inv1.number).toBe("ALF-2026-000001");
    expect(inv1.totalMinor).toBe(10400);
    await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).addLine(folioId, {
        kind: "damage",
        description: "Lamp",
        date: "2026-10-08",
        amountMinor: 3000,
      }),
    );
    const inv2 = await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).issueInvoice(folioId, { year: 2026, prefix: "ALF" }),
    );
    expect(inv2.number).toBe("ALF-2026-000002");
    f = await run((tx) => new DrizzleBillingRepository(tx, ORG).folio(folioId));
    const invoicedLine = f!.lines.find((l) => l.invoiceId)!;
    await expectDbError(
      run((tx) =>
        tx.execute(`update folio_line set amount_minor = 1 where id = '${invoicedLine.id}'`),
      ),
      /credit note/,
    );
    await run((tx) =>
      new DrizzleBillingRepository(tx, ORG).setPaymentState(held, "captured", "broken lamp"),
    );
    f = await run((tx) => new DrizzleBillingRepository(tx, ORG).folio(folioId));
    expect(f?.balance.balanceMinor).toBe(13400 - 25000);
  });
});

describe("reservation list, detail, timeline, queue (spec 08 §8.1–8.5)", () => {
  it("lists with shipped views, shows the human-readable timeline and acknowledges modifications", async () => {
    const all = await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).list({}, "2026-10-04"),
    );
    expect(all.total).toBe(2);
    expect(all.rows.find((r) => r.id === bookingId)).toMatchObject({
      guestName: "Ana S.",
      nights: 4,
      status: "modified",
      unacknowledged: true,
      credentials: 0,
    });
    const arrivals = await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).list(
        { view: "arrivals_today" },
        "2026-10-08",
      ),
    );
    expect(arrivals.rows.map((r) => r.otaReservationCode)).toEqual(["ABC123"]);
    const changeovers = await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).list(
        { view: "same_day_changeovers" },
        "2026-10-08",
      ),
    );
    expect(changeovers.total).toBe(2);
    const modified = await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).list(
        { view: "modified_since_yesterday" },
        "2026-09-01",
      ),
    );
    expect(modified.rows.map((r) => r.id)).toEqual([bookingId]);
    const d = (await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).detail(bookingId),
    ))!;
    expect(d.revisions.map((r) => r.timelineText)).toEqual([
      "Departure 2026-10-07 → 2026-10-08 · +1 nights · turnover tasks re-planned, access code rotated",
      "Booking received",
    ]);
    expect(d.financials).toMatchObject({ roomRevenueMinor: 40000, withheldTaxesMinor: 600 });
    expect(d.unacknowledged).toBe(true);
    await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).acknowledge(
        bookingId,
        d.lastRevisionId!,
        actor.id,
      ),
    );
    expect(
      (await run((tx) => new DrizzleReservationRepository(tx, ORG, crypto).detail(bookingId)))!
        .unacknowledged,
    ).toBe(false);
    const pii = await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).guestPii(d.guest!.id),
    );
    expect(pii).toEqual({ name: "Ana", surname: "Silva", email: "ana@example.com", phone: null });
    const search = await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).list({ q: "ABC12" }, "2026-10-04"),
    );
    expect(search.total).toBe(2);
    expect(
      (
        await run((tx) =>
          new DrizzleReservationRepository(tx, ORG, crypto).list(
            { q: "nothing-like-this" },
            "2026-10-04",
          ),
        )
      ).total,
    ).toBe(0);
  });
  it("unmapped bookings queue and one-click resolve", async () => {
    await apply(
      revision(4, {
        bookingId: "cx-b3",
        rooms: [{ ...revision(1).rooms[0]!, roomTypeId: null, ratePlanId: null }],
        customer: { name: "Cy", surname: "Ng" },
      }),
    );
    const q = await run((tx) => new DrizzleReservationRepository(tx, ORG, crypto).unmappedQueue());
    expect(q).toHaveLength(1);
    expect(q[0]?.rooms[0]).toMatchObject({
      otaRoomCode: "R1",
      otaRateCode: "STD",
      roomTypeId: null,
    });
    expect(q[0]?.suggestions[0]).toMatchObject({ roomTypeId, ratePlanId });
    await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).resolveMapping(
        q[0]!.id,
        roomTypeId,
        ratePlanId,
      ),
    );
    expect(
      await run((tx) => new DrizzleReservationRepository(tx, ORG, crypto).unmappedQueue()),
    ).toEqual([]);
    const rack = await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).roomRack(
        propertyId,
        "2026-10-01",
        "2026-11-05",
      ),
    );
    expect(rack[0]?.blocks).toHaveLength(1);
  });
  it("stay state and unit assignment", async () => {
    const d = (await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).detail(bookingId),
    ))!;
    await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).assignUnit(d.rooms[0]!.id, unitId),
    );
    await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).setStayState(
        d.rooms[0]!.id,
        "checked_in",
        actor.id,
      ),
    );
    const d2 = (await run((tx) =>
      new DrizzleReservationRepository(tx, ORG, crypto).detail(bookingId),
    ))!;
    expect(d2.rooms[0]).toMatchObject({ assignedUnitId: unitId, stayState: "checked_in" });
  });
});
