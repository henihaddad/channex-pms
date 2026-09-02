"use server";

import { sql, rawRows } from "@pms/db";
import { withPermission } from "@/server/with-permission";

export interface AuditRow {
  seq: number;
  action: string;
  actor: { type: string; id: string };
  subject: { kind: string; id: string };
  surface: string;
  occurredAt: string;
  hash: string;
}

export const listAudit = withPermission<[{ limit?: number }], AuditRow[]>(
  "audit:read",
  { scope: "organization", audit: false },
  async (ctx, input) =>
    rawRows<AuditRow>(
      ctx.tx,
      sql`select seq, action, actor, subject, surface, occurred_at as "occurredAt", hash from audit_log order by seq desc limit ${input.limit ?? 100}`,
    ),
);

export const verifyAudit = withPermission<
  [],
  { ok: boolean; checked: number; brokenAtSeq?: number }
>("audit:read", { scope: "organization", audit: false }, async (ctx) =>
  ctx.audit.verify(ctx.orgId),
);
