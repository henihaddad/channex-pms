# ADR-0012: The jobs Worker runs next to the database

**Status:** accepted (2026-11-23; complements ADR-0009)

## Context

The job worker (`apps/worker-cf`, `otabridge-jobs`) runs on Cloudflare: a one-minute Cron Trigger
and ten Queues consumers. Every job is a series of statements against Neon in AWS us-east-2 (Ohio),
through Hyperdrive. Cloudflare starts cron and queue invocations wherever it likes: in the hour
before this change most ran in San Jose, Los Angeles, Seattle, Denver and Dallas, with a median
wall time of 2.4 to 4 seconds per invocation and a p90 of 7 to 25 seconds. The few that ran in
Columbus, next to the database, took about 0.12 seconds.

Cloudflare's Placement Hints (`placement.region`) run a Worker in the data center with the lowest
latency to a named cloud region, but only for `fetch` invocations; cron and queue handlers are not
moved (docs: workers/configuration/placement, "Review limitations"). ADR-0009 had found Smart
Placement worse for the web app; an explicit region was not available then.

## Decision

1. `otabridge-jobs` sets `placement.region = "aws:us-east-2"` and binds itself as `SELF`.
2. The cron and queue handlers keep the schedule, delivery, acknowledgement and retries, and hand
   the work to the same Worker's `fetch` handler through `SELF`: `POST /internal/tick` for the
   minute tick and `POST /internal/job` for each queued job (`{ queue, name, data, id }` in,
   `{ delayMs? }` out, 500 with the error to retry). Those calls are placed.
3. The internal endpoints require the Worker's `OUTBOX_KICK_SECRET` in `x-otabridge-internal`
   (the Worker also answers on workers.dev). Without the binding or the secret (local `wrangler dev`,
   tests) the handlers run the work inline, as before.

## Consequences

- Measured right after the deploy with `wrangler tail`: a single job now takes 0.12 to 0.16 s, a
  booking revision about 0.4 s, the minute tick about 0.8 s. A queue invocation's own wall time is
  the sum of its batch (up to 5 jobs run one after another), so the per-colo analytics of the queue
  handler still read 2 to 2.5 s for a full batch; the placed work itself is reported under the
  data center near Ohio (Chicago).
- One extra in-process hop per job, no extra cost (service bindings are free) and no change to the
  shared runtime in `@pms/jobs`.
- The web app is unaffected and stays on Vercel next to the database (ADR-0009). Its Cloudflare
  copy can take the same hint; measured from Ohio it changes nothing (requests already run there),
  and it would matter for visitors whose nearest data center is far from Ohio.
