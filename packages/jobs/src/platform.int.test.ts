import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, createHmac, randomBytes } from "node:crypto";
import {
  createProperty,
  FakeBillingProvider,
  FakeClock,
  Id,
  QUOTA_EXEMPT,
  type Crypto,
} from "@pms/core";
import { createTestDb } from "@pms/db/testing";
import {
  asSystem,
  DrizzleOperatorRepository,
  DrizzlePlatformRepository,
  DrizzlePropertyRepository,
  rawRows,
  schema,
  sql,
  withoutTenant,
  withTenant,
  type DbHandle,
} from "@pms/db";
import { createLogger } from "@pms/runtime";
import { queueAriPush } from "./ari-events.js";
import { recomputeAvailability } from "./availability.js";
import {
  attachPaymentMethod,
  choosePlan,
  closeBillingPeriods,
  deliverPluginEvents,
  installPlugin,
  meterUsage,
  purgeOffboardedTenants,
  quotaFor,
  runDunning,
  runExports,
  transitionTenant,
  type PlatformDeps,
} from "./platform.js";

/**
 * M8 exit (spec 15, spec 12): metering bills the peak; a plan choice moves the tenant to
 * active; an invoice is built from usage the customer can see (BILL-2); a declined card
 * starts dunning and a billing outage changes nothing (BILL-1); dunning suspends after the
 * grace period and a suspended tenant still syncs (§12.3); quotas never touch connectivity
 * (QUOTA-1); plugin deliveries are signed, retried, and never sit on a connectivity queue;
 * the export bundle is complete and the purge leaves a tombstone.
 */
let handle: DbHandle;
const ORG = Id.next();
const USER = Id.next();
const log = createLogger({ level: "silent", service: "test" });
const clock = new FakeClock("2026-06-30T09:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const billing = new FakeBillingProvider();
const mails: Array<{ to: string; template: string }> = [];
const received: Array<{ headers: Record<string, string>; body: string }> = [];
let pluginStatus = 200;
let deps: PlatformDeps;
let propertyId: string;
let roomTypeId: string;
const HOTEL = Id.next();
const HOTEL_RT = Id.next();
const run = <T>(fn: (tx: Parameters<Parameters<typeof asSystem>[2]>[0]) => Promise<T>) =>
  asSystem(handle.db, ORG, fn);
const repo = <T>(fn: (r: DrizzlePlatformRepository) => Promise<T>) =>
  run((tx) => fn(new DrizzlePlatformRepository(tx, ORG, crypto)));
const orgState = async () => (await repo((r) => r.orgState())).state;

beforeAll(async () => {
  handle = await createTestDb();
  deps = {
    db: handle.db,
    clock,
    crypto,
    log,
    mailer: {
      send: async (m) => {
        mails.push(m);
      },
    },
    billing,
    sellerCountry: "PT",
    fetchImpl: async (_url: string | URL | Request, init?: RequestInit) => {
      received.push({
        headers: Object.fromEntries(Object.entries(init?.headers ?? {})),
        body: typeof init?.body === "string" ? init.body : "",
      });
      return new Response("{}", { status: pluginStatus });
    },
    appUrl: "https://pms.example",
  };
  await withoutTenant(handle.db, async (tx) => {
    await tx.insert(schema.organization).values({
      id: ORG,
      name: "Direct Co",
      slug: "direct-co",
      country: "PT",
      defaultCurrency: "EUR",
    });
    await tx.insert(schema.user).values({
      id: USER,
      email: "owner@example.com",
      name: "Mia",
      passwordHash: "x",
      locale: "en",
    });
    await tx.insert(schema.grant).values({
      id: Id.next(),
      orgId: ORG,
      subjectType: "user",
      subjectId: USER,
      roleKey: "org_owner",
      scopeType: "organization",
      scopeId: ORG,
    });
  });
  const created = await withTenant(
    handle.db,
    { orgId: ORG, actor: { type: "system", id: "t" } },
    (tx) =>
      createProperty(
        {
          repo: new DrizzlePropertyRepository(tx, ORG),
          clock,
          orgId: ORG,
          horizonDays: 40,
          webhookCredentials: async () => ({ token: "t", secretSealed: "s:x" }),
        },
        { title: "Flat", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
      ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  roomTypeId = created.value.roomTypes[0]!.id;
  await run((tx) => tx.update(schema.property).set({ state: "live" }));
  await run(async (tx) => {
    await tx.insert(schema.property).values({
      id: HOTEL,
      orgId: ORG,
      kind: "hotel",
      title: "Hotel",
      currency: "EUR",
      timezone: "UTC",
      state: "live",
    });
    await tx
      .insert(schema.roomType)
      .values({ id: HOTEL_RT, orgId: ORG, propertyId: HOTEL, title: "Double", countOfRooms: 0 });
  });
});
afterAll(() => handle.close());

describe("metering and plans (§12.5)", () => {
  it("meters active units nightly and bills the peak of the period from usage the customer can see", async () => {
    expect(await meterUsage(deps, ORG)).toBe(1);
    await run((tx) =>
      tx
        .update(schema.roomType)
        .set({ countOfRooms: 2 })
        .where(sql`id = ${HOTEL_RT}`),
    );
    clock.advance({ hours: 24 });
    await meterUsage(deps, ORG);
    await run((tx) =>
      tx
        .update(schema.roomType)
        .set({ countOfRooms: 1 })
        .where(sql`id = ${HOTEL_RT}`),
    );
    clock.advance({ hours: 24 });
    await meterUsage(deps, ORG);
    const usage = await repo((r) => r.usage("2026-06-01", "2026-08-01"));
    expect(usage.map((u) => u.activeUnits)).toEqual([1, 3, 2]);
    expect(await orgState()).toBe("trial");
    const chosen = await choosePlan(
      deps,
      ORG,
      {
        planKey: "growth",
        annual: false,
        addOns: [],
        billingEmail: "bill@example.com",
        billingName: "Direct Co",
        vatId: null,
        userId: USER,
      },
      run,
    );
    expect(chosen.periodTo).toBe("2026-08-02");
    expect(await orgState()).toBe("active");
    expect(billing.customers.size).toBe(1);
    await attachPaymentMethod(deps, ORG, "tok_visa_4242", run);
    const sub = await repo((r) => r.subscription());
    expect(sub?.paymentMethod?.last4).toBe("4242");
    expect(sub?.plan.key).toBe("growth");
  });

  it("QUOTA-1: connectivity is exempt whatever the overage; reports are not", async () => {
    await run((tx) =>
      tx
        .update(schema.roomType)
        .set({ countOfRooms: 5000 })
        .where(sql`id = ${HOTEL_RT}`),
    );
    for (const kind of QUOTA_EXEMPT)
      expect((await run((tx) => quotaFor(deps, tx, ORG, kind))).allow).toBe(true);
    expect(await run((tx) => quotaFor(deps, tx, ORG, "report"))).toMatchObject({ allow: false });
    await run((tx) =>
      tx
        .update(schema.roomType)
        .set({ countOfRooms: 1 })
        .where(sql`id = ${HOTEL_RT}`),
    );
  });

  it("closes the period with an explainable invoice; a billing outage leaves the tenant untouched (BILL-1)", async () => {
    // move the period end into the past
    await repo((r) => r.updateSubscription({ periodFrom: "2026-06-15", periodTo: "2026-07-02" }));
    clock.set("2026-07-02T03:00:00Z");
    billing.failNext = true;
    const r1 = await closeBillingPeriods(deps, ORG);
    expect(r1).toEqual({ invoiced: 1, failed: 0 });
    let inv = (await repo((r) => r.invoices()))[0]!;
    expect(inv.state).toBe("open");
    expect(inv.failureReason).toBe("billing provider unavailable");
    expect(await orgState()).toBe("past_due");
    // BILL-2: the draft on the invoice carries the peak and the tier lines
    expect((inv.draft as { peakUnits: number }).peakUnits).toBe(3);
    expect(inv.subtotalMinor).toBe(3 * 800);
    expect(inv.vatMinor).toBe(Math.round(3 * 800 * 0.23));
    const sub = await repo((r) => r.subscription());
    expect(sub?.periodFrom).toBe("2026-07-02");
    expect(sub?.periodTo).toBe("2026-08-02");
    expect(sub?.paymentFailedOn).toBe("2026-07-02");
    inv = (await repo((r) => r.invoices()))[0]!;
    expect(inv.periodFrom).toBe("2026-06-15");
  });

  it("dunning retries on days 3, 5, 7, then suspends; the suspended tenant still syncs (§12.3)", async () => {
    await repo((r) =>
      r.updateSubscription({
        paymentMethod: { methodRef: "pm_decline", brand: "visa", last4: "0002" },
      }),
    );
    billing.methods.set("cus_fake_" + ORG.slice(0, 8), {
      methodRef: "pm_decline",
      brand: "visa",
      last4: "0002",
    });
    clock.set("2026-07-05T03:00:00Z");
    expect(await runDunning(deps, ORG)).toMatchObject({ retried: 1, recovered: 0, suspended: 0 });
    clock.set("2026-07-07T03:00:00Z");
    expect(await runDunning(deps, ORG)).toMatchObject({ retried: 1 });
    clock.set("2026-07-09T03:00:00Z");
    expect(await runDunning(deps, ORG)).toMatchObject({ retried: 1 });
    expect(await orgState()).toBe("past_due");
    clock.set("2026-07-20T03:00:00Z");
    expect(await runDunning(deps, ORG)).toMatchObject({ suspended: 0 });
    clock.set("2026-07-23T03:00:00Z");
    expect(await runDunning(deps, ORG)).toMatchObject({ suspended: 1 });
    expect(await orgState()).toBe("suspended");
    expect(mails.map((m) => m.template)).toContain("billing_suspended");
    // sync keeps running: an availability change in a suspended org still queues its push
    const before = await run((tx) =>
      rawRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from outbox_event where type = 'ari.changed'`,
      ),
    );
    await run(async (tx) => {
      await recomputeAvailability(
        tx,
        ORG,
        propertyId,
        roomTypeId,
        "2026-07-25",
        "2026-07-26",
        Date.now(),
        "test",
      );
      await queueAriPush(tx, ORG, propertyId, Date.now(), "test");
    });
    const after = await run((tx) =>
      rawRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from outbox_event where type = 'ari.changed'`,
      ),
    );
    expect(Number(after[0]!.n)).toBeGreaterThan(Number(before[0]!.n));
    expect(
      await withoutTenant(handle.db, (tx) => new DrizzleOperatorRepository(tx).syncingOrgIds()),
    ).toContain(ORG);
    // a working card recovers: the open invoice is paid on attach and the tenant is active again
    billing.methods.set("cus_fake_" + ORG.slice(0, 8), {
      methodRef: "pm_visa",
      brand: "visa",
      last4: "4242",
    });
    await attachPaymentMethod(deps, ORG, "tok_visa_4242", run);
    expect(await orgState()).toBe("active");
    expect((await repo((r) => r.invoices()))[0]!.state).toBe("paid");
  });
});

describe("plugins (§12.7, ADR-0004)", () => {
  let secret: string;
  it("delivers only subscribed events, signed, after the install cursor; failures retry and open the breaker", async () => {
    const before = await run((tx) =>
      rawRows<{ n: number }>(tx, sql`select count(*)::int as n from outbox_event`),
    );
    const installed = await run((tx) =>
      installPlugin(deps, tx, ORG, {
        manifest: {
          key: "slack-notify",
          name: "Slack",
          version: "1.0.0",
          events: ["ari."],
          extensionPoints: ["notification_sink"],
          permissions: [],
          compatibleCore: ">=1",
        },
        endpointUrl: "https://plugin.example/hook",
        config: {},
        installedBy: USER,
      }),
    );
    secret = installed.secret;
    // mark the outbox as published (the publisher does this in production)
    clock.advance({ minutes: 1 });
    await run(async (tx) => {
      await queueAriPush(tx, ORG, propertyId, Date.parse(clock.now().toString()), "test");
      await tx.execute(
        sql`update outbox_event set published_at = now(), occurred_at = ${clock.now().toString()} where published_at is null`,
      );
    });
    const r = await deliverPluginEvents(deps, ORG);
    expect(r.queued).toBeGreaterThanOrEqual(1);
    expect(r.delivered).toBe(r.queued);
    expect(Number(before[0]!.n)).toBeGreaterThanOrEqual(0);
    const d = received.at(-1)!;
    const expected =
      "v1=" +
      createHmac("sha256", secret)
        .update(`v1.${d.headers["x-pms-timestamp"]}.${d.body}`)
        .digest("hex");
    expect(d.headers["x-pms-signature"]).toBe(expected);
    expect(JSON.parse(d.body).type).toBe("ari.changed");
    // a failing endpoint: failed with backoff, dead after the policy, breaker open after five in a row
    pluginStatus = 503;
    for (let i = 0; i < 6; i++) {
      await run(async (tx) => {
        await queueAriPush(
          tx,
          ORG,
          propertyId,
          Date.parse(clock.now().toString()) + i,
          `fail${String(i)}`,
        );
        await tx.execute(
          sql`update outbox_event set published_at = now(), occurred_at = ${clock.now().toString()} where published_at is null`,
        );
      });
      clock.advance({ minutes: 1 });
      await deliverPluginEvents(deps, ORG);
    }
    const plugin = (await repo((r) => r.plugins()))[0]!;
    expect(plugin.consecutiveFailures).toBeGreaterThanOrEqual(5);
    expect(plugin.breakerOpenUntil).not.toBeNull();
    const deliveries = await repo((r) => r.deliveries());
    expect(deliveries.some((x) => x.state === "failed")).toBe(true);
    pluginStatus = 200;
  });
});

describe("offboarding (§12.3)", () => {
  it("exports everything the tenant owns, readable, then purges to a tombstone after the grace period", async () => {
    const exportId = await repo((r) => r.requestExport(USER));
    expect(await runExports(deps, ORG)).toBe(1);
    const bundle = JSON.parse((await repo((r) => r.exportBundle(exportId)))!) as {
      format: string;
      counts: Record<string, number>;
      tables: Record<string, unknown[]>;
    };
    expect(bundle.format).toBe("channex-pms-export/1");
    expect(bundle.counts.properties).toBe(2);
    expect(bundle.counts.audit_log).toBeGreaterThan(0);
    expect(Object.keys(bundle.tables)).toEqual(
      expect.arrayContaining([
        "bookings",
        "guests",
        "messages",
        "invoices",
        "availability_history",
      ]),
    );
    await run((tx) =>
      transitionTenant(deps, tx, ORG, "offboarding_requested", { type: "user", id: USER }),
    );
    expect(await orgState()).toBe("offboarding");
    expect(
      await withoutTenant(handle.db, (tx) => new DrizzleOperatorRepository(tx).syncingOrgIds()),
    ).not.toContain(ORG);
    clock.advance({ hours: 24 * 31 });
    const staleAt = new Date(Date.parse(clock.now().toString()) - 40 * 86_400_000).toISOString();
    await withoutTenant(handle.db, (tx) =>
      tx.execute(
        sql`update organization set updated_at = ${staleAt}::timestamptz where id = ${ORG}`,
      ),
    );
    expect(await purgeOffboardedTenants(deps, 30)).toBe(1);
    const [left] = await withoutTenant(handle.db, (tx) =>
      rawRows<{ n: number }>(
        tx,
        sql`select (select count(*) from property where org_id = ${ORG}) + (select count(*) from usage_record where org_id = ${ORG}) + (select count(*) from plugin where org_id = ${ORG}) as n`,
      ),
    );
    expect(Number(left!.n)).toBe(0);
    const [org] = await withoutTenant(handle.db, (tx) =>
      rawRows<{ name: string; archived_at: string | null }>(
        tx,
        sql`select name, archived_at from organization where id = ${ORG}`,
      ),
    );
    expect(org).toMatchObject({ name: "purged" });
    expect(org?.archived_at).not.toBeNull();
    const audit = await withoutTenant(handle.db, (tx) =>
      new DrizzleOperatorRepository(tx).operatorAudit(),
    );
    expect(audit.map((a) => a.action)).toContain("tenant:purged");
  });
});
