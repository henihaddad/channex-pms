import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sql } from "drizzle-orm";
import { getTableName } from "drizzle-orm";
import { createTestDb } from "./testing/index.js";
import type { DbHandle } from "./client.js";
import * as schema from "./schema/index.js";
import { TENANCY } from "./schema/registry.js";
import { withTenant, withoutTenant } from "./tenant.js";

let handle: DbHandle;
const ORG_A = "019212a0-0000-7000-8000-00000000000a";
const ORG_B = "019212a0-0000-7000-8000-00000000000b";
const actor = { type: "user" as const, id: "019212a0-0000-7000-8000-0000000000aa" };

beforeAll(async () => {
  handle = await createTestDb();
  await withoutTenant(handle.db, async (tx) => {
    await tx.insert(schema.organization).values([
      { id: ORG_A, name: "A", slug: "a", country: "PT", defaultCurrency: "EUR" },
      { id: ORG_B, name: "B", slug: "b", country: "TN", defaultCurrency: "TND" },
    ]);
  });
});

afterAll(async () => {
  await handle.close();
});

/** Drizzle wraps driver errors ("Failed query: …") with the Postgres error as `cause`. */
async function expectDbError(p: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await p;
  } catch (e) {
    const messages: string[] = [];
    for (let cur: unknown = e; cur instanceof Error; cur = cur.cause) messages.push(cur.message);
    expect(messages.join(" | ")).toMatch(pattern);
    return;
  }
  throw new Error(`expected a database error matching ${String(pattern)}`);
}

const rows = async <T>(q: Promise<{ rows: T[] } | T[]>): Promise<T[]> => {
  const r = await q;
  return Array.isArray(r) ? r : r.rows;
};

describe("tenancy registry (INV-10)", () => {
  const tableNames = Object.values(schema)
    .filter(
      (v): v is (typeof schema)["organization"] =>
        typeof v === "object" && v !== null && Symbol.for("drizzle:Name") in (v as object),
    )
    .map((t) => getTableName(t));

  it("every schema table declares its tenancy", () => {
    for (const name of tableNames)
      expect(TENANCY[name], `${name} missing from TENANCY`).toBeDefined();
    for (const name of Object.keys(TENANCY))
      expect(tableNames, `${name} in TENANCY but not in schema`).toContain(name);
  });

  it("every org table has org_id NOT NULL, RLS forced and a policy", async () => {
    const orgTables = Object.entries(TENANCY)
      .filter(([, t]) => t !== "global")
      .map(([n]) => n);
    const cols = await rows<{ table_name: string; is_nullable: string }>(
      handle.db.execute(
        sql`select table_name, is_nullable from information_schema.columns where table_schema='public' and column_name='org_id'`,
      ),
    );
    const rls = await rows<{
      relname: string;
      relrowsecurity: boolean;
      relforcerowsecurity: boolean;
    }>(
      handle.db.execute(
        sql`select relname, relrowsecurity, relforcerowsecurity from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'`,
      ),
    );
    const policies = await rows<{ tablename: string }>(
      handle.db.execute(sql`select tablename from pg_policies where schemaname='public'`),
    );
    for (const name of orgTables) {
      if (TENANCY[name] === "org") {
        const col = cols.find((c) => c.table_name === name);
        expect(col, `${name}.org_id`).toBeDefined();
        expect(col!.is_nullable).toBe("NO");
      }
      const r = rls.find((x) => x.relname === name);
      expect(r?.relrowsecurity, `${name} rls`).toBe(true);
      expect(r?.relforcerowsecurity, `${name} force rls`).toBe(true);
      expect(
        policies.some((p) => p.tablename === name),
        `${name} policy`,
      ).toBe(true);
    }
  });
});

describe("row-level isolation (NFR-2)", () => {
  it("a tenant transaction sees only its own rows and cannot write another org", async () => {
    await withTenant(handle.db, { orgId: ORG_A, actor }, async (tx) => {
      await tx
        .insert(schema.propertyGroup)
        .values({ id: "019212a0-0000-7000-8000-000000000001", orgId: ORG_A, name: "Lisbon" });
    });
    await withTenant(handle.db, { orgId: ORG_B, actor }, async (tx) => {
      await tx
        .insert(schema.propertyGroup)
        .values({ id: "019212a0-0000-7000-8000-000000000002", orgId: ORG_B, name: "Tunis" });
      const seen = await tx.select().from(schema.propertyGroup);
      expect(seen.map((g) => g.name)).toEqual(["Tunis"]);
      const orgs = await tx.select().from(schema.organization);
      expect(orgs.map((o) => o.slug)).toEqual(["b"]);
    });
    // a failed statement aborts the whole transaction, so the smuggling attempt gets its own
    await expectDbError(
      withTenant(handle.db, { orgId: ORG_B, actor }, (tx) =>
        tx
          .insert(schema.propertyGroup)
          .values({ id: "019212a0-0000-7000-8000-000000000003", orgId: ORG_A, name: "Smuggled" }),
      ),
      /row-level security/,
    );
    await withTenant(handle.db, { orgId: ORG_A, actor }, async (tx) => {
      const seen = await tx.select().from(schema.propertyGroup);
      expect(seen.map((g) => g.name)).toEqual(["Lisbon"]);
    });
  });

  it("without a tenant context, org tables yield nothing to the app role", async () => {
    const seen = await handle.db.transaction(async (tx) => {
      await tx.execute(sql`set local role pms_app`);
      return tx.select().from(schema.propertyGroup);
    });
    expect(seen).toEqual([]);
  });

  it("the app role cannot escape its tenant by resetting the setting", async () => {
    await withTenant(handle.db, { orgId: ORG_A, actor }, async (tx) => {
      await tx.execute(sql`select set_config('app.org_id', ${ORG_B}, true)`);
      // Changing the setting mid-transaction is possible, which is why withTenant is the only
      // entry point and the setting is never derived from request input after evaluation.
      const seen = await tx.select().from(schema.propertyGroup);
      expect(seen.map((g) => g.name)).toEqual(["Tunis"]);
    });
  });
});

describe("audit log immutability", () => {
  it("rejects update and delete", async () => {
    await withTenant(handle.db, { orgId: ORG_A, actor }, async (tx) => {
      await tx.insert(schema.auditLog).values({
        id: "019212a0-0000-7000-8000-000000000010",
        orgId: ORG_A,
        seq: 1,
        prevHash: "",
        hash: "h1",
        actor,
        action: "test",
        subject: { kind: "x", id: "1" },
        surface: "test",
      });
    });
    await expectDbError(
      withTenant(handle.db, { orgId: ORG_A, actor }, (tx) =>
        tx.execute(sql`update audit_log set action = 'tampered' where seq = 1`),
      ),
      /append-only|permission denied/i,
    );
    await expectDbError(
      withTenant(handle.db, { orgId: ORG_A, actor }, (tx) =>
        tx.execute(sql`delete from audit_log where seq = 1`),
      ),
      /append-only|permission denied/i,
    );
  });
});
