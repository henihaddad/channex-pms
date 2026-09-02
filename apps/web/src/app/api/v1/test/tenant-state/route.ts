import { asSystem } from "@pms/db";
import { transitionTenant } from "@pms/jobs";
import type { TenantEvent } from "@pms/core";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";
import { publicRoute } from "@/server/public";
import { testHooksEnabled } from "@/server/test-hooks";

/** PMS_TEST_HOOKS=1 only: drive the tenant lifecycle (spec 12 §12.3) without waiting for dunning days. */
export const POST = publicRoute("test_hook", async (req) => {
  if (!testHooksEnabled()) throw notFound();
  const c = await container();
  const body = (await req.json()) as { orgId: string; event: TenantEvent };
  const r = await asSystem(c.db.db, body.orgId, (tx) =>
    transitionTenant(c, tx, body.orgId, body.event, { type: "system", id: "test_hook" }),
  );
  return Response.json({ transition: r });
});
