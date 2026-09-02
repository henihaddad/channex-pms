# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) for the public API and plugin interfaces.

## [Unreleased]

### Added

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
