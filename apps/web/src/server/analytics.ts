import type { Id } from "@pms/core";
import { DrizzleAnalyticsRepository, DrizzleIdentityRepository } from "@pms/db";
import type { ActorCtx } from "./with-permission";

export const analytics = (ctx: ActorCtx) => new DrizzleAnalyticsRepository(ctx.tx, ctx.orgId);

export type DashboardRole =
  | "portfolio"
  | "property"
  | "revenue"
  | "reservations"
  | "housekeeping"
  | "guest_relations"
  | "finance"
  | "viewer";

/** Spec 11 §11.2: one dashboard per persona, picked from the user's highest-ranking role in this org. */
export async function dashboardRole(ctx: ActorCtx): Promise<DashboardRole> {
  const grants = await new DrizzleIdentityRepository(ctx.tx).listGrantsForSubject(
    "user",
    ctx.userId as Id,
  );
  const roles = new Set(grants.filter((g) => g.orgId === ctx.orgId).map((g) => g.roleKey));
  if (roles.has("org_owner") || roles.has("org_admin") || roles.has("portfolio_manager"))
    return "portfolio";
  if (roles.has("property_manager")) return "property";
  if (roles.has("revenue_manager")) return "revenue";
  if (roles.has("finance")) return "finance";
  if (roles.has("reservations_agent")) return "reservations";
  if (roles.has("guest_relations")) return "guest_relations";
  if (roles.has("cleaner") || roles.has("ops_coordinator") || roles.has("maintenance_tech"))
    return "housekeeping";
  return "viewer";
}

export const monthWindow = (today: string): { from: string; to: string } => {
  const d = new Date(`${today}T00:00:00Z`);
  const from = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1))
    .toISOString()
    .slice(0, 10);
  const to = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))
    .toISOString()
    .slice(0, 10);
  return { from, to };
};
