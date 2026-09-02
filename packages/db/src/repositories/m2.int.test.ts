import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createProperty, FakeClock, Id, transition, type Id as IdT } from "@pms/core";
import { createTestDb } from "../testing/index.js";
import type { DbHandle } from "../client.js";
import { withoutTenant, withTenant } from "../tenant.js";
import * as s from "../schema/index.js";
import { DrizzlePropertyRepository } from "./properties.js";
import { DrizzleChannelRepository } from "./channels.js";
import {
  applyCountChange,
  checkCellVersions,
  cellStatesSince,
  loadGrid,
  medianRate,
} from "./calendar.js";

let handle: DbHandle;
const ORG = Id.next();
const actor = { type: "user" as const, id: Id.next() };
const clock = new FakeClock("2026-09-01T12:00:00Z");
const run = <T>(fn: (tx: Parameters<Parameters<typeof withTenant>[2]>[0]) => Promise<T>) =>
  withTenant(handle.db, { orgId: ORG, actor }, fn);

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(s.organization)
      .values({ id: ORG, name: "Org", slug: "org-m2", country: "PT", defaultCurrency: "EUR" }),
  );
});
afterAll(() => handle.close());

let propertyId: IdT;
let standardId: IdT;
let roomTypeId: IdT;

describe("properties repository", () => {
  it("creates a single_unit property with one system-managed room type and unit, seeded for the horizon (MODEL-1, PROV-5)", async () => {
    const created = await run(async (tx) => {
      const repo = new DrizzlePropertyRepository(tx, ORG);
      return createProperty(
        {
          repo,
          clock,
          orgId: ORG,
          horizonDays: 40,
          webhookCredentials: async () => ({ token: "tok-1", secretSealed: "sealed" }),
        },
        {
          title: "Alfama Loft",
          kind: "single_unit",
          currency: "EUR",
          timezone: "Europe/Lisbon",
          ratePlans: [{ title: "Standard", baseRateMinor: 12000, minStay: 2 }],
        },
      );
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    propertyId = created.value.property.id;
    standardId = created.value.ratePlans[0]!.id;
    roomTypeId = created.value.roomTypes[0]!.id;
    expect(created.value.roomTypes).toHaveLength(1);
    expect(created.value.units).toHaveLength(1);
    expect(created.value.roomTypes[0]?.isSystemManaged).toBe(true);
    expect(created.value.seededCells).toBe(40);
    const list = await run((tx) => new DrizzlePropertyRepository(tx, ORG).list());
    expect(list).toMatchObject([{ title: "Alfama Loft", roomTypes: 1, ratePlans: 1, units: 1 }]);
    const detail = await run((tx) => new DrizzlePropertyRepository(tx, ORG).get(propertyId));
    expect(detail?.property.webhookToken).toBe("tok-1");
    const grid = await run((tx) =>
      loadGrid(tx, { dateFrom: "2026-09-01", dateTo: "2026-09-10", propertyIds: [propertyId] }),
    );
    expect(grid[0]?.roomTypes[0]?.cells).toHaveLength(10);
    expect(grid[0]?.roomTypes[0]?.ratePlans[0]?.cells[0]).toEqual([
      "2026-09-01",
      {
        rate: 12000,
        minStay: 2,
        stopSell: false,
        closedToArrival: false,
        closedToDeparture: false,
      },
      "pending",
      1,
    ]);
  });

  it("derived plans follow the parent on every edit in the same transaction (INV-6, spec 06 §6.1)", async () => {
    const nrId = Id.next();
    const seeded = await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).addDerivedRatePlan({
        id: nrId,
        propertyId,
        parentRatePlanId: standardId,
        title: "Non-refundable",
        option: { kind: "percent", direction: "decrease", value: 1000 },
      }),
    );
    expect(seeded).toBe(40);
    const r = await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).applyRateCells(
        propertyId,
        [{ ratePlanId: standardId, date: "2026-09-05", values: { rate: 20000 } }],
        "manual",
        actor.id,
      ),
    );
    expect(r).toEqual({ written: 1, derived: 1 });
    const cells = await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).rateCells(nrId, "2026-09-05", "2026-09-05"),
    );
    expect(cells[0]?.values.rate).toBe(18000);
    expect(cells[0]?.values.minStay).toBe(2);
    // depth limit: a chain deeper than 3 is refused
    const c2 = Id.next();
    const c3 = Id.next();
    await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).addDerivedRatePlan({
        id: c2,
        propertyId,
        parentRatePlanId: nrId,
        title: "L2",
        option: { kind: "amount", direction: "increase", value: 100 },
      }),
    );
    await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).addDerivedRatePlan({
        id: c3,
        propertyId,
        parentRatePlanId: c2,
        title: "L3",
        option: { kind: "amount", direction: "increase", value: 100 },
      }),
    );
    await expect(
      run((tx) =>
        new DrizzlePropertyRepository(tx, ORG).addDerivedRatePlan({
          id: Id.next(),
          propertyId,
          parentRatePlanId: c3,
          title: "L4",
          option: { kind: "amount", direction: "increase", value: 100 },
        }),
      ),
    ).rejects.toThrow(/INV-6/);
  });

  it("expected_version mismatch reports both values (CAL-5) and the realtime feed sees the change (CAL-3)", async () => {
    const before = await run((tx) =>
      checkCellVersions(tx, [
        { ratePlanId: standardId, date: "2026-09-05", values: {}, expectedVersion: 1 },
      ]),
    );
    expect(before[0]).toMatchObject({
      ok: false,
      reason: "conflict",
      current: { values: { rate: 20000 }, version: 2 },
    });
    const ok = await run((tx) =>
      checkCellVersions(tx, [
        { ratePlanId: standardId, date: "2026-09-05", values: {}, expectedVersion: 2 },
      ]),
    );
    expect(ok[0]).toMatchObject({ ok: true, version: 3 });
    const changed = await run((tx) => cellStatesSince(tx, [propertyId], "2026-01-01T00:00:00Z"));
    expect(
      changed.some(
        (c) =>
          c.kind === "rate" && c.id === standardId && c.date === "2026-09-05" && c.version === 2,
      ),
    ).toBe(true);
    expect(await run((tx) => medianRate(tx, propertyId, "2026-09-10"))).toBe(12000);
  });

  it("capacity changes flow into availability from a date (availability is derived)", async () => {
    const n = await run((tx) => applyCountChange(tx, roomTypeId, 1, "2026-09-20"));
    expect(n).toBe(21);
    const grid = await run((tx) =>
      loadGrid(tx, { dateFrom: "2026-09-19", dateTo: "2026-09-20", propertyIds: [propertyId] }),
    );
    expect(grid[0]?.roomTypes[0]?.cells.map((c) => c[1])).toEqual([1, 2]);
  });

  it("provisioning state and remote ids persist; id map reflects them (PROV-1, PROV-2)", async () => {
    await run(async (tx) => {
      const repo = new DrizzlePropertyRepository(tx, ORG);
      await repo.saveProvisioning(propertyId, {
        step: "room_types",
        refs: { property: "cx-1" },
        attempts: 0,
        lastError: null,
      });
      await repo.setRemoteIds({
        propertyId: { local: propertyId, remote: "cx-1" },
        roomTypes: [{ local: roomTypeId, remote: "cx-rt" }],
      });
    });
    const st = await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).loadProvisioning(propertyId),
    );
    expect(st).toEqual({
      step: "room_types",
      refs: { property: "cx-1" },
      attempts: 0,
      lastError: null,
    });
    const map = await run((tx) => new DrizzlePropertyRepository(tx, ORG).idMap(propertyId));
    expect(map).toEqual({
      property: { local: propertyId, remote: "cx-1" },
      roomTypes: [{ local: roomTypeId, remote: "cx-rt" }],
      ratePlans: [],
    });
  });

  it("templates round-trip and bulk operations record their inverse (BULK-2)", async () => {
    const tid = Id.next();
    await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).insertTemplate({
        id: tid,
        name: "City flat",
        payload: {
          kind: "single_unit",
          currency: "EUR",
          timezone: "Europe/Lisbon",
          ratePlans: [{ title: "Standard", baseRateMinor: 9000 }],
        },
      }),
    );
    expect(
      (await run((tx) => new DrizzlePropertyRepository(tx, ORG).listTemplates()))[0]?.name,
    ).toBe("City flat");
    const bid = Id.next();
    await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).insertBulkOperation({
        id: bid,
        propertyId,
        input: { ops: [] },
        cellCount: 1,
        inverse: [{ ratePlanId: standardId, date: "2026-09-05", values: { rate: 12000 } }],
      }),
    );
    const op = await run((tx) => new DrizzlePropertyRepository(tx, ORG).getBulkOperation(bid));
    expect(op?.inverse[0]?.values.rate).toBe(12000);
    await run((tx) => new DrizzlePropertyRepository(tx, ORG).markBulkUndone(bid));
    expect(
      (await run((tx) => new DrizzlePropertyRepository(tx, ORG).getBulkOperation(bid)))?.state,
    ).toBe("undone");
  });
});

describe("channels repository", () => {
  it("connections move through the state machine, mappings replace atomically, health sorts numbers", async () => {
    const accId = Id.next();
    const connId = Id.next();
    await run(async (tx) => {
      const ch = new DrizzleChannelRepository(tx, ORG);
      await ch.insertAccount({
        id: accId,
        adapterCode: "AirBNB",
        label: "Airbnb host",
        oauthTokensEnc: "sealed",
      });
      await ch.insertConnection({
        id: connId,
        propertyId,
        adapterCode: "BookingCom",
        settings: { hotel_id: "123" },
      });
      const c = await ch.getConnection(connId);
      expect(c?.state).toBe("draft");
      const next = transition("draft", "test_ok");
      await ch.updateConnection(connId, { state: next.ok ? next.value : "draft" });
      await ch.replaceMappings(
        connId,
        [{ ratePlanId: standardId, roomCode: "R1", rateCode: "STD", occupancy: 2 }],
        () => Id.next(),
      );
      await ch.insertEvent({
        id: Id.next(),
        connectionId: connId,
        propertyId,
        type: "rate_error",
        severity: "p2",
        message: "rate below minimum",
      });
    });
    const accounts = await run((tx) => new DrizzleChannelRepository(tx, ORG).listAccounts());
    expect(accounts[0]).toMatchObject({ adapterCode: "AirBNB", hasCredentials: true });
    const maps = await run((tx) => new DrizzleChannelRepository(tx, ORG).listMappings(connId));
    expect(maps).toEqual([
      { ratePlanId: standardId, roomCode: "R1", rateCode: "STD", occupancy: 2 },
    ]);
    const health = await run((tx) => new DrizzleChannelRepository(tx, ORG).health());
    expect(health[0]).toMatchObject({
      id: connId,
      state: "testing",
      openP2: 1,
      openP1: 0,
      ready: false,
    });
    expect(health[0]!.pendingCells).toBeGreaterThan(0);
  });
});
