# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) for the public API and plugin interfaces.

## [Unreleased]

### Added

- Monorepo scaffold: `apps/web` (Next.js), `apps/worker` (BullMQ), `packages/core`
  (framework-free domain layer) with pnpm workspaces and Turborepo.
- `packages/core` value objects `Money`, `LocalDate` and `DateRange` with property-based tests.
- Docker Compose for local Postgres, Redis and MinIO.
- CI: lint, typecheck, test and build on every push and pull request.
- Fair-code licensing (Sustainable Use License, Enterprise License, CLA), README, community
  files and the landing page in `website/`.
