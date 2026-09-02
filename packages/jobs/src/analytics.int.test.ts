import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import {
  createProperty,
  FakeClock,
  Id,
  ingestProperty,
  kpis,
  LocalDate,
  type Crypto,
} from "@pms/core";
import { FakeProvider } from "@pms/connectivity";
import { createTestDb } from "@pms/db/testing";
import {
  asSystem,
  BookingRepositoryPerCall,
  DrizzleAnalyticsRepository,
  DrizzleOwnerRepository,
  DrizzlePropertyRepository,
  rawRows,
  schema,
  sql,
  withoutTenant,
  withTenant,
  type DbHandle,
} from "@pms/db";
import { createLogger } from "@pms/runtime";
import {
  computeAlerts,
  dashboardKpis,
  reconcileStatements,
  rollup,
  runReport,
  sendScheduledReports,
  snapshotSource,
  toCsv,
} from "./analytics.js";
import { generateStatement, sendStatement } from "./owners.js";

/**
 * M6 exit (spec 15, spec 11 §11.6): occupancy is identical from the KPI
 * function, the SQL rollup and the CSV export on random booking sets; pace is
 * marked unavailable without a year of snapshots; the owner statement register
 * reconciles to the revenue report; alerts raise once and resolve; a scheduled
 * report goes out by mail.
 */
let handle: DbHandle;
const ORG = Id.next();
const STAFF = Id.next();
const log = createLogger({ level: "silent", service: "test" });
const clock = new FakeClock("2026-07-03T09:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const fake = new FakeProvider({ seed: 3, rules: [] });
fake.nowSource = () => clock.now().toString();
const mails: Array<{ to: string; template: string; params: Record<string, string> }> = [];
const deps = {
  clock,
  crypto,
  log,
  mailer: {
    send: async (m: { to: string; template: string; params: Record<string, string> }) => {
      mails.push(m);
    },
  },
};
const props: Array<{ id: string; roomTypeId: string; ratePlanId: string }> = [];
const repo = <T>(fn: (r: DrizzleAnalyticsRepository) => Promise<T>) =>
  asSystem(handle.db, ORG, (tx) => fn(new DrizzleAnalyticsRepository(tx, ORG)));
async function ingest(propertyId: string): Promise<void> {
  const r = new BookingRepositoryPerCall(handle.db, ORG, crypto);
  await ingestProperty({ provider: fake, repo: r, clock, orgId: ORG, log }, propertyId, {
    dedupeKey: `t:${propertyId}:${String(clock.now().epochMilliseconds)}`,
    requestId: "t",
  });
}
const day = (i: number) => `2026-06-${String(i).padStart(2, "0")}`;

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o-kpi", country: "PT", defaultCurrency: "EUR" }),
  );
  for (const [title, kind] of [
    ["Sea View", "single_unit"],
    ["Harbour House", "multi_unit"],
  ] as const) {
    const created = await withTenant(
      handle.db,
      { orgId: ORG, actor: { type: "system", id: "t" } },
      (tx) =>
        createProperty(
          {
            repo: new DrizzlePropertyRepository(tx, ORG),
            clock,
            orgId: ORG,
            horizonDays: 120,
            webhookCredentials: async () => ({ token: `tok-${title}`, secretSealed: "s:x" }),
          },
          {
            title,
            kind,
            currency: "EUR",
            timezone: "Europe/Lisbon",
            ...(kind === "multi_unit"
              ? {
                  roomTypes: [
                    { title: "Apartment", countOfRooms: 4, occAdults: 2, occChildren: 0 },
                  ],
                  ratePlans: [{ title: "Standard", baseRateMinor: 9000 }],
                }
              : {}),
          },
        ),
    );
    if (!created.ok) throw created.error;
    props.push({
      id: created.value.property.id,
      roomTypeId: created.value.roomTypes[0]!.id,
      ratePlanId: created.value.ratePlans[0]!.id,
    });
  }
  await asSystem(handle.db, ORG, (tx) => tx.update(schema.property).set({ state: "live" }));
  // a random-ish June: 14 bookings across both properties, a cancellation and a no-show
  let seed = 7;
  const rnd = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  for (let i = 0; i < 14; i++) {
    const p = props[i % 2]!;
    const start = 1 + Math.floor(rnd() * 24);
    const nights = 1 + Math.floor(rnd() * 4);
    const days: Record<string, number> = {};
    for (let n = 0; n < nights; n++) days[day(start + n)] = 8000 + Math.floor(rnd() * 6000);
    fake.emitBooking({
      propertyId: p.id,
      roomTypeId: p.roomTypeId,
      ratePlanId: p.ratePlanId,
      arrivalDate: day(start),
      departureDate: day(start + nights),
      days,
      otaName: i % 3 === 0 ? "Airbnb" : i % 3 === 1 ? "Booking.com" : "direct",
    });
  }
  for (const p of props) await ingest(p.id);
  fake.cancelBooking(fake.ledger.emitted[2]!.bookingId);
  await ingest(props[0]!.id);
  const [third] = await asSystem(handle.db, ORG, (tx) =>
    rawRows<{ id: string; booking_room_id: string }>(
      tx,
      sql`select b.id, br.id as booking_room_id from booking b join booking_room br on br.booking_id = b.id where b.channex_booking_id = ${fake.ledger.emitted[4]!.bookingId}`,
    ),
  );
  await asSystem(handle.db, ORG, (tx) =>
    tx.insert(schema.stayState).values({
      orgId: ORG,
      bookingRoomId: third!.booking_room_id,
      bookingId: third!.id,
      state: "no_show",
    }),
  );
});
afterAll(() => handle.close());

describe("KPI engine over the rollups", () => {
  it("occupancy agrees between the KPI function, the SQL aggregate and the CSV export (spec 11 §11.6)", async () => {
    const r = await rollup({ db: handle.db, ...deps }, ORG, "2026-06-01", "2026-07-05");
    expect(r.days).toBe(70);
    expect(r.nights).toBeGreaterThan(10);
    for (const scope of [null, props[0]!.id, props[1]!.id]) {
      const facts = await repo((x) =>
        x.daily({ from: "2026-06-01", to: "2026-07-01", propertyIds: scope ? [scope] : null }),
      );
      const fromFunction = kpis(facts).occupancyBps;
      const fromSql = await repo((x) => x.occupancyFromSql("2026-06-01", "2026-07-01", scope));
      expect(fromSql).toBe(fromFunction);
      const report = await asSystem(handle.db, ORG, (tx) =>
        runReport(tx, ORG, crypto, "kpi_summary", {
          from: "2026-06-01",
          to: "2026-07-01",
          propertyId: scope,
        }),
      );
      const csv = toCsv(report);
      const exported = csv
        .split("\n")
        .slice(2)
        .filter(Boolean)
        .map((line) => line.split(",")[3]);
      const rowsForScope = report.rows.filter((row) => row[1] !== 0);
      // the export prints the same basis-point occupancy, per property; for the portfolio it prints every property
      expect(exported).toHaveLength(rowsForScope.length);
      for (const row of report.rows) {
        const propId = (
          await asSystem(handle.db, ORG, (tx) =>
            rawRows<{ id: string }>(
              tx,
              sql`select id from property where title = ${String(row[0])}`,
            ),
          )
        )[0]!.id;
        const f = await repo((x) =>
          x.daily({ from: "2026-06-01", to: "2026-07-01", propertyIds: [propId] }),
        );
        const bps = kpis(f).occupancyBps;
        expect(row[3]).toBe(bps === null ? "" : `${(bps / 100).toFixed(1)}%`);
      }
    }
    // a no-show is not a sold night; a cancelled booking restates its stay dates to zero
    const facts = await repo((x) => x.daily({ from: "2026-06-01", to: "2026-07-01" }));
    const k = kpis(facts);
    expect(k.noShows).toBe(1);
    // the cancellation happened on 2026-07-03: it counts on that day, not in June (restatement only touches the stay dates)
    expect(k.cancellations).toBe(0);
    expect(
      kpis(await repo((x) => x.daily({ from: "2026-07-01", to: "2026-07-06" }))).cancellations,
    ).toBe(1);
    expect(k.roomsSold).toBeLessThan(
      fake.ledger.emitted.reduce((a, b) => a + Object.keys(b.rooms[0]!.days).length, 0),
    );
    // TRevPAR ≥ RevPAR, ADR × occupancy ≈ RevPAR
    expect(k.trevparMinor!).toBeGreaterThanOrEqual(k.revparMinor!);
    expect(Math.abs(k.revparMinor! - (k.adrMinor! * k.occupancyBps!) / 10_000)).toBeLessThanOrEqual(
      2,
    );
    // rerunning the rollup is idempotent
    const again = await rollup({ db: handle.db, ...deps }, ORG, "2026-06-01", "2026-07-05");
    expect(again.nights).toBe(r.nights);
    expect(
      (await repo((x) => x.daily({ from: "2026-06-01", to: "2026-07-01" }))).map(
        (f) => f.roomsSold,
      ),
    ).toEqual(facts.map((f) => f.roomsSold));
  });

  it("pace is marked unavailable without a year of snapshots; pickup counts what the snapshots gained", async () => {
    // two nightly snapshots a week apart, with a booking in between
    clock.set("2026-05-20T04:00:00Z");
    const src = snapshotSource();
    for (const p of props) {
      const rows = await asSystem(handle.db, ORG, (tx) =>
        src.onTheBooks(tx, p.id, LocalDate.parse("2026-05-20"), 60),
      );
      await asSystem(handle.db, ORG, (tx) =>
        tx.insert(schema.otbSnapshot).values(
          rows.map((r) => ({
            orgId: ORG,
            propertyId: p.id,
            stayDate: r.stayDate.toString(),
            snapshotDate: "2026-05-20",
            roomsAvailable: r.roomsAvailable,
            roomsSold: r.roomsSold,
            roomRevenueMinor: r.roomRevenueMinor,
            currency: r.currency,
          })),
        ),
      );
    }
    const before = (
      await asSystem(handle.db, ORG, (tx) =>
        src.onTheBooks(tx, props[0]!.id, LocalDate.parse("2026-06-28"), 1),
      )
    )[0]!;
    fake.emitBooking({
      propertyId: props[0]!.id,
      roomTypeId: props[0]!.roomTypeId,
      ratePlanId: props[0]!.ratePlanId,
      arrivalDate: "2026-06-28",
      departureDate: "2026-06-29",
      days: { "2026-06-28": 9900 },
    });
    await ingest(props[0]!.id);
    for (const p of props) {
      const rows = await asSystem(handle.db, ORG, (tx) =>
        src.onTheBooks(tx, p.id, LocalDate.parse("2026-05-27"), 60),
      );
      await asSystem(handle.db, ORG, (tx) =>
        tx.insert(schema.otbSnapshot).values(
          rows.map((r) => ({
            orgId: ORG,
            propertyId: p.id,
            stayDate: r.stayDate.toString(),
            snapshotDate: "2026-05-27",
            roomsAvailable: r.roomsAvailable,
            roomsSold: r.roomsSold,
            roomRevenueMinor: r.roomRevenueMinor,
            currency: r.currency,
          })),
        ),
      );
    }
    await rollup({ db: handle.db, ...deps }, ORG, "2026-06-01", "2026-06-30");
    const d = await asSystem(handle.db, ORG, (tx) =>
      dashboardKpis(tx, ORG, { from: "2026-06-01", to: "2026-07-01", today: "2026-05-27" }),
    );
    expect(d.pace.available).toBe(false);
    expect(d.pace.reason).toMatch(/last year/);
    expect(d.pickup7.nights).toBe(1);
    expect(d.pickup7.baselineDate).toBe("2026-05-20");
    expect(before.roomsSold).toBe(0);
    expect(d.snapshotMonths).toBe(0);
    const paceReport = await asSystem(handle.db, ORG, (tx) =>
      runReport(tx, ORG, crypto, "pace_pickup", {
        from: "2026-06-01",
        to: "2026-07-01",
        date: "2026-05-27",
      }),
    );
    expect(paceReport.rows[0]![3]).toMatch(/needs a year/);
    expect(d.channels.map((c) => c.channel)).toContain("direct");
    expect(d.current.directShareBps).toBeGreaterThan(0);
  });

  it("the owner statement register reconciles to the revenue report; a mismatch becomes a critical alert", async () => {
    const ownerId = (
      await asSystem(handle.db, ORG, (tx) =>
        new DrizzleOwnerRepository(tx, ORG, crypto).createOwner({
          type: "individual",
          name: "Kpi Owner",
          email: "kpi@example.com",
          phone: null,
          address: {},
          taxId: null,
          locale: "en",
          notes: null,
        }),
      )
    ).id;
    const { agreementKey } = await asSystem(handle.db, ORG, (tx) =>
      new DrizzleOwnerRepository(tx, ORG, crypto).saveAgreement({
        ownerId,
        propertyId: props[0]!.id,
        unitIds: null,
        model: { kind: "commission_pct", rateBps: 2000 },
        commissionBasis: "gross",
        deductibles: {},
        cleaningFees: { kind: "kept" },
        ownerStays: { kind: "free" },
        ownerStayAllowanceNights: null,
        payout: { frequency: "monthly", dayOfMonth: 1, minimumMinor: 0, holdBackBps: 0 },
        vat: { onFee: false, rateBps: 0 },
        currency: "EUR",
        effectiveFrom: "2026-01-01",
        effectiveTo: null,
        createdBy: STAFF,
      }),
    );
    clock.set("2026-07-03T09:00:00Z");
    const st = await generateStatement(
      {
        db: handle.db,
        ...deps,
        payouts: {
          kind: "fake",
          createTransfer: async () => ({ providerRef: "", state: "paid" as const }),
          getTransfer: async () => ({ providerRef: "", state: "paid" as const }),
        },
      },
      ORG,
      agreementKey,
      { from: "2026-06-01", to: "2026-07-01" },
    );
    await asSystem(handle.db, ORG, (tx) =>
      new DrizzleOwnerRepository(tx, ORG, crypto).approve(st!.id, STAFF),
    );
    await sendStatement(
      {
        db: handle.db,
        ...deps,
        payouts: {
          kind: "fake",
          createTransfer: async () => ({ providerRef: "", state: "paid" as const }),
          getTransfer: async () => ({ providerRef: "", state: "paid" as const }),
        },
      },
      ORG,
      st!.id,
    );
    const r1 = await reconcileStatements({ db: handle.db, ...deps }, ORG);
    expect(r1).toEqual({ checked: 1, mismatches: 0 });
    const register = await asSystem(handle.db, ORG, (tx) =>
      runReport(tx, ORG, crypto, "owner_statement_register", {
        from: "2026-06-01",
        to: "2026-07-01",
      }),
    );
    expect(register.rows[0]!.at(-1)).toBe("yes");
    // a booking that lands after the statement was sent (not billed yet) breaks the reconciliation until the next statement restates it
    fake.emitBooking({
      propertyId: props[0]!.id,
      roomTypeId: props[0]!.roomTypeId,
      ratePlanId: props[0]!.ratePlanId,
      arrivalDate: "2026-06-29",
      departureDate: "2026-06-30",
      days: { "2026-06-29": 7700 },
    });
    await ingest(props[0]!.id);
    await rollup({ db: handle.db, ...deps }, ORG, "2026-06-01", "2026-06-30");
    const r2 = await reconcileStatements({ db: handle.db, ...deps }, ORG);
    expect(r2.mismatches).toBe(1);
    const alerts = await repo((x) => x.alerts("open"));
    expect(alerts.some((a) => a.type === "statement_mismatch" && a.severity === "critical")).toBe(
      true,
    );
  });

  it("alerts raise once per condition, can be acknowledged, and resolve when the condition clears (ALRT-1)", async () => {
    // Harbour House has 4 rooms and nothing sold next week: low occupancy within 7 days
    clock.set("2026-06-26T09:00:00Z");
    await rollup({ db: handle.db, ...deps }, ORG, "2026-06-26", "2026-07-10");
    const first = await computeAlerts({ db: handle.db, ...deps }, ORG);
    expect(first.raised).toBeGreaterThan(0);
    const again = await computeAlerts({ db: handle.db, ...deps }, ORG);
    expect(again.raised).toBe(0);
    const open = await repo((x) => x.alerts("open"));
    const low = open.find((a) => a.type === "low_occupancy");
    expect(low).toBeDefined();
    expect(low!.link).toMatch(/\/calendar\?property=/);
    await repo((x) => x.setAlertState(low!.id, "actioned", STAFF));
    expect(
      (await repo((x) => x.alertStats())).find((s) => s.type === "low_occupancy")?.actioned,
    ).toBe(1);
    // fill the week with bookings: the condition clears and the open alerts resolve
    for (let d = 26; d <= 30; d++)
      for (let k = 0; k < 4; k++)
        fake.emitBooking({
          propertyId: props[1]!.id,
          roomTypeId: props[1]!.roomTypeId,
          ratePlanId: props[1]!.ratePlanId,
          arrivalDate: day(d),
          departureDate: d === 30 ? "2026-07-01" : day(d + 1),
          days: { [day(d)]: 9000 },
        });
    for (let d = 1; d <= 3; d++)
      for (let k = 0; k < 4; k++)
        fake.emitBooking({
          propertyId: props[1]!.id,
          roomTypeId: props[1]!.roomTypeId,
          ratePlanId: props[1]!.ratePlanId,
          arrivalDate: `2026-07-0${String(d)}`,
          departureDate: `2026-07-0${String(d + 1)}`,
          days: { [`2026-07-0${String(d)}`]: 9000 },
        });
    for (let i = 0; i < 4; i++) await ingest(props[1]!.id); // the feed is paged
    await rollup({ db: handle.db, ...deps }, ORG, "2026-06-26", "2026-07-10");
    const after = await computeAlerts({ db: handle.db, ...deps }, ORG);
    expect(after.resolved).toBeGreaterThan(0);
    const stillOpen = await repo((x) => x.alerts("open"));
    expect(
      stillOpen.filter(
        (a) =>
          a.type === "low_occupancy" &&
          a.key.startsWith(props[1]!.id) &&
          a.key < `${props[1]!.id}:2026-07-04`,
      ),
    ).toHaveLength(0);
  });

  it("a scheduled report goes out by mail with its CSV", async () => {
    await repo((x) =>
      x.saveSchedule({
        reportKey: "production_by_day",
        name: "Weekly production",
        filters: {},
        recipients: ["boss@example.com"],
        cadence: "weekly",
        format: "csv",
        createdBy: STAFF,
      }),
    );
    expect(await sendScheduledReports({ db: handle.db, ...deps }, ORG)).toBe(1);
    expect(mails.at(-1)).toMatchObject({ to: "boss@example.com", template: "scheduled_report" });
    expect(mails.at(-1)!.params.attachment).toMatch(/^data:text\/csv;base64,/);
    expect(
      Buffer.from(mails.at(-1)!.params.attachment!.split(",")[1]!, "base64").toString(),
    ).toContain("date,rooms_available,rooms_sold,occupancy");
    expect(await sendScheduledReports({ db: handle.db, ...deps }, ORG)).toBe(0);
  });
});
