# Runbook: Provider 429 storm

**Symptom.** `provider_429_last24h` spikes; pushes fail with `ThrottleError`; the adaptive limiter halves the rate.

**How to confirm.** Fleet health → 429s; **Sync inspector** operations with `last_error` containing 429. Circuit breaker state per org in the worker log (`breaker.open`).

**Blast radius.** Pushes are delayed, not lost: cells stay `pending` and retry. Bookings and acks keep flowing on their own lanes.

**Immediate mitigation.** Nothing destructive. Let the limiter back off. If a bulk operation caused it, stop the bulk (it is resumable). Do not restart the worker repeatedly: it resets the limiter.

**Root cause.** A bulk update over a large horizon, a reconcile after an outage, or a provider-side limit change. Reduce concurrency (`WORKER_CONCURRENCY`) if it recurs.

**Who to tell.** Channex support if limits changed; the revenue manager who launched the bulk.
