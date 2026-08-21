# 08 — Reservations, Turnover & Field Operations

**Status:** `review` — revised 2026-08-21: turnover operations are the primary
surface; the front desk remains for `hotel`-kind properties.

**Primary personas:** `ops_coordinator`, `cleaner`, `maintenance_tech`,
`reservations_agent`, `property_manager`.

For an STR manager the operational unit of work is not a check-in desk — it is the
**turnover**: guest leaves at 10:00, cleaner arrives, unit is cleaned, photographed
and inspected, access code rotates, next guest arrives at 15:00. Same-day
changeovers across a city are the hardest thing these companies do, and no channel
manager helps them do it. That is the gap this module fills.

## 8.1 Reservation list

Virtualised table, server-side filtered, saved views per user, portfolio-wide by
default with property/group filters.

Filters: date type (arrival / departure / stay / booked) · date range · property /
group · channel · status · mapping state · payment state · unit · unassigned ·
access-credential state · flagged · free text (guest, email, OTA reference, phone).

Shipped views: **Arrivals today**, **Departures today**, **In stay**,
**Same-day changeovers**, **Unassigned**, **Unmapped**, **No access code issued**,
**Cancelled this week**, **Modified since yesterday**, **Payment action needed**.

- **RES-1** Bulk actions where safe: assign units, issue access codes, export, tag.
- **RES-2** Every list exportable (CSV/XLSX) under `export:execute`.
- **RES-3** A `modified` badge persists until a human acknowledges it — a silently
  missed date change strands a guest at a locked door.

## 8.2 Reservation detail

| Section | Contents |
|---|---|
| **Header** | Guest, channel logo, OTA reference, status, dates, nights, total, balance, flags, actions bar. |
| **Stay** | Room/unit, rate plan, occupancy (with children's ages), assigned unit, nightly price breakdown from `BookingRoomDay`. |
| **Access** | Issued credentials: type, validity window, delivery state, rotate/revoke actions. Gated by `access_credential:read`; values masked by default. |
| **Guest** | Contact, language, country, stay history, notes, preferences. Gated by `booking:read_pii`. |
| **Financials** | Room revenue, extras, taxes, **OTA-withheld taxes separately**, OTA commission, expected payout, folio balance, **owner attribution** (which agreement this revenue flows to). |
| **Payment** | Instrument metadata (masked card / VCC balance and window). Step-up gated, audited per view. |
| **Operations** | The linked turnover tasks: previous departure clean, pre-arrival inspection, states and photos. |
| **Revisions** | The timeline (§8.3). |
| **Messages** | The linked thread inline, sendable without leaving. |
| **Audit** | Every local action, with actor and surface. |

## 8.3 Revision timeline

- One entry per revision, newest first: type, received timestamp, OTA `system_id`.
- A **human-readable diff**: "Departure 14 Mar → 16 Mar (+2 nights, +€230)".
- Raw payload viewable by `property_manager`+ for disputes.
- An unacknowledged-change indicator until a human confirms they saw it.
- **RES-4** A date or unit change automatically regenerates turnover tasks and
  revokes/reissues access credentials (INV-14), and says so in the timeline.

## 8.4 Actions

| Action | Notes |
|---|---|
| Assign / move unit | Availability-aware; warns on attribute mismatch and on moving an in-stay guest. `single_unit` properties skip this entirely. |
| Auto-assign | For `multi_unit`/`hotel`: keeps stays contiguous, minimises moves; previewable. |
| Issue / rotate / revoke access | Generates a `AccessCredential` via the `LockProvider` port or manual code entry; schedules delivery by automation. |
| Check in / out | `hotel` kind: full desk flow. STR kinds: an arrival/departure confirmation that flips unit state and starts the turnover clock. |
| No-show | Applies policy fee, releases the unit, records the reason. |
| Modify (direct bookings) | Dates, occupancy, rate plan, extras — reprices and recalculates availability. **OTA bookings are modified at the OTA**; we say so plainly. |
| Cancel | Policy-driven fees, releases availability, notifies guest, revokes access, cancels turnover tasks. |
| Add charge / payment, split folio | See §8.8. |
| Resolve unmapped | See §8.5. |

- **RES-5** Every action states its side effects before committing ("releases 2
  nights on Alfama 2B, revokes the door code, cancels Thursday's clean").
- **RES-6** Permission-blocked actions are visible but disabled with the reason.

## 8.5 Mapping resolution queue

The operational face of [05 §5.7](./05-channex-integration.md#57-unmapped-bookings):
every booking whose room type or rate plan could not be resolved, with OTA codes,
ranked suggestions, one-click resolve, and a follow-up prompt to fix the channel
mapping so it cannot recur. Blocks arrival preparation until resolved; never blocks
messaging the guest.

## 8.6 The turnover board

The `ops_coordinator`'s home screen. Portfolio-wide, one day at a time, realtime.

**Layout** — a time-windowed board:

- **Departures lane** — each with checkout time, unit, and the turnover task it
  spawns.
- **Turnovers lane** — tasks ordered by deadline pressure; **same-day changeovers
  pinned to the top with a countdown** (time until check-in minus estimated clean
  duration + travel).
- **Arrivals lane** — check-in time, access-credential state, unit readiness.
- **Map view** — tasks plotted across the city with crew positions (opt-in),
  because routing five cleaners through fourteen apartments is a geography problem.

**Scheduling:**

- **OPS-1** Tasks generate automatically from booking diffs the moment a revision
  lands: departure clean on checkout date, changeover when a same-day arrival
  exists, mid-stay per configured cadence for long stays.
- **OPS-2** Assignment: manual drag, or **suggested routing** that orders each
  cleaner's day by geography and deadline (simple greedy + travel estimates in v1 —
  no route-optimisation research project).
- **OPS-3** A booking modification or cancellation **re-plans affected tasks and
  notifies the assignee** of exactly what changed.
- **OPS-4** Unassigned same-day changeovers within N hours escalate: push to the
  coordinator, then to the property manager.
- **OPS-5** Crews (external cleaning companies) receive tasks under their own
  grants; their members see only their own assignments (`turnover:read_own`).

## 8.7 The cleaner app

A PWA designed for a phone in a stairwell, in the cleaner's language.

- **My day**: an ordered route of tasks with addresses, access instructions, and
  time windows. One tap to navigate.
- Per task: checklist (photo-required items enforced), supplies notes, "report
  issue" (creates a `MaintenanceIssue` with photos in ≤3 taps), guest-facing
  info they need (arrival time) and nothing they don't (no financials, no PII
  beyond first name).
- State flow: `assigned` → `accepted` → `on_site` → `done` → `inspected`
  (inspection optional per org).
- **OPS-6** Fully offline-tolerant: the day's tasks are cached; state updates,
  photos and issues queue locally and sync on reconnect with visible pending state.
- **OPS-7** Completing a changeover task flips unit status and can trigger the
  "your place is ready" guest message automatically.
- **OPS-8** Photo evidence is timestamped, geotagged (opt-in), stored per task, and
  retained per the org's dispute-window policy — it is the manager's defence in
  damage disputes and the owner's assurance of quality.

## 8.8 Maintenance

- Issues from cleaners, guests (via portal), owners (via portal) or staff, with
  severity, category, photos.
- Triage on the coordinator's board: assign to `maintenance_tech` or vendor, block
  availability if needed (`UnitBlock`, pushed to channels), track cost.
- Closing an issue with a cost prompts: **rebill to owner?** → creates an
  `OwnerExpense` with the receipt attached, flowing to the next statement.
- Recurring preventive tasks (boiler service, filter change) on a schedule. v1.1.

## 8.9 Folios, charges and invoices

Native to us; Channex has no billing concept.

- **Folio per booking**, splittable, transferable between folios.
- **Charges**: nightly room revenue posting, extras, **tourist/city tax with
  per-jurisdiction rules** (per person per night, age exemptions, caps), cleaning
  fees, damage charges, cancellation and no-show fees.
- **Payments**: card via `PaymentProvider`, cash, bank transfer, OTA-collected,
  virtual cards. OTA-collected amounts and commission reconcile to expected payout.
- **Security deposits**: pre-authorisation hold via the payment provider, release
  or capture with a reason; the STR damage-deposit flow, first-class.
- **Virtual cards**: balance and charge window surfaced with a deadline reminder —
  a missed VCC window is unrecoverable revenue.
- **Invoices**: gapless sequential numbering per property (a legal requirement in
  most of Europe), templates, credit notes, PDF + email, multi-currency with the
  rate recorded at posting.
- **Refunds** require step-up auth and a reason.
- **Night audit** (`hotel` kind) / **daily close** (STR kinds): posts revenue,
  rolls the business date, flags unbalanced folios, feeds the daily report.
  Idempotent and re-runnable.

## 8.10 Front desk (hotel-kind properties)

Everything above applies; additionally, `hotel` properties get:

- **Today board**: arrivals, departures, in-house, with one-click check-in/out.
- **Room rack**: rooms × 14 days, occupied/arriving/departing/blocked/dirty, with
  drag-and-drop moves.
- Registration cards, walk-in creation at the desk, shift handover notes with
  acknowledgement.
- Housekeeping runs on the same `TurnoverTask` model with corridor-style boards
  (by floor) instead of city routing.

## 8.11 Direct and staff bookings

Staff can create bookings directly: availability-checked, priced from the rate
plan, guest created or matched, availability pushed everywhere, confirmation
emailed. Same domain path as the booking engine ([10](./10-booking-engine.md)) —
one booking-creation code path, ever.

**Owner stays** are created as `UnitBlock`s of reason `owner_stay` (by staff or by
the owner from their portal, subject to agreement terms), reduce availability, and
appear on the statement per the agreement (free, at cost, or at a configured rate).

## 8.12 Acceptance criteria

- An OTA booking is visible within 30 seconds, with turnover tasks generated and
  availability decremented, no manual step.
- A same-day changeover that loses its cleaner is escalated within minutes, not
  discovered at check-in.
- A cleaner with no signal for an hour loses zero updates and zero photos.
- A date modification regenerates tasks and rotates the door code without human
  intervention, and the timeline shows it did.
- A hotel-kind property can run a real front desk; an STR portfolio never sees one.
