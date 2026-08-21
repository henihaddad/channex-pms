# 16 — Open Questions

**Status:** `draft` — this is the working agenda. Each answer becomes an ADR.

Ordered by how much they change the build.

## Q1 — Target segment first? *(blocks the data model)*

Hotels, vacation rentals, and hostels look similar and are not.

- **Hotels** — room types with many identical units; the model in
  [03](./03-domain-model.md) fits natively.
- **Vacation rentals** — each property *is* one unit (`count_of_rooms = 1`); managers
  hold 50 separate Channex properties. Portfolio-level UX becomes the primary
  surface, not a nice-to-have, and per-property onboarding cost dominates.
- **Hostels** — beds sold individually within dorms; needs bed-level inventory,
  which is a real extension, not a config flag.

Current assumption: **hotels and small guesthouses first**, portfolio features
designed in from the start, hostel bed-level inventory deferred. Confirm or redirect.

## Q2 — Scope of v1: channel manager, or channel manager + PMS? *(≈8 weeks of difference)*

[15](./15-roadmap.md) sequences the channel manager first (M2) and the front
desk/folio work second (M3). An alternative is to ship the channel manager alone as
v1 and treat the PMS as v2 — faster to adoption, but properties then keep paying for
a second system, which weakens the pitch.

Assumption: keep both, sequenced, with `v0.1` at M2 so real feedback arrives early.

## Q3 — Technology stack *(blocks all code)*

[14](./14-tech-stack.md) recommends TypeScript + NestJS + Next.js + Postgres +
Redis. Elixir/Phoenix is a strong second and is what Channex itself uses. **Which
are you personally fastest and happiest in?** For a project whose first year depends
on one or two people, that outweighs every abstract argument in spec 14.

## Q4 — SaaS, or pure open source?

Affects whether the billing and quota work in [12](./12-platform-admin-and-billing.md)
is in v1 or dropped entirely. Options: pure OSS (no billing module), OSS + a hosted
offering (billing needed, parity guarantee applies), or open-core (**not
recommended** — it corrodes contributor trust and contradicts
[01 §1.9](./01-vision-and-scope.md#19-licence-and-governance)).

Assumption: OSS-first, with the billing module optional and clearly separable.

## Q5 — Licence and contribution model

Proposed AGPL-3.0 (server) + Apache-2.0 (SDK, plugin interfaces, booking widget).
Open: DCO or CLA? A CLA preserves relicensing and dual-licensing options; it also
deters casual contributors. Recommendation: **DCO**, unless a hosted commercial
offering is definitely planned.

## Q6 — Commercial relationship with Channex

Practical questions to settle with them early, because they affect the product's
economics and legal footing:

1. Pricing model for an OSS integrator — per property, per account, revenue share?
2. Is a reseller / white-label arrangement available, so a self-hoster gets
   connectivity without a separate negotiation?
3. Long-lived staging access for CI, and the certification process and timeline.
4. Are undocumented rate limits publishable, so our limiter can be tuned rather
   than adaptive-guessing?
5. Roadmap alignment: HMAC webhook signing, more messaging channels, a bulk ARI
   read endpoint for cheaper drift detection.
6. Would they support the project publicly? An open-source PMS is a distribution
   channel for them, which makes this a plausible ask rather than a favour.

## Q7 — Existing Channex users: import or greenfield?

Many prospects already run Channex with properties, mappings and history in place.
Do we build an **import mode** that adopts existing Channex properties, room types,
rate plans and channels into our model? It is real work (reconciling by natural key,
back-filling ARI, taking over the webhook endpoint without dropping bookings during
cutover) and it is probably the single strongest adoption lever we have.

Recommendation: yes, in M2, as an explicit "adopt existing property" path.

## Q8 — Tenancy isolation model

Shared tables + RLS (assumed: simplest operationally, fine to hundreds of tenants)
vs schema-per-tenant (stronger isolation, painful migrations) vs
database-per-tenant (enterprise-grade, operationally heavy). Confirm shared+RLS.

## Q9 — Name and brand

`channex-pms` is a fine working title but couples us to one provider — awkward
given the deliberate provider abstraction in
[01 §1.5](./01-vision-and-scope.md#15-provider-abstraction-non-negotiable), and it
borrows someone else's trademark. Worth choosing something ownable before the first
public release. Also needed: a domain, a GitHub org, and a one-line pitch.

## Q10 — Launch locales

Which languages for v1? Suggested: English, French, Arabic (an early RTL test is
worth far more than a late one), Spanish, Portuguese. Confirm, and say whether any
launch market imposes guest-registration or e-invoicing obligations
([13 §13.9](./13-nfr-security-compliance.md#139-sector-specific-compliance)) that
must be in v1 rather than a plugin.

## Q11 — Design partners

Who is property #1? A real property using this weekly is worth more than any amount
of speculative design. Ideally two: one hotel, one small portfolio. Do you have
access to either?

## Q12 — AI features: how far?

The spec keeps AI strictly optional and human-in-the-loop
([09 §9.3](./09-messaging-and-inbox.md#93-composing)). Options range from none, to
reply drafting only, to reply drafting + review responses + pricing suggestions.
Anything more raises privacy obligations and self-hoster friction. Assumption:
opt-in reply drafting behind a port, off by default.

## Q13 — Mobile

PWA only (assumed for v1), or native shells for the front desk and housekeeping?
Native buys reliable offline behaviour and push notifications, at the cost of an
app-store release process.

## Q14 — Deferred technical decisions

- Whether to snapshot on-the-books data from M0 rather than M5 — it cannot be
  backfilled, and the cost is one nightly job. **Leaning yes.**
- Whether the direct booking engine registers as a Channex channel via the Open
  Channel API or stays purely local ([10 §10.1](./10-booking-engine.md#101-architectural-stance)).
- Whether availability keep-back defaults on or off for new properties.
- Reporting horizon: how many years of history to keep queryable before archiving.
