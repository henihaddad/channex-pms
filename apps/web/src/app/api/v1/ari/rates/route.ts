import type { z } from "zod";
import { withPermission } from "@/server/with-permission";
import { applyCellEdits } from "@/server/ari";
import { rateEditSchema } from "@/api/schemas";

/** Rate edits (CAL-3, CAL-5): 409 with both values on a version mismatch. */
export const PATCH = withPermission.route<z.infer<typeof rateEditSchema>>(
  "ari:update_rate",
  {
    scope: "property",
    resolveScope: (b) => ({ kind: "property", id: b.propertyId }),
    input: async (req) => rateEditSchema.parse(await req.json()),
    subject: (b) => ({ kind: "property", id: b.propertyId }),
  },
  async (ctx, body) => {
    const r = await applyCellEdits(ctx, body.propertyId, body.edits, "manual");
    return Response.json(r, { status: r.undoId ? 200 : 409 });
  },
);
