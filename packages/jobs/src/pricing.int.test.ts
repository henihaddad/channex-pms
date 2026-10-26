import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createProperty,
  FakeClock,
  FakeRateImportProvider,
  Id,
  type RateImportRow,
} from "@pms/core";
import { createTestDb } from "@pms/db/testing";
import {
  asSystem,
  DrizzlePropertyRepository,
  DrizzleRateImportRepository,
  rawRows,
  schema,
  sql,
  withoutTenant,
  withTenant,
  type DbHandle,
  type RateImportSettings,
  type Tx,
} from "@pms/db";
import { createLogger } from "@pms/runtime";
import { extendHorizons } from "./horizon.js";
import { runScheduledRateImports } from "./pricing.js";

/**
 * The scheduled rate import (spec 06 §6.5b) end to end: a pull reaches the engine, the
 * guard rails refuse what they should, shadow mode writes nothing and raises an alert
 * instead, auto-apply writes through the ARI path with an undo, and a hand edit inside
 * the hold window survives the next pull (YR-2, YR-4, YR-5).
 */
let handle: DbHandle;
const ORG = Id.next();
const actor = { type: "system" as const, id: "t" };
const log = createLogger({ level: "silent", service: "test" });
const clock = new FakeClock("2026-09-01T12:00:00Z");
let propertyId: string;
let ratePlanId: string;
const run = <T>(fn: (tx: Tx) => Promise<T>) => asSystem(handle.db, ORG, fn);
const deps = (providers: Record<string, FakeRateImportProvider>) => ({
  db: handle.db,
  clock,
  log,
  providers,
});
const rate = (date: string) =>
  run(async (tx) => {
    const [c] = await new DrizzlePropertyRepository(tx, ORG).rateCells(ratePlanId, date, date);
    return c?.values.rate ?? null;
  });
const settings = (over: Partial<RateImportSettings>) =>
  run(async (tx) => {
    const repo = new DrizzleRateImportRepository(tx, ORG);
    await repo.save(propertyId, { ...(await repo.get(propertyId)), ...over });
  });
/**
 * `rate_day.updated_at` comes from the database clock while the import reads the
 * FakeClock, so the hold window (YR-5) is exercised by ageing a cell's timestamp relative
 * to the fake clock rather than to `now()`.
 */
const backdate = (date: string, hours: number) => {
  const at = new Date(Date.parse(clock.now().toString()) - hours * 3_600_000).toISOString();
  return run((tx) =>
    rawRows(
      tx,
      sql`update rate_day set updated_at = ${at}
          where rate_plan_id = ${ratePlanId} and date = ${date}`,
    ),
  );
};
const alerts = () =>
  run((tx) =>
    rawRows<{ type: string; severity: string; title: string; detail: string; link: string }>(
      tx,
      sql`select type, severity, title, detail, link from alert where org_id = ${ORG} order by created_at`,
    ),
  );

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, (tx) =>
    tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o-pricing", country: "PT", defaultCurrency: "EUR" }),
  );
  const created = await withTenant(handle.db, { orgId: ORG, actor }, (tx) =>
    createProperty(
      {
        repo: new DrizzlePropertyRepository(tx, ORG),
        clock,
        orgId: ORG,
        horizonDays: 120,
        webhookCredentials: async () => ({ token: "tp", secretSealed: "s:x" }),
      },
      { title: "Bica Flat", kind: "single_unit", currency: "EUR", timezone: "Europe/Lisbon" },
    ),
  );
  if (!created.ok) throw created.error;
  propertyId = created.value.property.id;
  ratePlanId = created.value.ratePlans[0]!.id;
  await extendHorizons({ db: handle.db, clock, log });
  // a starting price, written by hand and aged past the hold window
  const seeded = ["2026-09-10", "2026-09-11", "2026-09-12"];
  await run((tx) =>
    new DrizzlePropertyRepository(tx, ORG).applyRateCells(
      propertyId,
      seeded.map((date) => ({ ratePlanId, date, values: { rate: 10000 } })),
      "manual",
    ),
  );
  for (const date of seeded) await backdate(date, 72);
});
afterAll(() => handle.close());

const rows: RateImportRow[] = [
  { date: "2026-09-10", listingRef: "L1", priceMinor: 12000 },
  { date: "2026-09-11", listingRef: "L1", priceMinor: 1000 }, // under the floor
  { date: "2026-09-12", listingRef: "L2", priceMinor: 13000 }, // not mapped
];

describe("a scheduled pull a stock deployment cannot make", () => {
  it("records that no adapter is installed instead of failing silently", async () => {
    await settings({ enabled: true, provider: "pricelabs", providerRef: "P-1" });
    const runs = await runScheduledRateImports(deps({}));
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ error: "no adapter installed", applied: false });
    const s = await run((tx) => new DrizzleRateImportRepository(tx, ORG).get(propertyId));
    expect(s.lastError).toBe('no adapter installed for "pricelabs"');
  });

  it("skips a property that never asked for one", async () => {
    await settings({ enabled: false });
    expect(await runScheduledRateImports(deps({}))).toEqual([]);
  });
});

describe("shadow mode is the default (YR-4)", () => {
  it("writes nothing, raises one alert, and says what the guard rails refused", async () => {
    await settings({
      enabled: true,
      provider: "pricelabs",
      autoApply: false,
      mapping: { L1: ratePlanId },
      guardRails: { floorMinor: 9000, ceilingMinor: null, maxChangeBps: null },
    });
    const provider = new FakeRateImportProvider(rows);
    const runs = await runScheduledRateImports(deps({ pricelabs: provider }));
    expect(provider.calls[0]).toMatchObject({ propertyRef: "P-1", from: "2026-09-01" });
    expect(runs[0]).toMatchObject({
      applied: false,
      fetched: 3,
      cellCount: 1,
      refused: 1,
      unmapped: 1,
    });
    // nothing moved
    expect(await rate("2026-09-10")).toBe(10000);
    expect(await rate("2026-09-11")).toBe(10000);
    const a = await alerts();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ type: "rate_import_pending", severity: "warning" });
    expect(a[0]!.title).toContain("1 price change");
    expect(a[0]!.detail).toContain("1 refused by a guard rail");
    expect(a[0]!.link).toBe(`/properties/${propertyId}/pricing`);
  });

  it("ALRT-1: a second pull the same day does not raise a second alert", async () => {
    await runScheduledRateImports(deps({ pricelabs: new FakeRateImportProvider(rows) }));
    expect(await alerts()).toHaveLength(1);
  });
});

describe("auto-apply writes through the ARI path", () => {
  it("applies what the rails allow, leaves the rest, and records an undo", async () => {
    await settings({ autoApply: true });
    const runs = await runScheduledRateImports(
      deps({ pricelabs: new FakeRateImportProvider(rows) }),
    );
    expect(runs[0]).toMatchObject({ applied: true, cellCount: 1, refused: 1 });
    expect(await rate("2026-09-10")).toBe(12000);
    // refused and unmapped nights are untouched
    expect(await rate("2026-09-11")).toBe(10000);
    expect(await rate("2026-09-12")).toBe(10000);

    const ops = await run((tx) =>
      rawRows<{ cell_count: number; inverse: unknown; input: { kind: string } }>(
        tx,
        sql`select cell_count, inverse, input from bulk_operation where property_id = ${propertyId} order by created_at desc limit 1`,
      ),
    );
    expect(ops[0]?.input.kind).toBe("rate_import");
    expect(ops[0]?.cell_count).toBe(1);
    expect(ops[0]?.inverse).toEqual([{ ratePlanId, date: "2026-09-10", values: { rate: 10000 } }]);

    // the cell is marked as ours, and queued for every channel
    const [cell] = await run((tx) =>
      rawRows<{ source: string; sync_state: string }>(
        tx,
        sql`select source, sync_state from rate_day where rate_plan_id = ${ratePlanId} and date = '2026-09-10'`,
      ),
    );
    expect(cell).toMatchObject({ source: "rate_import", sync_state: "pending" });
  });

  it("YR-5: a price set by hand survives the next pull, and is taken once the hold lapses", async () => {
    await run((tx) =>
      new DrizzlePropertyRepository(tx, ORG).applyRateCells(
        propertyId,
        [{ ratePlanId, date: "2026-09-10", values: { rate: 15000 } }],
        "manual",
      ),
    );
    const runs = await runScheduledRateImports(
      deps({ pricelabs: new FakeRateImportProvider(rows) }),
    );
    expect(runs[0]).toMatchObject({ applied: false, cellCount: 0, held: 1 });
    expect(await rate("2026-09-10")).toBe(15000);

    // once the hand edit is older than the hold, the engine's price is taken
    await backdate("2026-09-10", 72);
    const later = await runScheduledRateImports(
      deps({ pricelabs: new FakeRateImportProvider(rows) }),
    );
    expect(later[0]).toMatchObject({ applied: true, cellCount: 1, held: 0 });
    expect(await rate("2026-09-10")).toBe(12000);
  });
});
