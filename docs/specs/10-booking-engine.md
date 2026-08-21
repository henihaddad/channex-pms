# 10 — Direct Booking Engine

**Status:** `draft`

**Primary personas:** the **guest**, plus `property_manager` and `revenue_manager`
who configure it.

Every OTA booking costs 15–25% commission. A direct channel is the highest-margin
inventory a property has, and in closed channel managers it is usually an
afterthought sold as an add-on. Here it is a first-class channel.

## 10.1 Architectural stance

**The direct channel is modelled as a `ChannelConnection` with
`adapter_code = "direct"`.** Availability, rates and restrictions therefore flow
through the same pipeline as any OTA, and a direct booking enters through the same
`Booking`/`BookingRevision` path as an OTA booking.

Consequences we want:

- one booking-creation code path for OTA, direct, and staff/walk-in
  ([08 §8.9](./08-reservations-and-frontdesk.md#89-direct-and-walk-in-bookings));
- availability decrements identically, so direct sales cannot overbook the OTAs;
- channel-mix reporting includes direct without special-casing;
- rate parity is visible against real OTA prices in one table.

Search reads **our own** `AvailabilityDay` / `RateDay` tables — we are the source
of truth, so a direct search is a local query, fast and unaffected by provider
latency. Channex's **Booking CRS API**, **Open Channel API** and **Shopping API**
remain available for the inverse case (an operator who wants their engine
registered as a Channex channel, or wants to shop other inventory); the provider
port keeps that door open without complicating v1.

## 10.2 Guest booking flow

```mermaid
flowchart LR
  A[Search: dates, guests,<br/>promo code] --> B[Results: room types<br/>with rate plan options]
  B --> C[Extras: breakfast, parking,<br/>early check-in]
  C --> D[Guest details<br/>+ special requests]
  D --> E[Payment / guarantee<br/>per policy]
  E --> F[Confirmation<br/>+ email + calendar file]
  F --> G[Guest portal link]
```

Requirements:

- **BE-1** Availability and price shown must be the price charged. Taxes and fees
  are itemised before payment, never revealed at the last step.
- **BE-2** Restrictions are honoured in search: min/max stay, CTA/CTD, stop-sell,
  cut-off and release rules.
- **BE-3** Multi-room and multi-room-type bookings in one transaction.
- **BE-4** Occupancy-aware pricing including children's ages, matching the rate
  plan configuration.
- **BE-5** A **hold** (default 15 min) reserves inventory during checkout and
  releases automatically on abandonment. Holds count against availability so we
  cannot double-sell the last room during a slow card entry.
- **BE-6** Idempotent submission — a double-clicked confirm button creates one
  booking.
- **BE-7** Confirmation email in the guest's language with a portal magic link and
  an `.ics` attachment.
- **BE-8** Full audit trail from search to confirmation for dispute resolution.

## 10.3 Distribution and embedding

- **Hosted page** at a per-property path or custom domain, server-rendered for SEO.
- **Embeddable widget** — one `<script>` tag plus a target element; renders in an
  iframe with `postMessage` resizing so it never breaks a hotel's WordPress theme.
- **Deep links** honouring dates, promo code, room type and language, so campaigns
  can land directly on results.
- **Multi-property search** for portfolios, with a map and property filters.
- **White-label theming**: logo, colours, fonts, custom CSS, per property.
- **Localisation**: full i18n, RTL, per-locale currency display with a clear
  statement of the charge currency.

Non-functional:

- **BE-9** LCP < 2.0 s on a mid-range mobile over 4G; the widget's initial JS
  payload under 100 kB gzipped.
- **BE-10** WCAG 2.2 AA on the entire funnel, keyboard-completable end to end.
- **BE-11** No third-party trackers by default. Analytics and pixels are opt-in per
  property with a consent banner, and the engine works fully with consent denied.

## 10.4 Payments

Through the `PaymentProvider` port; **Stripe** is the reference implementation, and
Channex's payment application / Stripe tokenisation app is supported for
properties already using it.

- Policy-driven guarantee: card-on-file, deposit (fixed or %), full prepayment, or
  pay-at-property.
- SCA / 3-D Secure where applicable; failures surface as recoverable, with a retry
  that does not lose the booking form.
- **We never see a PAN.** Card fields are provider-hosted elements; our servers
  receive a token ([13](./13-nfr-security-compliance.md)).
- Refunds and cancellation fees are computed from the policy and executed under
  step-up auth.
- Multi-currency: display currency vs charge currency always stated explicitly.

## 10.5 Direct-only commercial tools

- **Promo codes** — percentage or amount, date and stay constraints, usage caps,
  single-use codes.
- **Direct-only rate plans** — mapped to the direct channel and nowhere else, which
  is the entire point of parity-compliant direct discounting.
- **Upsells and extras** — breakfast, parking, transfers, early/late checkout,
  posted to the folio as charges.
- **Abandonment recovery** — an optional email to a guest who entered contact
  details and did not complete, subject to consent, throttled, and off by default.
- **Best-rate messaging** — an honest comparison against the mapped OTA price for
  the same dates, using our own parity data rather than a scraped guess.

## 10.6 Guest portal

Magic-link authenticated, scoped to one booking, no account required.

- View and download the reservation and invoice.
- **Online pre-check-in**: guest details, ID/passport upload where legally
  required, arrival time, preferences — feeding the front desk board and cutting
  arrival queues.
- Purchase extras and upgrades.
- Message the property (creating a `direct` thread in the unified inbox).
- Self-service cancellation or date change **only where the policy allows it**,
  with the fee shown before confirming.
- Post-stay: invoice, review link.

Security: single-use, short-lived, rate-limited links; no enumeration of other
bookings; every portal action audited as an `actor_type = guest` entry.

## 10.7 Roadmap beyond v1

Metasearch and Google Hotel Ads free booking links (via the Channex adapters where
available), corporate/negotiated-rate portals with company logins, gift vouchers,
and a multi-property loyalty/member rate scheme.

## 10.8 Acceptance criteria

- A guest can book a room on a phone in under 90 seconds, keyboard-only if needed.
- A direct booking decrements OTA availability within seconds, through the same
  path as an OTA booking.
- A restriction set in the calendar is immediately respected by the engine.
- The property pays 0% commission, and the channel-mix report shows the saving in
  money.
