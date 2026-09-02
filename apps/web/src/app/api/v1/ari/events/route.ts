import { withPermission } from "@/server/with-permission";
import { ariEventStream } from "@/server/realtime";

export const dynamic = "force-dynamic";

/** Realtime cell states over SSE (CAL-3): permission-checked at open, then polled per tick within the org. */
export const GET = withPermission.route(
  "ari:read",
  {
    scope: "organization",
    audit: false,
    input: (req) => ({
      propertyIds: req.nextUrl.searchParams.getAll("propertyId").filter(Boolean).slice(0, 500),
    }),
  },
  (ctx, { propertyIds }, req) => ariEventStream(ctx.orgId, propertyIds, req.signal),
);
