import { z } from "zod";
import { DrizzleChannelRepository, DrizzlePropertyRepository } from "@pms/db";
import { activateConnection, pauseConnection } from "@pms/jobs";
import type { ActorCtx } from "../with-permission";
import { container } from "../container";
import { HttpProblem } from "../errors";
import { airbnbAccount, airbnbAccounts, airbnbListings, importAirbnbListing } from "../airbnb";
import { op } from "./op";

/**
 * The channel tools (spec 04 §4.7a, spec 07 CH-5): connect an Airbnb account, see every listing
 * on it, link a listing to a property, and switch a connection on, off and on again. The same
 * code as the console's channel screens; the agent never holds the Airbnb authorisation itself,
 * which a person grants on airbnb.com.
 */

const id = z.string().min(1).max(64);

/** A connection of this property, or a 404 the model can act on: the scope is the property. */
async function connectionOf(ctx: ActorCtx, propertyId: string, connectionId: string) {
  const conn = await new DrizzleChannelRepository(ctx.tx, ctx.orgId).getConnection(connectionId);
  if (!conn || conn.propertyId !== propertyId)
    throw new HttpProblem(
      404,
      "not_found",
      "Connection not found on this property",
      "Use the id and propertyId from list_channels",
    );
  return conn;
}

const deps = async () => {
  const c = await container();
  return { provider: c.provider, clock: c.clock, log: c.log };
};

const connectionInput = {
  propertyId: id.describe("Property id the connection belongs to (from list_channels)"),
  connectionId: id.describe("Connection id from list_channels or import_airbnb_listing"),
};

export const connectAirbnb = op({
  name: "connect_airbnb",
  title: "Connect an Airbnb account",
  description:
    "Give the host the link that connects their Airbnb account. Airbnb asks the account owner to approve on airbnb.com, so the host opens the link in their browser (signed in to OTAbridge) and approves; you cannot do that step. Once approved, list_airbnb_listings shows every listing on the account. Pass propertyId to start from one property; omit it to connect for every live property. Connecting again re-authorises the same account.",
  permission: "channel:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({
    propertyId: id.optional().describe("Optional: a live property to start the connection from"),
  }),
  rest: { method: "GET", path: "/api/v1/channels/airbnb/connect-link" },
  run: async (ctx, i) => {
    const c = await container();
    const props = (await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).list()).filter(
      (p) => p.state === "live",
    );
    if (props.length === 0)
      throw new HttpProblem(
        409,
        "no_live_property",
        "Take a property live before connecting Airbnb",
      );
    if (i.propertyId && !props.some((p) => p.id === i.propertyId))
      throw new HttpProblem(404, "not_found", "No live property with this id", "Check propertyId");
    const base = c.config.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
    const query = i.propertyId ? `?propertyId=${encodeURIComponent(i.propertyId)}` : "";
    const accounts = await airbnbAccounts(ctx);
    return {
      url: `${base}/channels/airbnb/connect${query}`,
      alreadyConnected: accounts.length > 0,
      steps: [
        "Open the link in the browser where you are signed in to OTAbridge.",
        "Approve OTAbridge on airbnb.com (Airbnb shows this to the account owner only).",
        "You come back to OTAbridge; then ask me to list your Airbnb listings.",
      ],
    };
  },
});

export const listAirbnbListings = op({
  name: "list_airbnb_listings",
  title: "List Airbnb listings",
  description:
    "Every listing on the host's connected Airbnb account, linked or not: Airbnb's listing id, title and city, which OTAbridge property holds it (linkedTo, with that connection's state) and, for an unlinked one, the property whose name is closest. An unlinked listing cannot be priced from here until import_airbnb_listing links it. Reads Airbnb live.",
  permission: "channel:read",
  scope: "organization",
  write: false,
  audit: false,
  schema: z.object({
    connectionId: id
      .optional()
      .describe("Optional: an Airbnb connection id, when several Airbnb accounts are connected"),
  }),
  rest: { method: "GET", path: "/api/v1/channels/airbnb/listings" },
  run: async (ctx, i) => {
    const accounts = i.connectionId
      ? [await airbnbAccount(ctx, i.connectionId)]
      : await airbnbAccounts(ctx);
    if (accounts.length === 0)
      return {
        accounts: [],
        note: "No Airbnb account is connected; connect_airbnb gives the link.",
      };
    const out = [];
    for (const a of accounts) {
      const listings = await airbnbListings(ctx, a);
      out.push({
        connectionId: a.connectionId,
        listings,
        unlinked: listings.filter((l) => l.linkedTo.length === 0).length,
      });
    }
    return { accounts: out };
  },
});

export const importAirbnbListingOp = op({
  name: "import_airbnb_listing",
  title: "Link an Airbnb listing",
  description:
    "Link one Airbnb listing to OTAbridge so it can be priced and managed here. With no propertyId a new property is created from the listing (title, place, photos, description, capacity, and Airbnb's prices and minimum stays for the coming year); with propertyId the listing is linked to that existing property, whose own calendar is kept. A listing already linked to another property is refused. Returns the new connection; then call activate_channel with it (a new property is first set up on the channel manager, which takes about a minute).",
  permission: "channel:create",
  scope: "organization",
  // may create the property it lands on, so it cannot be scoped to one
  orgWide: true,
  write: true,
  schema: z.object({
    listingId: z.string().min(1).max(64).describe("Airbnb listing id from list_airbnb_listings"),
    propertyId: id
      .optional()
      .describe("Optional: an existing property to link it to; omit to create a new property"),
    connectionId: id
      .optional()
      .describe("Optional: the Airbnb connection id, when several Airbnb accounts are connected"),
  }),
  subject: (i) => ({ kind: "airbnb_listing", id: i.listingId }),
  rest: { method: "POST", path: "/api/v1/channels/airbnb/import", status: 201 },
  run: async (ctx, i) => {
    const account = await airbnbAccount(ctx, i.connectionId);
    const r = await importAirbnbListing(ctx, account, {
      listingId: i.listingId,
      propertyId: i.propertyId ?? null,
    });
    return {
      ...r,
      next: r.createdProperty
        ? "Call activate_channel with this propertyId and connectionId in about a minute, once the new property is set up on the channel manager."
        : "Call activate_channel with this propertyId and connectionId to start sending prices and availability to Airbnb.",
    };
  },
});

export const activateChannel = op({
  name: "activate_channel",
  title: "Activate a channel connection",
  description:
    "Switch a mapped channel connection on: its listings are linked on the channel manager, prices and availability start going out, and the channel's future reservations are imported. For Airbnb this waits up to about 45 seconds for Airbnb to confirm the link. When the property is still being set up, the answer says so: try again in a minute. Returns activated true, or the issues to fix.",
  permission: "channel:activate",
  scope: "property",
  write: true,
  schema: z.object(connectionInput),
  resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
  subject: (i) => ({ kind: "channel_connection", id: i.connectionId }),
  rest: { method: "POST", path: "/api/v1/channels/{id}/activate", idKey: "connectionId" },
  run: async (ctx, i) => {
    const conn = await connectionOf(ctx, i.propertyId, i.connectionId);
    if (conn.state === "active")
      return { activated: true, state: conn.state, issues: [], note: "Already active." };
    const detail = await new DrizzlePropertyRepository(ctx.tx, ctx.orgId).get(i.propertyId);
    const mapped = await new DrizzleChannelRepository(ctx.tx, ctx.orgId).listMappings(conn.id);
    const plans = new Map<string, string | null>(
      detail?.ratePlans.map((p) => [p.id, p.channexRatePlanId]) ?? [],
    );
    if (!detail?.property.channexPropertyId || mapped.some((m) => !plans.get(m.ratePlanId)))
      return {
        activated: false,
        state: conn.state,
        issues: [
          "The property is still being set up on the channel manager; try again in a minute.",
        ],
      };
    try {
      const r = await activateConnection(await deps(), ctx.orgId, conn.id, (fn) => fn(ctx.tx));
      return {
        activated: r.activated,
        state: r.activated ? "active" : conn.state,
        issues: r.readiness.issues,
      };
    } catch (e) {
      // the provider's refusal is the answer the host needs, as on the console's channel screen
      const message = e instanceof Error ? e.message : String(e);
      await new DrizzleChannelRepository(ctx.tx, ctx.orgId).updateConnection(conn.id, {
        lastError: message,
      });
      return { activated: false, state: conn.state, issues: [message] };
    }
  },
});

export const pauseChannel = op({
  name: "pause_channel",
  title: "Pause a channel connection",
  description:
    "Stop sending prices and availability to one channel for one property, keeping the connection and its mapping. For Airbnb the listing is unlinked on the channel manager and the Airbnb account stays connected for the other properties. Undo with resume_channel.",
  permission: "channel:deactivate",
  scope: "property",
  write: true,
  schema: z.object(connectionInput),
  resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
  subject: (i) => ({ kind: "channel_connection", id: i.connectionId }),
  rest: { method: "POST", path: "/api/v1/channels/{id}/pause", idKey: "connectionId" },
  run: async (ctx, i) => {
    const conn = await connectionOf(ctx, i.propertyId, i.connectionId);
    try {
      await pauseConnection(await deps(), ctx.orgId, conn.id, true, (fn) => fn(ctx.tx));
    } catch (e) {
      throw new HttpProblem(409, "channel_refused", e instanceof Error ? e.message : String(e));
    }
    return { paused: true, connectionId: conn.id, state: "paused" };
  },
});

export const resumeChannel = op({
  name: "resume_channel",
  title: "Resume a channel connection",
  description:
    "Switch a paused channel connection back on: the listing is linked again and every night is re-sent to the channel. Refused when another property has linked the same Airbnb listing meanwhile.",
  permission: "channel:activate",
  scope: "property",
  write: true,
  schema: z.object(connectionInput),
  resolveScope: (i) => ({ kind: "property", id: i.propertyId }),
  subject: (i) => ({ kind: "channel_connection", id: i.connectionId }),
  rest: { method: "POST", path: "/api/v1/channels/{id}/resume", idKey: "connectionId" },
  run: async (ctx, i) => {
    const conn = await connectionOf(ctx, i.propertyId, i.connectionId);
    try {
      await pauseConnection(await deps(), ctx.orgId, conn.id, false, (fn) => fn(ctx.tx));
    } catch (e) {
      throw new HttpProblem(409, "channel_refused", e instanceof Error ? e.message : String(e));
    }
    return { resumed: true, connectionId: conn.id, state: "active" };
  },
});
