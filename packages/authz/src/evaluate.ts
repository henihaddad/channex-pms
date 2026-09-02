import {
  isPermission,
  type Permission,
  type RoleKey,
  type RowFilter,
  type ScopeKind,
} from "./catalogue.js";
import { SYSTEM_ROLE_TABLE, type RoleDefinition, type RoleTable } from "./roles.js";

export interface ScopeRef {
  kind: ScopeKind;
  id: string;
}

/**
 * The scope graph of one organization (spec 02 §2.1): a property may belong to
 * several groups, so coverage is "any path", not a tree walk.
 */
export interface ScopeGraph {
  orgId: string;
  /** groupId → property ids in that group */
  groupProperties: ReadonlyMap<string, ReadonlySet<string>>;
}

export interface Grant {
  role: RoleKey | { custom: RoleDefinition };
  scope: ScopeRef;
  overrides?: { allow?: readonly Permission[]; deny?: readonly Permission[] };
  /** ISO instant; expired grants are ignored. */
  expiresAt?: string | null;
}

export type Decision =
  | {
      allow: false;
      missing: Permission;
      reason: "no_grant" | "denied" | "unknown_permission" | "scope";
    }
  | { allow: true; stepUp: boolean; rowFilter?: RowFilter };

export interface EvaluateInput {
  grants: readonly Grant[];
  permission: string;
  target: ScopeRef;
  graph: ScopeGraph;
  now?: string;
  roles?: RoleTable;
}

const SCOPE_RANK: Record<ScopeKind, number> = { organization: 0, group: 1, property: 2 };

/** Does a grant at `scope` cover `target`? Organization covers everything in the org; a group covers its properties. */
export function covers(scope: ScopeRef, target: ScopeRef, graph: ScopeGraph): boolean {
  if (scope.kind === "organization") return scope.id === graph.orgId;
  if (scope.kind === target.kind) return scope.id === target.id;
  if (scope.kind === "group" && target.kind === "property") {
    return graph.groupProperties.get(scope.id)?.has(target.id) ?? false;
  }
  return false;
}

function resolveRole(grant: Grant, roles: RoleTable): RoleDefinition {
  return typeof grant.role === "string" ? roles[grant.role] : grant.role.custom;
}

/**
 * Deny by default. Effective permission = union of allows minus union of denies
 * across every covering grant; `deny` wins at any level; unknown permission denies.
 */
export function evaluate(input: EvaluateInput): Decision {
  const roles = input.roles ?? SYSTEM_ROLE_TABLE;
  if (!isPermission(input.permission)) {
    return { allow: false, missing: input.permission as Permission, reason: "unknown_permission" };
  }
  const permission = input.permission;
  const now = input.now ?? new Date().toISOString();

  let allowed = false;
  let stepUp = false;
  let unfiltered = false;
  let filter: RowFilter | undefined;
  let sawCovering = false;

  for (const grant of input.grants) {
    if (grant.expiresAt && grant.expiresAt <= now) continue;
    if (!covers(grant.scope, input.target, input.graph)) continue;
    sawCovering = true;
    if (grant.overrides?.deny?.includes(permission)) {
      return { allow: false, missing: permission, reason: "denied" };
    }
    const role = resolveRole(grant, roles);
    const maxScope = role.maxScope.get(permission);
    const viaRole =
      role.allow.has(permission) &&
      (!maxScope || SCOPE_RANK[grant.scope.kind] >= SCOPE_RANK[maxScope]);
    const viaOverride = grant.overrides?.allow?.includes(permission) ?? false;
    if (!viaRole && !viaOverride) continue;
    allowed = true;
    if (role.stepUp.has(permission)) stepUp = true;
    const f = viaRole ? role.rowFilter.get(permission) : undefined;
    if (f) filter ??= f;
    else unfiltered = true;
  }

  if (!allowed)
    return { allow: false, missing: permission, reason: sawCovering ? "no_grant" : "scope" };
  return unfiltered || !filter
    ? { allow: true, stepUp }
    : { allow: true, stepUp, rowFilter: filter };
}
