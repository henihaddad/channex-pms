# Contributing to Channex PMS

Thank you for considering a contribution. The project is in its design phase, so the most valuable
contributions today are arguments, not code: read the [specification](./docs/specs/) and tell us
where it is wrong.

## Contents

- [Code of Conduct](#code-of-conduct)
- [Ways to contribute right now](#ways-to-contribute-right-now)
- [Directory structure](#directory-structure)
- [Development setup](#development-setup)
- [Development cycle](#development-cycle)
- [Changing the specification](#changing-the-specification)
- [Contributor License Agreement](#contributor-license-agreement)

## Code of Conduct

This project follows the [Contributor Covenant](./CODE_OF_CONDUCT.md). By participating you agree
to uphold it.

## Ways to contribute right now

1. **Disagree with a spec.** Open an issue that quotes the section and says what a real property
   would do differently. Operators of short-term rentals and small hotels are the reviewers we lack.
2. **Answer an open question.** [Spec 16](./docs/specs/16-open-questions.md) lists what is still
   undecided, with the trade-offs.
3. **Become a design partner.** If you manage 5 to 300 units and would run an early release on a
   real portfolio, open an issue titled `Design partner: <your region>`.
4. **Improve the website or docs.** The landing page lives in [`website/`](./website/).

## Directory structure

```
apps/web          Next.js: staff console, booking engine, portals, webhooks, public API
apps/worker       BullMQ worker: sync engine, ingestion, automation, rollups
packages/core     all domain logic, framework-free (Money, LocalDate, DateRange, services, ports)
docs/specs/       the specification, the design source of truth
website/          the landing page (Next.js + Tailwind), a standalone npm project
.claude/skills/   agent skills used to write and review this repository
```

Still to come, per [spec 04 §4.10](./docs/specs/04-architecture.md#410-repository-layout):
`packages/authz`, `db`, `connectivity`, `sync`, `ui`, `sdk`, `testkit`.

## Development setup

### Website

Requires Node.js 22 or later.

```sh
cd website
npm install
npm run dev        # http://localhost:3000
npm run lint
npm run build
```

### Platform

Requires Node.js 22, pnpm 10 (`corepack enable`) and Docker.

```sh
pnpm install
cp .env.example .env
pnpm infra:up        # Postgres 16, Redis 7, MinIO via docker-compose.yml
pnpm dev             # apps/web on http://localhost:3000 and apps/worker
pnpm check           # lint, typecheck, test, build, what CI runs
pnpm format          # Prettier
```

`packages/core` is framework-free by lint rule; the worker is a separate process; every Server
Action and route handler will be permission-wrapped (see [spec 14 §14.3](./docs/specs/14-tech-stack.md)
and [CLAUDE.md](./CLAUDE.md) for the rules agents and humans both follow).

## Development cycle

1. Fork the repository and create a branch from `main`.
2. Keep pull requests focused. One concern per PR.
3. Write commit messages in the imperative mood ("Add owner statement export").
4. Run `pnpm check` at the root (and `npm run lint && npm run build` in `website/` if you touched it).
5. Open the PR against `main`, fill in the template, and link the spec section or issue.
6. A maintainer reviews within a week. Spec changes and code changes that disagree with a spec are
   reviewed together.

Non-`main` branches are unlicensed until merged. See [LICENSE.md](./LICENSE.md).

## Changing the specification

Specs are the source of truth and code follows them. When they disagree, fix the spec in the same
pull request that fixes the code.

- Each spec has a status (`draft`, `review`, `accepted`, `superseded`). Changes to an `accepted`
  spec need a rationale in the PR description.
- Meaningful decisions become architecture decision records in `docs/adr/` and are referenced from
  the spec.
- Keep Channex vocabulary where Channex names a concept (`rate_plan`, `booking_revision`).

## Contributor License Agreement

Before we can merge your first pull request you need to sign the
[Contributor License Agreement](./CONTRIBUTOR_LICENSE_AGREEMENT.md). It is four sentences long, in
plain English. A bot will ask on the PR; reply with the sentence it gives you and it records your
signature. You only do this once.

The CLA exists because the project is [fair-code](https://faircode.io) and runs a hosted service on
this code. It lets the project relicense contributions, which is what keeps enterprise licensing and
a future move to a more permissive licence possible.
