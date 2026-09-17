import {
  asSystem,
  DrizzleChannelRepository,
  enqueueOutbox,
  markWebhook,
  rawRows,
  readInboundWebhook,
  sql,
  type Db,
} from "@pms/db";
import { describeChannelEvent, Id, transition, type DomainEvent } from "@pms/core";
import type { Logger } from "@pms/runtime";

const BOOKING_EVENTS = new Set([
  "booking",
  "booking_new",
  "booking_modification",
  "booking_cancellation",
  "booking_unmapped_room",
  "booking_unmapped_rate",
  "non_acked_booking",
]);

/** Airbnb booking requests and their outcomes (docs: Webhook Collection). */
const REQUEST_EVENTS = new Set([
  "inquiry",
  "reservation_request",
  "alteration_request",
  "accepted_reservation",
  "declined_reservation",
]);

/** The provider changed a connection's state, or a sync at the channel failed (docs: Webhook Collection). */
const CHANNEL_STATE_EVENTS = new Set([
  "activate_channel",
  "deactivate_channel",
  "disconnect_channel",
  "disconnect_listing",
  "sync_error",
  "sync_warning",
  "rate_error",
]);

/** A sync outcome reported by the channel, kept as an event for the health board (spec 05 §5.5.3). */
const SYNC_EVENTS = new Set(["sync_error", "sync_warning", "rate_error"]);

/** Channex deletes inactive connections and channel-less properties; it warns 30/7/1 days ahead (docs: Webhook Collection). */
const REMOVAL_EVENTS = new Set(["channel_removal_warning", "property_removal_warning"]);

/**
 * webhook.ingest: a webhook is a trigger, not truth (spec 04 §4.4). Booking
 * events queue a feed pull for the property; `ari` events queue a targeted
 * reconcile; everything else is recorded and counted (HOOK-4).
 */
export async function processWebhook(
  db: Db,
  event: DomainEvent,
  log: Logger,
): Promise<"booking" | "ari" | "message" | "review" | "request" | "warning" | "other"> {
  const p = event.payload as { webhookId: string; propertyId: string; event: string };
  return asSystem(db, event.orgId, async (tx) => {
    let kind: "booking" | "ari" | "message" | "review" | "request" | "warning" | "other" = "other";
    if (BOOKING_EVENTS.has(p.event)) {
      kind = "booking";
      await enqueueOutbox(tx, {
        type: "booking.pull",
        orgId: event.orgId,
        aggregate: { kind: "property", id: p.propertyId as DomainEvent["aggregate"]["id"] },
        payload: { orgId: event.orgId, propertyId: p.propertyId, reason: "webhook" },
        occurredAt: event.occurredAt,
        dedupeKey: `booking.pull:${p.propertyId}:${String(Math.floor(Date.parse(event.occurredAt) / 5000))}`,
      });
    } else if (p.event === "ari") {
      kind = "ari";
      await enqueueOutbox(tx, {
        type: "ari.reconcile",
        orgId: event.orgId,
        aggregate: { kind: "property", id: p.propertyId as DomainEvent["aggregate"]["id"] },
        payload: { orgId: event.orgId, propertyId: p.propertyId, reason: "webhook" },
        occurredAt: event.occurredAt,
        dedupeKey: `ari.reconcile:${p.propertyId}:${String(Math.floor(Date.parse(event.occurredAt) / 60000))}`,
      });
    } else if (p.event === "message") {
      // CXMSG-2: the webhook triggers a thread pull; the 2-minute poll makes it exact
      kind = "message";
      await enqueueOutbox(tx, {
        type: "message.sync",
        orgId: event.orgId,
        aggregate: { kind: "property", id: p.propertyId as DomainEvent["aggregate"]["id"] },
        payload: { orgId: event.orgId, propertyId: p.propertyId, reason: "webhook" },
        occurredAt: event.occurredAt,
        dedupeKey: `message.sync:${p.propertyId}:${String(Math.floor(Date.parse(event.occurredAt) / 5000))}`,
      });
    } else if (REQUEST_EVENTS.has(p.event)) {
      kind = "request";
      await enqueueOutbox(tx, {
        type: "requests.sync",
        orgId: event.orgId,
        aggregate: { kind: "property", id: p.propertyId as DomainEvent["aggregate"]["id"] },
        payload: { orgId: event.orgId, propertyId: p.propertyId, reason: "webhook" },
        occurredAt: event.occurredAt,
        dedupeKey: `requests.sync:${p.propertyId}:${String(Math.floor(Date.parse(event.occurredAt) / 5000))}`,
      });
    } else if (CHANNEL_STATE_EVENTS.has(p.event)) {
      kind = "warning";
      await recordChannelStateEvent(tx, event.orgId, p);
    } else if (REMOVAL_EVENTS.has(p.event)) {
      // the one webhook whose payload is the news: the date, and which connection
      kind = "warning";
      await recordRemovalWarning(tx, event.orgId, p);
    } else if (p.event === "review" || p.event === "updated_review") {
      // `updated_review`: guest feedback revealed, or our reply confirmed or refused (docs)
      kind = "review";
      await enqueueOutbox(tx, {
        type: "review.sync",
        orgId: event.orgId,
        aggregate: { kind: "property", id: p.propertyId as DomainEvent["aggregate"]["id"] },
        payload: { orgId: event.orgId, propertyId: p.propertyId, reason: "webhook" },
        occurredAt: event.occurredAt,
        dedupeKey: `review.sync:${p.propertyId}:${String(Math.floor(Date.parse(event.occurredAt) / 60000))}`,
      });
    }
    await markWebhook(tx, p.webhookId, "processed");
    log.debug({ event: p.event, propertyId: p.propertyId, kind }, "webhook.ingest");
    return kind;
  });
}

async function recordRemovalWarning(
  tx: Parameters<typeof readInboundWebhook>[0],
  orgId: string,
  p: { webhookId: string; propertyId: string; event: string },
): Promise<void> {
  const stored = await readInboundWebhook(tx, p.webhookId);
  const body = (stored?.payload.payload ?? {}) as Record<string, unknown>;
  const removalDate = typeof body.removal_date === "string" ? body.removal_date : null;
  const ch = new DrizzleChannelRepository(tx, orgId);
  const [prop] = await rawRows<{ title: string }>(
    tx,
    sql`select title from property where id = ${p.propertyId}`,
  );
  const channelId = typeof body.channel_id === "string" ? body.channel_id : null;
  const conn = channelId
    ? (await ch.listConnections(p.propertyId)).find((c) => c.channexChannelId === channelId)
    : undefined;
  if (p.event === "channel_removal_warning") {
    if (conn) await ch.updateConnection(conn.id, { expectedRemovalDate: removalDate });
  } else {
    await tx.execute(
      sql`update property set expected_removal_date = ${removalDate} where id = ${p.propertyId}`,
    );
  }
  const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const alert = describeChannelEvent(p.event, {
    propertyTitle: prop?.title ?? text(body.property_name) ?? "",
    channelTitle: text(body.channel_name) ?? text(body.channel) ?? conn?.adapterCode ?? "Channex",
    ...(removalDate ? { deadline: removalDate } : {}),
  });
  await ch.insertEvent({
    id: Id.next(),
    connectionId: conn?.id ?? null,
    propertyId: p.propertyId,
    type: p.event,
    severity: alert.severity,
    message: `${alert.title}. ${alert.consequence} ${alert.action}`,
    payload: { removalDate, daysLeft: body.days_left ?? null, channelId },
  });
}

/**
 * `activate_channel` / `deactivate_channel`: the connection's state as the provider now holds it
 * (spec 05 §5.5: refresh the state, audit who changed it). `sync_error`: a channel-side rejection,
 * kept as an event so the health board names it.
 */
async function recordChannelStateEvent(
  tx: Parameters<typeof readInboundWebhook>[0],
  orgId: string,
  p: { webhookId: string; propertyId: string; event: string },
): Promise<void> {
  const stored = await readInboundWebhook(tx, p.webhookId);
  const body = (stored?.payload.payload ?? {}) as Record<string, unknown>;
  const text = (v: unknown): string | null => (typeof v === "string" && v !== "" ? v : null);
  const ch = new DrizzleChannelRepository(tx, orgId);
  const channelId = text(body.channel_id);
  const conn = channelId
    ? (await ch.listConnections(p.propertyId)).find((c) => c.channexChannelId === channelId)
    : undefined;
  if (!conn) return;
  const ctx = {
    propertyTitle: conn.propertyTitle,
    channelTitle: text(body.channel_name) ?? text(body.title) ?? conn.adapterCode,
  };
  if (SYNC_EVENTS.has(p.event)) {
    // the docs give no payload example for sync_warning and rate_error: the same fields are read as
    // for sync_error and missing ones stay null
    const detail = text(body.error_type) ?? text(body.message) ?? text(body.error);
    const alert = describeChannelEvent(p.event, { ...ctx, ...(detail ? { detail } : {}) });
    await ch.insertEvent({
      id: Id.next(),
      connectionId: conn.id,
      propertyId: p.propertyId,
      type: p.event,
      severity: alert.severity,
      message: `${alert.title}. ${alert.consequence} ${alert.action}`,
      payload: { errorType: body.error_type ?? null, logId: body.log_id ?? null },
    });
    return;
  }
  if (
    p.event === "deactivate_channel" ||
    p.event === "disconnect_channel" ||
    p.event === "disconnect_listing"
  ) {
    // deactivate_channel echoes our own pause/remove; disconnect_* is always the provider's doing
    // (an automatic rule or a user in Channex) and a P1 (spec 05 §5.5.3)
    if (p.event === "deactivate_channel" && !conn.isActive && conn.state !== "active") return;
    const type = p.event === "deactivate_channel" ? "disconnect_channel" : p.event;
    const alert = describeChannelEvent(type, ctx);
    const next = transition(conn.state, "provider_error");
    await ch.updateConnection(conn.id, {
      isActive: false,
      ...(next.ok ? { state: next.value } : {}),
      lastError:
        p.event === "disconnect_listing"
          ? "Listing disconnected on Airbnb"
          : "Deactivated on the channel manager",
    });
    await ch.insertEvent({
      id: Id.next(),
      connectionId: conn.id,
      propertyId: p.propertyId,
      type,
      severity: alert.severity,
      message: `${alert.title}. ${alert.consequence} ${alert.action}`,
      payload: { source: "webhook", event: p.event, listingId: body.listing_id ?? null },
    });
    return;
  }
  // activate_channel: the provider switched it on (from its own screen, or our activation echoed)
  if (!conn.isActive) {
    const next = transition(conn.state, conn.state === "paused" ? "resumed" : "recovered");
    await ch.updateConnection(conn.id, {
      isActive: true,
      ...(next.ok ? { state: next.value } : {}),
      lastError: null,
    });
  }
}
