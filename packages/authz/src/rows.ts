import type { Permission } from "./catalogue.js";

/**
 * Each row of the spec 02 §2.4 matrix mapped to permission sets.
 * - read: what an `R` cell grants
 * - full: what a `✓` cell grants (sensitive permissions are stripped unless the cell is `!`)
 * - own: what a `⊙` cell grants (defaults to `read` with a row filter)
 * - named: subsets referenced by qualifiers such as `✓ create`, `○ avail`, `R+update`
 */
export interface RowDef {
  read: readonly Permission[];
  full: readonly Permission[];
  own?: readonly Permission[];
  named?: Readonly<Record<string, readonly Permission[]>>;
}

export const ROWS: Readonly<Record<string, RowDef>> = {
  Organization: {
    read: ["org:read"],
    full: ["org:read", "org:update", "org:delete", "org:transfer_ownership"],
    named: { update: ["org:update"] },
  },
  Groups: {
    read: ["group:read"],
    full: ["group:read", "group:create", "group:update", "group:delete"],
    named: { update: ["group:update"] },
  },
  Properties: {
    read: ["property:read"],
    full: [
      "property:read",
      "property:create",
      "property:update",
      "property:delete",
      "property:publish_content",
    ],
  },
  "Clone / bulk import property": { read: [], full: ["property:clone", "property:bulk_import"] },
  "People & roles": {
    read: ["member:read"],
    full: ["member:read", "member:invite", "member:update_role", "member:remove"],
    named: { crews: ["member:read", "member:invite", "member:remove"] },
  },
  "Custom roles": { read: [], full: ["role:manage_custom"] },
  "Room types / units": {
    read: ["room_type:read", "unit:read"],
    full: [
      "room_type:read",
      "room_type:create",
      "room_type:update",
      "room_type:delete",
      "unit:read",
      "unit:create",
      "unit:update",
      "unit:delete",
    ],
  },
  "Rate plans": {
    read: ["rate_plan:read"],
    full: ["rate_plan:read", "rate_plan:create", "rate_plan:update", "rate_plan:delete"],
  },
  "ARI (avail/rates/restrictions)": {
    read: ["ari:read"],
    full: ["ari:read", "ari:update_availability", "ari:update_rate", "ari:update_restriction"],
    named: { avail: ["ari:read", "ari:update_availability"] },
  },
  "Bulk ARI + force resync": { read: [], full: ["ari:bulk_execute", "ari:force_resync"] },
  "Yield rules": {
    read: ["yield_rule:read"],
    full: [
      "yield_rule:read",
      "yield_rule:create",
      "yield_rule:update",
      "yield_rule:delete",
      "yield_rule:execute",
    ],
  },
  "Channel settings & mapping": {
    read: ["channel:read"],
    full: [
      "channel:read",
      "channel:create",
      "channel:update_settings",
      "channel:update_mapping",
      "channel:activate",
      "channel:deactivate",
      "channel:delete",
    ],
  },
  "Channel accounts / credentials": {
    read: [],
    full: ["channel:read_credentials", "channel_account:manage"],
  },
  "Bookings (read)": { read: ["booking:read"], full: ["booking:read", "note:create"] },
  "Guest PII": { read: ["booking:read_pii"], full: ["booking:read_pii"] },
  "Payment instrument": { read: [], full: ["booking:read_payment_instrument"] },
  "Create / modify / cancel booking": {
    read: [],
    full: ["booking:create", "booking:modify", "booking:cancel"],
  },
  "Assign unit, check in/out": { read: [], full: ["booking:assign_unit", "booking:check_in_out"] },
  "Access credentials": {
    read: ["access_credential:read"],
    full: ["access_credential:read", "access_credential:issue", "access_credential:revoke"],
  },
  "Unmapped booking queue": { read: [], full: ["booking:resolve_unmapped"] },
  "Turnover board": {
    // a full grant is a superset of the own grant: a coordinator can open the cleaner app for their own tasks
    read: ["turnover:read", "turnover:read_own"],
    full: ["turnover:read", "turnover:read_own", "turnover:update", "turnover:complete"],
    own: ["turnover:read_own", "turnover:update", "turnover:complete"],
  },
  "Assign crews / tasks": { read: [], full: ["turnover:assign", "checklist:manage"] },
  "Unit status": { read: [], full: ["unit:update_status"], own: ["unit:update_status"] },
  Maintenance: {
    read: ["maintenance:read"],
    full: ["maintenance:read", "maintenance:create", "maintenance:update", "maintenance:assign"],
    own: ["maintenance:read", "maintenance:update"],
    named: { create: ["maintenance:create"] },
  },
  "Blocks (incl. owner stays)": { read: [], full: ["block:manage"], own: ["block:manage"] },
  "Folios & charges": {
    read: ["folio:read"],
    full: ["folio:read", "folio:update", "charge:create"],
  },
  "Capture / refund payment": { read: [], full: ["payment:capture", "payment:refund"] },
  "Invoices & tax": { read: ["folio:read"], full: ["folio:read", "invoice:issue", "tax:manage"] },
  "Owners & agreements": {
    read: ["owner:read", "agreement:read"],
    full: ["owner:read", "owner:create", "owner:update", "agreement:read", "agreement:manage"],
  },
  "Statements: generate/approve/send": {
    read: [],
    full: ["statement:generate", "statement:approve", "statement:send"],
  },
  "Statements: read": {
    read: ["statement:read"],
    full: ["statement:read"],
    own: ["statement:read_own"],
  },
  Expenses: {
    read: ["expense:read"],
    full: ["expense:read", "expense:create", "expense:approve"],
    named: { create: ["expense:create"], approve: ["expense:create", "expense:approve"] },
  },
  Payouts: { read: ["payout:read"], full: ["payout:read", "payout:execute"] },
  "Guest messaging": {
    read: ["message:read"],
    full: ["message:read", "message:send", "message:close_thread"],
  },
  "Templates & automation": {
    read: ["template:read"],
    full: ["template:read", "template:manage", "automation:manage"],
  },
  Reviews: { read: ["review:read"], full: ["review:read", "review:respond"] },
  "Operational reports": { read: ["report:read"], full: ["report:read"], own: ["report:read_own"] },
  "Financial reports": {
    read: ["report:read_financial"],
    full: ["report:read_financial"],
    own: ["report:read_own"],
  },
  Exports: { read: [], full: ["export:execute"], own: ["export:execute"] },
  "Audit log": { read: ["audit:read"], full: ["audit:read"] },
  "API keys & webhooks": {
    read: ["api_key:read"],
    full: ["api_key:read", "api_key:create", "api_key:revoke", "webhook:manage"],
  },
  Plugins: { read: ["plugin:read"], full: ["plugin:read", "plugin:install", "plugin:configure"] },
  Billing: { read: ["billing:read"], full: ["billing:read", "billing:manage"] },
};
