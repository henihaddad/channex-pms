import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OUT_OF_MATRIX_ROLES,
  PERMISSIONS,
  SENSITIVE_PERMISSIONS,
  SYSTEM_ROLES,
  type Permission,
} from "./catalogue.js";
import { parseCell } from "./cell.js";
import { parseMatrixMarkdown, type Matrix } from "./matrix.js";
import { ROWS } from "./rows.js";
import { buildRoles, SYSTEM_ROLE_TABLE } from "./roles.js";
import matrixJson from "./generated/matrix.json" with { type: "json" };

const specPath = resolve(import.meta.dirname, "../../../docs/specs/02-personas-and-rbac.md");
const fresh = parseMatrixMarkdown(readFileSync(specPath, "utf8"));

describe("spec 02 §2.4 matrix", () => {
  it("committed snapshot matches the spec (run `pnpm --filter @pms/authz generate` after editing the spec)", () => {
    expect(matrixJson as Matrix).toEqual(fresh);
  });

  it("every cell parses and every row is defined", () => {
    for (const [label, cells] of Object.entries(fresh.rows)) {
      const row = ROWS[label];
      expect(row, label).toBeDefined();
      for (const role of SYSTEM_ROLES)
        expect(() => parseCell(cells[role], row!, label)).not.toThrow();
    }
  });

  it("every catalogue permission is reachable through some row, and rows use only catalogue permissions", () => {
    const used = new Set<Permission>();
    for (const row of Object.values(ROWS)) {
      for (const p of [
        ...row.read,
        ...row.full,
        ...(row.own ?? []),
        ...Object.values(row.named ?? {}).flat(),
      ]) {
        expect(PERMISSIONS).toContain(p);
        used.add(p);
      }
    }
    const unreachable = PERMISSIONS.filter((p) => !used.has(p) && p !== "impersonation:execute");
    expect(unreachable).toEqual([]);
  });
});

describe("generated system roles", () => {
  const roles = buildRoles(fresh);

  it("sensitive permissions reach a role only through a step-up cell", () => {
    for (const role of SYSTEM_ROLES) {
      for (const p of roles[role].allow) {
        if (SENSITIVE_PERMISSIONS.has(p))
          expect(roles[role].stepUp.has(p), `${role} ${p}`).toBe(true);
      }
    }
    expect(roles.org_owner.allow.has("impersonation:execute")).toBe(false);
  });

  it("owner is read-only, own-rows only, and never sees PII, payments or messages", () => {
    const owner = roles.owner;
    for (const p of owner.allow) {
      expect(owner.rowFilter.get(p), `owner ${p} must be row-filtered`).toBeDefined();
      expect(
        /:(read|read_own|manage)$|^block:manage$|^expense:read$|^maintenance:(read|create)$|^export:execute$/.test(
          p,
        ),
        p,
      ).toBe(true);
    }
    for (const p of [
      "booking:read_pii",
      "booking:read_payment_instrument",
      "message:read",
      "message:send",
      "payout:execute",
      "ari:update_rate",
    ] as const) {
      expect(owner.allow.has(p), p).toBe(false);
    }
    expect(owner.allow.has("statement:read_own")).toBe(true);
    expect(owner.allow.has("statement:read")).toBe(false);
  });

  it("cleaner and maintenance_tech have no messaging, folio or PII access", () => {
    for (const role of ["cleaner", "maintenance_tech"] as const) {
      for (const p of [
        "message:read",
        "folio:read",
        "booking:read_pii",
        "ari:read",
        "rate_plan:read",
      ] as const) {
        expect(roles[role].allow.has(p), `${role} ${p}`).toBe(false);
      }
      expect(
        roles[role].allow.has("turnover:read_own") || roles[role].allow.has("unit:update_status"),
      ).toBe(true);
    }
    expect(roles.cleaner.rowFilter.get("booking:read")).toBe("today");
  });

  it("org_owner is a superset of org_admin except billing-only differences", () => {
    for (const p of roles.org_admin.allow) expect(roles.org_owner.allow.has(p), p).toBe(true);
    expect(roles.org_owner.allow.has("billing:manage")).toBe(true);
    expect(roles.org_admin.allow.has("billing:manage")).toBe(false);
    expect(roles.org_admin.allow.has("org:update")).toBe(true);
    expect(roles.org_admin.allow.has("org:transfer_ownership")).toBe(false);
  });

  it("scope-qualified cells record a max scope", () => {
    expect(roles.portfolio_manager.maxScope.get("member:invite")).toBe("group");
    expect(roles.property_manager.maxScope.get("member:invite")).toBe("property");
    expect(roles.portfolio_manager.maxScope.get("audit:read")).toBe("group");
  });

  it("grantable-by-override cells are not allowed by default", () => {
    expect(roles.reservations_agent.allow.has("ari:update_availability")).toBe(false);
    expect(roles.reservations_agent.grantable.has("ari:update_availability")).toBe(true);
    expect(roles.reservations_agent.grantable.has("ari:update_rate")).toBe(false);
    expect(roles.ops_coordinator.grantable.has("member:invite")).toBe(true);
    expect(roles.ops_coordinator.rowFilter.get("booking:read_pii")).toBe("name_only");
  });

  it("out-of-matrix roles hold nothing implicitly", () => {
    for (const key of OUT_OF_MATRIX_ROLES) expect(SYSTEM_ROLE_TABLE[key].allow.size).toBe(0);
  });
});
