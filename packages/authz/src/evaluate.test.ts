import { describe, expect, it } from "vitest";
import fc from "fast-check";
import { PERMISSIONS, SYSTEM_ROLES } from "./catalogue.js";
import { evaluate, type Grant, type ScopeGraph } from "./evaluate.js";
import { SYSTEM_ROLE_TABLE } from "./roles.js";

const ORG = "org-1";
const graph: ScopeGraph = {
  orgId: ORG,
  groupProperties: new Map([
    ["lisbon", new Set(["alfama", "chiado"])],
    ["algarve", new Set(["lagos"])],
    ["silva-family", new Set(["alfama", "lagos"])],
  ]),
};
const prop = (id: string) => ({ kind: "property" as const, id });
const group = (id: string) => ({ kind: "group" as const, id });
const org = { kind: "organization" as const, id: ORG };

describe("evaluate", () => {
  it("denies by default and on unknown permissions", () => {
    expect(
      evaluate({ grants: [], permission: "booking:read", target: prop("alfama"), graph }).allow,
    ).toBe(false);
    const d = evaluate({
      grants: [{ role: "org_owner", scope: org }],
      permission: "nope:x",
      target: org,
      graph,
    });
    expect(d).toMatchObject({ allow: false, reason: "unknown_permission" });
  });

  it("cascades down the scope graph along any path", () => {
    const grants: Grant[] = [{ role: "portfolio_manager", scope: group("silva-family") }];
    expect(
      evaluate({ grants, permission: "booking:read", target: prop("alfama"), graph }).allow,
    ).toBe(true);
    expect(
      evaluate({ grants, permission: "booking:read", target: prop("lagos"), graph }).allow,
    ).toBe(true);
    expect(
      evaluate({ grants, permission: "booking:read", target: prop("chiado"), graph }),
    ).toMatchObject({ allow: false, reason: "scope" });
  });

  it("deny overrides win at any level", () => {
    const grants: Grant[] = [
      { role: "org_owner", scope: org },
      { role: "viewer", scope: prop("alfama"), overrides: { deny: ["booking:read"] } },
    ];
    expect(
      evaluate({ grants, permission: "booking:read", target: prop("alfama"), graph }),
    ).toMatchObject({ allow: false, reason: "denied" });
    expect(
      evaluate({ grants, permission: "booking:read", target: prop("chiado"), graph }).allow,
    ).toBe(true);
  });

  it("allow overrides unlock grantable permissions", () => {
    const grants: Grant[] = [
      {
        role: "reservations_agent",
        scope: prop("alfama"),
        overrides: { allow: ["ari:update_availability"] },
      },
    ];
    expect(
      evaluate({ grants, permission: "ari:update_availability", target: prop("alfama"), graph })
        .allow,
    ).toBe(true);
    expect(
      evaluate({ grants, permission: "ari:update_rate", target: prop("alfama"), graph }).allow,
    ).toBe(false);
  });

  it("expired grants are ignored", () => {
    const grants: Grant[] = [{ role: "org_owner", scope: org, expiresAt: "2026-01-01T00:00:00Z" }];
    expect(
      evaluate({ grants, permission: "org:read", target: org, graph, now: "2026-02-01T00:00:00Z" })
        .allow,
    ).toBe(false);
    expect(
      evaluate({ grants, permission: "org:read", target: org, graph, now: "2025-12-01T00:00:00Z" })
        .allow,
    ).toBe(true);
  });

  it("reports step-up and row filters", () => {
    expect(
      evaluate({
        grants: [{ role: "finance", scope: org }],
        permission: "payout:execute",
        target: org,
        graph,
      }),
    ).toMatchObject({ allow: true, stepUp: true });
    expect(
      evaluate({
        grants: [{ role: "owner", scope: prop("alfama") }],
        permission: "statement:read_own",
        target: prop("alfama"),
        graph,
      }),
    ).toMatchObject({ allow: true, rowFilter: "own" });
    // an unfiltered grant elsewhere lifts the filter
    const both: Grant[] = [
      { role: "owner", scope: prop("alfama") },
      { role: "org_admin", scope: org },
    ];
    expect(
      evaluate({ grants: both, permission: "booking:read", target: prop("alfama"), graph }),
    ).toMatchObject({ allow: true });
    expect(
      evaluate({ grants: both, permission: "booking:read", target: prop("alfama"), graph }),
    ).not.toHaveProperty("rowFilter");
  });

  it("max-scope cells do not apply from an organization-wide grant", () => {
    const orgWide: Grant[] = [{ role: "portfolio_manager", scope: org }];
    expect(
      evaluate({ grants: orgWide, permission: "member:invite", target: prop("alfama"), graph })
        .allow,
    ).toBe(false);
    const grouped: Grant[] = [{ role: "portfolio_manager", scope: group("lisbon") }];
    expect(
      evaluate({ grants: grouped, permission: "member:invite", target: prop("alfama"), graph })
        .allow,
    ).toBe(true);
  });

  it("agrees with the role table for every (role, permission) at the role's own scope", () => {
    for (const role of SYSTEM_ROLES) {
      const def = SYSTEM_ROLE_TABLE[role];
      for (const permission of PERMISSIONS) {
        const d = evaluate({
          grants: [{ role, scope: org }],
          permission,
          target: prop("alfama"),
          graph,
        });
        const expected = def.allow.has(permission) && !def.maxScope.has(permission);
        expect(d.allow, `${role} ${permission}`).toBe(expected);
        if (d.allow) expect(d.stepUp).toBe(def.stepUp.has(permission));
      }
    }
  });

  it("never allows a permission no covering grant carries (property)", () => {
    const roleArb = fc.constantFrom(...SYSTEM_ROLES);
    const scopeArb = fc.constantFrom(
      org,
      group("lisbon"),
      group("algarve"),
      prop("alfama"),
      prop("lagos"),
    );
    const permArb = fc.constantFrom(...PERMISSIONS);
    fc.assert(
      fc.property(
        fc.array(fc.record({ role: roleArb, scope: scopeArb }), { maxLength: 4 }),
        permArb,
        scopeArb,
        (grants, permission, target) => {
          const d = evaluate({ grants, permission, target, graph });
          if (d.allow) {
            expect(grants.some((g) => SYSTEM_ROLE_TABLE[g.role].allow.has(permission))).toBe(true);
          }
        },
      ),
    );
  });
});
