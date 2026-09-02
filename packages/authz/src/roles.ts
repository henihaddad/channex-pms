import {
  OUT_OF_MATRIX_ROLES,
  SYSTEM_ROLES,
  type Permission,
  type RoleKey,
  type RowFilter,
  type ScopeKind,
  type SystemRole,
} from "./catalogue.js";
import { parseCell, type CellGrant } from "./cell.js";
import { ROWS } from "./rows.js";
import type { Matrix } from "./matrix.js";
import matrixJson from "./generated/matrix.json" with { type: "json" };

/** The resolved permission set of a role. Custom roles use the same shape. */
export interface RoleDefinition {
  key: string;
  allow: ReadonlySet<Permission>;
  /** Permissions that require step-up re-authentication (`!`). */
  stepUp: ReadonlySet<Permission>;
  /** Row filters a repository must apply for a permission. */
  rowFilter: ReadonlyMap<Permission, RowFilter>;
  /** Permissions off by default but grantable via override (`○`). */
  grantable: ReadonlySet<Permission>;
  /** Widest scope kind at which a permission applies (`✓ (group)`). */
  maxScope: ReadonlyMap<Permission, Extract<ScopeKind, "group" | "property">>;
}

export type RoleTable = Readonly<Record<RoleKey, RoleDefinition>>;

function emptyRole(key: string): RoleDefinition {
  return {
    key,
    allow: new Set(),
    stepUp: new Set(),
    rowFilter: new Map(),
    grantable: new Set(),
    maxScope: new Map(),
  };
}

/** Build every system role from the matrix. Pure; used by the generator's check and at runtime. */
export function buildRoles(matrix: Matrix): RoleTable {
  const table: Partial<Record<RoleKey, RoleDefinition>> = {};
  for (const role of SYSTEM_ROLES) {
    const allow = new Set<Permission>();
    const stepUp = new Set<Permission>();
    const rowFilter = new Map<Permission, RowFilter>();
    const grantable = new Set<Permission>();
    const maxScope = new Map<Permission, "group" | "property">();
    for (const [label, cells] of Object.entries(matrix.rows)) {
      const row = ROWS[label];
      if (!row) throw new Error(`No row definition for "${label}"`);
      const cell: CellGrant = parseCell(cells[role], row, label);
      for (const p of cell.allow) {
        allow.add(p);
        if (cell.stepUp) stepUp.add(p);
        if (cell.maxScope) maxScope.set(p, cell.maxScope);
      }
      if (cell.rowFilter) {
        for (const p of cell.allow) rowFilter.set(p, cell.rowFilter);
        for (const p of cell.grantable) rowFilter.set(p, cell.rowFilter);
      }
      for (const p of cell.grantable) grantable.add(p);
    }
    // A permission allowed unfiltered by one row must not be filtered by another row of the same role.
    for (const p of allow)
      if (rowFilter.has(p) && !isOnlyFiltered(matrix, role, p)) rowFilter.delete(p);
    table[role] = { key: role, allow, stepUp, rowFilter, grantable, maxScope };
  }
  for (const key of OUT_OF_MATRIX_ROLES) table[key] = emptyRole(key);
  return table as RoleTable;
}

function isOnlyFiltered(matrix: Matrix, role: SystemRole, permission: Permission): boolean {
  for (const [label, cells] of Object.entries(matrix.rows)) {
    const row = ROWS[label];
    if (!row) continue;
    const cell = parseCell(cells[role], row, label);
    if (cell.allow.includes(permission) && !cell.rowFilter) return false;
  }
  return true;
}

/** System roles, built from the committed matrix snapshot. */
export const SYSTEM_ROLE_TABLE: RoleTable = buildRoles(matrixJson);

export function systemRole(key: RoleKey): RoleDefinition {
  return SYSTEM_ROLE_TABLE[key];
}
