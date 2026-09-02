# 01 — Vision & Scope

**Status:** `review` — segment, v1 scope and business model decided 2026-08-21.

## 1.1 The problem

A vacation-rental manager with 40 apartments pays for a channel manager (per
listing), a PMS (per listing), a booking engine, a cleaning-coordination app, and
then builds owner statements in a spreadsheet every month. Five hundred to three
thousand euros a month, five logins, and the owner reporting — the thing their
actual clients see — is the part no vendor does well.

Independent hotels have the same problem in a different shape. Both are paying
repeatedly for software whose expensive half is something neither vendor built:
certified connectivity to Booking.com, Airbnb, Vrbo, Expedia and forty others.

## 1.2 The bet

**Channex is the connectivity layer. We are the product layer.**

Channex.io owns the unglamorous half — certified two-way OTA adapters, mapping
descriptors, ARI delivery, booking normalisation into revisions, OTA messaging,
reviews — and exposes all of it as a plain JSON REST API with webhooks.

That leaves the half that is actually a *product*, and that every closed vendor
does mediocrely:

- a portfolio calendar that works at 200 listings, not just at 20
- rate and restriction management that does not require a spreadsheet
- a real role model, so a cleaner is not one click from deleting a rate plan
- one inbox for every OTA conversation
- **owner statements and payouts that generate themselves**
- turnover coordination that survives a same-day changeover
- dashboards that answer "how are we doing" without exporting to Excel
- an honest API and a plugin system, so the manager owns their own integrations

We build that, open source, self-hostable, with Channex as a pluggable
connectivity provider behind an interface.

## 1.3 Primary segment: vacation rentals and short-term rental managers

**Decided.** The model is optimised for **short-term rental managers** — companies
and individuals operating 5–300 units, usually on behalf of owners.

What this decides, concretely:

| Because the segment is STR… | The product must… |
|---|---|
| Each listing is typically its own Channex property with one unit | Treat **the portfolio, not the property, as the primary scope**. Every screen defaults to "all my listings". |
| Managers hold 40–300 properties | Make per-listing onboarding near-free: clone, templates, bulk import, bulk channel connection. Onboarding cost dominates everything else. |
| Airbnb is a top-two channel | Treat Airbnb's OAuth, listing import, inquiries, reservation requests and alteration requests as **first-class**, not as an adapter footnote. |
| There is no front desk | Replace it with **turnover operations**: cleaning, same-day changeovers, cleaner routing, access codes, self-check-in, maintenance. |
| Units are managed for owners | Ship **owner agreements, statements, expenses and payouts** as a core module, plus an owner portal. This is the single biggest differentiator. |
| Guests are strangers arriving to an empty flat | Automated messaging, access credentials and pre-arrival flows are revenue-critical, not conveniences. |
| Tourist tax and guest registration are per-city | Make jurisdiction rules pluggable and unavoidable. |

**Hotels and guesthouses remain fully supported** — `property.kind = hotel` keeps
room types with many identical units, and the front-desk surfaces appear only for
those properties. We are not building an STR-only product; we are choosing whose
workflow gets optimised when the two conflict.

**Hostels** (bed-level inventory within dorms) are explicitly deferred to post-v1.

## 1.4 What we are

1. **Channel manager** — connect OTAs, map inventory, push ARI, watch health.
2. **Reservation system** — ingest OTA bookings, handle revisions and
   cancellations, reconcile, never lose one.
3. **Operations** — turnover and cleaning coordination, access codes, maintenance,
   plus front-desk surfaces for hotel-kind properties.
4. **Unified guest inbox** — Booking.com, Airbnb and Expedia threads in one place
   with templates, automation and response-time SLAs.
5. **Owner management** — agreements, statements, expenses, payouts, owner portal.
6. **Direct booking engine** — multi-property search, commission-free, a
   first-class channel.
7. **Analytics** — occupancy, ADR, RevPAR, pace, channel mix, per role.
8. **Hosted service** — a managed offering from launch, on the same open codebase.

## 1.5 What we are explicitly *not*

| Not building | Why |
|---|---|
| Our own OTA adapters / XML certifications | A multi-year, per-OTA compliance treadmill. Exactly what Channex is for. |
| A revenue-management ML engine (v1) | Rule-based yielding covers 80% of the value. Leave a clean extension point. |
| Full-service accounting | We produce owner statements and export to accounting systems. We do not become one. |
| A payment processor | We orchestrate Stripe and Channex payment apps. We never touch a raw PAN — see [13](./13-nfr-security-compliance.md). |
| Hostel bed-level inventory (v1) | A genuine domain extension, not a flag. Post-v1. |
| A listing marketplace | We are software for managers, not a demand source. |
| Smart-lock / IoT drivers in core | A `LockProvider` port and reference plugins. Not core. |

## 1.6 Provider abstraction (non-negotiable)

Even though Channex is the launch provider, **no domain or UI code may import a
Channex client directly.** All connectivity goes through a `ConnectivityProvider`
port ([04 §4.3](./04-architecture.md#43-ports-and-adapters)). This costs little now
and buys three things: the project survives a Channex pricing change, contributors
can add a second provider, and a large operator can run direct connections behind
the same interface.

## 1.7 Deployment and commercial model

**Decided: open source *and* a hosted service from launch.**

| Mode | Who |
|---|---|
| **Self-host** | Managers and hotels who want control. Docker Compose, full product, no crippled build. |
| **Managed SaaS** | Anyone who does not want to run servers. Same code, plus billing, quotas and the operator console ([12](./12-platform-admin-and-billing.md)). |

**Parity guarantee.** The billing module is *additive*. No feature is withheld from
the self-hosted build, ever, and feature flags exist for rollout — never as a
paywall. Open-core is explicitly rejected: it corrodes contributor trust, and the
contributors are the point.

Consequence for the roadmap: billing, quotas, dunning and the operator console are
**in v1**, not deferred ([15](./15-roadmap.md)).

## 1.8 Product principles

1. **Never silently lose a booking.** Every revision is persisted, acknowledged and
   reconciled. Unmapped bookings go to a visible queue, not a log line.
2. **Local state is authoritative for ARI.** We compute what inventory *should* be,
   push it, and continuously verify what Channex and the OTAs actually hold. Drift
   is a first-class, surfaced concept.
3. **Portfolio-first.** Any screen that only works for one property at a time is
   unfinished. 200 listings is the design target, not the stretch goal.
4. **Every mutation is attributable.** Who changed this rate, from what, when,
   through which surface — including API and automation actors.
5. **Optimistic UI, honest state.** The calendar responds instantly; a pending or
   failed sync is *visibly* pending or failed. We never fake success.
6. **The owner is a user, not a report.** Owners get a real portal, not a monthly PDF.
7. **Boring, inspectable technology.**
8. **Accessible and multilingual from the start.** WCAG 2.2 AA, i18n day one, RTL
   supported.
9. **Offline-tolerant field work.** Cleaners work in basements and stairwells.

## 1.9 Success metrics

| Horizon | Metric | Target |
|---|---|---|
| MVP | Time from `docker compose up` to first OTA booking in the UI | < 60 min |
| MVP | Bookings lost or unacknowledged | 0 |
| v1 | ARI change → visible on OTA | p95 < 60 s |
| v1 | Time to onboard listing #2 through #40 | < 3 min each |
| v1 | Monthly owner statements generated with zero manual editing | > 95% |
| v1 | Managed-service tenants paying | 10 |
| v1 | Self-hosted properties live (non-contributor) | 50 |
| v2 | External contributors with merged PRs | 20 |
| v2 | Third-party plugins in the registry | 5 |

## 1.10 Licence and governance

**Decided 2026-09-02 (D5).** The project is **fair-code**, on the n8n model, not OSI open source.

| Component | Licence |
|---|---|
| Platform: `apps/web`, `apps/worker`, `packages/core` and all other packages not listed below | [Sustainable Use License 1.0](../../LICENSE.md) |
| Files with `.ee.` in the name or `.ee` in the directory | [Channex PMS Enterprise License](../../LICENSE_EE.md) |
| `packages/sdk`, `packages/plugin-api`, `packages/booking-widget` | Apache-2.0 |

The Sustainable Use License lets anyone read, self-host, modify and use the software for their own
business or personal use, free of charge, and offer consulting around it. It does not let anyone
host it and charge others for access, or white-label it inside a product they sell; that needs an
enterprise licence. This protects the hosted service (D4) without an open-core split: the
self-hosted edition is the full product, and the only enterprise-gated code is explicitly marked
`.ee.`.

The integration surface stays permissive so plugin authors, PMS vendors and hoteliers embedding the
booking widget on their own sites carry no restrictions.

Contributors sign the four-sentence [Contributor License Agreement](../../CONTRIBUTOR_LICENSE_AGREEMENT.md)
on their first pull request, which gives the project the right to relicense contributions. That
right is what keeps enterprise licensing, and a later move to a more permissive licence, possible.

Superseded: the earlier AGPL-3.0 + Apache-2.0 proposal. Its goal, stopping a SaaS competitor from
taking the product closed while leaving self-hosters free, is met more directly by the Sustainable
Use License, and it also lets us keep the term "fair-code" honest rather than calling a
service-protecting licence "open source".
