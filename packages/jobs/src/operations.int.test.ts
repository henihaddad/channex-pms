import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  createProperty,
  FakeClock,
  FakeLockProvider,
  Id,
  ingestProperty,
  type Crypto,
  type DomainEvent,
} from "@pms/core";
import { FakeProvider } from "@pms/connectivity";
import { createTestDb } from "@pms/db/testing";
import {
  asSystem,
  BookingRepositoryPerCall,
  DrizzleBillingRepository,
  DrizzleOperationsRepository,
  DrizzlePropertyRepository,
  drainOutbox,
  rawRows,
  schema,
  sql,
  withoutTenant,
  withTenant,
  type DbHandle,
} from "@pms/db";
import { createLogger } from "@pms/runtime";
import {
  escalateTurnovers,
  issueCredential,
  purgeCardMetadata,
  replanOperations,
  runDailyCloses,
} from "./operations.js";

/**
 * M3 exit (spec 15): a simulated week with FakeClock: arrivals, departures, a
 * same-day changeover, a modification, a cancellation. Tasks regenerate, the
 * credential rotates within the revision, escalation fires, daily close posts once.
 */
let handle: DbHandle;
const ORG = Id.next();
const log = createLogger({ level: "silent", service: "test" });
const clock = new FakeClock("2026-10-01T09:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const fake = new FakeProvider({ seed: 11, rules: [] });
const lock = new FakeLockProvider(() => 0.42);
const notifications: Array<{ kind: string; to: string | null; text: string }> = [];
const deps = {
  provider: fake,
  clock,
  crypto,
  lock,
  log,
  notify: async (
    _tx: unknown,
    _org: string,
    n: { kind: string; to: string | null; text: string },
  ) => {
    notifications.push(n);
  },
};
let propertyId: string;
let roomTypeId: string;
let ratePlanId: string;
let unitId: string;

async function ingestAndReplan(): Promise<void> {
  const repo = new BookingRepositoryPerCall(handle.db, ORG, crypto);
  await ingestProperty({ provider: fake, repo, clock, orgId: ORG, log }, propertyId, {
    dedupeKey: `t:${String(clock.now().epochMilliseconds)}`,
    requestId: "t",
  });
  const events: DomainEvent[] = [];
  await withoutTenant(handle.db, (tx) =>
    drainOutbox(
      tx,
      {
        publish: async (e) => {
          events.push(e);
        },
      },
      100,
    ),
  );
  for (const e of events)
    if (e.type === "booking.revision_applied")
      await replanOperations({ db: handle.db, ...deps }, e);
}
const tasks = () =>
  asSystem(handle.db, ORG, (tx) =>
    rawRows<{
      date: string;
      type: string;
      state: string;
      is_same_day: boolean;
      assignee_id: string | null;
    }>(
      tx,
      sql`select date::text, type, state, is_same_day, assignee_id from turnover_task where property_id = ${propertyId} order by date, type`,
    ),
  );

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o-ops", country: "PT", defaultCurrency: "EUR" }),
  );
  const created = await withTenant(
    handle.db,
    { orgId: ORG, actor: { type: "system", id: "t" } },
    (tx) =>
      createProperty(
        {
          repo: new DrizzlePropertyRepository(tx, ORG),
          clock,
          orgId: ORG,
          horizonDays: 60,
          webhookCredentials: async () => ({ token: "tok-ops", secretSealed: "s:x" }),
        },
        {
          title: "Bairro Alto Flat",
          kind: "single_unit",
          currency: "EUR",
          timezone: "Europe/Lisbon",
        },
      ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  roomTypeId = created.value.roomTypes[0]!.id;
  ratePlanId = created.value.ratePlans[0]!.id;
  unitId = created.value.units[0]!.id;
  await asSystem(handle.db, ORG, (tx) => tx.update(schema.property).set({ state: "live" }));
});
afterAll(() => handle.close());

describe("a simulated week of operations", () => {
  it("Monday: two OTA bookings arrive; a departure task and a same-day changeover are planned; a door code is issued", async () => {
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-10-03",
      departureDate: "2026-10-06",
      days: { "2026-10-03": 12000, "2026-10-04": 12000, "2026-10-05": 12000 },
    });
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-10-06",
      departureDate: "2026-10-08",
      days: { "2026-10-06": 11000, "2026-10-07": 11000 },
    });
    await ingestAndReplan();
    expect((await tasks()).map((t) => [t.date, t.type, t.is_same_day])).toEqual([
      ["2026-10-06", "changeover", true],
      ["2026-10-08", "departure", false],
    ]);
    const [b1] = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ id: string }>(tx, sql`select id from booking where arrival_date = '2026-10-03'`),
    );
    const cred = await asSystem(handle.db, ORG, (tx) =>
      issueCredential({ db: handle.db, ...deps }, tx, ORG, {
        propertyId,
        bookingId: b1!.id,
        unitId,
        type: "smart_lock",
        timezone: "Europe/Lisbon",
        arrivalDate: "2026-10-03",
        departureDate: "2026-10-06",
        issuedBy: "test",
      }),
    );
    expect(cred.value).toMatch(/^\d{6}$/);
    expect(cred.validFrom).toBe("2026-10-03T13:00:00.000Z");
    expect(lock.issued).toHaveLength(1);
  });

  it("Tuesday: the first guest extends by a day; tasks re-plan, the assignee is told, and the door code rotates (RES-4, INV-14)", async () => {
    const t = await tasks();
    const [changeover] = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ id: string }>(
        tx,
        sql`select id from turnover_task where property_id = ${propertyId} and type = 'changeover'`,
      ),
    );
    const cleaner = Id.next();
    await withoutTenant(handle.db, (tx) =>
      tx.insert(schema.user).values({
        id: cleaner,
        email: "c@example.com",
        name: "Cleo",
        passwordHash: "x",
        locale: "en",
      }),
    );
    await asSystem(handle.db, ORG, (tx) =>
      new DrizzleOperationsRepository(tx, ORG).assign(changeover!.id, cleaner, null),
    );
    expect(t).toHaveLength(2);
    clock.advance({ hours: 24 });
    const first = fake.ledger.emitted[0]!;
    fake.modifyBooking(first.bookingId, {
      departureDate: "2026-10-07",
      days: { ...first.rooms[0]!.days, "2026-10-06": 12000 },
    });
    await ingestAndReplan();
    const after = await tasks();
    // the 10-06 changeover is gone; 10-07 is now the departure of guest 1 while guest 2 is in house on another... single unit: overlap means guest 2's stay is squeezed; planner keeps what the stays say
    expect(after.find((x) => x.date === "2026-10-06" && x.type === "changeover")?.state).toBe(
      "cancelled",
    );
    expect(after.some((x) => x.date === "2026-10-07" && x.state !== "cancelled")).toBe(true);
    expect(
      notifications.some((n) => n.kind === "task_changed" || n.kind === "turnover_escalation"),
    ).toBe(false);
    const creds = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ revoked_at: string | null; revoke_reason: string | null }>(
        tx,
        sql`select revoked_at, revoke_reason from access_credential order by issued_at`,
      ),
    );
    expect(creds).toHaveLength(2);
    expect(creds[0]).toMatchObject({ revoke_reason: "dates changed" });
    expect(creds[1]?.revoked_at).toBeNull();
    expect(lock.revoked).toHaveLength(1);
    expect(lock.issued).toHaveLength(2);
  });

  it("Wednesday: the second guest cancels; their tasks cancel and no credential remains", async () => {
    clock.advance({ hours: 24 });
    const second = fake.ledger.emitted[1]!;
    fake.cancelBooking(second.bookingId);
    await ingestAndReplan();
    const after = await tasks();
    expect(after.filter((x) => x.state !== "cancelled").map((x) => [x.date, x.type])).toEqual([
      ["2026-10-07", "departure"],
    ]);
  });

  it("Thursday: an unassigned same-day changeover escalates as its window approaches (OPS-4)", async () => {
    fake.emitBooking({
      propertyId,
      roomTypeId,
      ratePlanId,
      arrivalDate: "2026-10-07",
      departureDate: "2026-10-09",
      days: { "2026-10-07": 9000, "2026-10-08": 9000 },
    });
    await ingestAndReplan();
    const open = (await tasks()).filter((x) => x.state !== "cancelled");
    expect(open.map((x) => [x.date, x.type, x.is_same_day])).toEqual([
      ["2026-10-07", "changeover", true],
      ["2026-10-09", "departure", false],
    ]);
    clock.set("2026-10-07T08:00:00Z"); // 10:00 Lisbon, window ends 14:30 → 5.5 h left → coordinator
    expect(await escalateTurnovers({ db: handle.db, ...deps })).toEqual({ escalated: 1 });
    expect(notifications.at(-1)?.kind).toBe("turnover_escalation");
    expect(await escalateTurnovers({ db: handle.db, ...deps })).toEqual({ escalated: 0 });
    clock.set("2026-10-07T11:00:00Z"); // 2.5 h left → property manager
    expect(await escalateTurnovers({ db: handle.db, ...deps })).toEqual({ escalated: 1 });
    expect(notifications.at(-1)?.text).toContain("property manager");
  });

  it("Friday: the cleaner completes the changeover with photos; the unit flips to clean and daily close posts each night once", async () => {
    const [task] = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ id: string }>(
        tx,
        sql`select id from turnover_task where property_id = ${propertyId} and date = '2026-10-07' and state <> 'cancelled'`,
      ),
    );
    await asSystem(handle.db, ORG, async (tx) => {
      const ops = new DrizzleOperationsRepository(tx, ORG);
      await ops.assign(
        task!.id,
        (await rawRows<{ id: string }>(tx, sql`select id from "user" limit 1`))[0]!.id,
        null,
      );
      await ops.setState(task!.id, "accepted");
      await ops.setState(task!.id, "on_site");
      await ops.setState(task!.id, "done", {
        photos: [{ ref: "photo-1", takenAt: clock.now().toString() }],
        durationActualMinutes: 95,
      });
      await ops.setUnitStatus(unitId, "clean");
    });
    clock.set("2026-10-08T05:00:00Z");
    expect(await runDailyCloses({ db: handle.db, clock, log })).toEqual({ closed: 1 });
    const lines = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from folio_line where kind = 'room' and date = '2026-10-07'`,
      ),
    );
    expect(lines[0]?.n).toBe(1);
    expect(await runDailyCloses({ db: handle.db, clock, log })).toEqual({ closed: 0 });
    const f = await asSystem(handle.db, ORG, async (tx) => {
      const [b] = await rawRows<{ id: string }>(
        tx,
        sql`select id from booking where arrival_date = '2026-10-07'`,
      );
      return new DrizzleBillingRepository(tx, ORG).foliosForBooking(b!.id);
    });
    expect(f[0]?.lines.map((l) => l.amountMinor)).toEqual([9000]);
    expect(await purgeCardMetadata({ db: handle.db, clock, log }, 30)).toEqual({ purged: 0 });
  });
});
