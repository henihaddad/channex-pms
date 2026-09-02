# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) for the public API and plugin interfaces.

## [Unreleased]

### Added

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
