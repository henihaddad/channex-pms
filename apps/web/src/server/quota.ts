import { quotaFor } from "@pms/jobs";
import type { WorkKind } from "@pms/core";
import { container } from "./container";
import { HttpProblem } from "./errors";
import type { ActorCtx } from "./with-permission";

/**
 * QUOTA-1 at the web edge: reports, exports and bulk operations stop past a plan limit;
 * nothing that touches connectivity ever calls this. Self-hosted installations have no
 * subscription and therefore no quotas.
 */
export async function assertQuota(ctx: ActorCtx, kind: WorkKind): Promise<void> {
  const c = await container();
  if (!c.hosted) return;
  const d = await quotaFor(c, ctx.tx, ctx.orgId, kind);
  if (!d.allow) throw new HttpProblem(429, "quota_exceeded", d.reason);
}
