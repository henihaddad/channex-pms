import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { SYSTEM_ROLES, evaluate } from "@pms/authz";
import { createTestDb } from "@pms/db/testing";
import { DrizzleIdentityRepository, rawRows, sql, withTenant, type DbHandle } from "@pms/db";
import { seedDemo, type DemoSeed } from "./demo.js";

let handle: DbHandle;
let seed: DemoSeed;

beforeAll(async () => {
  handle = await createTestDb();
  seed = await seedDemo(handle.db);
});
afterAll(() => handle.close());

describe("demo seed", () => {
  it("creates one user per system role with grants inside org A, invisible from org B", async () => {
    expect(Object.keys(seed.orgA.users).sort()).toEqual([...SYSTEM_ROLES].sort());
    const fromA = await withTenant(
      handle.db,
      { orgId: seed.orgA.id, actor: { type: "system", id: "t" } },
      (tx) =>
        new DrizzleIdentityRepository(tx).listGrantsForSubject("user", seed.orgA.users.cleaner.id),
    );
    expect(fromA).toHaveLength(1);
    expect(fromA[0]).toMatchObject({ roleKey: "cleaner", scopeType: "group" });
    const fromB = await withTenant(
      handle.db,
      { orgId: seed.orgB.id, actor: { type: "system", id: "t" } },
      (tx) =>
        new DrizzleIdentityRepository(tx).listGrantsForSubject("user", seed.orgA.users.cleaner.id),
    );
    expect(fromB).toEqual([]);
  });

  it("owner-isolation (RBAC-9, M0 slice): the owner grant reaches only the owner group's properties", async () => {
    await withTenant(
      handle.db,
      { orgId: seed.orgA.id, actor: { type: "system", id: "t" } },
      async (tx) => {
        const rows = await rawRows<{ group_id: string; property_id: string }>(
          tx,
          sql`select group_id, property_id from property_group_membership`,
        );
        const groupProperties = new Map<string, Set<string>>();
        for (const r of rows)
          (
            groupProperties.get(r.group_id) ??
            groupProperties.set(r.group_id, new Set()).get(r.group_id)!
          ).add(r.property_id);
        const [grant] = await new DrizzleIdentityRepository(tx).listGrantsForSubject(
          "user",
          seed.orgA.users.owner.id,
        );
        const props = await rawRows<{ id: string; title: string }>(
          tx,
          sql`select id, title from property order by title`,
        );
        const graph = { orgId: seed.orgA.id, groupProperties };
        const decide = (propertyId: string) =>
          evaluate({
            permission: "property:read",
            target: { kind: "property", id: propertyId },
            graph,
            grants: [{ role: "owner", scope: { kind: grant!.scopeType, id: grant!.scopeId } }],
          });
        const byTitle = Object.fromEntries(props.map((p) => [p.title, decide(p.id)]));
        expect(byTitle["Alfama 2B"]).toMatchObject({ allow: true, rowFilter: "own" });
        expect(byTitle["Lagos Villa"]).toMatchObject({ allow: true, rowFilter: "own" });
        expect(byTitle["Chiado Loft"]).toMatchObject({ allow: false });
      },
    );
  });
});
