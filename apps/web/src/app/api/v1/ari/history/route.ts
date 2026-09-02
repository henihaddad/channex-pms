import { rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";

/** CAL-8: a cell's history from the audit log (value, actor, surface, time) plus its sync result. */
export const GET = withPermission.route(
  "audit:read",
  {
    scope: "organization",
    audit: false,
    input: (req) => ({
      ratePlanId: req.nextUrl.searchParams.get("ratePlanId") ?? "",
      date: req.nextUrl.searchParams.get("date") ?? "",
    }),
  },
  async (ctx, { ratePlanId, date }) => {
    const entries = await rawRows<{
      seq: number;
      action: string;
      actor: unknown;
      surface: string;
      occurred_at: string;
      after: unknown;
    }>(
      ctx.tx,
      sql`select seq, action, actor, surface, occurred_at, after from audit_log where action like 'ari:%' and after::text like ${"%" + ratePlanId + "%"} and after::text like ${"%" + date + "%"} order by seq desc limit 20`,
    );
    const [cell] = await rawRows<{
      sync_state: string;
      synced_values: unknown;
      last_error: string | null;
      synced_at: string | null;
      version: number;
    }>(
      ctx.tx,
      sql`select sync_state, synced_values, last_error, synced_at, version from rate_day where rate_plan_id = ${ratePlanId} and date = ${date}`,
    );
    return Response.json({ entries, sync: cell ?? null });
  },
);
