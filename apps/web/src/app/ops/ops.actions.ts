"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { DrizzleAuditWriter, DrizzlePlatformRepository, rawRows, sql, type Tx } from "@pms/db";
import { markAllPending, queueAriPush, transitionTenant, IMPERSONATION } from "@pms/jobs";
import type { TenantEvent } from "@pms/core";
import { withOperator, IMPERSONATION_COOKIE } from "@/server/operator";
import { container } from "@/server/container";
import { COOKIES } from "@/server/session";
import { HttpProblem } from "@/server/errors";

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const cookieBase = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
};

/**
 * Every tenant-touching operator action lands on the tenant's own audit chain too (§12.1).
 * Same transaction as the operator's write: one connection, no nesting (ADR-0007).
 */
async function tenantAudit(
  tx: Tx,
  orgId: string,
  operatorId: string,
  action: string,
  subject: { kind: string; id: string },
  after?: unknown,
): Promise<void> {
  const c = await container();
  await new DrizzleAuditWriter(tx, c.sha256Hex).append({
    orgId: orgId as never,
    actor: { type: "user", id: operatorId, impersonatedBy: operatorId },
    action,
    subject,
    after,
    surface: "operator_console",
    occurredAt: c.clock.now().toString(),
  });
}

// ---- sync inspector (§12.1) ------------------------------------------------------------------------------

export const retryOperationAction = withOperator<[FormData], void>(
  "sync.retry",
  {},
  async (ctx, fd) => {
    const id = str(fd, "operationId");
    const [op] = await rawRows<{ org_id: string; property_id: string }>(
      ctx.tx,
      sql`select org_id, property_id from sync_operation where id = ${id}`,
    );
    if (!op) throw new HttpProblem(404, "not_found", "operation not found");
    await ctx.repo.requeueDeadLetter("sync", id);
    await ctx.audit("sync.retry", { kind: "sync_operation", id }, op.org_id);
    await tenantAudit(ctx.tx, op.org_id, ctx.operatorId, "sync:retry", {
      kind: "sync_operation",
      id,
    });
    revalidatePath(`/ops/inspector/${op.property_id}`);
  },
);

export const forceResyncAction = withOperator<[FormData], void>(
  "sync.force_resync",
  {},
  async (ctx, fd) => {
    const propertyId = str(fd, "propertyId");
    const [p] = await rawRows<{ org_id: string }>(
      ctx.tx,
      sql`select org_id from property where id = ${propertyId}`,
    );
    if (!p) throw new HttpProblem(404, "not_found", "property not found");
    await markAllPending(ctx.tx, propertyId);
    await queueAriPush(ctx.tx, p.org_id, propertyId, Date.now(), "operator_force_resync");
    await ctx.audit("sync.force_resync", { kind: "property", id: propertyId }, p.org_id);
    await tenantAudit(ctx.tx, p.org_id, ctx.operatorId, "ari:force_resync", {
      kind: "property",
      id: propertyId,
    });
    revalidatePath(`/ops/inspector/${propertyId}`);
  },
);

export const replayWebhookAction = withOperator<[FormData], void>(
  "webhook.replay",
  {},
  async (ctx, fd) => {
    const id = str(fd, "webhookId");
    const [w] = await rawRows<{ org_id: string; property_id: string | null }>(
      ctx.tx,
      sql`select org_id, property_id from inbound_webhook where id = ${id}`,
    );
    if (!w) throw new HttpProblem(404, "not_found", "webhook not found");
    const replayed = await ctx.repo.replayWebhook(id);
    await ctx.audit("webhook.replay", { kind: "inbound_webhook", id }, w.org_id, { replayed });
    await tenantAudit(
      ctx.tx,
      w.org_id,
      ctx.operatorId,
      "webhook:replay",
      { kind: "inbound_webhook", id },
      { replayed },
    );
    revalidatePath("/ops/webhooks");
    if (w.property_id) revalidatePath(`/ops/inspector/${w.property_id}`);
  },
);

// ---- DLQ ---------------------------------------------------------------------------------------------------

export const dlqAction = withOperator<[FormData], void>("dlq", {}, async (ctx, fd) => {
  const kind = str(fd, "kind") as "sync" | "webhook" | "plugin";
  const id = str(fd, "id");
  const orgId = str(fd, "orgId");
  const op = str(fd, "op");
  if (op === "requeue") await ctx.repo.requeueDeadLetter(kind, id);
  else await ctx.repo.discardDeadLetter(kind, id, str(fd, "reason") || "operator discard");
  await ctx.audit(`dlq.${op}`, { kind, id }, orgId, { reason: str(fd, "reason") });
  await tenantAudit(
    ctx.tx,
    orgId,
    ctx.operatorId,
    `dlq:${op}`,
    { kind, id },
    { reason: str(fd, "reason") },
  );
  revalidatePath("/ops/dlq");
});

// ---- tenants (§12.3) ----------------------------------------------------------------------------------------

export const tenantEventAction = withOperator<[FormData], void>(
  "tenant.transition",
  {},
  async (ctx, fd) => {
    const orgId = str(fd, "orgId");
    const event = str(fd, "event") as TenantEvent;
    const c = await container();
    const r = await transitionTenant(c, ctx.tx, orgId, event, { type: "user", id: ctx.operatorId });
    await ctx.audit("tenant.transition", { kind: "organization", id: orgId }, orgId, {
      event,
      result: r,
    });
    revalidatePath("/ops/tenants");
  },
);

// ---- flags and announcements --------------------------------------------------------------------------------

export const setFlagAction = withOperator<[FormData], void>("flag.set", {}, async (ctx, fd) => {
  await ctx.repo.setFlag(
    str(fd, "key"),
    str(fd, "orgId") || null,
    fd.get("enabled") === "on",
    Number(str(fd, "rollout") || 0),
    ctx.operatorId,
  );
  await ctx.audit(
    "flag.set",
    { kind: "feature_flag", id: str(fd, "key") },
    str(fd, "orgId") || null,
    {
      enabled: fd.get("enabled") === "on",
      rollout: str(fd, "rollout"),
    },
  );
  revalidatePath("/ops/flags");
});

export const announceAction = withOperator<[FormData], void>(
  "announcement.post",
  {},
  async (ctx, fd) => {
    const id = await ctx.repo.announce({
      title: str(fd, "title"),
      body: str(fd, "body"),
      level: str(fd, "level") || "info",
      orgId: str(fd, "orgId") || null,
      endsAt: str(fd, "endsAt") ? new Date(str(fd, "endsAt")).toISOString() : null,
      createdBy: ctx.operatorId,
    });
    await ctx.audit("announcement.post", { kind: "announcement", id }, str(fd, "orgId") || null);
    revalidatePath("/ops/announcements");
  },
);

export const endAnnouncementAction = withOperator<[FormData], void>(
  "announcement.end",
  {},
  async (ctx, fd) => {
    await ctx.repo.endAnnouncement(str(fd, "id"));
    revalidatePath("/ops/announcements");
  },
);

// ---- impersonation (spec 02 §2.7) -----------------------------------------------------------------------------

export const requestImpersonationAction = withOperator<[FormData], void>(
  "impersonation.request",
  {},
  async (ctx, fd) => {
    const orgId = str(fd, "orgId");
    const breakGlass = fd.get("breakGlass") === "on";
    const reason = str(fd, "reason");
    const id = await ctx.repo.requestImpersonation({
      orgId,
      operatorId: ctx.operatorId,
      reason,
      breakGlass,
    });
    const c = await container();
    // pre-granted support access approves at once; break-glass waits for a second operator and mails the tenant
    const pre = await ctx.repo.supportAccessFor(orgId, c.clock.now().toString());
    if (pre && !breakGlass)
      await new DrizzlePlatformRepository(ctx.tx, orgId, c.crypto).approveImpersonation(
        id,
        ctx.operatorId,
        pre.writeAllowed,
      );
    await ctx.audit("impersonation.request", { kind: "impersonation_session", id }, orgId, {
      breakGlass,
    });
    await tenantAudit(
      ctx.tx,
      orgId,
      ctx.operatorId,
      "impersonation:requested",
      { kind: "impersonation_session", id },
      { reason, breakGlass },
    );
    if (breakGlass) {
      const [owner] = await rawRows<{ email: string }>(
        ctx.tx,
        sql`select u.email from "grant" g join "user" u on u.id = g.subject_id where g.org_id = ${orgId} and g.role_key = 'org_owner' limit 1`,
      );
      if (owner)
        await c.mailer.send({
          to: owner.email,
          template: "break_glass_notice",
          locale: "en",
          params: { reason },
        });
    }
    revalidatePath("/ops/impersonation");
  },
);

export const authoriseBreakGlassAction = withOperator<[FormData], void>(
  "impersonation.authorise",
  {},
  async (ctx, fd) => {
    const id = str(fd, "id");
    await ctx.repo.secondOperatorAuthorises(id, ctx.operatorId);
    await ctx.audit("impersonation.authorise", { kind: "impersonation_session", id }, null);
    revalidatePath("/ops/impersonation");
  },
);

/** Enter: the session becomes active for the cap, the org cookie points at the tenant, the banner appears. */
export const enterImpersonationAction = withOperator<[FormData], void>(
  "impersonation.enter",
  {},
  async (ctx, fd) => {
    const id = str(fd, "id");
    const row = await ctx.repo.impersonation(id);
    if (!row || row.operatorId !== ctx.operatorId || row.state !== "approved")
      throw new HttpProblem(409, "not_approved", "session is not approved");
    await ctx.repo.startImpersonation(id, IMPERSONATION.capMinutes);
    await ctx.audit("impersonation.enter", { kind: "impersonation_session", id }, row.orgId);
    await tenantAudit(
      ctx.tx,
      row.orgId,
      ctx.operatorId,
      "impersonation:started",
      { kind: "impersonation_session", id },
      {
        capMinutes: IMPERSONATION.capMinutes,
        writeApproved: row.writeApproved,
      },
    );
    const jar = await cookies();
    jar.set(IMPERSONATION_COOKIE, id, { ...cookieBase, maxAge: IMPERSONATION.capMinutes * 60 });
    jar.set(COOKIES.org, row.orgId, { ...cookieBase, maxAge: IMPERSONATION.capMinutes * 60 });
    revalidatePath("/ops/impersonation");
  },
);

export const leaveImpersonationAction = withOperator<[FormData], void>(
  "impersonation.leave",
  {},
  async (ctx) => {
    const jar = await cookies();
    const id = jar.get(IMPERSONATION_COOKIE)?.value;
    if (id) {
      const row = await ctx.repo.impersonation(id);
      await ctx.repo.endImpersonation(id);
      if (row)
        await tenantAudit(ctx.tx, row.orgId, ctx.operatorId, "impersonation:ended", {
          kind: "impersonation_session",
          id,
        });
      await ctx.audit(
        "impersonation.leave",
        { kind: "impersonation_session", id },
        row?.orgId ?? null,
      );
    }
    jar.delete(IMPERSONATION_COOKIE);
    jar.delete(COOKIES.org);
    revalidatePath("/ops/impersonation");
  },
);

// ---- jobs and operators ---------------------------------------------------------------------------------------

export const requestJobAction = withOperator<[FormData], void>(
  "job.request",
  {},
  async (ctx, fd) => {
    const id = await ctx.repo.requestJob(
      str(fd, "kind"),
      str(fd, "orgId") || null,
      {},
      ctx.operatorId,
    );
    await ctx.audit("job.request", { kind: "platform_job_request", id }, str(fd, "orgId") || null, {
      job: str(fd, "kind"),
    });
    revalidatePath("/ops/jobs");
  },
);

export const grantOperatorAction = withOperator<[FormData], void>(
  "operator.grant",
  {},
  async (ctx, fd) => {
    const [u] = await rawRows<{ id: string }>(
      ctx.tx,
      sql`select id from "user" where email = ${str(fd, "email").toLowerCase()}`,
    );
    if (!u) throw new HttpProblem(404, "not_found", "no user with that email");
    await ctx.repo.grantOperator(u.id, ctx.operatorId);
    await ctx.audit("operator.grant", { kind: "user", id: u.id }, null);
    revalidatePath("/ops/operators");
  },
);
