import { withPermission } from "@/server/with-permission";
import { undoOperation } from "@/server/ari";

/** CAL-4, BULK-2: server-backed undo of a recorded operation. The property comes from the query so the scope resolves without a database round trip. */
export const POST = withPermission.route<{ id: string; propertyId: string }>(
  "ari:bulk_execute",
  {
    scope: "property",
    input: (req, params) => ({
      id: String(params.id),
      propertyId: req.nextUrl.searchParams.get("propertyId") ?? "",
    }),
    resolveScope: ({ propertyId }) => ({ kind: "property", id: propertyId }),
    subject: ({ id }) => ({ kind: "bulk_operation", id }),
  },
  async (ctx, { id, propertyId }) => Response.json(await undoOperation(ctx, id, propertyId)),
);
