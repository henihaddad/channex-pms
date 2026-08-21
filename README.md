# Channex PMS *(working title)*

An **open-source property management system and channel manager** for independent
hotels, guesthouses and small portfolios — built on the
[Channex.io](https://channex.io) connectivity API.

> **Status: design phase.** No application code yet. The
> [specification](./docs/specs/) is the current deliverable and the place to
> argue about decisions before they get expensive.

## The idea

Channel management has an expensive, unglamorous half — certified two-way
connections to Booking.com, Expedia, Airbnb, Agoda and dozens more — and a
product half: the calendar, the rate tools, the roles, the inbox, the dashboards.

Channex already does the first half well and exposes it as a plain REST API.
So we build the second half, in the open:

- **Channel manager** — connect OTAs, map inventory, push rates and availability,
  monitor health
- **Reservations** — OTA bookings with full revision history, never silently lost
- **Light PMS** — arrivals, room assignment, housekeeping, folios, invoices
- **Unified inbox** — Booking.com, Airbnb and Expedia guest messaging in one place
- **Direct booking engine** — commission-free, treated as a first-class channel
- **Dashboards** — occupancy, ADR, RevPAR, pace and channel mix, per role
- **Real roles** — twelve personas, scoped grants, audited everything

Self-hostable with Docker Compose. Your data stays yours, and you can export all
of it and leave at any time.

## Read the specs

Start with [docs/specs/README.md](./docs/specs/README.md), or jump to:

- [Vision & Scope](./docs/specs/01-vision-and-scope.md) — what this is, and what it is deliberately not
- [Personas & RBAC](./docs/specs/02-personas-and-rbac.md) — the role model
- [Architecture](./docs/specs/04-architecture.md) — modular monolith, queues, ports
- [Channex Integration](./docs/specs/05-channex-integration.md) — the sync engine, in detail
- [Roadmap](./docs/specs/15-roadmap.md) — milestones from M0 to v1
- [Open Questions](./docs/specs/16-open-questions.md) — **decisions still to make; opinions welcome**

## Design principles

1. Never silently lose a booking.
2. Local state is authoritative for availability and rates; provider state is a
   mirror we continuously verify.
3. Every mutation is attributable — who, when, from where.
4. Optimistic UI, honest state: a pending sync always *looks* pending.
5. Boring, inspectable technology.
6. Accessible and multilingual from day one.

## Contributing

The most useful contribution right now is disagreement. If you run a property or
have built distribution software, the
[open questions](./docs/specs/16-open-questions.md) are where to start.

## Licence

Proposed: **AGPL-3.0** for the server, **Apache-2.0** for the SDK, plugin
interfaces and the booking widget. Not yet final — see
[Q5](./docs/specs/16-open-questions.md#q5--licence-and-contribution-model).

Not affiliated with or endorsed by Channex.io.
