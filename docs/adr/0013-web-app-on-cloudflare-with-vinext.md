# ADR-0013: The hosted web app runs on Cloudflare Workers, built with vinext

**Status:** accepted (2026-11-26, supersedes the web-app placement of ADR-0009 and the OpenNext
build of ADR-0008)

## Context

ADR-0009 moved the web app from Cloudflare (OpenNext) to Vercel because the Workers deployment
was slow. Of the reasons it measured, two came from the build: a cold isolate spent 250 to 500 ms
of CPU evaluating OpenNext's bundle of the Next.js server (34 MB, 6.9 MB gzipped), and Cloudflare
started most requests on fresh isolates far from the database. The third reason, about thirty
statements per page through Hyperdrive, came from where the code runs.

Two things changed since then. vinext, Cloudflare's reimplementation of the Next.js API on Vite,
reports the app 100% compatible (`vinext check`: App Router, route handlers, Server Actions, the
proxy, next-intl) and builds it to a 4 MB Worker (1 MB gzipped) in about 25 seconds. Placement
Hints (`placement.region`, ADR-0012) now run a Worker's `fetch` in the data center closest to a
named cloud region. The host chose to run the whole service on Cloudflare again.

## Decision

1. `apps/web` is built for production with vinext (`vite.config.mts`, `pnpm build:cf`) and
   deployed as the Worker `otabridge-app` (`wrangler.jsonc`), placed at `aws:us-east-2` next to
   Neon, on the custom domain `app.otabridge.com`. The OpenNext build is removed.
2. `next dev` and `next build` stay the local, test and end-to-end builds; the app code is the
   same for both. The one runtime seam is `cfContext()` (`src/server/cf-context.ts`): the Worker
   entry `vinext/worker.ts` keeps each request's bindings and execution context in an
   `AsyncLocalStorage` and publishes it on `globalThis`; under Node it is absent and the app
   uses `DATABASE_URL`, a pooled `pg` connection and the outbox kick over HTTP.
3. Native and process-bound modules (Argon2, pino, PGlite, ioredis) are swapped for the
   `@pms/runtime` shims by Vite aliases, as they were for OpenNext.
4. `.github/workflows/deploy-cloudflare.yml` builds and deploys the web app and the jobs Worker
   from `main` once CI is green. The Vercel project remains as a fallback but no longer serves
   the domain; its secrets are not needed for production.

## Consequences

- One host for the hosted service: web app, jobs, queues, landing page and DNS on Cloudflare.
- The database is still one network hop away from the Worker (about 15 ms from the placed data
  center to Neon, against 1 to 2 ms from inside AWS), and the per-request connection runs a
  page's statements one after another. Pages that issue many statements stay slower than they
  were on Vercel until they issue fewer; that is the next performance lever.
- Moving to vinext surfaced a bug in the per-request pool (`packages/db/src/client.ts`): a
  transaction that waited for the shared connection did not cancel the idle close armed by the
  transaction before it, so a queued transaction longer than 300 ms lost its connection
  ("Client was closed and is not queryable"). The storefront's parallel per-organization
  searches hit it. Fixed, with an integration test.
- vinext needs React 19.3.1 or later and `@cloudflare/vite-plugin` needs Wrangler 4.164 or
  later in `apps/web`. vinext classifies routes by static analysis; every route is dynamic here
  and no response cache is configured.
- Self-hosting is untouched: `compose.selfhost.yml` and the Node build remain the reference.
