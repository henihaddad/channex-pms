# 14 — Technology Stack

**Status:** `accepted` (2026-08-21) — supersedes the earlier NestJS recommendation.

## 14.1 Decision

**Full-stack Next.js (App Router) + a separate plain-Node worker process,
TypeScript throughout, PostgreSQL + Redis.**

No NestJS. No separate API application in v1.

```
apps/
  web/       Next.js — staff console, booking engine, guest portal,
             owner portal, webhook receiver, public REST API v1
  worker/    plain Node + BullMQ — sync engine, ingestion, automation,
             rollups, night audit
packages/
  core/      ALL domain logic, framework-free
  ...
```

## 14.2 Why Nest is not necessary here

NestJS earns its weight when you have a large public REST surface, many
contributors needing enforced structure, and a team that wants DI. What it
actually provides that we need:

| Nest feature | Do we need it? | Cheaper substitute |
|---|---|---|
| Module system for boundaries | Yes | `packages/*` + an ESLint import-boundary rule. Enforced identically, zero runtime cost. |
| Guards for per-route permissions | **Critically** (RBAC-1) | A single `withPermission()` wrapper — §14.4. Better, actually: it covers Server Actions too, which Nest guards never would. |
| DI for the provider ports | Not really | A typed container built at boot (~40 lines). We have ~8 ports, not 80. |
| Decorator-driven OpenAPI | Yes, by v1 | Generate from the Zod schemas we already write for validation. One source of truth instead of two. |
| Interceptors (logging, tracing) | Yes | Next middleware + one wrapper in the handler chain. |

And against it, three things that matter more for *this* product with 1–2 developers:

1. **The booking engine is SEO- and LCP-critical.** Vacation-rental direct bookings
   live and die on organic search and page speed. Next.js SSR/RSC is the reason to
   pick this stack at all — and running Nest alongside means two deploys, two
   runtimes and a network hop between the console and its own data.
2. **Server Components delete most of the console's API layer.** A portfolio
   calendar, a reservation list, an owner statement — these are reads that can go
   straight to the database in a server component. Building REST endpoints for them
   is work that buys nothing.
3. **One repo, one deploy, one type system.** With two people, integration overhead
   is the tax you can least afford.

**What we give up, honestly:** a slightly less obvious place for a newcomer to
find "the API layer", and a manual OpenAPI pipeline. Both are acceptable.

## 14.3 The three non-negotiable conditions

Full-stack Next.js goes wrong in one predictable way: business logic accretes
inside Server Actions and route handlers until it cannot be tested, reused by the
worker, or reasoned about. Since the worker needs the *same* logic the UI does
(availability recalculation, booking projection, rate derivation), that failure is
not hypothetical — it is guaranteed unless prevented structurally.

**C1 — All domain logic lives in `packages/core`, framework-free.**
No `next/*` import anywhere in `packages/core`. Server Actions and route handlers
are adapters: parse input, resolve actor, call a core service, map the result.
Target ≤ 20 lines each; a lint rule flags longer ones. The worker imports exactly
the same services, which is the real test that this rule is being honoured.

**C2 — One authorization chokepoint.**
Every Server Action and every route handler is wrapped:

```ts
export const setRateDays = withPermission(
  'ari:update_rate',
  { scope: 'property' },
  async (ctx, input: SetRateDaysInput) => rates.setRateDays(ctx, input),
)
```

`withPermission` resolves the session, loads effective grants, evaluates scope,
records the audit entry, and opens the tenant-scoped transaction (setting the RLS
session variable). A build-time check enumerates every exported action and route
handler and **fails the build** on any that is not wrapped — this is how
[RBAC-1](./02-personas-and-rbac.md#29-requirements) ("a route with no declaration
fails closed") is satisfied without a framework.

**C3 — The worker is a separate process from day one.**
Next.js has no worker model, and this product is queue-shaped: per-property
serialised ARI pushes, booking ack loops, reconciliation, automation, night audit,
rollups. `apps/worker` is a plain Node entrypoint with BullMQ consumers importing
`packages/core`. It is never a Next route, a cron-hitting-an-endpoint, or a
`setInterval`.

## 14.4 Where we deliberately break Next idiom

**The calendar does not use Server Actions.**

Server Actions serialise through the router, cannot batch, and re-render on
resolution. The calendar grid does high-frequency optimistic cell writes — drag a
selection over 200 cells and paste — which is precisely the workload they are
worst at. So:

| Surface | Mechanism |
|---|---|
| Calendar cell and bulk ARI writes | Route handlers (`/api/v1/…`) + TanStack Query mutations with optimistic cache updates; realtime channel confirms per-cell sync state |
| Inbox send, thread actions | Route handlers + TanStack Query (same reason: optimistic, high frequency) |
| Everything else in the console (forms, settings, wizards, assignments) | Server Actions — they are genuinely nicer here |
| Reads for console pages | Server Components querying `packages/core` directly |
| Booking engine, guest portal, owner portal | Server Components + Server Actions |
| Third-party / partner access | Public REST API v1, route handlers, OpenAPI generated from Zod |
| Webhook receiver | Route handler on the Node runtime, `dynamic = 'force-dynamic'`, persist-and-return-200 only |

## 14.5 Escape hatch

If the partner API becomes a product surface — PMS vendors, agencies, a public
integration ecosystem — extract `apps/api` (Fastify, or Nest then) and point it at
the same `packages/core`. Because C1 holds, that is a mechanical change: new
adapters, no domain rewrite. We are deferring the decision, not foreclosing it.

## 14.6 Hosting consequence

The webhook receiver and the worker both need a **long-running Node runtime**.
Serverless-only hosting cannot run BullMQ consumers, and edge runtimes cannot hold
a Postgres pool. Therefore:

- **Self-host:** Docker Compose — `web`, `worker`, `postgres`, `redis`, `minio`,
  `caddy`. One command, as promised in [04 §4.8](./04-architecture.md#48-deployment-topology).
- **SaaS:** containers on a normal host (Fly.io, Railway, Render, Hetzner + Docker,
  or ECS). `web` and `worker` scale independently; managed Postgres and Redis.
- Vercel may host the marketing site if we want its preview workflow, but the
  product itself runs in containers. We do **not** split the app to fit a serverless
  platform.
- **Cloudflare (hosted service, ADR-0008):** the one serverless target that met the
  conditions without a split. The same `apps/web` runs on Workers through OpenNext; the
  worker stays a separate Worker (`apps/worker-cf`) over Cloudflare Queues and a Cron
  Trigger, running the processors shared with `apps/worker` from `packages/jobs`; Postgres
  is Neon behind Hyperdrive with one connection per transaction. Redis is replaced by a
  Durable Object lease and by polling for realtime. The outbox is published by the request
  that wrote it (`waitUntil`) and by the worker's minute tick.

## 14.7 Component decisions

| Concern | Choice | Why, and what was rejected |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Shared `packages/core` between `web` and `worker` is the whole architecture. |
| App framework | **Next.js App Router** (16 at scaffold time, 2026-09) | SSR for the booking engine, RSC for console reads, one deploy. |
| Worker | Plain Node + **BullMQ** | Per-key concurrency (one job per property), delays, repeatable jobs, DLQ. Rejected: pg-boss (fewer features), Kafka (overkill). |
| Database | **PostgreSQL 16+** | RLS for tenancy, partitioning for ARI, JSONB for raw payloads, window functions for pace. SQLite is not supported. |
| Data access | **Drizzle ORM** | SQL-first, works cleanly with RLS and partitioned tables, excellent inference. Rejected: Prisma — fights RLS and complex ARI upserts. |
| Migrations | Drizzle Kit, forward-only, hand-reviewed | Run as an explicit job, never on boot. |
| Validation | **Zod** | One schema for input validation, config validation, and generated OpenAPI. |
| Auth | Own session layer (Argon2id, TOTP, refresh rotation) + OIDC/SAML | Step-up auth and audited impersonation are too domain-specific to outsource. |
| Client state | **TanStack Query** | Optimistic calendar and inbox mutations, cache invalidation, offline queueing for housekeeping. |
| Realtime | WebSocket gateway in `apps/worker` (or a small `apps/realtime`), Redis pub/sub, SSE fallback | Next route handlers are a poor fit for long-lived sockets. |
| UI | React + Tailwind + shadcn/ui + Radix | Accessible primitives, design system we own. |
| Calendar grid | **Custom, on TanStack Virtual** | Nothing off-the-shelf handles 400 editable cells, three data layers, per-cell sync state, range paste and server-backed undo. |
| Tables | TanStack Table | Reservation lists, statements, reports. |
| Charts | Recharts, escalating to visx for heatmaps | |
| Forms | React Hook Form + Zod | Channel settings forms are built from runtime descriptors. |
| i18n | next-intl + ICU | RTL from day one. |
| Dates | Temporal (polyfilled) | **A night is a `LocalDate`, never an instant.** |
| Money | Integer minor units in a `Money` value object | Floats banned by lint rule. |
| Object storage | S3-compatible (MinIO self-host) | Photos, attachments, statements, exports. |
| Email | React Email + pluggable transport | |
| Payments | Stripe behind a `PaymentProvider` port | Also `BillingProvider` for subscriptions, `PayoutProvider` for owner payouts. |
| Testing | Vitest, Testcontainers, Playwright, fast-check | Property-based tests for ARI diffing, date compression, money, and statement maths. |
| Observability | OpenTelemetry → Prometheus + Grafana + Loki/Tempo | Self-hostable by default. |
| CI | GitHub Actions | Lint, typecheck, unit, integration, E2E, authz-matrix test, unwrapped-handler check, migration check, security scan, SBOM. |

## 14.8 Engineering standards

- **Strict TypeScript**; no `any` outside typed boundary adapters.
- **`packages/core` imports no framework.** Enforced by lint, checked in CI.
- **No cross-module table access** — modules own their vertical slice.
- **Every exported action/handler is permission-wrapped** — build-time enforced.
- **Every PR:** tests for new behaviour, migration reviewed, spec updated if
  behaviour changed, CHANGELOG entry.
- Conventional Commits; SemVer for the public API and plugin interfaces.
- **Definition of done:** works, tested, observable, documented, accessible,
  permission-checked.
