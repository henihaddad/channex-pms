# Runbook: Webhook endpoint down

**Symptom.** No inbound webhooks for minutes while the provider is up; `/webhooks/channex/<token>` returns 5xx or the host is unreachable.

**How to confirm.** `curl -X POST https://<host>/webhooks/channex/<token>` from outside; check Caddy and the web container logs; Fleet health webhook lag.

**Blast radius.** Bookings arrive late (the 60-second poll reconciler catches them, HOOK-6) and ARI refreshes are missed.

**Immediate mitigation.** Restore the web service; the provider retries and `booking.poll` fills gaps. Replay any webhook stuck in `failed` from the explorer.

**Root cause.** TLS certificate expiry (Caddy logs), a deploy that did not come up, or a rotated webhook token not registered at the provider (re-run provisioning for the property).

**Who to tell.** The on-call engineer; tenants only if the outage exceeds the poll window.
