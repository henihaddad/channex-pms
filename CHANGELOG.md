# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) for the public API and plugin interfaces.

## [Unreleased]

### Added

- Cloudflare deployment target (ADR-0008): `apps/web` builds for Workers with
  `@opennextjs/cloudflare` (`build:cf`, `deploy:cf`); `apps/worker-cf` runs the job runtime on
  Cloudflare Queues, a one-minute Cron Trigger scheduler and a Durable Object lease per property;
  `@pms/cloudflare` holds the queue bindings and the outbox publisher over Queues; the outbox is
  drained after every request chokepoint through `waitUntil`; `db:migrate:neon` migrates Neon over
  a WebSocket; `MAIL_TRANSPORT=resend`; deploy workflow `deploy-cloudflare.yml`.
- `@pms/runtime/shims/*`: pure-JS Argon2id (PHC-compatible with the native hashes), a console JSON
  logger with the same redaction list, PGlite and ioredis stubs, aliased into Workers bundles only.

- Channex certification suite run against staging: provisioning with natural-key reconciliation
  (PROV-3), ARI round trip, property import and adapter descriptors, with recorded fixtures;
  provider corrections for the flat property address, `min_stay` mode and descriptor shape.

- M1 connectivity core: `ConnectivityProvider` port with the spec 05 error taxonomy; `ChannexProvider`
  over fetch/record/replay transports with docs-sourced fixtures and a contract suite; `FakeProvider`
  with seeded fault injection (429, 5xx, timeouts, partial 422, duplicate/reordered/dropped webhooks,
  unmapped bookings) and a ledger; ARI batch builder (run-length, weekday, base-plus-override with
  FIFO-safe merging) proven by property tests; push pipeline with adaptive token bucket, circuit
  breaker, per-cell versions and sampled read-back; booking ingestion with the ack loop, out-of-order
  handling and the ack sweep; availability derivation from booking diffs; webhook receiver
  (token + secret, persist-first, dedupe); nightly reconcile; Sync Health page; worker processors on
  BullMQ; chaos runner asserting no booking lost and no cell permanently wrong (200/200 seeds).

- M0 foundations: `packages/authz` generated from spec 02 with the matrix and evaluator tests;
  `packages/db` with tenancy schema, forced row-level security on every org table, hash-chained
  append-only audit log, transactional outbox and a PGlite test harness; identity (sign-up, login
  with lockout, TOTP, invitations, magic links, rotating refresh sessions); `withPermission`
  chokepoint with the unwrapped-handler build check; console shell with next-intl (en, fr, ar);
  worker container with the outbox publisher and the nightly on-the-books snapshot job;
  Playwright onboarding e2e; ADR-0001 to ADR-0005.

- Monorepo scaffold: `apps/web` (Next.js), `apps/worker` (BullMQ), `packages/core`
  (framework-free domain layer) with pnpm workspaces and Turborepo.
- `packages/core` value objects `Money`, `LocalDate` and `DateRange` with property-based tests.
- Docker Compose for local Postgres, Redis and MinIO.
- CI: lint, typecheck, test and build on every push and pull request.
- Fair-code licensing (Sustainable Use License, Enterprise License, CLA), README, community
  files and the landing page in `website/`.

### Changed

- The queue processors, the `system` job table and the schedule moved from `apps/worker` into
  `packages/jobs/src/worker` (`handleQueueJob`, `runSystemJob`, `SCHEDULE`, `dueJobs`);
  `apps/worker` is now a BullMQ adapter around them. Processors take a `JobControl` instead of a
  BullMQ `Job`.
- `packages/db` connects with one client per transaction when `DATABASE_PER_REQUEST=1` and loads
  PGlite on demand; `MIGRATIONS_FOLDER` became `migrationsFolder()`. With a request `scope`
  (the web app on Workers passes its request context) every transaction and query of one request
  shares a single connection, serialised as on the development database, closed shortly after
  the last use. `withTenant` applies the role switch and all settings in one statement. Together
  these cut a console page from 6 to 7 connections and 36 to 58 statements to 1 connection and
  roughly half the statements.
- The hosted web app moved to Vercel as the plain Node build, pinned to Neon's region
  (ADR-0009); the jobs Worker, Queues, the fallback copy of the web app and the landing page stay
  on Cloudflare. After a write, a web app hosted off Cloudflare pokes the jobs Worker's new
  `POST /outbox/drain` (shared secret) through Next's `after()`. Smart Placement was tried and
  reverted; the jobs Worker's minute tick keeps one web instance warm.

### Fixed

- The console proxy no longer redirects the Channex webhook receiver (`/webhooks/*`) to the login
  page; the receiver authenticates by path token and secret.
- The cleaner app keeps not-yet-synced local updates when a day refresh lands, and syncs one queue
  at a time, so a fast accept → on-site sequence can no longer lose the second update.
- The storefront search keeps its organization scope across searches.
- Reservation saved views ("arrivals today" and friends) use the property-local date instead of
  UTC.
- The worker's per-property provider calls (ARI push, reconcile, booking pull, thread and review
  sync) now go out with the property's Channex ids and come back with local ones, as the
  test-hook drain always did; the queue path previously pushed local ids and Channex rejected
  every cell. ARI push jobs also read their ids from the outbox envelope.
- The Channex HTTP transport calls `fetch` on the global, which Cloudflare Workers require.

## [1.0.0] — 2026-09-02

### Added

- M8 hosted service and hardening: the `platform` module (launch plans with marginal tiers,
  peak-of-period metering, EU VAT with reverse charge and OSS, proration, the tenant lifecycle
  state machine, dunning schedule, quotas with the QUOTA-1 exemption, the `BillingProvider`
  port) with property tests; `StripeBillingProvider` over the transport port and
  `FakeBillingProvider`; subscription, usage, invoice, operator, flag, announcement,
  impersonation, support-access, plugin, delivery, export and job-request tables with RLS; jobs
  for metering, period close, dunning, trial expiry, signed plugin deliveries with breaker and
  backoff, exports, tenant purge and operator job requests; the worker schedulers; the `/ops`
  operator console behind the `withOperator` chokepoint with fleet health, tenants, sync
  inspector, dead letters, webhook explorer, flags, announcements, impersonation (approval or
  pre-granted access, 60-minute cap, read-only, PII closed, banner, transcript, break-glass with a
  second operator), jobs, operators and the operator audit; tenant settings for billing (plans,
  card, usage, invoices with explainer, cancel, export, leave), plugins (install with the
  permission grant, secret shown once, deliveries) and support (pre-granted access, approvals,
  diagnostics bundle); the onboarding checklist and state banners in the console shell; the
  suspended-tenant console gate that keeps sync running; extension-point interfaces and signing
  helpers in the Apache-2.0 SDK with two reference plugins; fifteen runbooks; install, operate,
  plugin and API docs; the security workflow (gitleaks, PAN scan, audit, SBOM, CodeQL), the
  drills workflow (backup → restore, upgrade → rollback, compose smoke) and k6 load scenarios;
  `es` and `pt` locales for the guest, owner and onboarding surfaces with English fallback.

### Changed

- Reports, exports and bulk operations check the plan quota in hosted mode; the PAN scan skips
  the negative tests that prove a card number is refused.

## [0.6.0] — 2026-09-02

### Added

- M7 direct booking engine: the direct channel as a `ChannelConnection` (`adapter_code = "direct"`);
  local search honouring every restriction with occupancy pricing (BE-2, BE-4) and a fast-check
  property that no offer violates a restriction or a held night; holds that count against
  availability on every channel and expire by a worker sweep (BE-5); a three-phase, idempotent
  confirm through the `PaymentProvider` port with `StripePaymentProvider` (PaymentIntents over
  REST, unit-tested) and `FakePaymentProvider` for tests and the demo, 3-D Secure round-trips and
  recoverable declines (BE-6); confirmation mail with `.ics` and the portal link (BE-7); guest
  audit entries from hold to cancellation (BE-8); the portfolio storefront with attribute filters
  and a dependency-free map, per-property pages with deep links, the `/widget.js` iframe embed
  with `postMessage` resizing, per-property colour theming, no third-party scripts (BE-9..11);
  promo codes, direct-only rate plans, extras to the folio, consent-gated abandonment mails;
  the guest portal (magic token, pre-check-in, access-code reveal at the configured window,
  house manual, extras, messaging into the direct thread, policy-driven cancellation with refund);
  console pages per property and a portfolio overview with the commission saved; every direct
  booking gets a door code at confirm and a line on the owner statement.

## [0.5.0] — 2026-09-02

### Added

- M6 dashboards and reporting: the KPI dictionary as code with property tests; nightly rollups
  into `fact_room_night`, `fact_booking` and `agg_daily_kpi` with cancellation restatement and
  labelled commission estimates; the live on-the-books snapshot source, pickup and pace (marked
  unavailable until a year of snapshots exists); realtime today deltas; role dashboards for
  portfolio, property, revenue, reservations, housekeeping, guest relations, finance and viewer
  with a league table, outlier flags, action queues, "vs previous period" and budgets; a
  seventeen-report catalogue with CSV and PDF export, basis printed on every file, saved
  schedules by email; hourly alerts with once-per-condition raising, auto-resolution and
  per-type action rates (ALRT-1); the daily statement-to-report reconciliation job; a read-only
  `reporting` schema for BI tools.

## [0.4.0] — 2026-09-02

### Added

- M5 owner management: owner records with documents and expiry flags, sealed payout
  destinations shown masked (PAY-1), portal access as a passwordless `owner` grant on the owner's
  group; versioned agreements for every model and commission basis with deductible, cleaning-fee,
  owner-stay, payout and VAT terms, overlap refusal (AGR-1, AGR-2, INV-12); expense capture with
  receipts, agreement-suggested rebill flag with override reason and approval with optional
  four-eyes (EXP-1, EXP-2); the pure statement engine with per-night attribution, per-version
  segments, labelled commission estimates, visible markup, owner-stay allowances, hold-back and
  minimum payout, property-based tests and byte-identical regeneration (STMT-1..3, OWN-1);
  restatement adjustments after send from the billed-night ledger (STMT-4, OWN-2); the
  draft → approved → sent → paid workflow with review flags, previous-period column, PDF and
  email, auto-send after N days (STMT-5); payouts through the `PayoutProvider` port with a fake
  and a Stripe Connect adapter, step-up and four-eyes (PAY-1..3); the owner portal (dashboard,
  calendar with self-service owner stays through ARI, statements with line drill-down, PDF and
  dispute threads, expenses, maintenance with raise, reviews, documents) scoped hard to the
  owner (PORT-1..3, OWN-3); worker schedulers `statements.sweep`, `statements.autosend`,
  `payouts.poll`.

## [0.3.0] — 2026-09-02

### Added

- M4 unified messaging: thread and message sync from the provider (webhook-triggered pull plus a
  2-minute poll, idempotent by provider message id, CXMSG-2/3), sealed bodies and guest names, a
  portfolio inbox with the spec's views, SLA chips and counts in the nav badge (MSG-1/2), a
  conversation view with booking sidebar, Airbnb inquiry cards, per-message delivery states with
  retry and capability-aware controls (close, Booking.com "no reply needed"); structurally
  separated guest and note composers, the send button naming guest and channel, re-confirmation
  on switching (MSG-3..5) and internal notes that cannot reach a provider at the type, runtime and
  database level (MSG-6); org-scoped templates with locale variants, real-value preview and
  promotional-pattern warnings (AUTO-7); the automation engine over the spec's triggers with
  property-local quiet hours, per-guest limits, guest-reply handover, rule-and-version labels,
  test-send with preview, a per-property kill switch and access-code delivery that waits for the
  window and resends on rotation (AUTO-1..6); reviews with responses and a response-SLA marker;
  a first-response KPI per property, channel and agent; worker consumers for `messages.sync` and
  `automation.run` and schedulers `messages.poll`, `automation.tick`, `reviews.sweep`; FakeProvider
  messaging and reviews with a ledger of everything it accepted.

## [0.2.0] — 2026-09-02

### Added

- M3 reservations and operations: reservation list with shipped and saved views, filters and CSV
  export; detail with human-readable revision timeline, acknowledgement badge, unit assignment and
  auto-assign, check-in/out and no-show, access credentials through the `LockProvider` port (sealed,
  masked, revoked and reissued within the revision's job, INV-14), audited guest PII and step-up
  gated payment instrument reveals; mapping resolution queue; turnover tasks generated and re-planned
  from booking diffs with same-day changeover windows, greedy routing, escalation, crews and
  checklists; the cleaner PWA with an offline queue, photo-required checklists and issue reporting;
  maintenance issues with availability blocks; unit blocks incl. owner stays; folios, charges,
  tourist tax, deposit holds, gapless invoices and credit-note-only corrections, idempotent daily
  close; front desk today board and room rack for hotel-kind properties; staff bookings and direct
  cancellations on the one booking-creation path; card-metadata retention purge (PCI-4).

## [0.1.0] — 2026-09-02

### Added

- M2 inventory, calendar and channels: property wizard with `kind` selection and system-managed
  room type and unit for `single_unit` listings (MODEL-1), templates, clone, CSV import and adoption
  of an existing Channex property; resumable idempotent provisioning (PROV-1..5) with webhook
  registration, provider-id translation and a rolling 730-day horizon job; derived rate plans
  recomputed with their parent (INV-6), room-type capacity changes flowing into availability,
  policies; the portfolio calendar (virtualised rows and columns, keyboard editing, range
  toolbar, `expected_version` conflicts with both values, server-backed undo, per-cell sync
  state over server-sent events); bulk update with mandatory dry run, guard rails and
  inverse-operation undo (BULK-1..4); channel accounts with Airbnb OAuth and bulk listing
  import (CH-5), descriptor-driven connection wizard (CH-1..4, CH-6), mapping with confidence-
  scored suggestions, coverage warnings, validation, diff-before-save and targeted re-push
  (MAP-1..4, MAP-6), health board with plain-language alerts and reversible pause (CH-7, CH-8),
  readiness polling; step-up re-authentication page for `!` permissions; `/api/v1` public
  endpoints with an OpenAPI 3.1 document and the Apache-2.0 `@channex-pms/sdk`; `packages/jobs`
  shared by the worker and the test hooks; `compose.selfhost.yml` with a multi-target Dockerfile.
