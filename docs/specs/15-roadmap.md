# 15 — Roadmap

**Status:** `review` — revised 2026-08-21. Decisions applied: STR-first, **v1 =
the full platform including the booking engine**, hosted SaaS from launch.

Sequencing principle unchanged: **build the riskiest thing first** — the sync
engine and the booking loop, behind a fake provider that simulates the failures
that matter. What changed: owner management and turnover operations are core
milestones, billing is in scope, and nothing is cut from v1.

A warning, stated once and honestly: this is a **9–11 month build for one focused
developer**. The milestones are ordered so that from M2 onward every release is
independently useful — which matters, because "everything in v1" only works if
design partners are on the earlier milestones while the later ones are built.

Estimates are sequencing, not commitments.

---

## M0 — Foundations *(~3 weeks)* ✅ exit criterion met 2026-09-02

- Monorepo (`web` + `worker` + `packages/*`), CI, Docker Compose, lint/typecheck
  gates, the unwrapped-handler build check.
- Postgres schema for tenancy + RLS; migrations; seed and demo-data generators.
- Identity: sign-up, login, TOTP, sessions, invitations, magic-link login.
- **`authz` generated from [spec 02](./02-personas-and-rbac.md)** with the full
  role × permission matrix test, including `owner` isolation (RBAC-9).
- Audit log with hash chaining. Observability wiring. App shell + i18n scaffolding.
- **Nightly on-the-books snapshot job** — pace data cannot be backfilled, so this
  starts before there is anything to snapshot ([Q14, resolved](./16-open-questions.md)).

**Exit:** sign up, create an org, invite a colleague with a role; every action
audited; cross-tenant and cross-owner tests green.

---

## M1 — Connectivity core *(~4 weeks)* ← highest risk ✅ exit met 2026-09-02 (chaos 200/200; certification green on staging.channex.io the same day)

- `ConnectivityProvider` port + **`FakeProvider`** (429s, out-of-order webhooks,
  duplicate revisions, partial 200s, outages).
- `ChannexProvider`: auth, pagination, error taxonomy, adaptive rate limits.
- ARI model + diffing + RLE/weekday/FIFO batch builder, property-based tested.
- Per-property serialised push queue, circuit breaker, priority lanes.
- Webhook receiver (persist-first, dedupe, DLQ, replay).
- Booking ingestion + **the ack loop** with the 5-minute sweep.
- Drift detection, nightly reconcile, force resync.
- Chaos runner asserting *no booking lost, no cell permanently wrong*.

**Exit:** chaos suite green; a property on Channex staging receives and acks test
bookings with zero loss.

---

## M2 — Inventory, calendar, channels *(~5 weeks)* ✅ exit met 2026-09-02 on FakeProvider (20-listing portfolio e2e; 200-listing × 90-day grid in 0.6 s); first design partner still to be found

- Property wizard with **`kind` selection**; `single_unit` auto-managed room
  type/unit (MODEL-1); **property templates, clone, and bulk import** — listing #40
  in three minutes is an M2 exit criterion, not a polish item.
- Rate plans (derived + occupancy pricing), policies, taxes, photos.
- **The portfolio calendar**: multi-property rows by default, virtualised,
  keyboard-driven, optimistic, per-cell sync state, range ops, server-backed undo.
- Bulk update with dry-run and one-click undo. Restrictions and availability rules.
- Descriptor-driven channel wizard; **`ChannelAccount` shared credentials**;
  **Airbnb OAuth + listing import as a first-class path**; mapping UI with
  auto-suggest and coverage warnings; channel health board; Sync Health page.
- **Adopt-existing-Channex-property import** (Q7, decided yes).

**Exit:** a real 20-listing portfolio connects Airbnb + Booking.com, maps, edits
rates, sees them live. Tag `v0.1`; first design partner on it.

---

## M3 — Reservations & operations *(~5 weeks)* ✅ exit met 2026-09-02 (simulated week on FakeClock; cleaner offline e2e)

- Reservation list + saved views; detail with revision timeline and diffs.
- Mapping resolution queue.
- Units, assignment (multi-unit/hotel), blocks incl. owner stays, OOO/OOS.
- **Turnover board**: auto-generated tasks, same-day changeover countdowns,
  crew assignment, routing suggestions, escalations.
- **Cleaner PWA**: offline-tolerant task flow, checklists, photos, issue reporting.
- Maintenance with owner-rebill hook.
- Access credentials: issue/rotate/revoke, automated delivery, INV-14.
- Folios, charges, tourist tax, deposits, invoices, daily close; front-desk board
  for `hotel` kind.
- Direct/staff booking creation.

**Exit:** a portfolio runs a week of real turnovers, including same-day
changeovers, without a spreadsheet. `v0.2`.

---

## M4 — Messaging *(~3 weeks)* ✅ shipped 2026-09-02 as v0.3

- Thread/message sync, attachments, capability-driven UI.
- Unified portfolio inbox: filters, SLA chips, assignment, collision detection.
- Org-scoped templates with variables and locales; the strictly separated
  internal-note composer.
- Automation: booking-confirmed → pre-arrival → **access-code delivery** →
  in-stay → post-stay; quiet hours, rate limits, guest-reply handover, kill switch.
- Airbnb inquiries and reservation/alteration requests as actionable cards with
  deadlines. Booking.com "no reply needed". Reviews + responses.

**Exit:** access codes deliver themselves; median first-response time measurable.
`v0.3`.

---

## M5 — Owners *(~4 weeks)* ✅ shipped 2026-09-02 as v0.4

- Owner records, documents, versioned agreements (all models + commission bases).
- Expense capture with receipts and approval flow.
- **Statement engine**: generation, review diff, approval, PDF, send; adjustment
  flow for post-send revisions; property-based tests on the arithmetic.
- Payouts: manual recording + Stripe Connect reference; step-up + four-eyes.
- **Owner portal**: dashboard, calendar with self-service owner stays, statements
  with line-level drill-down, expenses, maintenance, documents.

**Exit:** a manager closes a real month in under an hour; an owner self-serves the
"why is it lower" question. `v0.4`. **This is the release that wins customers.**

---

## M6 — Dashboards & reporting *(~3 weeks)* ✅ shipped 2026-09-02 as v0.5

- KPI engine + nightly rollups over the snapshots collected since M0.
- Role dashboards ([11 §11.2](./11-dashboards-and-analytics.md#112-role-dashboards)),
  portfolio league table, action queues.
- Report catalogue, exports, scheduled email reports. Alerts and anomalies
  (zero-booking channel, pace vs STLY, parity breach).

**Exit:** occupancy/ADR/RevPAR agree everywhere; owner statements reconcile to the
finance reports. `v0.5`.

---

## M7 — Direct booking engine *(~4 weeks)*

- Direct channel as a `ChannelConnection`; local availability search honouring all
  restrictions; **multi-property search with map** (portfolio-first).
- Funnel with holds, Stripe payments incl. deposits, confirmations, `.ics`.
- Embeddable widget, hosted page per property *and* per portfolio, theming, i18n,
  accessibility audit.
- Promo codes, direct-only rate plans, extras/upsells.
- **Guest portal**: pre-check-in, arrival details, access code reveal at the
  configured time, extras, direct-thread messaging, policy-driven self-service
  changes.

**Exit:** a commission-free booking flows end to end, gets a door code
automatically, and shows up in the owner's statement. `v0.6`.

---

## M8 — SaaS & hardening to v1 *(~5 weeks)*

- **Billing**: plans, Stripe Billing integration, metering (peak active
  units/period), dunning, self-service plan management, VAT handling
  ([12 §12.5](./12-platform-admin-and-billing.md#125-billing-saas-mode-only)).
- Quotas with the connectivity exemption (QUOTA-1). Operator console complete.
- **Channex PMS certification tests passing** against staging.
- Independent penetration test + remediation; load/soak to the
  [13 §13.7](./13-nfr-security-compliance.md#137-performance-budgets) budgets.
- Backup/restore drill, upgrade/rollback rehearsal, all runbooks exercised.
- Docs: install, operate, contribute, plugin guide, API reference. Launch locales.

**Exit:** `v1.0` — self-hosters install from the README; the hosted service takes
paying tenants.

---

## Beyond v1

| Theme | Contents |
|---|---|
| Plugin ecosystem | Registry, sandboxing; guest-registration providers per country (Alloggiati, SES, AIMA…); accounting exports; smart-lock providers (Nuki, TTLock, Igloohome). |
| Hostels | Bed-level inventory — the deferred segment. |
| Revenue | Competitor rate shopping, demand signals, ML pricing behind the yield port. |
| Distribution | Vrbo/Google via Channex adapters as they mature, metasearch, more direct channels (WhatsApp, SMS). |
| Owner growth | Owner-acquisition reports, owner referral flows. |
| Mobile | Native shells for cleaner/ops apps if the PWA hits limits. |
| Scale | Extract the sync engine into its own service if a very large operator needs it — the port makes it a deployment change. |

## Suggested first two weeks

1. Settle the naming question that remains in [16](./16-open-questions.md)
   (Q9); licensing is decided (D5). It blocks the public launch, not code.
2. Scaffold the monorepo: `apps/web`, `apps/worker`, `packages/core`, CI, Compose.
3. Write `packages/core` value objects — `Money`, `LocalDate`, `DateRange`,
   `Occupancy` — with property-based tests.
4. Generate `packages/authz` from spec 02; matrix test green.
5. Implement `FakeProvider` + the ARI batch builder with property-based tests.
   **The true heart of the product — before any UI exists.**
