/**
 * Tenancy declaration for every table (INV-10). The RLS integration test
 * enumerates the Drizzle schema and fails on any table missing here, and on any
 * `org` table without `org_id NOT NULL` and a policy.
 *
 * - `org`: has `org_id`, RLS forced, policy `org_id = current_setting('app.org_id')`
 * - `org-root`: the organization table itself; policy on `id`
 * - `global`: no tenant column (users, sessions); access is mediated by the application
 */
export type Tenancy = "org" | "org-root" | "global";

export const TENANCY: Readonly<Record<string, Tenancy>> = {
  organization: "org-root",
  org_key: "org",
  property_group: "org",
  property: "org",
  property_group_membership: "org",
  custom_role: "org",
  grant: "org",
  invitation: "org",
  service_account: "org",
  api_key: "org",
  audit_log: "org",
  outbox_event: "org",
  processed_event: "org",
  otb_snapshot: "org",
  user: "global",
  session: "global",
  magic_link: "global",
};

export const ORG_TABLES = Object.entries(TENANCY)
  .filter(([, t]) => t === "org")
  .map(([name]) => name);
