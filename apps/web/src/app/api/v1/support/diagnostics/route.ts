import { rawRows, sql } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

/**
 * Diagnostics bundle (spec 12 §12.6): redacted config, health snapshot, recent errors and
 * trace ids for attaching to an issue. No guest data, no secrets: env keys are listed as
 * present/absent, never with their values.
 */
export const GET = withPermission.route(
  "org:read",
  { scope: "organization", audit: false, input: () => ({}) },
  async (ctx) => {
    const c = await container();
    const [health] = await rawRows<Record<string, number>>(
      ctx.tx,
      sql`select
        (select count(*)::int from property where org_id = ${ctx.orgId} and archived_at is null) as properties,
        (select count(*)::int from availability_day where org_id = ${ctx.orgId} and sync_state in ('pending', 'failed')) as pending_cells,
        (select count(*)::int from booking_revision where org_id = ${ctx.orgId} and acked_at is null) as unacked,
        (select count(*)::int from sync_operation where org_id = ${ctx.orgId} and state in ('failed', 'dead')) as failed_ops,
        (select count(*)::int from inbound_webhook where org_id = ${ctx.orgId} and state = 'received') as webhooks_pending`,
    );
    const errors = await rawRows<{
      kind: string;
      state: string;
      last_error: string | null;
      request_id: string | null;
      created_at: string;
    }>(
      ctx.tx,
      sql`select kind, state, last_error, request_id, created_at::text from sync_operation where org_id = ${ctx.orgId} and last_error is not null order by created_at desc limit 20`,
    );
    const keys = [
      "DATABASE_URL",
      "REDIS_URL",
      "CHANNEX_API_KEY",
      "CHANNEX_ENV",
      "STRIPE_SECRET_KEY",
      "PMS_MASTER_KEY",
      "PMS_SESSION_KEY",
      "NEXT_PUBLIC_APP_URL",
      "MAIL_TRANSPORT",
      "PMS_MODE",
    ];
    const bundle = {
      generatedAt: c.clock.now().toString(),
      version: process.env.PMS_VERSION ?? "dev",
      gitSha: process.env.PMS_GIT_SHA ?? null,
      organization: ctx.orgId,
      requestId: ctx.requestId,
      config: Object.fromEntries(keys.map((k) => [k, process.env[k] ? "set" : "absent"])),
      database: c.db.driver,
      provider: c.provider.constructor.name,
      hosted: c.hosted,
      health,
      recentErrors: errors.map((e) => ({ ...e, last_error: (e.last_error ?? "").slice(0, 300) })),
    };
    return new Response(JSON.stringify(bundle, null, 2), {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="diagnostics-${ctx.orgId.slice(0, 8)}.json"`,
      },
    });
  },
);
