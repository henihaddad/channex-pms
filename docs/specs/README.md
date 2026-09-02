# Platform Specification

> Working title: **Channex PMS** — a fair-code, source-available, multi-tenant property
> management and channel-management platform for short-term rental managers and
> independent hotels, built on the [Channex.io](https://channex.io) API.

This directory is the design source of truth. Code follows the specs; when they
disagree, we fix the spec in the same pull request that fixes the code.

**Decided 2026-08-21** (see [16](./16-open-questions.md)): vacation-rental /
STR managers are the primary segment · v1 is the full platform including the
booking engine · full-stack Next.js + a separate Node worker, no NestJS ·
fair-code licensing (D5) **and** a hosted SaaS from launch, with a hard parity guarantee.

## Reading order

| # | Spec | What it answers |
|---|------|-----------------|
| 01 | [Vision & Scope](./01-vision-and-scope.md) | What we are building, for whom, and what we refuse to build |
| 02 | [Personas & RBAC](./02-personas-and-rbac.md) | Who logs in, what they can touch — incl. owners, cleaners, ops |
| 03 | [Domain Model](./03-domain-model.md) | Entities, relationships, invariants; `property.kind`; owner accounting |
| 04 | [Architecture](./04-architecture.md) | Modules, data flow, queues, deployment topology |
| 05 | [Channex Integration](./05-channex-integration.md) | Sync engine, webhooks, ack loop, drift reconciliation |
| 06 | [Inventory & Rates](./06-inventory-and-rates.md) | The portfolio calendar, restrictions, yield rules |
| 07 | [Channels & Mapping](./07-channels-and-mapping.md) | Connecting OTAs at portfolio scale, mapping, health |
| 08 | [Operations & Turnover](./08-operations-and-turnover.md) | Reservations, turnovers, cleaner app, maintenance, folios, front desk |
| 09 | [Messaging & Inbox](./09-messaging-and-inbox.md) | Unified guest inbox, templates, automation, SLAs |
| 10 | [Booking Engine](./10-booking-engine.md) | Direct channel, guest portal, payments |
| 11 | [Dashboards & Analytics](./11-dashboards-and-analytics.md) | KPIs, per-role dashboards, reports |
| 12 | [Platform Admin & Billing](./12-platform-admin-and-billing.md) | Operator console, tenancy, plans, support tooling |
| 13 | [NFR, Security & Compliance](./13-nfr-security-compliance.md) | Security, PCI, GDPR, performance, availability |
| 14 | [Tech Stack](./14-tech-stack.md) | Full-stack Next.js decision and component choices |
| 15 | [Roadmap](./15-roadmap.md) | M0–M8 to v1 |
| 16 | [Open Questions & Decisions](./16-open-questions.md) | What's decided, what still needs a human |
| 17 | [Owner Management](./17-owner-management.md) | Agreements, statements, payouts, the owner portal |

## Status legend

- **`draft`** — being written, expect churn, do not implement yet.
- **`review`** — complete enough to argue about; comments welcome.
- **`accepted`** — implementable. Changes need a pull request and a rationale.
- **`superseded`** — kept for history, points at its replacement.

## Conventions

- **Decisions get recorded, not re-litigated.** Meaningful choices become ADRs in
  `docs/adr/NNNN-title.md`, referenced from the spec.
- **`MUST` / `SHOULD` / `MAY`** follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).
- **Channex vocabulary is preserved.** Where Channex names a concept
  (`rate_plan`, `booking_revision`, `restrictions`), we use the same word.
  Divergences are called out explicitly (e.g. our `Unit` vs their `room_type`).
- **Every feature names its persona.** If no persona in spec 02 wants it, it does
  not go in the roadmap.
