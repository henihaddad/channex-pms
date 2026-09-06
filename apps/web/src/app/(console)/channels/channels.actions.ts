"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import {
  coverageWarnings,
  createProperty,
  Id,
  mappingDiff,
  nameSimilarity,
  sortWorstFirst,
  suggestMappings,
  transition,
  validateMappings,
  type AdapterDescriptor,
  type CoverageWarning,
  type MappingRow,
  type OurRatePlan,
  type Suggestion,
  type TheirRoom,
  LocalDate,
} from "@pms/core";
import {
  DrizzleAriStore,
  DrizzleChannelRepository,
  DrizzlePropertyRepository,
  type ChannelAccountRow,
  type ChannelEventRow,
  type ConnectionRow,
} from "@pms/db";
import { activateConnection, pauseConnection, queueAriPush, removeConnection } from "@pms/jobs";
import { CHANNEX_PRODUCTION, CHANNEX_STAGING, channexChannelScreenUrl } from "@pms/connectivity";
import { withPermission, type ActorCtx } from "@/server/with-permission";
import { container } from "@/server/container";
import { HttpProblem } from "@/server/errors";
import { ADAPTERS } from "@/api/schemas";

const byProperty = {
  scope: "property" as const,
  resolveScope: (i: { propertyId: string }) => ({ kind: "property" as const, id: i.propertyId }),
};
const meta = (ctx: ActorCtx, op: string) => ({
  dedupeKey: `${op}:${ctx.requestId}`,
  requestId: ctx.requestId,
});

export interface HealthBoard {
  connections: Array<
    ConnectionRow & {
      ready: boolean;
      failedCells: number;
      pendingCells: number;
      openP1: number;
      openP2: number;
      bookings7d: number;
      bookings30d: number;
      unmappedBookings: number;
    }
  >;
  accounts: ChannelAccountRow[];
  events: ChannelEventRow[];
}

export const loadHealthBoard = withPermission<[], HealthBoard>(
  "channel:read",
  { scope: "organization", audit: false },
  async (ctx) => {
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const [rows, accounts, events] = await Promise.all([
      ch.health(),
      ch.listAccounts(),
      ch.listEvents({ limit: 30, openOnly: true }),
    ]);
    return { connections: sortWorstFirst(rows), accounts, events };
  },
);

export const acknowledgeEventAction = withPermission<[FormData], void>(
  "channel:update_settings",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "channel_event", id: String(fd.get("eventId")) }),
  },
  async (ctx, fd) => {
    await new DrizzleChannelRepository(ctx.tx, ctx.orgId).acknowledgeEvent(
      String(fd.get("eventId")),
    );
    revalidatePath("/channels");
  },
);

export const pauseAction = withPermission<[FormData], void>(
  "channel:deactivate",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "channel_connection", id: String(fd.get("connectionId")) }),
  },
  async (ctx, fd) => {
    const c = await container();
    await pauseConnection(
      { provider: c.provider, clock: c.clock, log: c.log },
      ctx.orgId,
      String(fd.get("connectionId")),
      true,
      (fn) => fn(ctx.tx),
    );
    revalidatePath("/channels");
  },
);

export const resumeAction = withPermission<[FormData], void>(
  "channel:activate",
  {
    scope: "organization",
    subject: (fd) => ({ kind: "channel_connection", id: String(fd.get("connectionId")) }),
  },
  async (ctx, fd) => {
    const c = await container();
    await pauseConnection(
      { provider: c.provider, clock: c.clock, log: c.log },
      ctx.orgId,
      String(fd.get("connectionId")),
      false,
      (fn) => fn(ctx.tx),
    );
    revalidatePath("/channels");
  },
);

export const removeAction = withPermission<[FormData], void>(
  "channel:delete",
  {
    scope: "organization",
    stepUp: false,
    subject: (fd) => ({ kind: "channel_connection", id: String(fd.get("connectionId")) }),
  },
  async (ctx, fd) => {
    const c = await container();
    await removeConnection(
      { provider: c.provider, clock: c.clock, log: c.log },
      ctx.orgId,
      String(fd.get("connectionId")),
      (fn) => fn(ctx.tx),
    );
    revalidatePath("/channels");
  },
);

// ---- wizard (spec 07 §7.2) -----------------------------------------------------------

export const getDescriptor = withPermission<[{ adapterCode: string }], AdapterDescriptor>(
  "channel:read",
  { scope: "organization", audit: false },
  async (ctx, { adapterCode }) => {
    const c = await container();
    return c.provider.getAdapterDescriptor(adapterCode, meta(ctx, "channel.descriptor"));
  },
);

const settingsSchema = z.object({
  propertyId: z.string(),
  adapterCode: z.enum(ADAPTERS),
  settings: z.record(z.string(), z.string()),
  channelAccountId: z.string().optional(),
});
export type WizardSettings = z.infer<typeof settingsSchema>;

/** CH-3: test before creating; provider errors come back verbatim plus a likely cause. */
export const testConnectionAction = withPermission<
  [WizardSettings],
  { ok: boolean; message?: string; hint?: string }
>(
  "channel:create",
  {
    ...byProperty,
    schema: settingsSchema,
    subject: (i) => ({ kind: "channel_connection", id: `${i.propertyId}:${i.adapterCode}` }),
    redact: ["settings"],
  },
  async (ctx, input) => {
    const c = await container();
    const idMap = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).idMap(input.propertyId);
    const r = await c.provider.testConnection(
      {
        adapterCode: input.adapterCode,
        propertyId: idMap.property.remote,
        settings: input.settings,
      },
      meta(ctx, "channel.test"),
    );
    return r.ok
      ? r
      : {
          ...r,
          hint: /required|missing/i.test(r.message ?? "")
            ? "A required field is empty. Check the extranet for the exact value."
            : /invalid|auth|password|credential/i.test(r.message ?? "")
              ? "The channel rejected the credentials. Re-copy them from the extranet; passwords are case-sensitive."
              : "Check the values against the channel's extranet and try again.",
        };
  },
);

export interface BothSides {
  ours: OurRatePlan[];
  theirs: TheirRoom[];
  suggestions: Suggestion[];
  history: MappingRow[];
}

/** Step 4: both sides plus MAP-1 suggestions seeded from previously accepted mappings. */
export const loadBothSides = withPermission<[WizardSettings], BothSides>(
  "channel:read",
  { ...byProperty, schema: settingsSchema, audit: false },
  async (ctx, input) => {
    const c = await container();
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const d = await repo.get(input.propertyId);
    if (!d) throw new HttpProblem(404, "not_found", "Property not found");
    const idMap = await repo.idMap(input.propertyId);
    const options = await c.provider.readChannelMappingOptions(
      {
        adapterCode: input.adapterCode,
        propertyId: idMap.property.remote,
        settings: input.settings,
      },
      meta(ctx, "channel.mapping_details"),
    );
    const ours = ourPlans(d);
    const history = await new DrizzleChannelRepository(ctx.tx, ctx.orgId).mappingHistory(
      input.adapterCode,
      input.propertyId,
    );
    return {
      ours,
      theirs: options.rooms,
      suggestions: suggestMappings(ours, options.rooms, history),
      history,
    };
  },
);

function ourPlans(
  d: NonNullable<Awaited<ReturnType<DrizzlePropertyRepository["get"]>>>,
): OurRatePlan[] {
  return d.ratePlans.map((rp) => {
    const rt = d.roomTypes.find((r) => r.id === rp.roomTypeId)!;
    return {
      id: rp.id,
      title: rp.title,
      propertyId: d.property.id,
      roomTypeId: rt.id,
      roomTypeTitle: rt.title,
      occupancy: rt.defaultOccupancy,
      isDerived: rp.parentRatePlanId !== null,
    };
  });
}

const mappingRowSchema = z.object({
  ratePlanId: z.string(),
  roomCode: z.string(),
  rateCode: z.string(),
  occupancy: z.number().int().optional(),
  rateType: z.string().optional(),
  derivedOption: z
    .object({
      kind: z.enum(["percent", "amount"]),
      direction: z.enum(["increase", "decrease"]),
      value: z.number().int(),
    })
    .optional(),
});
const createSchema = settingsSchema.extend({ mappings: z.array(mappingRowSchema) });

/** Steps 5-6: validate (MAP-3), warn (MAP-2), create inactive (CH-4) with credentials sealed (CH-2). */
export const createConnectionAction = withPermission<
  [z.infer<typeof createSchema>],
  { connectionId: string; warnings: CoverageWarning[] }
>(
  "channel:create",
  {
    ...byProperty,
    schema: createSchema,
    subject: (i) => ({ kind: "channel_connection", id: `${i.propertyId}:${i.adapterCode}` }),
    redact: ["settings"],
  },
  async (ctx, input) => {
    const c = await container();
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const d = await repo.get(input.propertyId);
    if (!d) throw new HttpProblem(404, "not_found", "Property not found");
    const idMap = await repo.idMap(input.propertyId);
    const options = await c.provider.readChannelMappingOptions(
      {
        adapterCode: input.adapterCode,
        propertyId: idMap.property.remote,
        settings: input.settings,
      },
      meta(ctx, "channel.mapping_details"),
    );
    const ours = ourPlans(d);
    const errors = validateMappings(input.mappings, ours, input.propertyId, options.rooms);
    if (errors.length > 0)
      throw new HttpProblem(422, "mapping_invalid", errors.map((e) => e.message).join("; "));
    const warnings = coverageWarnings(ours, options.rooms, input.mappings);
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const id = Id.next();
    const secretKeys = ["password", "api_key", "token", "secret"];
    const open = Object.fromEntries(
      Object.entries(input.settings).filter(
        ([k]) => !secretKeys.some((s) => k.toLowerCase().includes(s)),
      ),
    );
    const secret = Object.fromEntries(
      Object.entries(input.settings).filter(([k]) =>
        secretKeys.some((s) => k.toLowerCase().includes(s)),
      ),
    );
    await ch.insertConnection({
      id,
      propertyId: input.propertyId,
      adapterCode: input.adapterCode,
      channelAccountId: input.channelAccountId ?? null,
      settings: open,
      settingsEnc: Object.keys(secret).length ? await c.crypto.seal(JSON.stringify(secret)) : null,
    });
    const s1 = transition("draft", "test_ok");
    const s2 = s1.ok ? transition(s1.value, "mappings_saved") : s1;
    await ch.updateConnection(id, {
      state: s2.ok ? s2.value : "draft",
      readiness: { ready: warnings.length === 0, issues: warnings.map((w) => w.message) },
    });
    await ch.replaceMappings(id, input.mappings, () => Id.next());
    revalidatePath("/channels");
    return { connectionId: id, warnings };
  },
);

/** Steps 7-8 (CH-4, CH-6): readiness then activation with the full horizon push. */
export const activateAction = withPermission<
  [{ connectionId: string }],
  { activated: boolean; issues: string[] }
>(
  "channel:activate",
  { scope: "organization", subject: (i) => ({ kind: "channel_connection", id: i.connectionId }) },
  async (ctx, { connectionId }) => {
    const c = await container();
    const r = await activateConnection(
      { provider: c.provider, clock: c.clock, log: c.log },
      ctx.orgId,
      connectionId,
      (fn) => fn(ctx.tx),
    );
    revalidatePath("/channels");
    return { activated: r.activated, issues: r.readiness.issues };
  },
);

/**
 * What the channel offers to map against. Airbnb through Channex (CH-5) has no
 * hotel-style rooms: the host's listings are the rooms and each listing is one rate.
 */
async function theirRooms(
  c: Awaited<ReturnType<typeof container>>,
  ctx: ActorCtx,
  connection: ConnectionRow,
  remotePropertyId: string,
  settings: Record<string, unknown>,
): Promise<TheirRoom[]> {
  if (
    connection.adapterCode === "AirBNB" &&
    connection.settings.managedIn === "channex" &&
    connection.channexChannelId
  ) {
    const listings = await c.provider.listChannelListings(
      { id: connection.channexChannelId },
      meta(ctx, "channel.listings"),
    );
    return listings.map((l) => ({
      code: l.id,
      title: `${l.title}${l.city ? ` · ${l.city}` : ""}`,
      rates: [
        {
          code: l.id,
          title: l.type ?? "Listing",
          ...(l.occupancies?.length ? { occupancy: Math.max(...l.occupancies) } : {}),
        },
      ],
    }));
  }
  const options = await c.provider.readChannelMappingOptions(
    { adapterCode: connection.adapterCode, propertyId: remotePropertyId, settings },
    meta(ctx, "channel.mapping_details"),
  );
  return options.rooms;
}

export interface ConnectionView {
  connection: ConnectionRow;
  mappings: MappingRow[];
  ours: OurRatePlan[];
  theirs: TheirRoom[];
  suggestions: Suggestion[];
  warnings: CoverageWarning[];
  events: ChannelEventRow[];
}

export const loadConnection = withPermission<[string], ConnectionView>(
  "channel:read",
  { scope: "organization", audit: false },
  async (ctx, id) => {
    const c = await container();
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const connection = await ch.getConnection(id);
    if (!connection) throw new HttpProblem(404, "not_found", "Connection not found");
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const d = (await repo.get(connection.propertyId))!;
    const idMap = await repo.idMap(connection.propertyId);
    const settings = {
      ...connection.settings,
      ...(connection.settingsEnc
        ? (JSON.parse(await c.crypto.open(connection.settingsEnc)) as Record<string, string>)
        : {}),
    };
    const theirs = await theirRooms(c, ctx, connection, idMap.property.remote, settings);
    const ours = ourPlans(d);
    const mappings = await ch.listMappings(id);
    return {
      connection: { ...connection, settingsEnc: null },
      mappings,
      ours,
      theirs,
      suggestions: suggestMappings(ours, theirs, mappings),
      warnings: coverageWarnings(ours, theirs, mappings),
      events: await ch.listEvents({ connectionId: id, limit: 20 }),
    };
  },
);

/** MAP-4/MAP-6: diff on a live connection, audit before/after, targeted re-push of the affected plans. */
export const saveMappingsAction = withPermission<
  [{ connectionId: string; mappings: MappingRow[] }],
  { diff: ReturnType<typeof mappingDiff>; warnings: CoverageWarning[] }
>(
  "channel:update_mapping",
  {
    scope: "organization",
    schema: z.object({ connectionId: z.string(), mappings: z.array(mappingRowSchema) }),
    subject: (i) => ({ kind: "channel_connection", id: i.connectionId }),
  },
  async (ctx, { connectionId, mappings }) => {
    const c = await container();
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const connection = await ch.getConnection(connectionId);
    if (!connection) throw new HttpProblem(404, "not_found", "Connection not found");
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const d = (await repo.get(connection.propertyId))!;
    const idMap = await repo.idMap(connection.propertyId);
    const rooms = await theirRooms(c, ctx, connection, idMap.property.remote, connection.settings);
    const ours = ourPlans(d);
    const errors = validateMappings(mappings, ours, connection.propertyId, rooms);
    if (errors.length > 0)
      throw new HttpProblem(422, "mapping_invalid", errors.map((e) => e.message).join("; "));
    const before = await ch.listMappings(connectionId);
    const diff = mappingDiff(before, mappings);
    await ch.replaceMappings(connectionId, mappings, () => Id.next());
    const warnings = coverageWarnings(ours, rooms, mappings);
    await ch.updateConnection(connectionId, {
      readiness: { ready: warnings.length === 0, issues: warnings.map((w) => w.message) },
    });
    await ctx.audit.append({
      orgId: ctx.orgId,
      actor: ctx.actor as never,
      action: "channel:update_mapping",
      subject: { kind: "channel_mapping", id: connectionId },
      before: { mappings: before },
      after: { mappings, diff },
      surface: "web",
      requestId: ctx.requestId,
      occurredAt: c.clock.now().toString(),
    });
    if (connection.state === "active")
      await queueAriPush(ctx.tx, ctx.orgId, connection.propertyId, Date.now(), "mapping.changed");
    revalidatePath(`/channels/${connectionId}`);
    return { diff, warnings };
  },
);

// ---- Airbnb (CH-5): import the host's listings as properties, match-or-create --------------

export interface ListingCandidate {
  code: string;
  title: string;
  city?: string;
  match: { propertyId: string; title: string; confidence: number } | null;
}

const IMPORT_HORIZON_DAYS = 365;
const TZ_BY_COUNTRY: Record<string, string> = {
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

async function airbnbChannelOf(ctx: ActorCtx, connectionId: string) {
  const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
  const conn = await ch.getConnection(connectionId);
  if (!conn || conn.adapterCode !== "AirBNB" || !conn.channexChannelId)
    throw new HttpProblem(404, "not_found", "Airbnb connection not found");
  const siblings = (await ch.listConnections()).filter(
    (c) => c.channexChannelId === conn.channexChannelId,
  );
  const mapped = new Set<string>();
  for (const sib of siblings) for (const m of await ch.listMappings(sib.id)) mapped.add(m.roomCode);
  return { conn, channelId: conn.channexChannelId, mapped };
}

/** The host's listings not yet mapped to a property, each with the closest property by name. */
export const importListingsPreview = withPermission<[{ connectionId: string }], ListingCandidate[]>(
  "channel_account:manage",
  { scope: "organization", audit: false, stepUp: false },
  async (ctx, { connectionId }) => {
    const c = await container();
    const { channelId, mapped } = await airbnbChannelOf(ctx, connectionId);
    const listings = await c.provider.listChannelListings(
      { id: channelId },
      meta(ctx, "airbnb.listings"),
    );
    const properties = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list();
    return listings
      .filter((l) => !mapped.has(l.id))
      .map((l) => {
        const scored = properties
          .map((p) => ({
            propertyId: p.id,
            title: p.title,
            confidence: nameSimilarity(p.title, l.title),
          }))
          .sort((a, b) => b.confidence - a.confidence);
        const best = scored[0];
        return {
          code: l.id,
          title: l.title,
          ...(l.city ? { city: l.city } : {}),
          match: best && best.confidence >= 0.5 ? best : null,
        };
      });
  },
);

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length === 0 ? 0 : s[Math.floor(s.length / 2)]!;
};
const mode = (xs: number[]) => {
  const counts = new Map<number, number>();
  for (const x of xs) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
};

/**
 * Match-or-create (CH-5): a matched listing gets a connection on that property; an unmatched
 * one becomes a property built from the listing itself — title, place, capacity, photos and
 * description as Airbnb reports them, a Standard plan at the median of the host's prices for
 * the coming year, and the host's per-day prices and minimum stays written into the calendar.
 * Availability is not copied: Airbnb's blocks are its own bookings, imported on activation.
 */
export const importListingsAction = withPermission<
  [
    {
      connectionId: string;
      decisions: Array<{ code: string; title: string; propertyId: string | null }>;
    },
  ],
  { created: number; connected: number }
>(
  "channel:create",
  {
    scope: "organization",
    subject: (i) => ({ kind: "channel_connection", id: i.connectionId }),
  },
  async (ctx, { connectionId, decisions }) => {
    const c = await container();
    const { channelId, mapped } = await airbnbChannelOf(ctx, connectionId);
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const store = new DrizzleAriStore(ctx.tx);
    const today = LocalDate.today("UTC");
    const range = { from: today.toString(), to: today.plusDays(IMPORT_HORIZON_DAYS).toString() };
    let created = 0;
    let connected = 0;
    for (const d of decisions) {
      if (mapped.has(d.code)) continue;
      let propertyId = d.propertyId;
      let calendar: Awaited<ReturnType<typeof c.provider.getChannelListingCalendar>> | null = null;
      if (!propertyId) {
        const details = await c.provider.getChannelListingDetails(
          { id: channelId },
          d.code,
          meta(ctx, `airbnb.listing:${d.code}`),
        );
        calendar = await c.provider.getChannelListingCalendar(
          { id: channelId },
          d.code,
          range,
          meta(ctx, `airbnb.calendar:${d.code}`),
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
            title: details.title || d.title,
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
                listingId: d.code,
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
        created++;
      }
      const detail = await repo.get(propertyId);
      const plan = detail?.ratePlans[0];
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
              ...(day.closedToArrival !== undefined
                ? { closedToArrival: day.closedToArrival }
                : {}),
              ...(day.closedToDeparture !== undefined
                ? { closedToDeparture: day.closedToDeparture }
                : {}),
            },
            "airbnb_import",
          );
        }
      }
      const id = Id.next();
      await ch.insertConnection({
        id,
        propertyId,
        adapterCode: "AirBNB",
        settings: { managedIn: "channex" },
      });
      await ch.updateConnection(id, { channexChannelId: channelId });
      if (plan) {
        await ch.replaceMappings(
          id,
          [{ ratePlanId: plan.id, roomCode: d.code, rateCode: d.code }],
          () => Id.next(),
        );
        await ch.updateConnection(id, { state: "mapped", readiness: { ready: true, issues: [] } });
      }
      mapped.add(d.code);
      connected++;
    }
    revalidatePath("/channels");
    revalidatePath("/properties");
    return { created, connected };
  },
);

/** Properties as import targets: id and title only. */
export const listPropertiesBrief = withPermission<[], Array<{ id: string; title: string }>>(
  "property:read",
  { scope: "organization", audit: false },
  async (ctx) =>
    (await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list()).map((p) => ({
      id: p.id,
      title: p.title,
    })),
);

// ---- connections made inside Channex (spec 07 CH-5: the channel iframe) -------------

const propertyOnly = z.object({ propertyId: z.string().uuid() });

/**
 * A one-time session for Channex's embedded channel screen, where Airbnb and
 * the OTAs that need the provider's own authorisation are connected. Without a
 * Channex key (development, tests) the screen is the in-app stand-in.
 */
export const channexScreenAction = withPermission<[{ propertyId: string }], { url: string }>(
  "channel:create",
  { ...byProperty, schema: propertyOnly, audit: false },
  async (ctx, input) => {
    const c = await container();
    const idMap = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).idMap(input.propertyId);
    const { token } = await c.provider.createChannelSession(
      idMap.property.remote,
      meta(ctx, "channel.session"),
    );
    if (!process.env.CHANNEX_API_KEY)
      return {
        url: `/api/v1/test/channex-screen?oauth_session_key=${token}&property_id=${idMap.property.remote}`,
      };
    const base = process.env.CHANNEX_ENV === "production" ? CHANNEX_PRODUCTION : CHANNEX_STAGING;
    const url = channexChannelScreenUrl(base, token, idMap.property.remote, {
      language: ctx.locale,
    });
    return { url };
  },
);

/** Mirror the connections Channex holds for a property into ChannelConnection rows so the health board and sync see them. */
export const syncConnectionsAction = withPermission<[FormData], void>(
  "channel:create",
  {
    scope: "property",
    resolveScope: (fd) => ({ kind: "property", id: String(fd.get("propertyId")) }),
    subject: (fd) => ({ kind: "channel_connection", id: `sync:${String(fd.get("propertyId"))}` }),
  },
  async (ctx, fd) => {
    const propertyId = String(fd.get("propertyId"));
    const c = await container();
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const idMap = await repo.idMap(propertyId);
    const toLocal = new Map(idMap.ratePlans.map((r) => [r.remote, r.local]));
    const remote = await c.provider.listChannels(idMap.property.remote, meta(ctx, "channel.list"));
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const existing = await ch.listConnections(propertyId);
    for (const r of remote) {
      let rowId = existing.find((e) => e.channexChannelId === r.id)?.id;
      if (!rowId) {
        rowId = Id.next();
        await ch.insertConnection({
          id: rowId,
          propertyId,
          adapterCode: r.adapterCode,
          settings: { managedIn: "channex", title: r.title },
        });
      }
      const mappings = r.mappings
        .filter((m) => toLocal.has(m.ratePlanId))
        .map((m) => ({
          ratePlanId: toLocal.get(m.ratePlanId)!,
          roomCode: m.roomCode ?? "",
          rateCode: m.rateCode ?? "",
          ...(m.occupancy !== undefined ? { occupancy: m.occupancy } : {}),
        }));
      await ch.updateConnection(rowId, {
        channexChannelId: r.id,
        state: r.isActive ? "active" : r.status === "permanent_error" ? "error" : "mapped",
        isActive: r.isActive,
        readiness: {
          ready: r.status === "active",
          issues: r.status === "active" ? [] : [`Channex reports ${r.status}`],
        },
      });
      if (mappings.length > 0) await ch.replaceMappings(rowId, mappings, () => Id.next());
    }
    revalidatePath("/channels");
    revalidatePath("/channels/connect");
  },
);
