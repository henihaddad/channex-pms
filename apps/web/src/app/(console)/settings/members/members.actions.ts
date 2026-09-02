"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { SYSTEM_ROLES } from "@pms/authz";
import { Id } from "@pms/core";
import { DrizzleIdentityRepository, sql, rawRows } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { inviteInTx } from "@/server/auth-flows";
import { HttpProblem } from "@/server/errors";
import { identity } from "@/server/auth-flows";

export interface MemberRow {
  grantId: string;
  userId: string;
  name: string;
  email: string;
  roleKey: string | null;
  scopeType: string;
  expiresAt: string | null;
}

/** Read loader: permission-checked and row-scoped, not audited (reads of non-PII are not events). */
export const listMembers = withPermission<[], MemberRow[]>(
  "member:read",
  { scope: "organization", audit: false },
  async (ctx) =>
    rawRows<MemberRow>(
      ctx.tx,
      sql`select g.id as "grantId", u.id as "userId", u.name, u.email, g.role_key as "roleKey", g.scope_type as "scopeType", g.expires_at as "expiresAt"
        from "grant" g join "user" u on u.id = g.subject_id
        where g.subject_type = 'user' and g.revoked_at is null order by u.name`,
    ),
);

export const listPendingInvitations = withPermission<
  [],
  Array<{ id: string; email: string; roleKey: string | null; expiresAt: string }>
>("member:read", { scope: "organization", audit: false }, async (ctx) =>
  rawRows(
    ctx.tx,
    sql`select id, email, intended_grant->>'roleKey' as "roleKey", expires_at as "expiresAt" from invitation where accepted_at is null and expires_at > now() order by created_at desc`,
  ),
);

const inviteSchema = z.object({
  email: z.string().email(),
  roleKey: z.enum(SYSTEM_ROLES),
  scopeType: z.enum(["organization"]).default("organization"),
});

export interface InviteState {
  error?: string;
  sent?: string;
}

export const inviteMember = withPermission<[InviteState, FormData], InviteState>(
  "member:invite",
  {
    scope: "organization",
    subject: () => ({ kind: "invitation", id: "new" }),
    auditInput: (_prev, fd) => ({ email: fd.get("email"), roleKey: fd.get("roleKey") }),
  },
  async (ctx, _prev, fd) => {
    const parsed = inviteSchema.safeParse({ email: fd.get("email"), roleKey: fd.get("roleKey") });
    if (!parsed.success) return { error: parsed.error.issues.map((i) => i.message).join("; ") };
    const org = await rawRows<{ name: string }>(
      ctx.tx,
      sql`select name from organization where id = ${ctx.orgId}`,
    );
    try {
      await inviteInTx(ctx.tx, {
        orgId: ctx.orgId,
        email: parsed.data.email,
        invitedBy: ctx.userId,
        locale: ctx.locale,
        orgName: org[0]?.name ?? "",
        grant: {
          roleKey: parsed.data.roleKey,
          customRoleId: null,
          scopeType: "organization",
          scopeId: ctx.orgId,
          overrides: null,
          expiresAt: null,
        },
      });
    } catch (e) {
      if (e instanceof HttpProblem) return { error: e.message };
      throw e;
    }
    revalidatePath("/settings/members");
    return { sent: parsed.data.email };
  },
);

export const revokeMember = withPermission<[FormData], void>(
  "member:remove",
  { scope: "organization", subject: (fd) => ({ kind: "grant", id: String(fd.get("grantId")) }) },
  async (ctx, fd) => {
    const grantId = Id.parse(String(fd.get("grantId")));
    const repo = new DrizzleIdentityRepository(ctx.tx);
    const rows = await rawRows<{
      subject_id: string;
      role_key: string | null;
      subject_type: "user";
    }>(ctx.tx, sql`select subject_id, role_key, subject_type from "grant" where id = ${grantId}`);
    const g = rows[0];
    if (!g) throw new HttpProblem(404, "not_found", "Grant not found");
    const grant = (await repo.listGrantsForSubject("user", g.subject_id as Id)).find(
      (x) => x.id === grantId,
    );
    if (!grant) throw new HttpProblem(404, "not_found", "Grant not found");
    const r = await (await identity(ctx.tx)).revokeGrant(grant, ctx.userId);
    if (!r.ok) throw new HttpProblem(409, r.error.code, r.error.message);
    revalidatePath("/settings/members");
  },
);
