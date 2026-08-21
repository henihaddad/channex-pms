# 08 — Reservations & Front Desk

**Status:** `draft`

**Primary personas:** `reservations_agent`, `property_manager`, `housekeeping`,
`finance`.

## 8.1 Reservation list

Virtualised table, server-side filtered, saved views per user.

Filters: date type (arrival / departure / stay / booked) · date range · channel ·
status (`new`, `modified`, `cancelled`, `no_show`) · mapping state · payment state ·
room type · rate plan · assigned room · unassigned · VIP · flagged · free-text
(guest name, email, OTA reference, phone, booking id).

Shipped saved views: **Arrivals today**, **Departures today**, **In house**,
**Unassigned**, **Unmapped**, **Cancelled this week**, **Modified since yesterday**,
**Payment action needed**.

- **RES-1** Bulk actions where safe: assign rooms, print/export, add note, tag.
- **RES-2** Every list is exportable (CSV/XLSX) under `export:execute`.
- **RES-3** A `modified` badge persists until a human acknowledges the change —
  silent modifications are how properties miss a date change and lose a room night.

## 8.2 Reservation detail

| Section | Contents |
|---|---|
| **Header** | Guest name, channel logo, OTA reference, status, dates, nights, total, balance, VIP/flag chips, and the actions bar. |
| **Stay** | Rooms with room type, rate plan, occupancy (adults/children with ages, infants), assigned physical room, per-night price breakdown from `BookingRoomDay`. |
| **Guest** | Contact details, language, country, company, stay history at this property, notes and preferences. Gated by `booking:read_pii`. |
| **Financials** | Room revenue, extras/services, taxes, **collected (OTA-withheld) taxes shown separately**, OTA commission, expected payout, folio balance. |
| **Payment** | Payment instrument metadata — masked card, type, expiry, cardholder; virtual card balance and effective window. Gated by `booking:read_payment_instrument`, step-up authenticated, and audited **per view**. |
| **Revisions** | The timeline (§8.3). |
| **Messages** | The linked thread inline, sendable without leaving the page. |
| **Tasks & notes** | Housekeeping requests, follow-ups, pinned internal notes. |
| **Audit** | Every local action on this booking, with actor and surface. |

## 8.3 Revision timeline

Because a booking *is* its revisions ([03 §3.5](./03-domain-model.md#35-reservations)):

- one entry per revision, newest first, with type (`new` / `modified` /
  `cancelled`), received timestamp, and OTA `system_id`;
- a **human-readable diff**: "Departure 14 Mar → 16 Mar (+2 nights, +€230)",
  "Guest name corrected", "Room type changed";
- raw payload viewable by `property_manager`+ for dispute resolution — the OTA's
  exact words matter when money is contested;
- an unacknowledged-change indicator until a human confirms they have seen it.

## 8.4 Actions

| Action | Notes |
|---|---|
| Assign / move room | Availability-aware; warns on attribute mismatch (accessible, connecting) and on moving an in-house guest. |
| Auto-assign | Optimises for keeping same-type stays together and minimising moves; always previewable before commit. |
| Check in | Requires assigned room and resolved mapping. Captures ID/registration where legally required, prints/emails the registration card. |
| Check out | Settles or explicitly defers the balance, sets room to `dirty`, generates the invoice. |
| No-show | Applies the policy's fee, releases the room, records the reason. |
| Modify (direct bookings only) | Dates, occupancy, rate plan, extras — recomputes price and availability. **OTA bookings are modified at the OTA**; we show that plainly instead of pretending. |
| Cancel | Policy-driven fee calculation, releases availability, notifies the guest. |
| Split / merge folio | For shared rooms and company billing. |
| Add charge / payment | See §8.7. |
| Resolve unmapped | See §8.5. |

- **RES-4** Every action states its side effects before committing ("this releases
  1 room on 14–16 Mar and will push new availability to 4 channels").
- **RES-5** Actions blocked by permission are visible but disabled with the reason,
  so staff learn the model instead of filing tickets.

## 8.5 Mapping resolution queue

The operational face of [05 §5.7](./05-channex-integration.md#57-unmapped-bookings).
A P1 work queue listing every booking whose room type or rate plan could not be
resolved, with the OTA codes, suggested matches ranked by confidence, one-click
resolve, and a follow-up prompt to fix the channel mapping so it cannot recur.
Empty state is the goal; the count is on every manager dashboard.

## 8.6 Today: the front desk board

A single operational screen for the shift, refreshing in realtime:

- **Arrivals** — expected, with assigned room, ETA, balance, special requests,
  VIP; one-click check-in.
- **Departures** — with balance due and late-checkout flags.
- **In house** — with stayover housekeeping needs.
- **Room rack** — a grid of rooms × next 14 days showing occupied / arriving /
  departing / blocked / dirty, with drag-and-drop room moves.
- **Alerts strip** — overbookings, unmapped bookings, failed payments, sync
  degradation. Anything that will ruin the shift, at the top.

Requirements:

- **FD-1** Loads in under 2 seconds and updates without a refresh.
- **FD-2** **Offline tolerance**: check-in, room status and notes queue locally and
  sync on reconnect, with an explicit offline banner. Hotel Wi-Fi fails at the
  worst moments.
- **FD-3** Printable / PDF shift handover report.
- **FD-4** A shift note that the next shift must acknowledge.

## 8.7 Housekeeping

Mobile-first, designed for someone holding a phone in a corridor.

- Nightly task generation from arrivals, departures and stayovers, by task type
  (`departure`, `stayover`, `deep`, `turndown`).
- Board grouped by floor or by attendant; assignment by drag or bulk.
- Room status transitions: `dirty` → `in_progress` → `clean` → `inspected`, with
  optional supervisor inspection and photos.
- `out_of_order` (reduces sellable availability, pushes to channels) vs
  `out_of_service` (does not). The distinction is explained inline every time,
  because getting it wrong either loses revenue or causes an overbooking.
- Maintenance issues raised from a room become tasks with photos and priority.
- Large touch targets, offline queueing, and a language switcher — housekeeping
  staff are frequently the least well served by hotel software and the most
  penalised for its mistakes.

## 8.8 Folios, charges and invoices

Native to us; Channex has no billing concept.

- **Folio per booking**, splittable per guest or per company, with transfers
  between folios.
- **Charges**: room revenue posted nightly, extras, city/tourist tax with
  per-jurisdiction rules, service charges, cancellation and no-show fees.
- **Payments**: cash, card (via `PaymentProvider`), bank transfer, OTA-collected,
  virtual credit card. OTA-collected amounts and commission are reconciled to the
  expected payout so a manager can see what the OTA actually owes.
- **Virtual cards**: balance and effective window are surfaced with a reminder
  before the window closes, since a missed VCC window is unrecoverable revenue.
- **Invoices**: sequential per-property numbering with no gaps (a legal requirement
  in most of Europe), configurable templates and tax display, credit notes, PDF and
  email delivery, and multi-currency with the rate recorded at posting time.
- **Refunds** require step-up auth and a reason.
- **Night audit**: a scheduled job that posts room revenue, rolls the business
  date, flags unbalanced folios, and produces the daily revenue report. Idempotent
  and re-runnable — night audit failures at 3am must be recoverable at 9am.

## 8.9 Direct and walk-in bookings

Staff can create a booking directly: availability-checked, priced from the rate
plan, guest record created or matched, availability pushed to channels, and
confirmation emailed. Same domain path as the booking engine
([10](./10-booking-engine.md)) so there is exactly one booking-creation code path,
not two that drift apart.

**Group bookings**: a group holds N rooms with a shared rate and a rooming list
imported from a spreadsheet, released on a deadline, and billed to a master folio.

## 8.10 Acceptance criteria

- An OTA booking is visible to the front desk within 30 seconds of arriving, with
  correct availability decremented.
- A cancellation releases inventory and pushes it to every channel automatically.
- An unmapped booking never blocks guest communication and never disappears.
- A receptionist can check in a guest, take a payment and print an invoice in under
  60 seconds.
- A housekeeper can update 20 rooms on a phone with poor connectivity without
  losing a single update.
