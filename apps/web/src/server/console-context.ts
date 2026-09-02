import { asSystem, DrizzleOperatorRepository, rawRows, sql, withoutTenant } from "@pms/db";
import { consoleAccess, type TenantState } from "@pms/core";
import { container } from "./container";
import { currentImpersonation, currentOperator } from "./operator";

export interface ConsoleContext {
  state: TenantState;
  access: "full" | "billing_only";
  announcements: Array<{ id: string; title: string; body: string; level: string }>;
  impersonation: { orgName: string; expiresAt: string } | null;
  isOperator: boolean;
  /** Time-to-first-value checklist (spec 12 §12.3); null once every step is done. */
  onboarding: Array<{ key: string; done: boolean; href: string }> | null;
}

/** Everything the console shell shows above the page: state banners, announcements, the checklist. */
export async function consoleContext(orgId: string): Promise<ConsoleContext> {
  const c = await container();
  const [row] = await withoutTenant(c.db.db, (tx) =>
    rawRows<{ state: TenantState }>(tx, sql`select state from organization where id = ${orgId}`),
  );
  const state = row?.state ?? "trial";
  const announcements = await withoutTenant(c.db.db, (tx) =>
    new DrizzleOperatorRepository(tx).activeAnnouncementsFor(orgId),
  );
  const [steps] = await asSystem(c.db.db, orgId, (tx) =>
    rawRows<{ properties: number; channels: number; pushed: number; live: number }>(
      tx,
      sql`select
        (select count(*)::int from property where org_id = ${orgId} and archived_at is null) as properties,
        (select count(*)::int from channel_connection where org_id = ${orgId} and archived_at is null) as channels,
        (select count(*)::int from sync_operation where org_id = ${orgId} and state = 'done') as pushed,
        (select count(*)::int from property where org_id = ${orgId} and state = 'live') as live`,
    ),
  );
  const providerConfigured = Boolean(process.env.CHANNEX_API_KEY) || c.fake !== undefined;
  const list = [
    { key: "organization", done: true, href: "/settings/organization" },
    { key: "provider", done: providerConfigured, href: "/sync-health" },
    { key: "property", done: Number(steps?.properties ?? 0) > 0, href: "/properties/new" },
    { key: "channel", done: Number(steps?.channels ?? 0) > 0, href: "/channels/new" },
    {
      key: "push",
      done: Number(steps?.pushed ?? 0) > 0 || Number(steps?.live ?? 0) > 0,
      href: "/sync-health",
    },
  ];
  const imp = await currentImpersonation();
  return {
    state,
    access: consoleAccess(state),
    announcements,
    impersonation: imp ? { orgName: imp.orgName, expiresAt: imp.expiresAt } : null,
    isOperator: (await currentOperator()) !== null,
    onboarding: list.every((s) => s.done) ? null : list,
  };
}
