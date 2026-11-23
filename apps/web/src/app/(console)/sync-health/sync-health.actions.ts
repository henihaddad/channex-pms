"use server";

import { revalidatePath } from "next/cache";
import {
  DrizzleOperatorRepository,
  DrizzleSyncHealthRepository,
  rawRows,
  sql,
  type DifferingNight,
  type SyncSummary,
} from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

export interface PropertySyncHealth {
  propertyId: string;
  title: string;
  state: string;
  cells: Record<string, number>;
  unackedBookings: number;
  recentOperations: Array<{
    kind: string;
    state: string;
    entries: number;
    accepted: number;
    rejected: number;
    lastError: string | null;
    createdAt: string;
  }>;
}

/**
 * Sync Health (CX-8): pending/failed/drifted cells, unacked bookings, recent provider errors, per
 * property. Three organization-wide grouped queries, whatever the number of properties.
 */
export const loadSyncHealth = withPermission<[], PropertySyncHealth[]>(
  "ari:read",
  { scope: "organization", audit: false },
  async (ctx) => {
    const [props, cells, unacked, ops] = await Promise.all([
      rawRows<{ id: string; title: string; state: string }>(
        ctx.tx,
        sql`select id, title, state from property where org_id = ${ctx.orgId} and archived_at is null order by title`,
      ),
      rawRows<{ property_id: string; sync_state: string; n: number }>(
        ctx.tx,
        sql`select property_id, sync_state, count(*)::int as n from (
              select property_id, sync_state from rate_day where org_id = ${ctx.orgId}
              union all
              select property_id, sync_state from availability_day where org_id = ${ctx.orgId}
            ) x group by property_id, sync_state`,
      ),
      rawRows<{ property_id: string; n: number }>(
        ctx.tx,
        sql`select b.property_id, count(*)::int as n
              from booking_revision r join booking b on b.id = r.booking_id
             where b.org_id = ${ctx.orgId} and r.acked_at is null
             group by b.property_id`,
      ),
      rawRows<PropertySyncHealth["recentOperations"][number] & { propertyId: string }>(
        ctx.tx,
        sql`select property_id as "propertyId", kind, state, entries, accepted, rejected,
                   last_error as "lastError", created_at as "createdAt"
              from (
                select o.*, row_number() over (partition by o.property_id order by o.created_at desc) as rn
                  from sync_operation o where o.org_id = ${ctx.orgId}
              ) ranked
             where rn <= 20
             order by property_id, created_at desc`,
      ),
    ]);
    const cellsBy = new Map<string, Record<string, number>>();
    for (const c of cells)
      cellsBy.set(c.property_id, { ...cellsBy.get(c.property_id), [c.sync_state]: c.n });
    const unackedBy = new Map(unacked.map((u) => [u.property_id, u.n]));
    const opsBy = new Map<string, PropertySyncHealth["recentOperations"]>();
    for (const { propertyId, ...op } of ops)
      opsBy.set(propertyId, [...(opsBy.get(propertyId) ?? []), op]);
    return props.map((p) => ({
      propertyId: p.id,
      title: p.title,
      state: p.state,
      cells: cellsBy.get(p.id) ?? {},
      unackedBookings: unackedBy.get(p.id) ?? 0,
      recentOperations: opsBy.get(p.id) ?? [],
    }));
  },
);

/** The Sync health board's numbers and the nights that differ from a channel (design canvas). */
export const loadSyncOverview = withPermission<
  [],
  {
    summary: SyncSummary;
    differing: DifferingNight[];
    channexEnv: "production" | "staging";
    /** The environment switch is the installer's to make; a hosted organization never sees it. */
    selfHosted: boolean;
    verifyRequested: boolean;
  }
>("ari:read", { scope: "organization", audit: false }, async (ctx) => {
  const repo = new DrizzleSyncHealthRepository(ctx.tx, ctx.orgId);
  const [summary, differing, pending] = await Promise.all([
    repo.summary(new Date().toISOString()),
    repo.differing(),
    rawRows<{ n: number }>(
      ctx.tx,
      sql`select count(*)::int as n from platform_job_request where kind = 'reconcile.org' and org_id = ${ctx.orgId} and state in ('requested', 'running')`,
    ),
  ]);
  return {
    summary,
    differing,
    channexEnv: process.env.CHANNEX_ENV === "production" ? "production" : "staging",
    selfHosted: !(await container()).hosted,
    verifyRequested: (pending[0]?.n ?? 0) > 0,
  };
});

/** "Verify now": the nightly drift check, for this organization's properties, as soon as the worker is free. */
export const verifyNowAction = withPermission<[FormData], void>(
  "ari:force_resync",
  { scope: "organization", subject: () => ({ kind: "organization", id: "reconcile" }) },
  async (ctx) => {
    const [open] = await rawRows<{ n: number }>(
      ctx.tx,
      sql`select count(*)::int as n from platform_job_request where kind = 'reconcile.org' and org_id = ${ctx.orgId} and state in ('requested', 'running')`,
    );
    if (!open?.n)
      await new DrizzleOperatorRepository(ctx.tx).requestJob(
        "reconcile.org",
        ctx.orgId,
        {},
        ctx.userId,
      );
    revalidatePath("/sync-health");
  },
);
