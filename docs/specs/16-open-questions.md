# 16 — Open Questions & Decision Log

**Status:** `review` — the big four were decided on 2026-08-21; each will get an
ADR when the repo scaffolding lands. Remaining open items are at the bottom.

## Decided

### ✅ D1 — Segment: **vacation rentals / short-term rental managers first**
*(was Q1, decided 2026-08-21)*

The model is optimised for STR managers operating 5–300 units for owners. Hotels
and guesthouses remain fully supported via `property.kind = hotel`; hostels
(bed-level inventory) are deferred post-v1. Consequences propagated:
portfolio-first UX, `single_unit` auto-managed inventory (MODEL-1), property
templates/clone/bulk import, turnover operations replacing the front desk
([08](./08-operations-and-turnover.md)), owner management as a core module
([17](./17-owner-management.md)), Airbnb OAuth as a first-class path, access
credentials in the domain model.

### ✅ D2 — v1 scope: **the full platform, booking engine included**
*(was Q2, decided 2026-08-21)*

Everything through M8 ships before `v1.0`: channel manager, operations, messaging,
owners, dashboards, booking engine, billing. Mitigation for the long runway
(9–11 months): every milestone from M2 onward is an independently usable release,
and design partners ride them while later milestones are built
([15](./15-roadmap.md)).

### ✅ D3 — Stack: **full-stack Next.js + separate Node worker; no NestJS**
*(was Q3, decided 2026-08-21)*

TypeScript throughout; Next.js App Router for console + booking engine + portals +
API routes; a plain Node BullMQ worker for the sync engine; `packages/core` holds
all domain logic, framework-free. The three conditions and the calendar's
deliberate idiom break are normative in [14](./14-tech-stack.md).

### ✅ D4 — Business model: **open source + hosted SaaS from launch**
*(was Q4, decided 2026-08-21)*

Billing, quotas, dunning and the operator console are in v1 (M8). The parity
guarantee holds: the self-hosted build is never crippled, feature flags are never
paywalls, open-core is rejected. This choice tilts Q5 toward a CLA — see below.

## Open

### Q5 — Contributor licensing: DCO or CLA?

Now sharper because of D4: we *are* running a commercial hosted service on this
code. A CLA preserves the option to offer commercial licences or relicense; DCO
maximises contributor trust and minimises friction. Middle path worth considering:
**DCO + a Contributor Agreement only for maintainers**, or the Fiduciary Licence
Agreement (FLA) which vests rights in a steward while guaranteeing the code stays
open. Needs a decision before the first external PR is accepted.

### Q6 — Commercial relationship with Channex

To settle with Channex early, because D4 makes us a reseller-shaped partner:

1. Pricing for an OSS integrator and for our hosted tenants — per property, per
   account, revenue share?
2. Can the hosted service hold one Channex master account with per-tenant
   sub-accounts (groups), or must each tenant bring their own Channex account?
   **This decides the SaaS onboarding flow and the margin structure**, and it is
   the most urgent open item on this list.
3. White-label / reseller terms for self-hosters, so they get connectivity without
   a separate negotiation.
4. Long-lived staging access for CI; certification process and timeline.
5. Publishable rate limits, so the adaptive limiter can be tuned rather than
   guessing.
6. Roadmap alignment: HMAC webhook signing, more messaging channels, bulk ARI read.
7. Public support: an open-source PMS is a distribution channel for them — a
   plausible ask, not a favour.

### Q7 — Adopt-existing-Channex-property import

**Recommended yes, scheduled in M2** ([15](./15-roadmap.md)): most prospects
already run Channex, and adopting their properties, mappings and webhook endpoints
without dropping a booking during cutover is the strongest adoption lever we have.
Confirm it stays in M2 if the milestone gets tight.

### Q8 — Tenancy isolation

Assumed **shared tables + Postgres RLS** (fine to hundreds of tenants, simplest
operations). Schema-per-tenant and database-per-tenant rejected for migration cost.
Confirm.

### Q9 — Name and brand

`channex-pms` couples the project to one provider and borrows a trademark. Needed
before the public launch: a name, domain, GitHub org, one-line pitch. Blocking
nothing technical, but blocking the public repo.

### Q10 — Launch locales

Suggested: English, French, Arabic (early RTL test), Spanish, Portuguese. Confirm,
and flag any launch market whose guest-registration or e-invoicing obligations
([13 §13.9](./13-nfr-security-compliance.md#139-sector-specific-compliance)) must be
v1 rather than a plugin. Tunisia/France specifics worth an early check given likely
first markets.

### Q11 — Design partners

Who is portfolio #1? Ideally one STR manager (20–60 units) and one small hotel.
A real portfolio on `v0.1` at M2 matters more than anything else on this page.

### Q12 — AI features

Spec stance: opt-in reply drafting behind an `LlmProvider` port, human always
sends, off by default, self-hostable models supported. Confirm or extend
(review responses? pricing suggestions?).

### Q13 — Mobile

PWA-only for v1 (assumed), including the cleaner app. Native shells post-v1 if
offline/push limits bite. Confirm.

### Q14 — Small technical items

- ✅ On-the-books snapshots start at **M0** (decided with D2 — cannot be backfilled).
- Direct booking engine: purely local (assumed) vs also registered as a Channex
  Open Channel. Revisit at M7.
- Availability keep-back default for new properties: **off** for `single_unit`
  (you cannot hold back your only unit), suggested `1` for hotel kinds. Confirm.
- Reporting horizon before archival: suggested 3 years hot, then parquet export.
