"use server";

import { revalidatePath } from "next/cache";
import { DrizzlePlatformRepository, type ImpersonationRow } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();

export const loadSupport = withPermission<
  [],
  {
    access: { writeAllowed: boolean; expiresAt: string } | null;
    requests: ImpersonationRow[];
    version: string;
  }
>("org:read", { scope: "organization", audit: false }, async (ctx) => {
  const c = await container();
  const repo = new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto);
  return {
    access: await repo.supportAccess(),
    requests: await repo.impersonations(),
    version: `${process.env.PMS_VERSION ?? "dev"}${process.env.PMS_GIT_SHA ? ` (${process.env.PMS_GIT_SHA.slice(0, 7)})` : ""}`,
  };
});

/** Pre-granted, time-boxed support access (spec 02 §2.7 step 2). */
export const grantSupportAccessAction = withPermission<[FormData], void>(
  "org:update",
  {
    scope: "organization",
    subject: () => ({ kind: "support_access", id: "current" }),
    auditInput: (fd) => ({ hours: fd.get("hours"), write: fd.get("writeAllowed") }),
  },
  async (ctx, fd) => {
    const c = await container();
    await new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto).grantSupportAccess(
      ctx.userId,
      Math.min(72, Math.max(1, Number(str(fd, "hours") || 24))),
      fd.get("writeAllowed") === "on",
      c.clock.now().toString(),
    );
    revalidatePath("/settings/support");
  },
);

export const revokeSupportAccessAction = withPermission<[FormData], void>(
  "org:update",
  { scope: "organization", subject: () => ({ kind: "support_access", id: "current" }) },
  async (ctx) => {
    const c = await container();
    await new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto).revokeSupportAccess();
    revalidatePath("/settings/support");
  },
);

/** Approve or deny an operator's impersonation request; approval lands in this tenant's audit log. */
export const decideImpersonationAction = withPermission<[FormData], void>(
  "org:update",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "impersonation_session", id: String(fd.get("id")) }),
    auditInput: (fd) => ({ decision: fd.get("decision") }),
  },
  async (ctx, fd) => {
    const c = await container();
    const repo = new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto);
    const decision = str(fd, "decision");
    if (decision === "deny") await repo.denyImpersonation(str(fd, "id"), ctx.userId);
    else await repo.approveImpersonation(str(fd, "id"), ctx.userId, decision === "approve_write");
    revalidatePath("/settings/support");
  },
);
