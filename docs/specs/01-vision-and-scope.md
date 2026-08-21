# 01 — Vision & Scope

**Status:** `draft`

## 1.1 The problem

Independent hotels, hostels, guesthouses and small vacation-rental portfolios pay
€50–€300 per property per month for channel management, and again for a PMS, and
again for a booking engine. The software is closed, the data is hostage, and the
integrations that matter (accounting, door locks, local payment providers) either
do not exist or cost extra. Meanwhile the genuinely hard part of this
industry — being a *certified* connectivity partner to Booking.com, Expedia,
Airbnb, Agoda and forty others — is not something an open-source project can
credibly rebuild or maintain.

## 1.2 The bet

**Channex is the connectivity layer. We are the product layer.**

Channex.io already owns the expensive, unglamorous half: certified two-way OTA
adapters, mapping descriptors, ARI delivery, booking normalisation into
revisions, OTA messaging APIs, reviews. It exposes all of it as a plain JSON REST
API with webhooks.

That leaves the half that is actually a *product* — and that every closed vendor
does mediocrely:

- a calendar people enjoy using
- rate and restriction management that does not require a spreadsheet
- a real role model, so a housekeeper is not one click from deleting a rate plan
- one inbox for every OTA conversation
- dashboards that answer "how are we doing" without exporting to Excel
- an honest API and a plugin system, so the property owns its own integrations

We build that, open source, self-hostable, with Channex as a pluggable
connectivity provider behind an interface.

## 1.3 What we are

A **multi-tenant hospitality operations platform**:

1. **Channel manager UI** — connect OTAs, map inventory, push ARI, watch health.
2. **Reservation system** — ingest OTA bookings, handle revisions and
   cancellations, reconcile, never lose one.
3. **Light PMS** — arrivals/departures, room assignment, housekeeping board,
   folios and invoices.
4. **Unified guest inbox** — Booking.com, Airbnb and Expedia threads in one place
   with templates, automation and response-time SLAs.
5. **Direct booking engine** — a first-class channel we own, not an afterthought.
6. **Analytics** — occupancy, ADR, RevPAR, pace, channel mix, per role.

## 1.4 What we are explicitly *not*

| Not building | Why |
|---|---|
| Our own OTA adapters / XML certifications | Multi-year, per-OTA compliance treadmill. This is exactly what Channex is for. |
| A revenue-management ML engine (v1) | Rule-based yielding covers 80% of the value. Leave a clean extension point; ship the model later or let a plugin do it. |
| Full-service accounting | We export to accounting systems. We do not become one. |
| A payment processor | We orchestrate Stripe / Channex payment apps. We never touch a raw PAN — see [13](./13-nfr-security-compliance.md). |
| Restaurant / spa / POS modules | Different product. Plugin surface, not core. |
| A marketplace / metasearch site | We are software for properties, not a demand source. |

## 1.5 Provider abstraction (non-negotiable)

Even though Channex is the launch provider, **no domain or UI code may import a
Channex client directly.** All connectivity goes through a
`ConnectivityProvider` port (see [04](./04-architecture.md#43-ports-and-adapters)):

```
push ARI · pull mapping descriptors · create/activate channels
receive bookings · ack revisions · send/receive messages · fetch reviews
```

This costs us little now and buys three things: the project survives a Channex
pricing change, contributors can add a second provider, and a large operator can
run their own direct connections behind the same interface.

## 1.6 Deployment modes

| Mode | Who | Notes |
|---|---|---|
| **Single-property self-host** | One independent hotel | Docker Compose, one Channex account, one property. Must be genuinely easy — this is the adoption funnel. |
| **Portfolio self-host** | Management company, 5–200 properties | Multi-tenant, groups, portfolio dashboards, per-property staff. |
| **Managed SaaS** | Anyone who does not want to run servers | Same code plus billing, quotas, operator console ([12](./12-platform-admin-and-billing.md)). Optional; the OSS build must never be crippled to sell it. |

The tenancy model is identical in all three; single-property is just a tenant of
one. We do **not** maintain a separate "lite" codebase.

## 1.7 Product principles

1. **Never silently lose a booking.** Every revision is persisted, acknowledged,
   and reconciled. Unmapped bookings go to a visible queue, not a log line.
2. **Local state is authoritative for ARI.** We compute what inventory *should*
   be, push it, and continuously verify what Channex/OTAs actually hold. Drift is
   a first-class, surfaced concept.
3. **Every mutation is attributable.** Who changed this rate, from what, when,
   through which surface. No exceptions, including API and automation actors.
4. **Optimistic UI, honest state.** The calendar responds instantly; a pending or
   failed sync is *visibly* pending or failed. We never fake success.
5. **Boring, inspectable technology.** A hotelier's cousin who codes should be
   able to fix a bug on a weekend.
6. **Accessible and multilingual from the start.** Hospitality staff are not all
   in the same country, on desktop, or fully sighted. WCAG 2.2 AA, i18n on day
   one, RTL supported.
7. **Offline-tolerant front desk.** Check-ins must survive a flaky hotel network.

## 1.8 Success metrics

| Horizon | Metric | Target |
|---|---|---|
| MVP | Time from `docker compose up` to first OTA booking landing in the UI | < 60 min |
| MVP | Bookings lost or unacknowledged | 0 |
| v1 | ARI change → visible on OTA | p95 < 60 s |
| v1 | Properties live in production (non-contributor) | 25 |
| v1 | Median guest-message first response time on Booking.com | < 30 min |
| v2 | External contributors with merged PRs | 20 |
| v2 | Third-party plugins in the registry | 5 |

## 1.9 Licence and governance

Proposed: **AGPL-3.0** for the server, **Apache-2.0** for the SDK/plugin
interfaces and any embeddable booking-engine widget.

Rationale: AGPL keeps a SaaS competitor from taking the product closed while
leaving every self-hoster completely free; permissive licensing on the
integration surface avoids scaring off plugin authors and PMS vendors who want to
interoperate. A CLA/DCO decision is deferred — see [16](./16-open-questions.md).
