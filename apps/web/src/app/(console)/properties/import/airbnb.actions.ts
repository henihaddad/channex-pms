"use server";

import { revalidatePath } from "next/cache";
import {
  createProperty,
  fieldsToApply,
  Id,
  listingImportPreview,
  LocalDate,
  nameSimilarity,
  normaliseAmenities,
  type ImportNight,
  type ImportPreview,
  type ListingSnapshot,
  type LocalSnapshot,
} from "@pms/core";
import { DrizzleAriStore, DrizzleChannelRepository, DrizzlePropertyRepository } from "@pms/db";
import { queueAriPush } from "@pms/jobs";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";

/** Nights read from Airbnb's calendar and compared: the coming year, as the CH-5 import reads it. */
const HORIZON_DAYS = 365;
const TZ_BY_COUNTRY: Record<string, string> = {
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  GB: "Europe/London",
  GR: "Europe/Athens",
  HR: "Europe/Zagreb",
  TR: "Europe/Istanbul",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  AE: "Asia/Dubai",
  US: "America/New_York",
  ZA: "Africa/Johannesburg",
};

const meta = (ctx: ActorCtx, op: string) => ({
  dedupeKey: `${op}:${ctx.requestId}`,
  requestId: ctx.requestId,
});

/** The Airbnb channel behind a connection, and the listings already mapped on any of its connections. */
async function airbnbChannel(ctx: ActorCtx, connectionId: string) {
  const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
  const all = await ch.listConnections();
  const conn = all.find((c) => c.id === connectionId);
  if (!conn || conn.adapterCode !== "AirBNB" || !conn.channexChannelId)
    throw new HttpProblem(404, "not_found", "Airbnb connection not found");
  const mapped = new Set<string>();
  for (const sib of all.filter((c) => c.channexChannelId === conn.channexChannelId))
    for (const m of await ch.listMappings(sib.id)) mapped.add(m.roomCode);
  return { channelId: conn.channexChannelId, mapped };
}

/** Airbnb's listing as the preview compares it, prices turned into minor units once, here. */
async function readListing(ctx: ActorCtx, channelId: string, listingId: string, today: LocalDate) {
  const c = await container();
  const details = await c.provider.getChannelListingDetails(
    { id: channelId },
    listingId,
    meta(ctx, `airbnb.listing:${listingId}`),
  );
  const calendar = await c.provider.getChannelListingCalendar(
    { id: channelId },
    listingId,
    { from: today.toString(), to: today.plusDays(HORIZON_DAYS).toString() },
    meta(ctx, `airbnb.calendar:${listingId}`),
  );
  const currency = /^[A-Z]{3}$/.test(calendar.currency) ? calendar.currency : "EUR";
  const snapshot: ListingSnapshot = {
    title: details.title,
    ...(details.city ? { city: details.city } : {}),
    ...(details.countryCode ? { countryCode: details.countryCode } : {}),
    ...(details.bedrooms !== undefined ? { bedrooms: details.bedrooms } : {}),
    ...(details.capacity !== undefined ? { capacity: details.capacity } : {}),
    ...(details.summary ? { summary: details.summary } : {}),
    amenities: details.amenities,
    photos: details.photos,
    currency,
    nights: calendar.days.map((d) => ({
      date: d.date,
      available: d.available,
      priceMinor: d.price === null ? null : Math.round(d.price * 100),
      ...(d.minNights !== undefined ? { minNights: d.minNights } : {}),
    })),
  };
  return { snapshot, calendar };
}

/** The property as the preview compares it, or null when the import makes a new one. */
async function readLocal(
  ctx: ActorCtx,
  propertyId: string | null,
  today: LocalDate,
): Promise<{ local: LocalSnapshot | null; ratePlanId: string | null; title: string | null }> {
  if (!propertyId) return { local: null, ratePlanId: null, title: null };
  const s = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).importSnapshot(
    propertyId,
    today.toString(),
    HORIZON_DAYS,
  );
  if (!s) throw new HttpProblem(404, "not_found", "Property not found");
  const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  const n = (v: unknown) => (typeof v === "number" ? v : undefined);
  const local: LocalSnapshot = {
    title: s.title,
    ...(s.address.city ? { city: s.address.city } : {}),
    ...(s.address.country ? { country: s.address.country } : {}),
    ...(n(s.content.bedrooms) !== undefined ? { bedrooms: n(s.content.bedrooms)! } : {}),
    ...(n(s.content.capacity) !== undefined ? { sleeps: n(s.content.capacity)! } : {}),
    ...(typeof s.content.summary === "string" ? { summary: s.content.summary } : {}),
    amenities: list(s.content.amenities),
    photos: list(s.content.photos),
    currency: s.currency,
    nights: s.nights.map((x): ImportNight => ({
      date: x.date,
      available: true,
      priceMinor: x.rate,
      ...(x.minStay !== null ? { minNights: x.minStay } : {}),
    })),
  };
  return { local, ratePlanId: s.ratePlanId, title: s.title };
}

export interface AirbnbImportView {
  connections: Array<{ id: string; channelId: string }>;
  connectionId: string | null;
  listings: Array<{ code: string; title: string; city?: string; matchId: string | null }>;
  listingId: string | null;
  properties: Array<{ id: string; title: string }>;
  /** The property the listing goes into, or null for a new property. */
  propertyId: string | null;
  preview: ImportPreview | null;
}

/**
 * Step 2 of the Airbnb import (spec 07 CH-5): which listings are not in OTAbridge yet, and for
 * the chosen one every field the import would write, compared with the property it goes into
 * (the closest by name, or the manager's choice, or a new one). Reads only; writes nothing.
 */
export const loadAirbnbImport = withPermission<
  [{ connectionId?: string; listingId?: string; propertyId?: string }],
  AirbnbImportView
>(
  "channel_account:manage",
  { scope: "organization", audit: false, stepUp: false },
  async (ctx, input) => {
    const c = await container();
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const seen = new Set<string>();
    const connections = (await ch.listConnections())
      .filter((x) => x.adapterCode === "AirBNB" && x.channexChannelId)
      .filter((x) => !seen.has(x.channexChannelId!) && seen.add(x.channexChannelId!))
      .map((x) => ({ id: x.id, channelId: x.channexChannelId! }));
    const properties = (await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list()).map((p) => ({
      id: p.id,
      title: p.title,
    }));
    const empty = { connections, listings: [], listingId: null, properties, propertyId: null };
    const conn = connections.find((x) => x.id === input.connectionId) ?? connections[0];
    if (!conn) return { ...empty, connectionId: null, preview: null };
    const { channelId, mapped } = await airbnbChannel(ctx, conn.id);
    const listings = (
      await c.provider.listChannelListings({ id: channelId }, meta(ctx, "airbnb.listings"))
    )
      .filter((l) => !mapped.has(l.id))
      .map((l) => {
        const best = properties
          .map((p) => ({ id: p.id, score: nameSimilarity(p.title, l.title) }))
          .sort((a, b) => b.score - a.score)[0];
        return {
          code: l.id,
          title: l.title,
          ...(l.city ? { city: l.city } : {}),
          matchId: best && best.score >= 0.5 ? best.id : null,
        };
      });
    const listing = listings.find((l) => l.code === input.listingId) ?? listings[0];
    if (!listing) return { ...empty, connectionId: conn.id, listings, preview: null };
    const propertyId =
      input.propertyId === "new"
        ? null
        : properties.some((p) => p.id === input.propertyId)
          ? input.propertyId!
          : listing.matchId;
    const today = LocalDate.today("UTC");
    const { snapshot } = await readListing(ctx, channelId, listing.code, today);
    const { local } = await readLocal(ctx, propertyId, today);
    return {
      connections,
      connectionId: conn.id,
      listings,
      listingId: listing.code,
      properties,
      propertyId,
      preview: listingImportPreview(snapshot, local),
    };
  },
);

export interface RunImportState {
  error?: string;
  propertyId?: string;
  written?: number;
  nights?: number;
}

/**
 * Step 3 (spec 07 CH-5): write exactly the ticked fields. Airbnb is read again, so what is
 * written is what Airbnb holds now; a field it does not report is never written. A new
 * property is created from the listing; an existing one keeps everything left unticked.
 * The listing is then mapped to the property's base plan, so it is never imported twice.
 */
export const runAirbnbImportAction = withPermission<[RunImportState, FormData], RunImportState>(
  "channel:create",
  {
    scope: "organization",
    subject: (_p, fd) => ({
      kind: "channel_connection",
      id: String(fd.get("connectionId")),
    }),
    auditInput: (_p, fd) => ({
      listingId: fd.get("listingId"),
      propertyId: fd.get("propertyId"),
      fields: fd.getAll("fields").map(String),
    }),
  },
  async (ctx, _prev, fd) => {
    const c = await container();
    const connectionId = String(fd.get("connectionId") ?? "");
    const listingId = String(fd.get("listingId") ?? "");
    const target = String(fd.get("propertyId") ?? "") || null;
    const { channelId, mapped } = await airbnbChannel(ctx, connectionId);
    if (mapped.has(listingId)) return { error: "This listing is already imported." };
    const today = LocalDate.today("UTC");
    const { snapshot } = await readListing(ctx, channelId, listingId, today);
    const { local, ratePlanId: existingPlan, title } = await readLocal(ctx, target, today);
    const preview = listingImportPreview(snapshot, local);
    const apply = fieldsToApply(preview, new Set(fd.getAll("fields").map(String)));
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const content: Record<string, unknown> = { source: "airbnb", listingId };
    if (apply.has("summary")) content.summary = snapshot.summary;
    if (apply.has("photos")) content.photos = snapshot.photos;
    if (apply.has("amenities")) content.amenities = normaliseAmenities(snapshot.amenities);
    if (apply.has("sleeps")) content.capacity = snapshot.capacity;
    if (apply.has("bedrooms")) content.bedrooms = snapshot.bedrooms;
    const address: Record<string, string> = {};
    if (apply.has("city") && snapshot.city) address.city = snapshot.city;
    if (apply.has("country") && snapshot.countryCode) address.country = snapshot.countryCode;
    const prices = preview.rows.find((r) => r.key === "prices")?.airbnb;
    const minStay = preview.rows.find((r) => r.key === "minStay")?.airbnb;

    let propertyId = target;
    let planId = existingPlan;
    if (!propertyId) {
      const r = await createProperty(
        {
          repo,
          clock: c.clock,
          orgId: ctx.orgId,
          webhookCredentials: async () => ({
            token: c.crypto.randomToken(24),
            secretSealed: await c.crypto.seal(c.crypto.randomToken(32)),
          }),
        },
        {
          title: snapshot.title,
          kind: "single_unit",
          currency: snapshot.currency,
          timezone: TZ_BY_COUNTRY[snapshot.countryCode ?? ""] ?? "UTC",
          address,
          ...(apply.has("sleeps") && snapshot.capacity ? { sleeps: snapshot.capacity } : {}),
          ratePlans: [
            {
              title: "Standard",
              baseRateMinor:
                apply.has("prices") && prices?.kind === "prices" ? prices.medianMinor : 10000,
              minStay: apply.has("minStay") && minStay?.kind === "nights" ? minStay.value : 1,
            },
          ],
          settings: { content },
        },
      );
      if (!r.ok) throw new HttpProblem(422, r.error.code, r.error.message);
      await repo.saveProvisioning(r.value.property.id, {
        step: "group",
        refs: {},
        attempts: 0,
        lastError: null,
      });
      propertyId = r.value.property.id;
      planId = r.value.ratePlans[0]?.id ?? null;
    } else {
      if (apply.has("title") || Object.keys(address).length > 0)
        await repo.updateDetails(propertyId, {
          title: apply.has("title") ? snapshot.title : (title ?? snapshot.title),
          address,
        });
      await repo.setContent(propertyId, content);
    }

    // the calendar: every priced night and/or its minimum stay, onto the base plan
    let nights = 0;
    if (planId && (apply.has("prices") || apply.has("minStay"))) {
      const store = new DrizzleAriStore(ctx.tx);
      for (const n of snapshot.nights) {
        const values = {
          ...(apply.has("prices") && n.priceMinor !== null && n.priceMinor > 0
            ? { rate: n.priceMinor }
            : {}),
          ...(apply.has("minStay") && n.minNights !== undefined ? { minStay: n.minNights } : {}),
        };
        if (Object.keys(values).length === 0) continue;
        await store.setRate(propertyId, ctx.orgId, planId, n.date, values, "airbnb_import");
        nights++;
      }
      if (target) await queueAriPush(ctx.tx, ctx.orgId, propertyId, Date.now(), "airbnb_import");
    }

    // map the listing to the base plan, as the CH-5 import does, so it is not offered again
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const id = Id.next();
    await ch.insertConnection({
      id,
      propertyId,
      adapterCode: "AirBNB",
      settings: { managedIn: "channex" },
    });
    await ch.updateConnection(id, { channexChannelId: channelId });
    if (planId) {
      await ch.replaceMappings(
        id,
        [{ ratePlanId: planId, roomCode: listingId, rateCode: listingId }],
        () => Id.next(),
      );
      await ch.updateConnection(id, { state: "mapped", readiness: { ready: true, issues: [] } });
    }
    revalidatePath("/properties");
    revalidatePath("/channels");
    return { propertyId, written: apply.size, nights };
  },
);
