import type { z } from "zod";
import { withPermission } from "@/server/with-permission";
import { applyCellEdits } from "@/server/ari";
import { restrictionEditSchema } from "@/api/schemas";

/** Restriction edits: the full Channex set (spec 06 §6.4). Nulls clear a field. */
export const PATCH = withPermission.route<z.infer<typeof restrictionEditSchema>>(
  "ari:update_restriction",
  {
    scope: "property",
    resolveScope: (b) => ({ kind: "property", id: b.propertyId }),
    input: async (req) => restrictionEditSchema.parse(await req.json()),
    subject: (b) => ({ kind: "property", id: b.propertyId }),
  },
  async (ctx, body) => {
    const r = await applyCellEdits(
      ctx,
      body.propertyId,
      body.edits.map((e) => ({
        ...e,
        values: Object.fromEntries(Object.entries(e.values).map(([k, v]) => [k, v ?? undefined])),
      })),
      "manual",
    );
    return Response.json(r, { status: r.undoId ? 200 : 409 });
  },
);
