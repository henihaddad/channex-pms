import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  FakeClock,
  Id,
  ingestProperty,
  type BookingRevisionPayload,
  type ConnectivityProvider,
  type Crypto,
} from "@pms/core";
import { createTestDb } from "../testing/index.js";
import type { DbHandle } from "../client.js";
import { sql } from "drizzle-orm";
import { withoutTenant, withTenant } from "../tenant.js";
import * as s from "../schema/index.js";
import { DrizzleAriStore } from "./ari.js";
import { bookedNightsByRoomType, DrizzleBookingRepository } from "./bookings.js";
import { storeInboundWebhook, resolveWebhookToken } from "./webhooks.js";

let handle: DbHandle;
const ORG = Id.next();
const PROP = Id.next();
const RT = Id.next();
const RP = Id.next();
const actor = { type: "system" as const, id: "t" };
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `sealed:${p}`,
  open: async (p) => p.replace("sealed:", ""),
};

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(s.organization)
      .values({ id: ORG, name: "O", slug: "o", country: "PT", defaultCurrency: "EUR" }),
  );
  await withTenant(handle.db, { orgId: ORG, actor }, async (tx) => {
    await tx.insert(s.property).values({
      id: PROP,
      orgId: ORG,
      kind: "single_unit",
      title: "Alfama",
      currency: "EUR",
      timezone: "Europe/Lisbon",
      state: "live",
      webhookToken: "tok123",
      webhookSecretEnc: "sealed:secret",
    });
    await tx.insert(s.roomType).values({
      id: RT,
      orgId: ORG,
      propertyId: PROP,
      title: "Apartment",
      countOfRooms: 1,
      isSystemManaged: true,
    });
    await tx.insert(s.ratePlan).values({
      id: RP,
      orgId: ORG,
      propertyId: PROP,
      roomTypeId: RT,
      title: "Standard",
      currency: "EUR",
    });
  });
});
afterAll(() => handle.close());

describe("DrizzleAriStore", () => {
  it("edits bump versions and outcomes apply only to the version they were computed for", async () => {
    await withTenant(handle.db, { orgId: ORG, actor }, async (tx) => {
      const store = new DrizzleAriStore(tx);
      await store.setRate(PROP, ORG, RP, "2026-10-01", { rate: 10000, minStay: 2 });
      await store.setRate(PROP, ORG, RP, "2026-10-01", { rate: 12000 }); // merges values, version 2
      await store.setAvailability(PROP, ORG, RT, "2026-10-01", 1);
      const pending = await store.loadPending(PROP);
      expect(pending.rate).toEqual([
        { ratePlanId: RP, date: "2026-10-01", values: { rate: 12000, minStay: 2 }, version: 2 },
      ]);
      expect(pending.availability).toEqual([
        { roomTypeId: RT, date: "2026-10-01", availability: 1, version: 1 },
      ]);
      await store.markInFlight(PROP, [
        { kind: "rate", ratePlanId: RP, date: "2026-10-01", version: 2 },
      ]);
      expect(await store.health(PROP)).toMatchObject({ in_flight: 1, pending: 1 });
      // stale outcome (version 1) is ignored; current one applies
      await store.applyOutcomes(PROP, [
        { kind: "rate", ratePlanId: RP, date: "2026-10-01", version: 1, status: "synced" },
      ]);
      expect(await store.health(PROP)).toMatchObject({ in_flight: 1 });
      await store.applyOutcomes(PROP, [
        { kind: "rate", ratePlanId: RP, date: "2026-10-01", version: 2, status: "synced" },
      ]);
      expect((await store.loadPending(PROP)).rate).toHaveLength(0);
      expect(await store.health(PROP)).toMatchObject({ synced: 1, pending: 1 });
      await store.applyOutcomes(PROP, [
        {
          kind: "availability",
          roomTypeId: RT,
          date: "2026-10-01",
          version: 1,
          status: "failed",
          reason: "bad",
        },
      ]);
      expect((await store.loadPending(PROP)).availability).toHaveLength(0); // validation failures wait for an edit
      await store.markConflicted(PROP, [{ kind: "rate", ratePlanId: RP, date: "2026-10-01" }]);
      expect((await store.loadPending(PROP)).rate).toHaveLength(1);
    });
  });
});

describe("DrizzleBookingRepository", () => {
  const rev = (over: Partial<BookingRevisionPayload>): BookingRevisionPayload => ({
    revisionId: Id.next(),
    bookingId: "cx-b1",
    systemId: over.systemId ?? "5001",
    propertyId: PROP,
    status: "new",
    arrivalDate: "2026-10-01",
    departureDate: "2026-10-03",
    currency: "EUR",
    amount: 20000,
    otaName: "Booking.com",
    otaReservationCode: "R1",
    insertedAt: "2026-09-01T10:00:00Z",
    rooms: [
      {
        roomTypeId: RT,
        ratePlanId: RP,
        checkinDate: "2026-10-01",
        checkoutDate: "2026-10-03",
        days: { "2026-10-01": 10000, "2026-10-02": 10000 },
        occupancy: { adults: 2, children: 0, infants: 0 },
        guests: [{ name: "Ana", surname: "S" }],
      },
    ],
    customer: {
      name: "Ana",
      surname: "Silva",
      email: "ana@example.com",
      phone: "+351 912 345 678",
    },
    services: [],
    taxes: [],
    guarantee: {
      cardType: "VI",
      maskedNumber: "411111******1111",
      expiry: "10/2030",
      cardholder: "Ana Silva",
    },
    raw: { fake: true },
    ...over,
  });

  it("ingests through the real repository: projection, sealed guest, nights, masked card, ack", async () => {
    const clock = new FakeClock("2026-09-01T10:05:00Z");
    const acked: string[] = [];
    const first = rev({});
    const provider = {
      listBookingRevisions: async () => ({ revisions: [first] }),
      ackBookingRevisions: async (ids: string[]) => {
        acked.push(...ids);
      },
    } as unknown as ConnectivityProvider;
    const summary = await withTenant(handle.db, { orgId: ORG, actor }, (tx) =>
      ingestProperty(
        { provider, repo: new DrizzleBookingRepository(tx, ORG, crypto), clock, orgId: ORG },
        PROP,
        { dedupeKey: "k", requestId: "r" },
      ),
    );
    expect(summary).toMatchObject({ applied: 1, acked: 1 });
    expect(acked).toEqual([first.revisionId]);
    await withTenant(handle.db, { orgId: ORG, actor }, async (tx) => {
      const repo = new DrizzleBookingRepository(tx, ORG, crypto);
      const p = await repo.loadProjection("cx-b1");
      expect(p).toMatchObject({
        status: "new",
        totalAmountMinor: 20000,
        mappingState: "mapped",
        lastSystemId: "5001",
        customer: { name: "Ana", surname: "Silva" },
      });
      expect(p?.rooms[0]?.days).toEqual({ "2026-10-01": 10000, "2026-10-02": 10000 });
      const nights = await bookedNightsByRoomType(tx, PROP, "2026-10-01", "2026-10-05");
      expect(nights.get(`${RT}|2026-10-01`)).toBe(1);
      const [g] = await tx.select().from(s.guest);
      expect(g?.nameEnc).toBe("sealed:Ana");
      expect(g?.emailEnc).toBe("sealed:ana@example.com");
      const [pi] = await tx.select().from(s.paymentInstrument);
      expect(pi?.maskedNumber).toBe("411111******1111");
      expect(await repo.findRevisionBySystemId("5001")).toMatchObject({
        channexRevisionId: first.revisionId,
      });
      expect((await repo.findRevisionBySystemId("5001"))?.ackedAt).not.toBeNull();
      const outbox = await tx.select().from(s.outboxEvent);
      expect(outbox.map((e) => e.type)).toEqual(["booking.revision_applied"]);
    });
    // a cancellation frees the nights for reporting and derivation
    const cancel = rev({
      systemId: "5002",
      status: "cancelled",
      insertedAt: "2026-09-02T10:00:00Z",
    });
    const provider2 = {
      listBookingRevisions: async () => ({ revisions: [cancel] }),
      ackBookingRevisions: async () => {},
    } as unknown as ConnectivityProvider;
    await withTenant(handle.db, { orgId: ORG, actor }, (tx) =>
      ingestProperty(
        {
          provider: provider2,
          repo: new DrizzleBookingRepository(tx, ORG, crypto),
          clock,
          orgId: ORG,
        },
        PROP,
        { dedupeKey: "k2", requestId: "r" },
      ),
    );
    await withTenant(handle.db, { orgId: ORG, actor }, async (tx) => {
      expect((await bookedNightsByRoomType(tx, PROP, "2026-10-01", "2026-10-05")).size).toBe(0);
      const revisions = await tx.select().from(s.bookingRevision);
      expect(revisions).toHaveLength(2);
      await expect(
        tx.execute(sql`update booking_revision set system_id = 'x' where system_id = '5001'`),
      ).rejects.toThrow();
    });
  });

  it("INV-7: a PAN-shaped masked number is rejected by the database", async () => {
    await expect(
      withTenant(handle.db, { orgId: ORG, actor }, (tx) =>
        tx.insert(s.paymentInstrument).values({
          id: Id.next(),
          orgId: ORG,
          bookingId: Id.next(),
          maskedNumber: "4111111111111111",
        }),
      ),
    ).rejects.toThrow();
  });
});

describe("inbound webhooks", () => {
  it("resolves the path token and deduplicates deliveries", async () => {
    expect(await resolveWebhookToken(handle.db, "tok123")).toMatchObject({
      orgId: ORG,
      propertyId: PROP,
      secretEnc: "sealed:secret",
    });
    expect(await resolveWebhookToken(handle.db, "nope")).toBeNull();
    const a = await withTenant(handle.db, { orgId: ORG, actor }, (tx) =>
      storeInboundWebhook(tx, {
        orgId: ORG,
        propertyId: PROP,
        event: "booking_new",
        payload: { x: 1 },
        dedupeKey: "d1",
      }),
    );
    const b = await withTenant(handle.db, { orgId: ORG, actor }, (tx) =>
      storeInboundWebhook(tx, {
        orgId: ORG,
        propertyId: PROP,
        event: "booking_new",
        payload: { x: 1 },
        dedupeKey: "d1",
      }),
    );
    expect(a.fresh).toBe(true);
    expect(b.fresh).toBe(false);
  });
});
