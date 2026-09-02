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
} from "@pms/core";
import {
  DrizzleChannelRepository,
  DrizzlePropertyRepository,
  type ChannelAccountRow,
  type ChannelEventRow,
  type ConnectionRow,
} from "@pms/db";
import { activateConnection, pauseConnection, queueAriPush } from "@pms/jobs";
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
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    const conn = await ch.getConnection(String(fd.get("connectionId")));
    if (!conn) throw new HttpProblem(404, "not_found", "Connection not found");
    if (conn.channexChannelId)
      await c.provider.setChannelActive(
        { id: conn.channexChannelId },
        false,
        meta(ctx, "channel.remove"),
      );
    await ch.removeConnection(conn.id);
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
    const options = await c.provider.readChannelMappingOptions(
      { adapterCode: connection.adapterCode, propertyId: idMap.property.remote, settings },
      meta(ctx, "channel.mapping_details"),
    );
    const ours = ourPlans(d);
    const mappings = await ch.listMappings(id);
    return {
      connection: { ...connection, settingsEnc: null },
      mappings,
      ours,
      theirs: options.rooms,
      suggestions: suggestMappings(ours, options.rooms, mappings),
      warnings: coverageWarnings(ours, options.rooms, mappings),
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
    const options = await c.provider.readChannelMappingOptions(
      {
        adapterCode: connection.adapterCode,
        propertyId: idMap.property.remote,
        settings: connection.settings,
      },
      meta(ctx, "channel.mapping_details"),
    );
    const ours = ourPlans(d);
    const errors = validateMappings(mappings, ours, connection.propertyId, options.rooms);
    if (errors.length > 0)
      throw new HttpProblem(422, "mapping_invalid", errors.map((e) => e.message).join("; "));
    const before = await ch.listMappings(connectionId);
    const diff = mappingDiff(before, mappings);
    await ch.replaceMappings(connectionId, mappings, () => Id.next());
    const warnings = coverageWarnings(ours, options.rooms, mappings);
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

// ---- Airbnb (CH-5): org-level account, bulk listing import, match-or-create ----------------

export interface ListingCandidate {
  code: string;
  title: string;
  match: { propertyId: string; title: string; confidence: number } | null;
}

export const importListingsPreview = withPermission<[{ accountId: string }], ListingCandidate[]>(
  "channel_account:manage",
  { scope: "organization", audit: false },
  async (ctx, { accountId }) => {
    const c = await container();
    const listings = await c.provider.readChannelMappingOptions(
      { adapterCode: "AirBNB", propertyId: "", settings: { account_id: accountId } },
      meta(ctx, "airbnb.listings"),
    );
    const properties = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list();
    return listings.rooms.map((room) => {
      const scored = properties
        .map((p) => ({
          propertyId: p.id,
          title: p.title,
          confidence: nameSimilarity(p.title, room.title),
        }))
        .sort((a, b) => b.confidence - a.confidence);
      const best = scored[0];
      return {
        code: room.code,
        title: room.title,
        match: best && best.confidence >= 0.5 ? best : null,
      };
    });
  },
);

/** Match-or-create: matched listings get a draft connection on the property; unmatched become single_unit properties first. */
export const importListingsAction = withPermission<
  [
    {
      accountId: string;
      decisions: Array<{ code: string; title: string; propertyId: string | null }>;
    },
  ],
  { created: number; connected: number }
>(
  "channel:create",
  { scope: "organization", subject: (i) => ({ kind: "channel_account", id: i.accountId }) },
  async (ctx, { accountId, decisions }) => {
    const c = await container();
    const repo = new DrizzlePropertyRepository(ctx.tx, ctx.orgId);
    const ch = new DrizzleChannelRepository(ctx.tx, ctx.orgId);
    let created = 0;
    let connected = 0;
    for (const d of decisions) {
      let propertyId = d.propertyId;
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
          { title: d.title, kind: "single_unit", currency: "EUR", timezone: "UTC" },
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
      const id = Id.next();
      await ch.insertConnection({
        id,
        propertyId,
        adapterCode: "AirBNB",
        channelAccountId: accountId,
        settings: { listing_id: d.code, account_id: accountId },
      });
      const plan = (await repo.get(propertyId))?.ratePlans[0];
      if (plan) {
        await ch.updateConnection(id, { state: "mapped", readiness: { ready: true, issues: [] } });
        await ch.replaceMappings(
          id,
          [{ ratePlanId: plan.id, roomCode: d.code, rateCode: "RP1" }],
          () => Id.next(),
        );
      }
      connected++;
    }
    revalidatePath("/channels");
    revalidatePath("/properties");
    return { created, connected };
  },
);
