# 15 — Roadmap

**Status:** `draft`

Sequencing principle: **build the riskiest thing first.** The risk in this project
is not CRUD screens — it is the correctness of the sync engine and the booking
loop. So we build those before anything a demo would show off, behind a fake
provider that lets us simulate the failures that matter.

Estimates assume roughly one focused full-time developer and are deliberately
coarse. Treat them as sequencing, not commitments.

---

## M0 — Foundations *(~3 weeks)*

**Goal:** an empty but trustworthy skeleton.

- Monorepo, CI, Docker Compose, lint/typecheck/test gates.
- Postgres schema for tenancy + RLS; migrations; seed and demo-data generators.
- Identity: sign-up, login, 2FA, sessions, invitations.
- **`authz` package generated from [spec 02](./02-personas-and-rbac.md), with the
  full role × permission matrix test.**
- Audit log with hash chaining.
- Observability wiring: traces, metrics, structured logs, health endpoints.
- App shell: navigation, property switcher, i18n scaffolding, design system base.

**Exit:** a user can sign up, create an org, invite a colleague with a role, and
every action appears in the audit log. Cross-tenant tests pass.

---

## M1 — Connectivity core *(~4 weeks)* ← the highest-risk milestone

**Goal:** the sync engine, proven against simulated failure.

- `ConnectivityProvider` port + **`FakeProvider`** (429s, out-of-order webhooks,
  duplicate revisions, partial 200s, outages).
- `ChannexProvider`: auth, pagination, error taxonomy, tracing, adaptive rate limits.
- ARI model + diffing + **RLE/weekday/FIFO batch builder**, property-based tested.
- Per-property serialised push queue, circuit breaker, priority lanes.
- Webhook receiver: persist-first, dedupe, DLQ, replay.
- Booking ingestion + **the ack loop** with the 5-minute sweep.
- Drift detection, nightly reconcile, force resync.
- Chaos scenario runner asserting *no booking lost, no cell permanently wrong*.

**Exit:** the chaos suite is green, and a property provisioned on Channex staging
receives and acknowledges test bookings with zero loss.

---

## M2 — Inventory, calendar and channels *(~5 weeks)*

**Goal:** a usable channel manager.

- Property wizard; room types, rate plans (incl. derived + occupancy pricing),
  policies, taxes, photos.
- **The calendar grid**: virtualised, keyboard-driven, optimistic, per-cell sync
  state, range select, copy/paste, server-backed undo, conflict detection.
- Bulk update with dry-run and one-click undo.
- Restrictions and availability rules.
- Descriptor-driven channel connection wizard, mapping UI with auto-suggest and
  coverage warnings, channel health board.
- Sync Health page.

**Exit:** a real property connects Booking.com, maps inventory, changes rates, and
sees them live on the OTA. **This is the first genuinely useful release — tag it
`v0.1` and get a design partner on it.**

---

## M3 — Reservations and front desk *(~4 weeks)*

- Reservation list with saved views; detail page with revision timeline and diffs.
- Mapping resolution queue.
- Physical rooms, assignment and auto-assign, room blocks, OOO/OOS.
- Today board: arrivals, departures, in-house, room rack; check-in/out.
- Housekeeping board, mobile-first, offline-tolerant.
- Folios, charges, payments, invoices, night audit.
- Direct/walk-in booking creation; group bookings and rooming lists.

**Exit:** a property can run its front desk on this. `v0.2`.

---

## M4 — Messaging *(~3 weeks)*

- Thread and message sync; attachments; capability-driven UI.
- Unified inbox: filters, SLA chips, assignment, presence and collision detection.
- Templates with variables and locales; the strictly separated internal-note
  composer.
- Automation rules with quiet hours, rate limits, guest-reply handover, kill switch.
- Airbnb inquiry handling; Booking.com "no reply needed".
- Reviews list and responses.

**Exit:** median first-response time is measurable and improving. `v0.3`.

---

## M5 — Dashboards and reporting *(~3 weeks)*

- KPI engine, nightly rollups, **on-the-books snapshots** (start these as early as
  possible — pace data cannot be backfilled).
- Role dashboards per [11 §11.2](./11-dashboards-and-analytics.md#112-role-dashboards).
- Report catalogue, exports, scheduled email reports.
- Alerts and anomaly detection.

**Exit:** occupancy/ADR/RevPAR agree everywhere; owner statements generate. `v0.4`.

---

## M6 — Direct booking engine *(~4 weeks)*

- Direct channel as a connection; local availability search honouring restrictions.
- Booking funnel, holds, payments via Stripe, confirmation emails.
- Embeddable widget, hosted page, theming, i18n, accessibility audit.
- Promo codes, direct-only rates, extras and upsells.
- Guest portal with pre-check-in.

**Exit:** a commission-free booking flows end to end and appears like any other.
`v0.5`.

---

## M7 — Hardening to v1 *(~4 weeks)*

- **Channex PMS certification tests passing** against staging.
- Independent penetration test and remediation.
- Load and soak testing to the [13 §13.7](./13-nfr-security-compliance.md#137-performance-budgets) budgets.
- Backup/restore drill; upgrade and rollback rehearsal.
- All runbooks written and exercised.
- Documentation: install, operate, contribute, plugin guide, API reference.
- Accessibility audit remediation; i18n launch locales.
- Operator console and (optional) billing.

**Exit:** `v1.0` — a property can run its business on this, and a stranger can
self-host it from the README.

---

## Beyond v1

| Theme | Contents |
|---|---|
| **Plugin ecosystem** | Registry, sandboxing, reference plugins, accounting exports, guest-registration providers per country. |
| **PMS depth** | Multi-property groups, corporate/negotiated rates, allotments, packages, POS hooks, door locks. |
| **Revenue** | Competitor rate shopping, demand signals, ML pricing behind the existing yield-rule port. |
| **Distribution** | Metasearch and Google free booking links, GDS via Channex adapters, more direct channels (WhatsApp, SMS). |
| **Mobile** | A native shell for the front desk and housekeeping if the PWA proves insufficient. |
| **Scale** | Extracting the sync engine into its own service if a large operator needs it — the port makes this a deployment change, not a rewrite. |

## Suggested first two weeks

Concrete, so momentum is immediate:

1. Confirm the [16](./16-open-questions.md) decisions — stack, scope, name, licence.
2. Scaffold the monorepo with CI, Compose, Postgres, and the health endpoint.
3. Write `packages/core` value objects: `Money`, `LocalDate`, `DateRange`,
   `Occupancy` — with property-based tests. Everything else leans on these.
4. Generate `packages/authz` from spec 02 and make the matrix test pass.
5. Implement `FakeProvider` and the ARI batch builder with property-based tests.
   **This is the true heart of the product**; get it right before any UI exists.
