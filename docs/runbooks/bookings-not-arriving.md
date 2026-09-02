# Runbook: Bookings not arriving

**Symptom.** A property manager reports a booking visible on the OTA extranet that is not in the PMS; `booking.poll` finds nothing; webhook lag grows.

**How to confirm.** Operator console **Webhook explorer**: is the `booking` webhook arriving (state `received` → `processed`)? **Fleet health**: webhook lag and `webhooks_pending`. **Sync inspector → unacked**: revisions received but not acknowledged.

**Blast radius.** A lost booking is the one thing the system must never do (NFR-1). Until fixed, the property may double-sell the night.

**Immediate mitigation.** Run `booking.poll` (operator **Jobs**) to pull the feed; ingestion is idempotent (BK-1). Replay the webhook from the explorer if it is stuck in `failed`. If the property is unmapped, resolve it in **Reservations → unmapped**.

**Root cause.** Webhook endpoint down (see `webhook-endpoint-down`), wrong webhook token after a rotation, provider outage, or a revision rejected by the projection (check `inbound_webhook.last_error`).

**Who to tell.** The property manager; the on-call engineer if any revision is older than 15 minutes without an ack.
