# Channex PMS: guide for coding agents

Read this before touching anything. The spec is the source of truth; code follows it.

## What this is

A fair-code property management system and channel manager for short-term rental managers
and independent hotels, built on the Channex.io API. Design in `docs/specs/` (17 documents).
Roadmap M0 to M8 in `docs/specs/15-roadmap.md`. Decisions and open questions in
`docs/specs/16-open-questions.md`.

## Layout

```
apps/web         Next.js App Router: console, booking engine, portals, webhooks, public API
apps/worker      plain Node + BullMQ: sync engine, ingestion, automation, rollups
packages/core    ALL domain logic, framework-free (Money, LocalDate, DateRange, services, ports)
packages/jobs    job processors shared by the worker and the test hooks (provisioning, horizon, channels)
packages/sdk     Apache-2.0 client for /api/v1, no workspace dependencies
website/         marketing site, standalone npm project, not in the pnpm workspace
docs/specs/      the specification
.claude/skills/  agent skills (design, UX heuristics, information architecture, Next.js, React,
                 Tailwind, shadcn, Postgres, Drizzle, README)
```

## Non-negotiable rules (spec 14 §14.3, enforced by lint and CI)

1. `packages/core` imports no framework and no infrastructure library. Server Actions and route
   handlers are thin adapters (≤ 20 lines) that call core services.
2. Every exported Server Action and route handler is wrapped in `withPermission(...)`. A build
   check fails on any that is not.
3. The worker is a separate process. Never a Next route, cron-hitting-an-endpoint or `setInterval`.
4. Money is integer minor units in `Money`. Floats are banned for money and dates.
5. A night is a `LocalDate`, never an instant. Stays are half-open `DateRange`s.
6. Local state is authoritative for availability and rates; the provider is a mirror we verify.
7. Never silently lose a booking. Duplicate webhooks and out-of-order revisions are the normal case.

## Working here

- `pnpm install`, `pnpm infra:up` (Postgres, Redis, MinIO), `pnpm dev`.
- Before pushing: `pnpm check` (lint, typecheck, test, build) and `pnpm format:check`.
- Tests: Vitest with fast-check property tests for anything touching dates, money or ARI diffs.
- Conventional Commits. Every behaviour change updates the spec in the same PR, plus CHANGELOG.
- Keep Channex vocabulary (`rate_plan`, `booking_revision`, `restrictions`).
- Every feature names its persona (spec 02). No persona, no feature.
- Licence: Sustainable Use License. Files needing an enterprise licence carry `.ee.` in the name.

## Skills

Use `find-skills` to look for a skill before doing something unfamiliar. Installed skills are
listed in `skills-lock.json`; `npx skills update` refreshes them.
