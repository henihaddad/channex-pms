"use server";

import { revalidatePath } from "next/cache";
import type { GuaranteePolicy } from "@pms/core";
import { DrizzleBookingEngineRepository } from "@pms/db";
import { enableDirectChannel } from "@pms/jobs";
import { withPermission } from "@/server/with-permission";
import { container } from "@/server/container";

const propertyScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};
const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, d = 0): number => Number(str(fd, k) || d);
const back = (fd: FormData) =>
  revalidatePath(`/properties/${str(fd, "propertyId")}/booking-engine`);

/** The direct channel on or off: a ChannelConnection like any OTA (spec 10 §10.1). */
export const toggleEngineAction = withPermission<[FormData], void>(
  "channel:activate",
  propertyScope,
  async (ctx, fd) => {
    const c = await container();
    await enableDirectChannel(
      c,
      ctx.tx,
      ctx.orgId,
      str(fd, "propertyId"),
      fd.get("enabled") === "1",
    );
    back(fd);
  },
);

export const saveEngineSettingsAction = withPermission<[FormData], void>(
  "channel:update_settings",
  propertyScope,
  async (ctx, fd) => {
    const c = await container();
    const kind = str(fd, "guarantee");
    const guarantee: GuaranteePolicy =
      kind === "deposit_fixed"
        ? { kind, amountMinor: num(fd, "depositAmount") }
        : kind === "deposit_percent"
          ? { kind, percentBps: num(fd, "depositBps") }
          : kind === "card_on_file" || kind === "prepay"
            ? { kind }
            : { kind: "pay_at_property" };
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).saveSettings(
      str(fd, "propertyId"),
      {
        guarantee,
        taxes: {
          vatBps: num(fd, "vatBps"),
          cityTaxPerPersonNightMinor: num(fd, "cityTax"),
          cityTaxMaxNights: str(fd, "cityTaxMax") ? num(fd, "cityTaxMax") : null,
        },
        accessRevealHours: num(fd, "accessRevealHours", 24),
        description: str(fd, "description") || null,
        attributes: str(fd, "attributes")
          .split(",")
          .map((a) => a.trim())
          .filter(Boolean),
        lat: str(fd, "lat") || null,
        lng: str(fd, "lng") || null,
        theme: str(fd, "colour") ? { colour: str(fd, "colour") } : {},
        houseManual: str(fd, "houseManual") || null,
        abandonmentEmails: fd.get("abandonment") === "on",
      },
    );
    back(fd);
  },
);

export const savePromoAction = withPermission<[FormData], void>(
  "rate_plan:update",
  propertyScope,
  async (ctx, fd) => {
    const c = await container();
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).savePromo({
      code: str(fd, "code").toUpperCase(),
      kind: str(fd, "kind") === "amount" ? "amount" : "percent",
      value: num(fd, "value"),
      validFrom: str(fd, "validFrom") || null,
      validTo: str(fd, "validTo") || null,
      stayFrom: null,
      stayTo: null,
      minNights: str(fd, "minNights") ? num(fd, "minNights") : null,
      maxUses: str(fd, "maxUses") ? num(fd, "maxUses") : null,
      singleUse: fd.get("singleUse") === "on",
      active: true,
      propertyId: str(fd, "propertyId"),
      createdBy: ctx.userId,
    });
    back(fd);
  },
);

export const saveExtraAction = withPermission<[FormData], void>(
  "rate_plan:update",
  propertyScope,
  async (ctx, fd) => {
    const c = await container();
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).saveExtra({
      propertyId: str(fd, "propertyId"),
      name: str(fd, "name"),
      description: null,
      priceMinor: num(fd, "priceMinor"),
      active: true,
      per: (["stay", "night", "person"].includes(str(fd, "per")) ? str(fd, "per") : "stay") as
        "stay" | "night" | "person",
    });
    back(fd);
  },
);

/** Direct-only rate plans (spec 10 §10.5): mapped to the direct channel and nowhere else. */
export const setDirectOnlyAction = withPermission<[FormData], void>(
  "rate_plan:update",
  propertyScope,
  async (ctx, fd) => {
    const c = await container();
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).setDirectOnly(
      str(fd, "ratePlanId"),
      fd.get("directOnly") === "1",
    );
    back(fd);
  },
);
