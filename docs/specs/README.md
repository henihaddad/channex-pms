# Platform Specification

> Working title: **Channex PMS** — an open-source, multi-tenant property management
> and channel-management platform built on the [Channex.io](https://channex.io) API.

This directory is the design source of truth. Code follows the specs; when they
disagree, we fix the spec in the same pull request that fixes the code.

## Reading order

| # | Spec | What it answers |
|---|------|-----------------|
| — | [README](./README.md) | How the specs are organised |
| 01 | [Vision & Scope](./01-vision-and-scope.md) | What we are building, for whom, and what we refuse to build |
| 02 | [Personas & RBAC](./02-personas-and-rbac.md) | Who logs in, what they can touch |
| 03 | [Domain Model](./03-domain-model.md) | Entities, relationships, invariants |
| 04 | [Architecture](./04-architecture.md) | Services, data flow, queues, deployment topology |
| 05 | [Channex Integration](./05-channex-integration.md) | Sync engine, webhooks, ack loop, drift reconciliation |
| 06 | [Inventory & Rates](./06-inventory-and-rates.md) | Room types, rate plans, calendar, restrictions, yield rules |
| 07 | [Channels & Mapping](./07-channels-and-mapping.md) | Connecting OTAs, mapping UI, health monitoring |
| 08 | [Reservations & Front Desk](./08-reservations-and-frontdesk.md) | Bookings, revisions, arrivals, housekeeping, folios |
| 09 | [Messaging & Unified Inbox](./09-messaging-and-inbox.md) | Guest conversations, templates, automation, SLAs |
| 10 | [Booking Engine & Direct](./10-booking-engine.md) | Direct channel, CRS, payments |
| 11 | [Dashboards & Analytics](./11-dashboards-and-analytics.md) | Per-role dashboards, KPIs, reports |
| 12 | [Platform Admin & Billing](./12-platform-admin-and-billing.md) | Operator console, tenancy, plans, support tooling |
| 13 | [Non-Functional Requirements](./13-nfr-security-compliance.md) | Security, PCI, GDPR, performance, availability |
| 14 | [Tech Stack](./14-tech-stack.md) | Language, framework, and infrastructure decisions |
| 15 | [Roadmap](./15-roadmap.md) | Milestones from MVP to v1 and beyond |
| 16 | [Open Questions](./16-open-questions.md) | Decisions still owned by a human |

## Status legend

Every spec carries a status header:

- **`draft`** — being written, expect churn, do not implement yet.
- **`review`** — complete enough to argue about; comments welcome.
- **`accepted`** — implementable. Changes need a pull request and a rationale.
- **`superseded`** — kept for history, points at its replacement.

## Conventions

- **Decisions get recorded, not re-litigated.** A meaningful architectural choice
  becomes an ADR in `docs/adr/NNNN-title.md`, referenced from the spec.
- **`MUST` / `SHOULD` / `MAY`** follow [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119).
- **Channex vocabulary is preserved.** Where Channex names a concept
  (`rate_plan`, `booking_revision`, `restrictions`), we use the same word rather
  than inventing a synonym. Divergences are called out explicitly.
- **Every feature names its persona.** If no persona in spec 02 wants it, it does
  not go in the roadmap.
