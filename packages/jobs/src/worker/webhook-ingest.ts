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
import { describeChannelEvent, Id, type DomainEvent } from "@pms/core";
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
    } else if (REMOVAL_EVENTS.has(p.event)) {
      // the one webhook whose payload is the news: the date, and which connection
      kind = "warning";
      await recordRemovalWarning(tx, event.orgId, p);
    } else if (p.event === "review") {
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
