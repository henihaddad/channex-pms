import {
  createProperty,
  Id,
  listingConflictMessage,
  listingConflicts,
  LocalDate,
  nameSimilarity,
  type ListingClaim,
} from "@pms/core";
import { DrizzleAriStore, DrizzleChannelRepository, DrizzlePropertyRepository } from "@pms/db";
import type { ActorCtx } from "./with-permission";
import { container } from "./container";
import { HttpProblem } from "./errors";

/**
 * Airbnb through Channex (spec 07 CH-5), shared by the console and the agent tools: the
 * accounts the host authorised, the listings on each, and the import that turns a listing into
 * a property linked to it. One Airbnb account is one provider channel; each property linked to
 * it is one connection carrying that channel's id.
 */

export const IMPORT_HORIZON_DAYS = 365;
export const TZ_BY_COUNTRY: Record<string, string> = {
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  ES: "Europe/Madrid",
  PT: "Europe/Lisbon",
  IT: "Europe/Rome",
  NL: "Europe/Amsterdam",
  BE: "Europe/Brussels",
  AT: "Europe/Vienna",
  CH: "Europe/Zurich",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  GR: "Europe/Athens",
  HR: "Europe/Zagreb",
  PL: "Europe/Warsaw",
  CZ: "Europe/Prague",
  SE: "Europe/Stockholm",
  NO: "Europe/Oslo",
  DK: "Europe/Copenhagen",
  FI: "Europe/Helsinki",
  TR: "Europe/Istanbul",
  MA: "Africa/Casablanca",
  TN: "Africa/Tunis",
  EG: "Africa/Cairo",
  AE: "Asia/Dubai",
  SA: "Asia/Riyadh",
  US: "America/New_York",
  CA: "America/Toronto",
  MX: "America/Mexico_City",
  BR: "America/Sao_Paulo",
  AU: "Australia/Sydney",
  NZ: "Pacific/Auckland",
  JP: "Asia/Tokyo",
  TH: "Asia/Bangkok",
  ID: "Asia/Jakarta",
  IN: "Asia/Kolkata",
  ZA: "Africa/Johannesburg",
};

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]!;
};
const mode = (xs: number[]) => {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

const meta = (ctx: ActorCtx, op: string) => ({
  dedupeKey: `${op}:${ctx.requestId}`,
  requestId: ctx.requestId,
});

export interface AirbnbAccount {
  /** A connection on the account, the handle the tools and the console pass around. */
  connectionId: string;
  channelId: string;
}

/** The Airbnb accounts the host authorised: one entry per provider channel. */
export async function airbnbAccounts(ctx: ActorCtx): Promise<AirbnbAccount[]> {
  const seen = new Set<string>();
  return (await new DrizzleChannelRepository(ctx.tx, ctx.orgId).listConnections())
    .filter((c) => c.adapterCode === "AirBNB" && c.settings.managedIn === "channex")
    .filter(
      (c) => c.channexChannelId && !seen.has(c.channexChannelId) && seen.add(c.channexChannelId),
    )
    .map((c) => ({ connectionId: c.id, channelId: c.channexChannelId! }));
}

/** The account behind a connection, or the only one when none is named. */
export async function airbnbAccount(ctx: ActorCtx, connectionId?: string): Promise<AirbnbAccount> {
  const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
  if (connectionId) {
    const conn = await ch.getConnection(connectionId);
    if (!conn || conn.adapterCode !== "AirBNB" || !conn.channexChannelId)
      throw new HttpProblem(404, "not_found", "Airbnb connection not found");
    return { connectionId: conn.id, channelId: conn.channexChannelId };
  }
  const all = await airbnbAccounts(ctx);
  if (all.length === 0)
    throw new HttpProblem(
      409,
      "airbnb_not_connected",
      "No Airbnb account is connected yet",
      "Connect one first (the connect_airbnb tool gives the link)",
    );
  if (all.length > 1)
    throw new HttpProblem(
      409,
      "airbnb_account_ambiguous",
      "Several Airbnb accounts are connected",
      "Name one with connectionId (list_airbnb_listings shows them)",
    );
  return all[0]!;
}

export interface AirbnbListingView {
  listingId: string;
  title: string;
  city?: string;
  type?: string;
  /** Who holds the listing here, the live link first; empty when it is not linked. */
  linkedTo: Array<{ propertyId: string; property: string; connectionId: string; state: string }>;
  /** The property whose name is closest, as the import would match it; null when none is close. */
  suggestedProperty: { propertyId: string; property: string; confidence: number } | null;
}

/** Every listing on the account, linked or not, as Airbnb reports it now. */
export async function airbnbListings(
  ctx: ActorCtx,
  account: AirbnbAccount,
): Promise<AirbnbListingView[]> {
  const c = await container();
  // docs: channel-api-examples/airbnb (4. Discover the listings), through the provider port
  const listings = await c.provider.listChannelListings(
    { id: account.channelId },
    meta(ctx, "airbnb.listings"),
  );
  const claims = await new DrizzleChannelRepository(ctx.tx, ctx.orgId).listingClaims(
    account.channelId,
  );
  const properties = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list();
  return listings.map((l) => {
    const best = properties
      .map((p) => ({
        propertyId: p.id,
        property: p.title,
        confidence: nameSimilarity(p.title, l.title),
      }))
      .sort((a, b) => b.confidence - a.confidence)[0];
    return {
      listingId: l.id,
      title: l.title,
      ...(l.city ? { city: l.city } : {}),
      ...(l.type ? { type: l.type } : {}),
      linkedTo: claims
        .filter((x) => x.listingId === l.id)
        .map((x) => ({
          propertyId: x.propertyId,
          property: x.propertyTitle,
          connectionId: x.connectionId,
          state: x.state,
        })),
      suggestedProperty:
        best && best.confidence >= 0.5
          ? { ...best, confidence: Math.round(best.confidence * 100) / 100 }
          : null,
    };
  });
}

export interface ImportedListing {
  listingId: string;
  propertyId: string;
  connectionId: string;
  /** True when the import made the property; false when it linked an existing one. */
  createdProperty: boolean;
  /** Nights of Airbnb's calendar written into the property's base plan. */
  nights: number;
}

/**
 * Match-or-create (CH-5): link one listing to a property. With no property named, one is built
 * from the listing itself — title, place, capacity, photos and description as Airbnb reports
 * them, a Standard plan at the median of the host's prices for the coming year, and the host's
 * per-day prices and minimum stays written into the calendar. Availability is not copied:
 * Airbnb's blocks are its own bookings, imported on activation. A listing another property
 * already links is refused by name. The connection ends `mapped`; activation is a separate step
 * (a new property is first created on the channel manager by the worker).
 */
export async function importAirbnbListing(
  ctx: ActorCtx,
  account: AirbnbAccount,
  input: { listingId: string; title?: string; propertyId: string | null },
  claims?: ListingClaim[],
): Promise<ImportedListing> {
  const c = await container();
  const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
  const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
  const store = new DrizzleAriStore(ctx.tx);
  const held = claims ?? (await ch.listingClaims(account.channelId));
  const taken = listingConflicts([input.listingId], held, "", "save");
  if (taken.length > 0)
    throw new HttpProblem(409, "listing_already_linked", listingConflictMessage(taken));
  if (input.propertyId && !(await repo.get(input.propertyId)))
    throw new HttpProblem(404, "not_found", "Property not found", "Check propertyId");

  const today = LocalDate.today("UTC");
  const range = { from: today.toString(), to: today.plusDays(IMPORT_HORIZON_DAYS).toString() };
  let propertyId = input.propertyId;
  let calendar: Awaited<ReturnType<typeof c.provider.getChannelListingCalendar>> | null = null;
  if (!propertyId) {
    const details = await c.provider.getChannelListingDetails(
      { id: account.channelId },
      input.listingId,
      meta(ctx, `airbnb.listing:${input.listingId}`),
    );
    calendar = await c.provider.getChannelListingCalendar(
      { id: account.channelId },
      input.listingId,
      range,
      meta(ctx, `airbnb.calendar:${input.listingId}`),
    );
    const prices = calendar.days
      .map((x) => x.price)
      .filter((p): p is number => p !== null && p > 0);
    const currency = /^[A-Z]{3}$/.test(calendar.currency) ? calendar.currency : "EUR";
    const country = details.countryCode ?? "DE";
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
        title: details.title || input.title || `Airbnb ${input.listingId}`,
        kind: "single_unit",
        currency,
        timezone: TZ_BY_COUNTRY[country] ?? "UTC",
        address: { city: details.city ?? "", country },
        ratePlans: [
          {
            title: "Standard",
            baseRateMinor: Math.round(median(prices) * 100) || 10000,
            minStay: mode(calendar.days.map((x) => x.minNights ?? 1)) ?? 1,
          },
        ],
        settings: {
          content: {
            source: "airbnb",
            listingId: input.listingId,
            summary: details.summary ?? "",
            photos: details.photos,
            amenities: details.amenities,
            capacity: details.capacity ?? null,
            bedrooms: details.bedrooms ?? null,
          },
        },
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
  }
  const detail = await repo.get(propertyId);
  const plan = detail?.ratePlans.find((p) => !p.parentRatePlanId) ?? detail?.ratePlans[0];
  let nights = 0;
  if (calendar && plan) {
    for (const day of calendar.days) {
      if (day.price === null || day.price <= 0) continue;
      await store.setRate(
        propertyId,
        ctx.orgId,
        plan.id,
        day.date,
        {
          rate: Math.round(day.price * 100),
          ...(day.minNights !== undefined ? { minStay: day.minNights } : {}),
          ...(day.maxNights !== undefined ? { maxStay: day.maxNights } : {}),
          ...(day.closedToArrival !== undefined ? { closedToArrival: day.closedToArrival } : {}),
          ...(day.closedToDeparture !== undefined
            ? { closedToDeparture: day.closedToDeparture }
            : {}),
        },
        "airbnb_import",
      );
      nights++;
    }
  }
  const id = Id.next();
  await ch.insertConnection({
    id,
    propertyId,
    adapterCode: "AirBNB",
    settings: { managedIn: "channex" },
  });
  await ch.updateConnection(id, { channexChannelId: account.channelId });
  if (plan) {
    await ch.replaceMappings(
      id,
      [{ ratePlanId: plan.id, roomCode: input.listingId, rateCode: input.listingId }],
      () => Id.next(),
    );
    await ch.updateConnection(id, { state: "mapped", readiness: { ready: true, issues: [] } });
  }
  held.push({
    listingId: input.listingId,
    connectionId: id,
    propertyId,
    propertyTitle: detail?.property.title ?? "",
    state: plan ? "mapped" : "draft",
  });
  return {
    listingId: input.listingId,
    propertyId,
    connectionId: id,
    createdProperty: !input.propertyId,
    nights,
  };
}
