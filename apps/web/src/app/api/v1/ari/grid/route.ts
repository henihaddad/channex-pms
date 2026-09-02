import { loadGrid } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { gridQuerySchema } from "@/api/schemas";

/** Portfolio grid (spec 06 §6.2, CAL-7): every property the actor may read, three queries, compact cells. */
export const GET = withPermission.route(
  "ari:read",
  {
    scope: "organization",
    audit: false,
    input: (req) => {
      const q = req.nextUrl.searchParams;
      return gridQuerySchema.parse({
        from: q.get("from"),
        to: q.get("to"),
        propertyIds: q.getAll("propertyId").filter(Boolean),
        groupId: q.get("groupId") ?? undefined,
      });
    },
  },
  async (ctx, q) => {
    const properties = await loadGrid(ctx.tx, {
      dateFrom: q.from,
      dateTo: q.to,
      propertyIds: q.propertyIds?.length ? q.propertyIds : undefined,
      groupId: q.groupId,
    });
    return Response.json(
      { from: q.from, to: q.to, properties },
      { headers: { "cache-control": "no-store" } },
    );
  },
);
