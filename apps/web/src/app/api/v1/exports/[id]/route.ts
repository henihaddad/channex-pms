import { DrizzlePlatformRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { notFound } from "@/server/errors";

/** The offboarding bundle (spec 12 §12.3): documented JSON, everything the tenant owns. */
export const GET = withPermission.route<{ id: string }>(
  "export:execute",
  {
    scope: "organization",
    input: (_req, params) => ({ id: String(params.id) }),
    auditInput: (i) => i,
  },
  async (ctx, input) => {
    const c = await container();
    const bundle = await new DrizzlePlatformRepository(ctx.tx, ctx.orgId, c.crypto).exportBundle(
      input.id,
    );
    if (!bundle) throw notFound();
    return new Response(bundle, {
      headers: {
        "content-type": "application/json",
        "content-disposition": `attachment; filename="channex-pms-export-${input.id}.json"`,
      },
    });
  },
);
