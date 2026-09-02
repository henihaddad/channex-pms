/**
 * The permission catalogue, spec 02 §2.3. Permissions are `resource:action`.
 * This list is the only place a permission string is spelled out by hand.
 */
export const PERMISSIONS = [
  // Organization
  "org:read",
  "org:update",
  "org:delete",
  "org:transfer_ownership",
  // Group
  "group:read",
  "group:create",
  "group:update",
  "group:delete",
  // Property
  "property:read",
  "property:create",
  "property:update",
  "property:delete",
  "property:publish_content",
  "property:clone",
  "property:bulk_import",
  // People
  "member:read",
  "member:invite",
  "member:update_role",
  "member:remove",
  "role:manage_custom",
  // Inventory
  "room_type:read",
  "room_type:create",
  "room_type:update",
  "room_type:delete",
  "rate_plan:read",
  "rate_plan:create",
  "rate_plan:update",
  "rate_plan:delete",
  "unit:read",
  "unit:create",
  "unit:update",
  "unit:delete",
  // ARI
  "ari:read",
  "ari:update_availability",
  "ari:update_rate",
  "ari:update_restriction",
  "ari:bulk_execute",
  "ari:force_resync",
  // Yielding
  "yield_rule:read",
  "yield_rule:create",
  "yield_rule:update",
  "yield_rule:delete",
  "yield_rule:execute",
  // Channels
  "channel:read",
  "channel:create",
  "channel:update_settings",
  "channel:update_mapping",
  "channel:activate",
  "channel:deactivate",
  "channel:delete",
  "channel:read_credentials",
  "channel_account:manage",
  // Reservations
  "booking:read",
  "booking:read_pii",
  "booking:read_payment_instrument",
  "booking:create",
  "booking:modify",
  "booking:cancel",
  "booking:assign_unit",
  "booking:check_in_out",
  "booking:resolve_unmapped",
  // Access
  "access_credential:read",
  "access_credential:issue",
  "access_credential:revoke",
  // Operations
  "turnover:read",
  "turnover:read_own",
  "turnover:update",
  "turnover:assign",
  "turnover:complete",
  "unit:update_status",
  "maintenance:read",
  "maintenance:create",
  "maintenance:update",
  "maintenance:assign",
  "block:manage",
  "checklist:manage",
  "note:create",
  // Finance
  "folio:read",
  "folio:update",
  "charge:create",
  "payment:capture",
  "payment:refund",
  "invoice:issue",
  "tax:manage",
  // Owners
  "owner:read",
  "owner:create",
  "owner:update",
  "agreement:read",
  "agreement:manage",
  "statement:read",
  "statement:read_own",
  "statement:generate",
  "statement:approve",
  "statement:send",
  "expense:read",
  "expense:create",
  "expense:approve",
  "payout:read",
  "payout:execute",
  // Messaging
  "message:read",
  "message:send",
  "message:close_thread",
  "template:read",
  "template:manage",
  "automation:manage",
  // Reviews
  "review:read",
  "review:respond",
  // Insight
  "report:read",
  "report:read_financial",
  "report:read_own",
  "export:execute",
  "audit:read",
  // Platform
  "api_key:read",
  "api_key:create",
  "api_key:revoke",
  "webhook:manage",
  "plugin:read",
  "plugin:install",
  "plugin:configure",
  "billing:read",
  "billing:manage",
  "impersonation:execute",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const PERMISSION_SET: ReadonlySet<string> = new Set(PERMISSIONS);

export function isPermission(value: string): value is Permission {
  return PERMISSION_SET.has(value);
}

/**
 * Sensitive permissions (spec 02 §2.3): never part of a role through a `✓` cell.
 * They reach a role only through a `!` (step-up) cell or an explicit grant override.
 */
export const SENSITIVE_PERMISSIONS: ReadonlySet<Permission> = new Set<Permission>([
  "booking:read_payment_instrument",
  "channel:read_credentials",
  "channel_account:manage",
  "payout:execute",
  "impersonation:execute",
  "org:delete",
  "property:delete",
]);

/** Row-filtered variants (spec 02 §2.3): enforced in the query, never by post-filtering. */
export const OWN_VARIANTS: Readonly<Partial<Record<Permission, Permission>>> = {
  "turnover:read": "turnover:read_own",
  "statement:read": "statement:read_own",
  "report:read": "report:read_own",
  "report:read_financial": "report:read_own",
};

export const SYSTEM_ROLES = [
  "org_owner",
  "org_admin",
  "portfolio_manager",
  "property_manager",
  "revenue_manager",
  "reservations_agent",
  "ops_coordinator",
  "cleaner",
  "maintenance_tech",
  "guest_relations",
  "finance",
  "owner",
  "viewer",
] as const;

export type SystemRole = (typeof SYSTEM_ROLES)[number];

/** Roles that exist outside the matrix: no implicit permissions at all. */
export const OUT_OF_MATRIX_ROLES = ["platform_operator", "service_account"] as const;

export type RoleKey = SystemRole | (typeof OUT_OF_MATRIX_ROLES)[number];

export type ScopeKind = "organization" | "group" | "property";

/** Row-filter tags a repository must honour (spec 02 §2.4 cell qualifiers). */
export type RowFilter = "own" | "today" | "limited" | "aggregate" | "name_only" | "own_stays";
