# Plugins

Plugins run **out of process** as signed webhooks (spec 12 §12.7, ADR-0004). The platform
never loads third-party code; it delivers events to an endpoint you run, signed with a secret
shown once at install, with timeouts, retries, a per-plugin circuit breaker and a rate limit.
A misbehaving plugin cannot delay an ARI push or a booking acknowledgement: deliveries read the
outbox through their own cursor and never sit on a connectivity queue.

## Extension points (v1)

| Point               | How                                                                                                    |
| ------------------- | ------------------------------------------------------------------------------------------------------ |
| Event subscriber    | Receive domain events (`booking.revision_applied`, `ari.changed`, `thread.close`, `payout.execute`, …) |
| Notification sink   | Same delivery, aimed at chat or paging tools                                                           |
| Report definition   | Register a report by posting its CSV back through the public API                                       |
| Webhook transformer | Receive an inbound provider webhook copy and post a normalised event back                              |

Scheduled jobs, provider implementations and settings pages stay in-repo until the registry
and sandboxed workers land (post-v1).

## Manifest

```json
{
  "key": "slack-notify",
  "name": "Slack notifications",
  "version": "1.0.0",
  "events": ["booking.revision_applied", "alert.raised"],
  "extensionPoints": ["notification_sink"],
  "permissions": ["read:booking_references"],
  "compatibleCore": ">=1.0.0 <2"
}
```

Serve it at `<endpoint>/manifest`, or paste it at install time. The install screen shows the
permissions requested before anything is enabled.

## Delivery

`POST <endpoint>` with `content-type: application/json` and headers `x-pms-signature`
(`v1=<hex hmac-sha256>` over `v1.<timestamp>.<body>`), `x-pms-timestamp` (unix seconds),
`x-pms-delivery`, `x-pms-event`. Reply 2xx within five seconds. Non-2xx and timeouts retry
with exponential backoff (1, 2, 4, 8, 16 minutes) up to five attempts; five consecutive
failures open the breaker for five minutes.

Verify with `@channex-pms/sdk`:

```ts
import { verifyPluginDelivery } from "@channex-pms/sdk";
const ok = await verifyPluginDelivery({ secret, body, signature, timestamp });
```

## Reference plugins

`plugins/accounting-csv` and `plugins/slack-notify` are dependency-free Node servers you can run
as-is or copy. Both are Apache-2.0.
