import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash, randomBytes } from "node:crypto";
import { createProperty, FakeClock, Id, type Crypto } from "@pms/core";
import { FakeProvider, withIdMap } from "@pms/connectivity";
import { createTestDb } from "@pms/db/testing";
import {
  AriStorePerCall,
  DrizzleChannelRepository,
  DrizzlePropertyRepository,
  asSystem,
  drainOutbox,
  rawRows,
  schema,
  sql,
  withoutTenant,
  withTenant,
  type DbHandle,
} from "@pms/db";
import { MemoryCircuitBreaker, pushProperty, TokenBucket } from "@pms/sync";
import { createLogger } from "@pms/runtime";
import { runProvisioning, markLiveIfSynced, propertiesToProvision } from "./provisioning.js";
import { extendHorizons } from "./horizon.js";
import {
  activateConnection,
  pauseConnection,
  pollChannelHealth,
  systemRunner,
} from "./channels.js";

let handle: DbHandle;
const ORG = Id.next();
const actor = { type: "system" as const, id: "t" };
const log = createLogger({ level: "silent", service: "test" });
const clock = new FakeClock("2026-09-01T12:00:00Z");
const crypto: Crypto = {
  randomToken: () => randomBytes(8).toString("hex"),
  sha256Hex: (x) => createHash("sha256").update(x).digest("hex"),
  seal: async (p) => `s:${p}`,
  open: async (p) => p.slice(2),
};
const fake = new FakeProvider({
  seed: 7,
  rules: [{ op: "ensureRoomType", times: 1, fault: "5xx" }],
});
let propertyId: string;

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o-jobs", country: "PT", defaultCurrency: "EUR" }),
  );
  const created = await withTenant(handle.db, { orgId: ORG, actor }, (tx) =>
    createProperty(
      {
        repo: new DrizzlePropertyRepository(tx, ORG),
        clock,
        orgId: ORG,
        horizonDays: 30,
        webhookCredentials: async () => ({ token: "tok-jobs", secretSealed: "s:secret" }),
      },
      { title: "Chiado Studio", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
    ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
});
afterAll(() => handle.close());

const deps = { provider: fake, clock, crypto, log, callbackBase: "https://pms.example" };

async function pushOnce(): Promise<void> {
  const idMap = await asSystem(handle.db, ORG, (tx) =>
    new DrizzlePropertyRepository(tx, ORG).idMap(propertyId),
  );
  await pushProperty({
    orgId: ORG,
    propertyId,
    provider: withIdMap(fake, idMap),
    store: new AriStorePerCall(handle.db, ORG),
    limiter: new TokenBucket(clock, { baseRatePerSecond: 1000, burst: 1000 }),
    breaker: new MemoryCircuitBreaker(clock, { failureThreshold: 5, cooldownMs: 1000 }),
    clock,
    meta: { dedupeKey: `t:${String(Math.random())}`, requestId: "t" },
    verifySampleRate: 0,
    log,
  });
}

describe("provisioning (PROV-1..5)", () => {
  it("resumes after a failed step without orphaning provider rows, records ids per step, ends live after the initial push", async () => {
    const d = { ...deps, db: handle.db };
    expect(await propertiesToProvision(handle.db)).toEqual([{ orgId: ORG, propertyId }]);
    await expect(runProvisioning(d, { orgId: ORG, propertyId })).rejects.toThrow(/simulated 5xx/);
    let st = await asSystem(handle.db, ORG, (tx) =>
      new DrizzlePropertyRepository(tx, ORG).loadProvisioning(propertyId),
    );
    expect(st).toMatchObject({ step: "room_types", attempts: 1 });
    expect(st?.refs.property).toBeDefined();
    const propertyCalls = fake.ledger.calls.filter((c) => c.op === "ensureProperty").length;
    st = await runProvisioning(d, { orgId: ORG, propertyId });
    expect(st.step).toBe("live");
    expect(st.lastError).toBeNull();
    // the resumed run did not re-create the property (PROV-3) and registered exactly one webhook (PROV-4)
    expect(fake.ledger.calls.filter((c) => c.op === "ensureProperty").length).toBe(propertyCalls);
    expect(fake.ledger.calls.filter((c) => c.op === "ensureWebhook").length).toBe(1);
    const [row] = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ state: string; channex_property_id: string | null }>(
        tx,
        sql`select state, channex_property_id from property where id = ${propertyId}`,
      ),
    );
    expect(row).toMatchObject({ state: "syncing" });
    expect(row?.channex_property_id).toBeTruthy();
    const idMap = await asSystem(handle.db, ORG, (tx) =>
      new DrizzlePropertyRepository(tx, ORG).idMap(propertyId),
    );
    expect(idMap.roomTypes).toHaveLength(1);
    expect(idMap.ratePlans).toHaveLength(1);
    // the outbox carries the initial push; running it makes the property live
    const events = await withoutTenant(handle.db, (tx) =>
      drainOutbox(tx, { publish: async () => {} }, 10),
    );
    expect(events).toBeGreaterThanOrEqual(1);
    expect(await markLiveIfSynced(handle.db, ORG, propertyId)).toBe(false);
    await pushOnce();
    expect(await markLiveIfSynced(handle.db, ORG, propertyId)).toBe(true);
    expect(fake.ledger.ari.restrictions.get(`${idMap.ratePlans[0]!.remote}|2026-09-01`)?.rate).toBe(
      10000,
    );
    expect(await propertiesToProvision(handle.db)).toEqual([]);
  });
});

describe("rolling horizon (spec 06 §6.7)", () => {
  it("extends every live plan to the configured horizon copying last year's weekday", async () => {
    const r = await extendHorizons({ db: handle.db, clock, log, horizonDays: 45 });
    expect(r).toEqual({ plans: 1, cells: 15 });
    const cells = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ n: number; pending: number }>(
        tx,
        sql`select count(*)::int as n, count(*) filter (where sync_state = 'pending')::int as pending from rate_day where property_id = ${propertyId}`,
      ),
    );
    expect(cells[0]).toEqual({ n: 45, pending: 15 });
    const avail = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from availability_day where property_id = ${propertyId}`,
      ),
    );
    expect(avail[0]?.n).toBe(45);
    expect(await extendHorizons({ db: handle.db, clock, log, horizonDays: 45 })).toEqual({
      plans: 0,
      cells: 0,
    });
  });
});

describe("channel activation and health (CH-4, CH-6, CH-8, spec 07 §7.4)", () => {
  it("activates only when ready, re-pushes the horizon, pauses reversibly and reports readiness regressions", async () => {
    const connId = Id.next();
    const rp = (await asSystem(handle.db, ORG, (tx) =>
      new DrizzlePropertyRepository(tx, ORG).get(propertyId),
    ))!.ratePlans[0]!;
    await asSystem(handle.db, ORG, async (tx) => {
      const ch = new DrizzleChannelRepository(tx, ORG);
      await ch.insertConnection({
        id: connId,
        propertyId,
        adapterCode: "BookingCom",
        settings: { hotel_id: "1" },
      });
      await ch.updateConnection(connId, { state: "mapped" });
      await ch.replaceMappings(
        connId,
        [{ ratePlanId: rp.id, roomCode: "R1", rateCode: "RP1", occupancy: 2 }],
        () => Id.next(),
      );
    });
    const cd = { db: handle.db, provider: fake, clock, log };
    const r = await activateConnection(cd, ORG, connId, systemRunner(handle.db, ORG));
    expect(r.activated).toBe(true);
    let c = (await asSystem(handle.db, ORG, (tx) =>
      new DrizzleChannelRepository(tx, ORG).getConnection(connId),
    ))!;
    expect(c).toMatchObject({ state: "active", isActive: true });
    expect(c.channexChannelId).toBeTruthy();
    const pending = await asSystem(handle.db, ORG, (tx) =>
      rawRows<{ n: number }>(
        tx,
        sql`select count(*)::int as n from rate_day where property_id = ${propertyId} and sync_state = 'pending'`,
      ),
    );
    expect(pending[0]?.n).toBe(45);
    await pauseConnection(cd, ORG, connId, true, systemRunner(handle.db, ORG));
    c = (await asSystem(handle.db, ORG, (tx) =>
      new DrizzleChannelRepository(tx, ORG).getConnection(connId),
    ))!;
    expect(c.state).toBe("paused");
    await pauseConnection(cd, ORG, connId, false, systemRunner(handle.db, ORG));
    expect((await pollChannelHealth(cd)).checked).toBe(1);
    const notReady = new FakeProvider();
    notReady.checkReadiness = async () => ({
      ready: false,
      issues: ["room R1 has no rate mapped"],
    });
    const h = await pollChannelHealth({ ...cd, provider: notReady });
    expect(h).toEqual({ checked: 1, regressions: 1 });
    c = (await asSystem(handle.db, ORG, (tx) =>
      new DrizzleChannelRepository(tx, ORG).getConnection(connId),
    ))!;
    expect(c.state).toBe("error");
    const events = await asSystem(handle.db, ORG, (tx) =>
      new DrizzleChannelRepository(tx, ORG).listEvents({ connectionId: connId }),
    );
    expect(events[0]).toMatchObject({ type: "readiness_regression", severity: "p2" });
    expect(events[0]?.message).toContain("Chiado Studio");
    await pollChannelHealth(cd);
    c = (await asSystem(handle.db, ORG, (tx) =>
      new DrizzleChannelRepository(tx, ORG).getConnection(connId),
    ))!;
    expect(c.state).toBe("active");
    // a channel the provider switched off after activation is a regression too, named as such
    const switchedOff = new FakeProvider();
    switchedOff.checkReadiness = async () => ({ ready: true, issues: [], inactive: true });
    expect(await pollChannelHealth({ ...cd, provider: switchedOff })).toEqual({
      checked: 1,
      regressions: 1,
    });
    c = (await asSystem(handle.db, ORG, (tx) =>
      new DrizzleChannelRepository(tx, ORG).getConnection(connId),
    ))!;
    expect(c.state).toBe("error");
    expect(c.lastError).toContain("deactivated");
    await pollChannelHealth(cd);
  });
});
