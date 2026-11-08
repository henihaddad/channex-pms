import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  createProperty,
  diffProjection,
  FakeClock,
  Id,
  projectRevision,
  DEFAULT_PRICING,
  type BookingRevisionPayload,
  type Crypto,
  type Id as IdT,
} from "@pms/core";
import { createTestDb } from "../testing/index.js";
import type { DbHandle } from "../client.js";
import { withoutTenant, withTenant, type Tx } from "../tenant.js";
import * as s from "../schema/index.js";
import { DrizzlePropertyRepository } from "./properties.js";
import { DrizzleBookingRepository } from "./bookings.js";
import { loadGrid, loadStays, saveNightNotes } from "./calendar.js";
import { DrizzlePricingDefaultsRepository } from "./pricing.js";
import { DrizzleSeasonRepository, loadYearNights } from "./seasons.js";

/**
 * The calendar's bars, notes, pricing defaults, seasons and year (spec 06 §6.2, §6.6)
 * through real SQL, and isolated per tenant like every org table.
 */
let handle: DbHandle;
const ORG = Id.next();
const OTHER = Id.next();
const actor = { type: "user" as const, id: Id.next() };
const clock = new FakeClock("2026-11-01T09:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const run = <T>(fn: (tx: Tx) => Promise<T>) => withTenant(handle.db, { orgId: ORG, actor }, fn);
const runOther = <T>(fn: (tx: Tx) => Promise<T>) =>
  withTenant(handle.db, { orgId: OTHER, actor }, fn);
let propertyId: IdT;
let roomTypeId: IdT;
let ratePlanId: IdT;

beforeAll(async () => {
  handle = await createTestDb();
  for (const [id, slug] of [
    [ORG, "org-cal"],
    [OTHER, "org-cal-other"],
  ] as const)
    await withoutTenant(handle.db, (tx) =>
      tx
        .insert(s.organization)
        .values({ id, name: slug, slug, country: "PT", defaultCurrency: "EUR" }),
    );
  const created = await run((tx) =>
    createProperty(
      {
        repo: new DrizzlePropertyRepository(tx, ORG),
        clock,
        orgId: ORG,
        horizonDays: 60,
        webhookCredentials: async () => ({ token: "tc", secretSealed: "s:x" }),
      },
      { title: "Alfama Loft", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
    ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  roomTypeId = created.value.roomTypes[0]!.id;
  ratePlanId = created.value.ratePlans[0]!.id;
  const revision: BookingRevisionPayload = {
    revisionId: Id.next(),
    bookingId: "cx-cal-1",
    systemId: "sys-cal-1",
    propertyId,
    status: "new",
    arrivalDate: "2026-11-05",
    departureDate: "2026-11-08",
    currency: "EUR",
    amount: 36000,
    otaName: "Airbnb",
    otaReservationCode: "HM1",
    insertedAt: "2026-11-01T08:00:00Z",
    rooms: [
      {
        roomTypeId,
        ratePlanId,
        checkinDate: "2026-11-05",
        checkoutDate: "2026-11-08",
        days: { "2026-11-05": 12000, "2026-11-06": 12000, "2026-11-07": 12000 },
        occupancy: { adults: 2, children: 0, infants: 0 },
        guests: [{ name: "Ana", surname: "Silva" }],
      },
    ],
    customer: { name: "Ana", surname: "Silva", email: "ana@example.com", language: "pt" },
    services: [],
    taxes: [],
    raw: {},
  };
  await run(async (tx) => {
    const next = projectRevision(revision, Id.next());
    await new DrizzleBookingRepository(tx, ORG, crypto).applyRevision({
      revision,
      projection: next,
      diff: diffProjection(null, next),
      events: [],
      now: clock.now().toString(),
    });
  });
});
afterAll(() => handle.close());

describe("the calendar's bars and notes (CAL-2a)", () => {
  it("draws a stay with its guest and channel, half-open, only where it overlaps", async () => {
    const { stays } = await run((tx) =>
      loadStays(tx, { dateFrom: "2026-11-07", dateTo: "2026-11-20", propertyIds: [propertyId] }),
    );
    expect(stays).toHaveLength(1);
    expect(stays[0]).toMatchObject({
      roomTypeId,
      from: "2026-11-05",
      to: "2026-11-08",
      guest: "Ana Silva",
      otaName: "Airbnb",
    });
    const after = await run((tx) =>
      loadStays(tx, { dateFrom: "2026-11-08", dateTo: "2026-11-20", propertyIds: [propertyId] }),
    );
    expect(after.stays).toHaveLength(0);
    const other = await runOther((tx) =>
      loadStays(tx, { dateFrom: "2026-11-01", dateTo: "2026-11-20", propertyIds: [propertyId] }),
    );
    expect(other.stays).toHaveLength(0);
  });

  it("keeps a private note per night, merges notes, and removes one on an empty body", async () => {
    await run((tx) =>
      saveNightNotes(tx, propertyId, [
        { ratePlanId, date: "2026-11-10", body: "Owner's cousin may ask" },
        { ratePlanId, date: "2026-11-11", body: "Boiler service" },
      ]),
    );
    await run((tx) =>
      saveNightNotes(tx, propertyId, [{ ratePlanId, date: "2026-11-11", body: " " }]),
    );
    const [p] = await run((tx) =>
      loadGrid(tx, { dateFrom: "2026-11-01", dateTo: "2026-11-30", propertyIds: [propertyId] }),
    );
    expect(p!.notes).toEqual({ [`${ratePlanId}|2026-11-10`]: "Owner's cousin may ask" });
    expect(p!.pricing).toEqual({ markupBps: {}, rounding: "unit" });
    const [narrow] = await run((tx) =>
      loadGrid(tx, { dateFrom: "2026-11-12", dateTo: "2026-11-30", propertyIds: [propertyId] }),
    );
    expect(narrow!.notes).toEqual({});
  });
});

describe("pricing defaults and seasons (spec 06 §6.6)", () => {
  it("stores markup, rounding and discounts with the property and reads them back clean", async () => {
    await run((tx) =>
      new DrizzlePricingDefaultsRepository(tx).save(propertyId, {
        ...DEFAULT_PRICING,
        markupBps: { airbnb: 1550, booking_com: 0 },
        rounding: "five",
        discounts: { ...DEFAULT_PRICING.discounts, weeklyBps: 800 },
      }),
    );
    const back = await run((tx) => new DrizzlePricingDefaultsRepository(tx).get(propertyId));
    expect(back.markupBps).toEqual({ airbnb: 1550, booking_com: 0 });
    expect(back.rounding).toBe("five");
    expect(back.discounts.weeklyBps).toBe(800);
    const [p] = await run((tx) =>
      loadGrid(tx, { dateFrom: "2026-11-01", dateTo: "2026-11-02", propertyIds: [propertyId] }),
    );
    expect(p!.pricing.markupBps.airbnb).toBe(1550);
  });

  it("lists a property's seasons with the organization's, in date order, and removes its own", async () => {
    const repo = (tx: Tx) => new DrizzleSeasonRepository(tx, ORG);
    const high = Id.next();
    await run((tx) =>
      repo(tx).add({
        id: high,
        propertyId,
        name: "High",
        ranges: [{ from: "2027-06-15", to: "2027-09-15" }],
        colour: "#f59e0b",
      }),
    );
    await run((tx) =>
      repo(tx).add({
        id: Id.next(),
        propertyId: null,
        name: "Peak",
        ranges: [{ from: "2026-12-21", to: "2027-01-05" }],
        colour: "#ef4444",
      }),
    );
    expect((await run((tx) => repo(tx).list(propertyId))).map((x) => x.name)).toEqual([
      "Peak",
      "High",
    ]);
    expect(await runOther((tx) => new DrizzleSeasonRepository(tx, OTHER).list(propertyId))).toEqual(
      [],
    );
    await run((tx) => repo(tx).remove(high, propertyId));
    expect((await run((tx) => repo(tx).list(propertyId))).map((x) => x.name)).toEqual(["Peak"]);
  });

  it("reads the year night by night: booked units, the base plan's price, and the revenue", async () => {
    const y = await run((tx) => loadYearNights(tx, propertyId, "2026-11-01", "2026-11-30"));
    expect(y.nights).toHaveLength(30);
    const n6 = y.nights.find((n) => n.date === "2026-11-06")!;
    expect(n6.booked).toBe(1);
    expect(n6.sellable).toBe(1);
    expect(y.nights.find((n) => n.date === "2026-11-08")!.booked).toBe(0);
    expect(y.revenueMinor).toBe(36_000);
    expect(y.ratePlanTitle).not.toBeNull();
  });
});
