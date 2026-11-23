"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { GuaranteePolicy } from "@pms/core";
import { DrizzleBookingEngineRepository, rawRows, sql } from "@pms/db";
import { enableDirectChannel } from "@pms/jobs";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { container } from "@/server/container";
import { decimalToMinor, percentToBps } from "@/lib/amounts";

const propertyScope = {
  scope: "property" as const,
  resolveScope: (fd: FormData) => ({ kind: "property" as const, id: String(fd.get("propertyId")) }),
};
const str = (fd: FormData, k: string): string => String(fd.get(k) ?? "").trim();
const num = (fd: FormData, k: string, d = 0): number => Number(str(fd, k) || d);
const back = (fd: FormData) =>
  revalidatePath(`/properties/${str(fd, "propertyId")}/booking-engine`);

async function currencyOf(ctx: ActorCtx, propertyId: string): Promise<string> {
  const [p] = await rawRows<{ currency: string }>(
    ctx.tx,
    sql`select currency from property where id = ${propertyId}`,
  );
  return p?.currency ?? "EUR";
}

/**
 * Amounts are typed in the currency and percentages in % (stored as minor units and basis
 * points). A value that does not read sends the host back with the field named, before anything
 * is written; an empty one takes `fallback`.
 */
function reader(fd: FormData, currency: string) {
  const bad = (field: string): never =>
    redirect(`/properties/${str(fd, "propertyId")}/booking-engine?invalid=${field}`);
  return {
    money: (field: string, fallback: number | null = 0): number | null => {
      const v = decimalToMinor(str(fd, field), currency);
      return v === undefined ? bad(field) : (v ?? fallback);
    },
    percent: (field: string, fallback: number | null = 0): number | null => {
      const v = percentToBps(str(fd, field));
      return v === undefined ? bad(field) : (v ?? fallback);
    },
  };
}

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
    const read = reader(fd, await currencyOf(ctx, str(fd, "propertyId")));
    const kind = str(fd, "guarantee");
    const guarantee: GuaranteePolicy =
      kind === "deposit_fixed"
        ? { kind, amountMinor: read.money("depositAmount")! }
        : kind === "deposit_percent"
          ? { kind, percentBps: read.percent("depositPercent")! }
          : kind === "card_on_file" || kind === "prepay"
            ? { kind }
            : { kind: "pay_at_property" };
    const vatBps = read.percent("vatPercent")!;
    const cityTax = read.money("cityTax")!;
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).saveSettings(
      str(fd, "propertyId"),
      {
        guarantee,
        taxes: {
          vatBps,
          cityTaxPerPersonNightMinor: cityTax,
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
    const kind = str(fd, "kind") === "amount" ? "amount" : "percent";
    // a percent code takes whole percent off; an amount code takes minor units off
    const value =
      kind === "amount"
        ? reader(fd, await currencyOf(ctx, str(fd, "propertyId"))).money("value")!
        : Math.round(num(fd, "value"));
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).savePromo({
      code: str(fd, "code").toUpperCase(),
      kind,
      value,
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
    const priceMinor = reader(fd, await currencyOf(ctx, str(fd, "propertyId"))).money("price")!;
    await new DrizzleBookingEngineRepository(ctx.tx, ctx.orgId, c.crypto).saveExtra({
      propertyId: str(fd, "propertyId"),
      name: str(fd, "name"),
      description: null,
      priceMinor,
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
