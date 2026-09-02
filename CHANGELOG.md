# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) for the public API and plugin interfaces.

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

## [Unreleased]

### Added

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
