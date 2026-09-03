import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { FakeClock, Id, type Crypto, type DomainEvent } from "@pms/core";
import { FakeProvider } from "@pms/connectivity";
import { createTestDb } from "@pms/db/testing";
import {
  rawRows,
  schema,
  sql,
  storeInboundWebhook,
  withoutTenant,
  withTenant,
  type DbHandle,
} from "@pms/db";
import { MemoryCircuitBreaker, TokenBucket } from "@pms/sync";
import { createLogger } from "@pms/runtime";
import { processBookings } from "@pms/jobs";
import { deriveAvailability } from "@pms/jobs";
import { processWebhook } from "@pms/jobs";
import { processAriPush } from "@pms/jobs";
import { reconcileProperty } from "@pms/jobs";
import { memoryLease } from "@pms/jobs";

let handle: DbHandle;
const ORG = Id.next();
const PROP = Id.next();
const RT = Id.next();
const RP = Id.next();
const actor = { type: "system" as const, id: "t" };
const log = createLogger({ level: "silent", service: "test" });
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const clock = new FakeClock("2026-09-01T12:00:00Z");

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o", country: "PT", defaultCurrency: "EUR" }),
  );
  await withTenant(handle.db, { orgId: ORG, actor }, async (tx) => {
    await tx.insert(schema.property).values({
      id: PROP,
      orgId: ORG,
      kind: "multi_unit",
      title: "Alfama",
      currency: "EUR",
      timezone: "Europe/Lisbon",
      state: "live",
      webhookToken: "tok",
    });
    await tx
      .insert(schema.roomType)
      .values({ id: RT, orgId: ORG, propertyId: PROP, title: "Apartment", countOfRooms: 2 });
    await tx.insert(schema.ratePlan).values({
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

describe("worker processors end to end on PGlite", () => {
  it("webhook → pull → ingest → derive availability → push → provider mirror matches", async () => {
    const fake = new FakeProvider({ seed: 3, rules: [{ op: "push", times: 1, fault: "429" }] });
    const rev = fake.emitBooking({
      propertyId: PROP,
      roomTypeId: RT,
      ratePlanId: RP,
      arrivalDate: "2026-10-01",
      departureDate: "2026-10-03",
      days: { "2026-10-01": 10000, "2026-10-02": 10000 },
    });

    // 1. receiver stored the webhook and emitted webhook.received; the processor turns it into a booking.pull
    const stored = await withTenant(handle.db, { orgId: ORG, actor }, (tx) =>
      storeInboundWebhook(tx, {
        orgId: ORG,
        propertyId: PROP,
        event: "booking_new",
        payload: { booking_id: rev.bookingId },
        dedupeKey: "w1",
      }),
    );
    const received: DomainEvent = {
      id: Id.next(),
      type: "webhook.received",
      orgId: ORG,
      aggregate: { kind: "property", id: PROP },
      payload: { webhookId: stored.id, propertyId: PROP, event: "booking_new" },
      occurredAt: clock.now().toString(),
      dedupeKey: "webhook.received:w1",
    };
    expect(await processWebhook(handle.db, received, log)).toBe("booking");
    const outbox = await rawRows<{ type: string; payload: { reason: string } }>(
      handle.db,
      sql`select type, payload from outbox_event where type = 'booking.pull'`,
    );
    expect(outbox[0]?.payload.reason).toBe("webhook");

    // 2. booking.process pulls the feed and acks
    await processBookings(
      { db: handle.db, provider: fake, crypto, clock, log },
      { orgId: ORG, propertyId: PROP, reason: "webhook" },
      "j1",
    );
    expect(fake.unackedRevisionIds()).toEqual([]);
    const applied = await rawRows<{ payload: { diff: unknown }; dedupe_key: string; type: string }>(
      handle.db,
      sql`select payload, dedupe_key, type from outbox_event where type = 'booking.revision_applied'`,
    );
    expect(applied).toHaveLength(1);

    // 3. availability derives from the diff: 2 rooms, 1 booked → 1 available on both nights, and an ari.changed event
    const ev: DomainEvent = {
      id: Id.next(),
      type: "booking.revision_applied",
      orgId: ORG,
      aggregate: { kind: "booking", id: Id.next() },
      payload: applied[0]!.payload,
      occurredAt: clock.now().toString(),
      dedupeKey: applied[0]!.dedupe_key,
    };
    expect(await deriveAvailability(handle.db, ev, log, Date.now())).toEqual({
      cells: 2,
      overbooked: 0,
    });
    expect(await deriveAvailability(handle.db, ev, log, Date.now())).toEqual({
      cells: 0,
      overbooked: 0,
    }); // idempotent
    const avail = await rawRows<{ date: string; available: number; sync_state: string }>(
      handle.db,
      sql`select date::text, available, sync_state from availability_day order by date`,
    );
    expect(avail).toEqual([
      { date: "2026-10-01", available: 1, sync_state: "pending" },
      { date: "2026-10-02", available: 1, sync_state: "pending" },
    ]);

    // 4. ari.push: first attempt is throttled (delayed), second lands; provider mirror equals desired
    const limiter = new TokenBucket(clock, {
      baseRatePerSecond: 100,
      burst: 100,
      sleep: async (ms) => {
        clock.advance({ milliseconds: ms });
      },
    });
    const breaker = new MemoryCircuitBreaker(clock);
    const delayed: number[] = [];
    const job = { orgId: ORG, propertyId: PROP };
    const ctl = {
      id: "p1",
      delay: async (ms: number) => {
        delayed.push(Date.now() + ms);
      },
    };
    const deps = {
      db: handle.db,
      provider: fake,
      limiter,
      breaker,
      clock,
      log,
      lease: memoryLease(),
      verifySampleRate: 0,
    };
    await processAriPush(deps, job, ctl);
    expect(delayed).toHaveLength(1);
    await processAriPush(deps, job, ctl);
    const snap = await fake.readAri(
      { propertyId: PROP, dateFrom: "2026-10-01", dateTo: "2026-10-02" },
      { dedupeKey: "x", requestId: "x" },
    );
    expect(snap.availability.map((a) => a.availability)).toEqual([1, 1]);
    const after = await rawRows<{ sync_state: string; synced_available: number }>(
      handle.db,
      sql`select sync_state, synced_available from availability_day`,
    );
    expect(after.every((r) => r.sync_state === "synced" && r.synced_available === 1)).toBe(true);

    // 5. an external edit at the provider is caught by the reconcile and re-pushed
    fake.driftAvailability(RT, "2026-10-01", 0);
    const drift = await reconcileProperty(
      { db: handle.db, provider: fake, limiter, breaker, clock, log },
      ORG,
      PROP,
      "Europe/Lisbon",
      "r1",
    );
    expect(drift).toBe(1);
    await processAriPush(deps, job, ctl);
    expect(
      (
        await fake.readAri(
          { propertyId: PROP, dateFrom: "2026-10-01", dateTo: "2026-10-01" },
          { dedupeKey: "y", requestId: "y" },
        )
      ).availability[0]?.availability,
    ).toBe(1);

    // 6. a cancellation frees the room again
    fake.cancelBooking(rev.bookingId);
    await processBookings(
      { db: handle.db, provider: fake, crypto, clock, log },
      { orgId: ORG, propertyId: PROP, reason: "poll" },
      "j2",
    );
    const cancel = await rawRows<{ payload: DomainEvent["payload"]; dedupe_key: string }>(
      handle.db,
      sql`select payload, dedupe_key from outbox_event where type = 'booking.revision_applied' order by occurred_at desc limit 1`,
    );
    await deriveAvailability(
      handle.db,
      { ...ev, payload: cancel[0]!.payload, dedupeKey: cancel[0]!.dedupe_key },
      log,
      Date.now() + 10_000,
    );
    const freed = await rawRows<{ available: number }>(
      handle.db,
      sql`select available from availability_day where date = '2026-10-01'`,
    );
    expect(freed[0]?.available).toBe(2);
  });
});
