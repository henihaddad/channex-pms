import type { z } from "zod";
import { withPermission } from "@/server/with-permission";
import { assertQuota } from "@/server/quota";
import { runBulk } from "@/server/ari";
import { container } from "@/server/container";
import { bulkSchema } from "@/api/schemas";

/** Bulk update (BULK-1..4): dry run by default; apply returns the operation id for undo. */
export const POST = withPermission.route<z.infer<typeof bulkSchema>>(
  "ari:bulk_execute",
  {
    scope: "property",
    resolveScope: (b) => ({ kind: "property", id: b.propertyId }),
    input: async (req) => bulkSchema.parse(await req.json()),
    subject: (b) => ({ kind: "property", id: b.propertyId }),
  },
  async (ctx, body) => {
    await assertQuota(ctx, "bulk");
    const c = await container();
    const { dryRun, propertyId, ...input } = body;
    const r = await runBulk(ctx, propertyId, input, dryRun, c.clock.today("UTC").toString());
    return Response.json(r, { status: r.blocked.length > 0 && !r.applied ? 422 : 200 });
  },
);
