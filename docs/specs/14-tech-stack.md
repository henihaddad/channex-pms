# 14 — Technology Stack

**Status:** `draft` — §14.1 is the one decision that needs confirming before code
is written ([16](./16-open-questions.md)).

## 14.1 Language and framework

**Recommendation: a TypeScript monorepo — Next.js on the front, NestJS on the API,
BullMQ workers, PostgreSQL, Redis.**

Rationale, in order of weight:

1. **Contributor pool.** An open-source hospitality platform lives or dies on
   drive-by contributors. TypeScript has the largest population of developers who
   can fix a bug in a calendar grid *and* in a sync worker.
2. **One type system end to end.** The domain here is full of fiddly shapes — ARI
   payloads, booking revisions, mapping descriptors. Sharing `packages/core` types
   between API, workers and UI eliminates an entire class of integration bug for free.
3. **The hardest UI in the product is the calendar grid.** It is a custom
   virtualised, keyboard-driven, optimistically-updating spreadsheet. That work is
   unavoidable and is best served by the richest front-end ecosystem.
4. **Boring and inspectable**, per [01 §1.7](./01-vision-and-scope.md#17-product-principles).

Alternatives genuinely considered:

| Option | Case for | Why not chosen |
|---|---|---|
| **Elixir / Phoenix** | Channex itself is Elixir; BEAM is superb for realtime fan-out and per-property serialised processes (a `GenServer` per property is a *beautiful* fit for the ARI queue); LiveView would cut front-end work | Much smaller contributor pool. Strong second choice — pick it if the core team is already fluent. |
| **Go** | Excellent workers, single-binary self-hosting | Weaker for a complex data-grid UI; more boilerplate for CRUD-heavy modules; no shared types with the front end. |
| **Python / Django** | Fast CRUD, great data tooling, huge pool | Weaker realtime story; async ergonomics are still awkward for a sync-heavy workload. |
| **Ruby / Rails** | Fastest to a working PMS | Smaller and shrinking contributor pool; performance work on the calendar would arrive early. |

**Single-binary caveat:** TypeScript loses to Go on self-host simplicity. We
compensate with a first-class Docker Compose bundle and a genuinely one-command
install ([04 §4.8](./04-architecture.md#48-deployment-topology)).

## 14.2 Component decisions

| Concern | Choice | Why, and what was rejected |
|---|---|---|
| Monorepo | pnpm workspaces + Turborepo | Fast, standard, cacheable CI. |
| API framework | **NestJS** | Its module system maps 1:1 onto the modular monolith in [04](./04-architecture.md); DI makes the provider ports natural; guards give declarative per-route permissions (RBAC-1). Rejected: bare Fastify (we would rebuild this structure by hand). |
| Web | **Next.js (App Router)** | SSR for the booking engine's SEO and LCP, SPA behaviour for the console, one framework for both. |
| Database | **PostgreSQL 16+** | RLS for tenant isolation, partitioning for ARI, JSONB for raw payloads, window functions for pace maths, `LISTEN/NOTIFY` if needed. Non-negotiable — SQLite cannot serve this model. |
| Data access | **Drizzle ORM** | SQL-first, transparent queries, no fight with RLS or partitioned tables, excellent types. Rejected: Prisma — its query layer makes RLS and complex ARI upserts harder than writing SQL. |
| Migrations | Drizzle Kit, forward-only, reviewed by hand | Generated migrations are always read before merge. |
| Queues | **BullMQ** on Redis | Mature, per-key concurrency (needed for one-job-per-property), delays, repeatable jobs, DLQ. Rejected: pgmq/pg-boss (fewer features), Kafka (vast overkill). |
| Cache / locks / presence | Redis | Also backs realtime fan-out. |
| Realtime | WebSocket via Socket.IO-compatible gateway, SSE fallback | Calendar cells, inbox, booking feed. |
| Object storage | S3-compatible (MinIO self-host) | Photos, attachments, exports, invoices. |
| Validation | **Zod** | One schema for API validation, config validation and generated OpenAPI. Config failures crash at boot, by design. |
| Auth | Own implementation on top of a vetted library, plus OIDC/SAML | Sessions, 2FA, step-up and impersonation are domain-specific enough that a hosted identity product would fight us. |
| UI | React + Tailwind + shadcn/ui + Radix | Accessible primitives, fast iteration, and a design system we control. |
| Grid | **Custom, built on TanStack Virtual** | No off-the-shelf grid handles 400 editable cells with three data layers, per-cell sync state, range paste and server-backed undo. Attempting to bend one is a known trap. |
| Tables | TanStack Table | Reservation lists, reports. |
| Charts | Recharts (escalate to visx for the heatmaps) | |
| Forms | React Hook Form + Zod | Descriptor-driven channel forms need runtime schemas. |
| i18n | i18next + ICU | RTL from day one. |
| Dates | Temporal (polyfilled) or date-fns + tzdb | **Rule: a hotel night is a `LocalDate`, never an instant.** Timezone bugs here cost real money. |
| Money | Integer minor units in a `Money` value object | Floats are banned by lint rule. |
| Email | React Email templates + a pluggable transport | |
| Testing | Vitest, Testcontainers, Playwright, fast-check | Property-based tests for ARI diffing and money maths. |
| Observability | OpenTelemetry → Prometheus + Grafana + Loki/Tempo, Sentry optional | Self-hostable by default. |
| Docs site | Docusaurus or Starlight | Specs, runbooks, API reference, plugin guide. |
| CI | GitHub Actions | Lint, typecheck, unit, integration, E2E, security scan, SBOM, migration check, authz-matrix test, certification suite on release branches. |

## 14.3 Engineering standards

- **Strict TypeScript.** `strict: true`, no `any` outside typed-boundary adapters,
  ESLint + Prettier enforced in CI.
- **Domain-first module layout.** No layer-first folders like `controllers/`,
  `services/`, `models/` at the top level — modules own their vertical slice.
- **No cross-module table access.** Enforced by an ESLint import-boundary rule, not
  by convention.
- **Every PR:** tests for new behaviour, migration reviewed if the schema changes,
  spec updated if behaviour changes, and a CHANGELOG entry.
- **Conventional Commits** for automated changelogs and SemVer.
- **Feature flags** for anything shipped incrementally; flags are removed once the
  feature is on everywhere (a flag older than two minors is a CI warning).
- **Definition of done:** works, tested, observable (metric or log), documented,
  accessible, and permission-checked.
