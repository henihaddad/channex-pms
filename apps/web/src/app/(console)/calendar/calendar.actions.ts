"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  Id,
  OTA_CHANNELS,
  parseMinor,
  parsePercentBps,
  parsePricingDefaults,
  validateSeason,
} from "@pms/core";
import {
  DrizzlePricingDefaultsRepository,
  DrizzleRateImportRepository,
  DrizzleSeasonRepository,
  loadStays,
  saveNightNotes,
  type GridBlock,
  type GridStay,
} from "@pms/db";
import { withPermission } from "@/server/with-permission";

const iso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const staysInput = z.object({
  from: iso,
  to: iso,
  propertyIds: z.array(z.string().uuid()).max(500),
});

/** The bookings and blocks behind the calendar's bars (CAL-2a), for the listings on screen. */
export const loadStaysAction = withPermission<
  [z.infer<typeof staysInput>],
  { stays: GridStay[]; blocks: GridBlock[] }
>("booking:read", { scope: "organization", schema: staysInput, audit: false }, async (ctx, q) =>
  loadStays(ctx.tx, { dateFrom: q.from, dateTo: q.to, propertyIds: q.propertyIds }),
);

const notesInput = z.object({
  propertyId: z.string().uuid(),
  notes: z
    .array(z.object({ ratePlanId: z.string().uuid(), date: iso, body: z.string().max(500) }))
    .max(400),
});

/** A private note on the selected nights, seen by the team and never sent to a channel. */
export const saveNightNotesAction = withPermission<[z.infer<typeof notesInput>], void>(
  "ari:update_restriction",
  {
    scope: "property",
    schema: notesInput,
    resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
  },
  async (ctx, i) => saveNightNotes(ctx.tx, i.propertyId, i.notes),
);

const propertyScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};
const pct = (fd: FormData, k: string): number | null => parsePercentBps(String(fd.get(k) ?? ""));

/** The form of the Pricing & availability page, read into stored settings. */
function pricingFromForm(fd: FormData) {
  return parsePricingDefaults({
    markupBps: Object.fromEntries(OTA_CHANNELS.map((c) => [c, pct(fd, `markup.${c}`)])),
    rounding: fd.get("rounding"),
    discounts: {
      weeklyBps: pct(fd, "weekly"),
      monthlyBps: pct(fd, "monthly"),
      earlyBirdBps: pct(fd, "earlyBird"),
      earlyBirdDays: Number(fd.get("earlyBirdDays")),
      lastMinuteBps: pct(fd, "lastMinute"),
      lastMinuteDays: Number(fd.get("lastMinuteDays")),
    },
  });
}
const minorOrNull = (fd: FormData, k: string): number | null => parseMinor(String(fd.get(k) ?? ""));

/**
 * "Pricing & availability" (spec 06 §6.6): channel markup, rounding and discounts, plus the
 * price-tips mode and the floor and ceiling, which are the rate import's own settings.
 */
export const savePricingDefaultsAction = withPermission<[FormData], void>(
  "yield_rule:update",
  propertyScope,
  async (ctx, fd) => {
    const propertyId = String(fd.get("propertyId"));
    await new DrizzlePricingDefaultsRepository(ctx.tx).save(propertyId, pricingFromForm(fd));
    const imports = new DrizzleRateImportRepository(ctx.tx, ctx.orgId);
    const stored = await imports.get(propertyId);
    const mode = String(fd.get("tips") ?? "suggest");
    await imports.save(propertyId, {
      ...stored,
      enabled: mode !== "off",
      autoApply: mode === "auto",
      guardRails: {
        ...stored.guardRails,
        floorMinor: minorOrNull(fd, "floor"),
        ceilingMinor: minorOrNull(fd, "ceiling"),
      },
    });
    revalidatePath("/calendar/settings");
  },
);

/** "+ Add a season": a named range of nights on this listing (spec 06 §6.6). */
export const addSeasonAction = withPermission<[FormData], { errors: string[] }>(
  "yield_rule:update",
  propertyScope,
  async (ctx, fd) => {
    const input = {
      name: String(fd.get("name") ?? ""),
      ranges: [{ from: String(fd.get("from") ?? ""), to: String(fd.get("to") ?? "") }],
      colour: String(fd.get("colour") || "#94a3b8"),
    };
    const errors = validateSeason(input);
    if (errors.length > 0) return { errors };
    const propertyId = String(fd.get("propertyId"));
    await new DrizzleSeasonRepository(ctx.tx, ctx.orgId).add({
      id: Id.next(),
      propertyId,
      ...input,
    });
    revalidatePath("/calendar");
    return { errors: [] };
  },
);

export const removeSeasonAction = withPermission<[FormData], void>(
  "yield_rule:update",
  propertyScope,
  async (ctx, fd) => {
    await new DrizzleSeasonRepository(ctx.tx, ctx.orgId).remove(
      String(fd.get("seasonId")),
      String(fd.get("propertyId")),
    );
    revalidatePath("/calendar");
  },
);
