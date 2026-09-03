import { asSystem, enqueueOutbox, markWebhook, type Db } from "@pms/db";
import type { DomainEvent } from "@pms/core";
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

/**
 * webhook.ingest: a webhook is a trigger, not truth (spec 04 §4.4). Booking
 * events queue a feed pull for the property; `ari` events queue a targeted
 * reconcile; everything else is recorded and counted (HOOK-4).
 */
export async function processWebhook(
  db: Db,
  event: DomainEvent,
  log: Logger,
): Promise<"booking" | "ari" | "message" | "review" | "other"> {
  const p = event.payload as { webhookId: string; propertyId: string; event: string };
  return asSystem(db, event.orgId, async (tx) => {
    let kind: "booking" | "ari" | "message" | "review" | "other" = "other";
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
