"use server";

import { revalidatePath } from "next/cache";
import { parseRateImportCsv, type RateImportPlan } from "@pms/core";
import { DrizzleRateImportRepository } from "@pms/db";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";
import { runRateImport, undoOperation } from "@/server/ari";

const propertyScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};
const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const intOrNull = (fd: FormData, k: string): number | null =>
  str(fd, k) === "" ? null : Math.round(Number(str(fd, k)));

/** Which engine prices this property, its guard rails and its mapping (spec 06 §6.5b). */
export const saveRateImportAction = withPermission<[FormData], void>(
  "yield_rule:update",
  propertyScope,
  async (ctx, fd) => {
    const propertyId = str(fd, "propertyId");
    const repo = new DrizzleRateImportRepository(ctx.tx, ctx.orgId);
    const stored = await repo.get(propertyId);
    // Merged, not replaced: the mapping is edited from two places (the settings form and
    // the unmapped listings a dry run turns up), and neither may drop the other's work.
    // An empty value is how a mapping is removed.
    const mapping = { ...stored.mapping };
    for (const [key, value] of fd.entries()) {
      if (!key.startsWith("map.")) continue;
      const ref = key.slice(4);
      if (String(value).trim() === "") delete mapping[ref];
      else mapping[ref] = String(value);
    }
    await repo.save(propertyId, {
      ...stored,
      provider: str(fd, "provider") || "csv",
      providerRef: str(fd, "providerRef") || null,
      enabled: fd.get("enabled") === "on",
      autoApply: fd.get("autoApply") === "on",
      guardRails: {
        floorMinor: intOrNull(fd, "floorMinor"),
        ceilingMinor: intOrNull(fd, "ceilingMinor"),
        maxChangeBps:
          intOrNull(fd, "maxChangePercent") === null
            ? null
            : intOrNull(fd, "maxChangePercent")! * 100,
      },
      holdHours: intOrNull(fd, "holdHours") ?? 48,
      mapping,
    });
    revalidatePath(`/properties/${propertyId}/pricing`);
  },
);

export interface ImportPreview {
  parseErrors: string[];
  columns: Record<string, string | undefined>;
  listingRefs: string[];
  plan: Pick<
    RateImportPlan,
    "cellCount" | "samples" | "warnings" | "refused" | "unmapped" | "held" | "outsideHorizon"
  > | null;
  applied: boolean;
  undoId: string | null;
}

/**
 * Read a pasted or uploaded export, then dry run it or apply it. The dry run is the
 * default and the only thing a mistyped file can do (BULK-1).
 */
export const importRatesAction = withPermission<[FormData], ImportPreview>(
  "ari:bulk_execute",
  propertyScope,
  async (ctx, fd) => {
    const c = await container();
    const propertyId = str(fd, "propertyId");
    const file = fd.get("file");
    const text =
      file instanceof File && file.size > 0 ? await file.text() : String(fd.get("csv") ?? "");
    const parsed = parseRateImportCsv(text);
    const listingRefs = [...new Set(parsed.rows.map((r) => r.listingRef))].sort();
    if (parsed.rows.length === 0)
      return {
        parseErrors: parsed.errors,
        columns: parsed.columns,
        listingRefs,
        plan: null,
        applied: false,
        undoId: null,
      };
    const settings = await new DrizzleRateImportRepository(ctx.tx, ctx.orgId).get(propertyId);
    const r = await runRateImport(
      ctx,
      propertyId,
      {
        rows: parsed.rows,
        mapping: new Map(Object.entries(settings.mapping)),
        guardRails: settings.guardRails,
        holdHours: settings.holdHours,
        override: fd.get("override") === "on",
        nowIso: c.clock.now().toString(),
      },
      fd.get("apply") !== "1",
    );
    if (r.applied) revalidatePath(`/properties/${propertyId}/pricing`);
    return {
      parseErrors: parsed.errors,
      columns: parsed.columns,
      listingRefs,
      plan: {
        cellCount: r.cellCount,
        samples: r.samples,
        warnings: r.warnings,
        refused: r.refused,
        unmapped: r.unmapped,
        held: r.held,
        outsideHorizon: r.outsideHorizon,
      },
      applied: r.applied,
      undoId: r.id,
    };
  },
);

/** BULK-2: one click puts every night back exactly as it was. */
export const undoImportAction = withPermission<[FormData], void>(
  "ari:bulk_execute",
  propertyScope,
  async (ctx, fd) => {
    const propertyId = str(fd, "propertyId");
    await undoOperation(ctx, str(fd, "operationId"), propertyId);
    revalidatePath(`/properties/${propertyId}/pricing`);
  },
);
