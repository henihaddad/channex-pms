# ADR-0008: Cloudflare Workers as the hosted deployment target

**Status:** accepted (2026-09-02, post v1.0)

## Context

v1.0 ships as two Node processes (`apps/web` on Next.js, `apps/worker` on BullMQ) plus Postgres,
Redis and MinIO, packaged by `compose.selfhost.yml`. The hosted service (spec 12) needs a
deployment that is cheap to run at zero tenants, scales without a fleet to patch, and keeps the
same code paths the self-hosted build uses. Cloudflare was chosen for the marketing site and the
domain; the question was whether the product could run there without forking it.

Three things did not fit Workers as written: native modules (`@node-rs/argon2`), process-bound
libraries (`pino`, `ioredis`, BullMQ) and the in-process database (`@electric-sql/pglite`). Two
Workers rules shape the rest: a socket cannot be shared across requests, and there is no
long-running process, so no poll loop, no `setInterval`, no Redis lease.

## Decision

1. **Same code, two adapters.** The web app is the Next.js app built by
   `@opennextjs/cloudflare` (`apps/web/open-next.config.ts`, `wrangler.jsonc`). The worker is a
   second, thin entry point, `apps/worker-cf`, over the shared job runtime that this port moved
   into `packages/jobs/src/worker`: the processors, the `system` job table and the schedule are
   one implementation; `apps/worker` adapts them to BullMQ, `apps/worker-cf` to Cloudflare
   Queues and Cron Triggers. Rule 3 of spec 14 §14.3 holds: the worker is a separate Worker.
2. **Postgres is Neon behind Hyperdrive.** D1 was rejected: the schema relies on row-level
   security, triggers, `jsonb` and exclusion constraints. `packages/db` opens one `pg` client
   per transaction when `DATABASE_PER_REQUEST=1` (`PerRequestPool`); Hyperdrive holds the real
   pool next to the origin. Migrations run from CI or a laptop with `db:migrate:neon`, which
   speaks the wire protocol over a WebSocket, because the Workers themselves never migrate
   (spec 14 §14.7).
3. **Shims, not forks.** `@pms/runtime/shims/*` replace `@node-rs/argon2` (pure-JS Argon2id from
   `@noble/hashes`, PHC-compatible with the native hashes), `pino` (JSON lines to `console`, same
   redaction list) and stub PGlite and ioredis. Next's Turbopack aliases them when
   `PMS_TARGET=cloudflare`; wrangler's `alias` does the same for the worker. Nothing in
   `packages/core` or the domain services changed.
4. **Outbox without a poller.** Every request chokepoint (`withPermission`, `publicRoute`,
   `publicAction`, `withGuestSession`, `withOperator`) hands `drainOutbox` to `waitUntil` after
   its transaction committed, publishing straight to the Queue bindings. The worker's minute tick
   drains again as the safety net; `FOR UPDATE SKIP LOCKED` makes the overlap harmless.
5. **One cron, a table of schedules.** Workers allow few Cron Triggers, so the worker has one
   (`* * * * *`) and `dueJobs()` in `packages/jobs` decides what is due from the same schedule
   table BullMQ uses. Jobs scheduled more often than a minute run once a minute. Each due job is
   its own `system` message, so it gets Queues retries, a dead-letter queue and the 15-minute
   consumer budget.
6. **Per-property lease in a Durable Object** (`PropertyLease`), replacing Redis `SET NX`. The
   token bucket and circuit breaker stay in memory per isolate, conservative by construction; a
   Durable Object for them is a follow-up if 429s show up in Sync Health.
7. **Mail over HTTPS.** `MAIL_TRANSPORT=resend` adds a `fetch`-based transport with the same
   `Mailer` port; without a key the console transport logs, as before.
8. **Realtime degrades to polling.** Without Redis the calendar's SSE endpoint polls every 2 s,
   which spec 04 §4.5 already allows.

## Consequences

- Self-hosting is untouched: `compose.selfhost.yml`, `apps/worker` and PGlite development all
  work as in v1.0. The hosted build is `pnpm --filter @pms/web build:cf` and
  `wrangler deploy` in both apps; `.github/workflows/deploy-cloudflare.yml` does it on `main`
  when the secrets exist.
- Cloudflare Queues are at-least-once with no dedupe; the dedupe keys ride along in the envelope
  and every consumer was already idempotent (`processed_event`), so duplicates are the normal
  case they were designed for.
- The FakeProvider and the test-hook mail store are per isolate. The end-to-end suite therefore
  runs against a single local `wrangler dev` (workerd against PGlite over the wire protocol) as
  the runtime gate; against the deployment only a smoke subset is meaningful.
- Argon2id in pure JS costs a few hundred milliseconds of CPU per login on Workers, well inside
  the budget; the parameters (spec 13 §13.5) did not change.
- `wrangler dev` presents requests under the configured custom domain; local runs pass
  `--host localhost:8787` (one hostname for cookies and redirects) so server-action redirects
  resolve locally.
