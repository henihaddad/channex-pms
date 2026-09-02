import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { FakeClock, Id, LocalDate, type DomainEvent } from "@pms/core";
import { createTestDb } from "@pms/db/testing";
import { enqueueOutbox, schema, sql, withoutTenant, withTenant, type DbHandle } from "@pms/db";
import { runOtbSnapshots, type SnapshotSource } from "./otb-snapshot.js";
import { routeEvent, startOutboxPublisher } from "./outbox-publisher.js";
import { verifyAllAuditChains } from "./audit-verify.js";

let handle: DbHandle;
const ORG = Id.next();
const PROP = Id.next();

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, async (tx) => {
    await tx
      .insert(schema.organization)
      .values({ id: ORG, name: "O", slug: "o", country: "PT", defaultCurrency: "EUR" });
  });
  await withTenant(handle.db, { orgId: ORG, actor: { type: "system", id: "seed" } }, async (tx) => {
    await tx.insert(schema.property).values({
      id: PROP,
      orgId: ORG,
      kind: "multi_unit",
      title: "Alfama 2B",
      currency: "EUR",
      timezone: "Europe/Lisbon",
      state: "live",
    });
  });
});
afterAll(() => handle.close());

describe("otb snapshot job", () => {
  const source: SnapshotSource = {
    onTheBooks: async (_tx, _p, from, days) =>
      Array.from({ length: Math.min(days, 3) }, (_, i) => ({
        stayDate: from.plusDays(i),
        roomsAvailable: 1,
        roomsSold: i === 0 ? 1 : 0,
        roomRevenueMinor: i === 0 ? 12_000 : 0,
        currency: "EUR",
      })),
  };

  it("writes once per property-local day, after 02:00 local, and is idempotent", async () => {
    const before2am = new FakeClock("2026-09-02T00:30:00Z"); // 01:30 Lisbon (WEST)
    expect(await runOtbSnapshots(handle.db, before2am, source, { info: () => {} })).toBe(0);
    const after2am = new FakeClock("2026-09-02T01:30:00Z"); // 02:30 Lisbon
    expect(await runOtbSnapshots(handle.db, after2am, source, { info: () => {} })).toBe(3);
    expect(await runOtbSnapshots(handle.db, after2am, source, { info: () => {} })).toBe(0);
    const rows = await withTenant(
      handle.db,
      { orgId: ORG, actor: { type: "system", id: "t" } },
      (tx) => tx.select().from(schema.otbSnapshot),
    );
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      snapshotDate: "2026-09-02",
      stayDate: "2026-09-02",
      roomsSold: 1,
      roomRevenueMinor: 12_000,
    });
    expect(LocalDate.parse(rows[0]!.snapshotDate).toString()).toBe("2026-09-02");
  });
});

describe("outbox publisher", () => {
  it("routes by event type and drains through the publisher", async () => {
    expect(routeEvent("ari.changed").queue).toBe("ari.push");
    expect(routeEvent("booking.revision_applied").queue).toBe("booking.process");
    expect(routeEvent("whatever").queue).toBe("system");
    const ev: Omit<DomainEvent, "id"> = {
      orgId: ORG,
      type: "ari.changed",
      aggregate: { kind: "property", id: PROP },
      payload: {},
      dedupeKey: "ari:1",
      occurredAt: new Date().toISOString(),
    };
    await withTenant(handle.db, { orgId: ORG, actor: { type: "system", id: "t" } }, (tx) =>
      enqueueOutbox(tx, ev),
    );
    const published: string[] = [];
    const stop = startOutboxPublisher(
      handle.db,
      {
        publish: async (e) => {
          published.push(e.dedupeKey);
        },
      },
      {
        intervalMs: 50,
        onError: (e) => {
          throw e;
        },
      },
    );
    await new Promise((r) => setTimeout(r, 300));
    await stop();
    expect(published).toEqual(["ari:1"]);
    const pending = await handle.db.execute(
      sql`select count(*)::int as n from outbox_event where published_at is null`,
    );
    expect((Array.isArray(pending) ? pending : pending.rows)[0]).toMatchObject({ n: 0 });
  });
});

describe("audit verify job", () => {
  it("reports every org", async () => {
    const sha = (s: string) => createHash("sha256").update(s).digest("hex");
    const results = await verifyAllAuditChains(handle.db, sha);
    expect(results).toEqual([{ orgId: ORG, ok: true }]);
  });
});
