"use server";

import { sql, rawRows } from "@pms/db";
import { withPermission } from "@/server/with-permission";

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

/** Sync Health (CX-8): pending/failed/drifted cells, unacked bookings, recent provider errors, per property. */
export const loadSyncHealth = withPermission<[], PropertySyncHealth[]>(
  "ari:read",
  { scope: "organization", audit: false },
  async (ctx) => {
    const props = await rawRows<{ id: string; title: string; state: string }>(
      ctx.tx,
      sql`select id, title, state from property where archived_at is null order by title`,
    );
    const out: PropertySyncHealth[] = [];
    for (const p of props) {
      const cells = await rawRows<{ sync_state: string; n: number }>(
        ctx.tx,
        sql`
      select sync_state, count(*)::int as n from (
        select sync_state from rate_day where property_id = ${p.id} union all select sync_state from availability_day where property_id = ${p.id}) x group by sync_state`,
      );
      const [unacked] = await rawRows<{ n: number }>(
        ctx.tx,
        sql`select count(*)::int as n from booking_revision r join booking b on b.id = r.booking_id where b.property_id = ${p.id} and r.acked_at is null`,
      );
      const ops = await rawRows<PropertySyncHealth["recentOperations"][number]>(
        ctx.tx,
        sql`
      select kind, state, entries, accepted, rejected, last_error as "lastError", created_at as "createdAt" from sync_operation where property_id = ${p.id} order by created_at desc limit 20`,
      );
      out.push({
        propertyId: p.id,
        title: p.title,
        state: p.state,
        cells: Object.fromEntries(cells.map((c) => [c.sync_state, c.n])),
        unackedBookings: unacked?.n ?? 0,
        recentOperations: ops,
      });
    }
    return out;
  },
);
