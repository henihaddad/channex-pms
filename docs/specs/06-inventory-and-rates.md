# 06 — Inventory, Rates & the Calendar

**Status:** `accepted` (2026-09-02) — implemented in M2: property wizard with `kind`, templates, clone and CSV import; derived plans recomputed in the same transaction as the parent edit; the portfolio grid (virtualised rows and columns, keyboard editing, range toolbar, `expected_version` conflicts, server-backed undo, SSE cell states); bulk update with mandatory dry run and inverse-operation undo; rolling 730-day horizon. The year view, seasons and the Pricing & availability page shipped in November 2026 (CAL-10, CAL-11, §6.6). Not yet built: presence avatars (CAL-6), history popover UI (the audit-backed endpoint exists), yield rules (§6.5) and promotions (§6.6), which M6/M7 pick up. The mobile day view (CAL-9) and rate import (§6.5b) shipped after v1.0.

**Primary personas:** `revenue_manager`, `property_manager`, `portfolio_manager`.

The calendar is the screen a revenue manager keeps open all day. If it is fast,
keyboard-driven and honest about sync state, the product is good. If it is slow or
lies, nothing else matters.

## 6.1 Inventory setup

**Room types** — title, description, `count_of_rooms`, occupancy limits (adults,
children, infants, max, default), bed configuration, size, facilities, photos.
Content pushes to Channex and onward to channels that accept it.

**Units** — native to us ([03](./03-domain-model.md#33-inventory-rates-and-content)).
Names, floors, attributes (accessible, connecting, pets, view), access
configuration. For `single_unit` properties the unit and its room type are
system-managed and invisible (MODEL-1); for `multi_unit` and `hotel` they are
explicit. A property may also run in "bucket mode" (channel-manager-only usage);
operations modules then hide themselves rather than showing empty screens.

**Rate plans** — title, currency, sell mode (per-room / per-person), meal plan,
occupancy pricing, tax set, policy, and optionally a **parent** with a derived
modifier.

### Derived rate plans

A derived plan (`parent + modifier`) is computed, never hand-edited. The editor
shows a live preview: "Non-refundable = Flexible − 10%, so 20 Mar is €135". Cells
belonging to a derived plan are read-only in the calendar with a link to the
parent, and changing the parent re-derives and re-pushes children in the same job.
Depth is capped at 3 (INV-6) because deeper chains become unexplainable to the
people who have to use them.

### Occupancy pricing

Channex accepts either a single `rate` or a `rates[]` array with per-occupancy
prices. The editor offers three modes:

1. **Flat** — one price regardless of occupancy.
2. **Per-occupancy table** — explicit price per occupancy level.
3. **Base + delta** — base occupancy price plus per-extra-adult / per-child
   amounts, expanded into the `rates[]` payload at push time.

## 6.2 The calendar grid

One screen, three data layers, 400+ visible cells, expected to feel instant.

**Layout — portfolio-first.** The default view is *all listings*: for
`single_unit` properties each listing is **one row** (its availability is 0/1 and
its primary rate inline), expandable to its rate plans; `multi_unit` and `hotel`
properties expand to room-type rows. A 200-listing portfolio is a 200-row grid,
grouped by `PropertyGroup`, filterable, and virtualised.

- Rows: property → room type (availability) → its rate plans (rate +
  restrictions), collapsible at every level. Pinned first column.
- Columns: dates. Views: 14 / 30 / 60 / 90 days, plus a **year heatmap** for
  spotting seasonal gaps.
- Header: weekday, date, season colour band, public holidays (per country),
  local events (optional data source), and an occupancy bar.
- Group/city filter and saved row-sets replace the single-property switcher; a single-property focus mode exists for hotel-kind properties.

**Cell content**

| Layer | Shows | Editable by |
|---|---|---|
| Availability (room type row) | units left, derived; red when overbooked | computed; only `count_of_rooms`, blocks and keep-back are editable |
| Rate (rate plan row) | price in property currency | `ari:update_rate` |
| Restrictions | compact badges: `MIN3` `CTA` `CTD` `STOP` `MAX7` | `ari:update_restriction` |
| Sync state | dot: grey pending · blue in-flight · green synced · red failed · amber drift | — |

**Interaction requirements**

- **CAL-1** Full keyboard control: arrows to move, type to edit, `Tab`/`Enter` to
  commit, `Esc` to cancel, `Shift`+arrows to range-select, `Cmd/Ctrl+C/V` to copy
  and paste blocks, `Cmd/Ctrl+Z` to undo. A revenue manager should never need the
  mouse.
- **CAL-2** Click a night or drag across nights (Shift-click extends, ⌘/Ctrl-click adds
  another range, even on another listing) → a panel under the strip for the selection,
  named after the listing and the nights it will change ("Alfama Loft · 16–18 Nov, 3 nights ·
  Mon, Tue, Wed"): price per night with what the old price was and what each connected OTA
  shows after its markup, Open/Block, the channels the nights are open on, minimum and maximum
  nights, the weekdays a guest may check in on (an unticked weekday writes `closedToArrival`
  on those nights), a private note, and where to apply it (the selection, every base plan of
  these listings, or every listing on screen). One "Save N nights" press writes only what was
  touched, as one undo entry; "More settings" keeps check-out closure and a percentage change
  that previews before it applies (BULK-1). No dialogs. A right-click on a night opens the same
  verbs as a menu (set price, block, open, minimum stay, private note, new reservation on
  these dates, copy price, paste to selection), and one key each does the same: `P`, `B`, `O`,
  `M`, `N`, `R`, `⌘C`, `⌘V`; `T` jumps to tonight; with no night focused `←`/`→` move the
  strip a week, `1`–`4` pick 14/30/60/90 nights and `Y` opens the year. Hovering a night shows
  a card: your price, what the guest sees on each connected OTA (markup and rounding from
  §6.6), the direct price, the minimum stay, any closure, the sync state and the private
  note. The toolbar carries Strip/Month/Year, the range, a property and group filter, Today,
  the price tips, the gear to Pricing & availability and `?`; a "Tricks that save you clicks"
  card lists every one of these, and a toast after each save names the nights and the
  channels told, with Undo and ⌘Z.
- **CAL-2a** Rows follow the portfolio shape: a listing with one room type and one base
  plan is one row carrying its cover photo (first library photo, else the photo an import
  brought), its title and a subtitle (city · plan · rooms); its derived plans fold under a
  "+N" button. A row of several rooms shows "N left" under each price. Bookings are bars
  across their nights, coloured by channel (Airbnb, Booking.com, Vrbo, Expedia, Direct) and
  labelled with the guest and the channel; a bar opens the reservation. Owner and maintenance
  blocks and stop-sold nights are hatched with the reason. Hotels keep property → room type →
  rate plan rows. Bars need `booking:read`; without it the strip still shows prices.
- **CAL-2b** Private notes on nights are kept with the property, keyed by plan and night,
  seen by the team and never sent to a channel; an empty note removes it.
- **CAL-3** Optimistic rendering: edits appear immediately, marked `pending`, with
  a per-cell state that resolves over the realtime channel.
- **CAL-4** Undo/redo is server-backed (an inverse operation, not a UI trick), so
  it survives a page reload and works on bulk operations.
- **CAL-5** Conflict handling: a cell edited by someone else since load prompts
  with both values (`expected_version` mismatch). Never a silent last-write-wins.
- **CAL-6** Live presence: avatars show who else is viewing/editing the property
  calendar, and their selection is faintly visible.
- **CAL-7** Performance targets: first paint < 1 s for 30 days × 40 rows;
  scroll and edit at 60 fps; virtualised rows and columns; the 90-day, 200-listing
  portfolio view must not exceed a 2 s load.
- **CAL-8** Every cell exposes a history popover: value, actor, surface, timestamp,
  and the sync result — sourced from the audit log.
- **CAL-9** Mobile: a phone opens one listing's month, not the strip: a tile per night with
  its price ("€80"), booked nights dark, the selection teal. Tap a night and tap or swipe to
  another to select the nights between; a bottom sheet sets price, Open/Block, minimum stay
  and a note and saves them in one press through the same ARI path, undo and push. A booked
  night opens its reservation. The single-day close-out list (every listing's price, rooms
  left, minimum stay and sync state for one night, and "close this night" through the bulk
  path) stays one link away, and on a desktop the month is the "Month" view.
- **CAL-10** Year view: twelve months of one listing from the current month, each night
  booked, part-booked, open or closed, each month with its occupancy on the books and its
  average price; nights in a season carry the season's colour. Tiles for occupancy over the
  next twelve months, revenue on the books, nights blocked by reason, seasons and price tips;
  a month opens the strip at that month.
- **CAL-11** Price tips are what a pricing engine proposes and has not applied (open
  `rate_import_pending` alerts from §6.5b). The calendar counts them and links to the review;
  with none it says so and says where they would come from. There is no tip engine of our own.

## 6.3 Bulk update

The workhorse for seasonal work, reachable from the calendar toolbar.

Inputs: date range · weekday filter (`mo`–`su`, mapping directly to the Channex
`days` parameter) · room types / rate plans (with "all", "derived included"
toggles) · operations.

Operations: set rate · adjust by % or amount (with rounding rules) · set/clear
min-stay family · set/clear CTA/CTD · stop-sell / open · set availability offset ·
apply a saved template.

Requirements:

- **BULK-1** Mandatory **dry-run preview**: affected cell count, before/after
  samples, and a warning when the blast radius exceeds a threshold.
- **BULK-2** Every bulk operation is one atomic, reversible, audited job with a
  single-click "undo this operation".
- **BULK-3** Progress is streamed; partial failures are itemised and retryable.
- **BULK-4** Guard rails block obviously wrong input (price 100× the 90-day
  median, negative rate, range beyond the horizon) with an explicit override that
  is logged.
- **BULK-5** Optional four-eyes approval above a configurable blast radius
  ([02 §2.6](./02-personas-and-rbac.md#26-authentication-and-step-up)).

## 6.4 Restrictions and availability rules

Full coverage of what Channex accepts: `min_stay`, `min_stay_arrival`,
`min_stay_through`, `max_stay`, `closed_to_arrival`, `closed_to_departure`,
`stop_sell`. Read-only fields (`availability_offset`, `max_availability`) are
displayed but never editable.

Plus native **availability rules** mirroring the Channex collection: keep-N-back,
cut-off days, release windows. Each rule has a plain-language summary
("Hold 1 room back per type inside 3 days of arrival") because opaque rules are
how properties end up with mystery inventory.

## 6.5 Yield rules (rule-based revenue management)

Deterministic and inspectable — not a black box.

```yaml
name: "Weekend crunch"
priority: 10
scope: { room_types: [double, twin], rate_plans: [flexible] }
window: { days_ahead: 0..21 }
when:
  all:
    - occupancy_pct: { gte: 80 }
    - day_of_week: [fr, sa]
then:
  - adjust_rate: { percent: +15 }
  - set_restriction: { min_stay: 2 }
guard_rails: { rate_floor: 90.00, rate_ceiling: 400.00, max_daily_change_pct: 25 }
```

- **YR-1** Rules evaluate on a schedule and on relevant events (booking,
  cancellation, availability change); the winning rule per cell is decided by
  priority, and the calendar shows *which* rule set a value.
- **YR-2** Guard rails are absolute — a rule may never breach floor, ceiling or
  max daily change. Breaches are logged and alerted, not clamped silently.
- **YR-3** **Simulation mode**: run against the last 90 days and report what would
  have changed and the estimated revenue delta. Nobody should enable automation
  blind.
- **YR-4** **Shadow mode**: compute and record recommendations without pushing,
  with a one-click "apply".
- **YR-5** Manual edits win for a configurable "hold" period (default 48 h) so
  automation does not fight a human mid-decision.
- **YR-6** A single global kill switch stops all automation per property, instantly.
- **YR-7** Every automated change is audited with the rule id and version, and
  appears in the cell history as an `automation` actor.

## 6.5b Rate import (an external pricing engine)

**Persona:** the `revenue_manager` of [spec 02](./02-personas-and-rbac.md); the
`property_manager` of a small portfolio.

PriceLabs and Wheelhouse are the integrations hosts ask for most
([research](../research/2026-09-competitors.md), gap 6). Rather than reimplement anyone's
revenue model, prices computed elsewhere come in through one port and are treated as a
**proposal**, not an instruction: local state stays authoritative (rule 6), and an import
goes through the same guard rails, dry run, undo and push path as a bulk edit.

- **RI-1 One port.** `RateImportProvider.fetchRates({ propertyRef, from, to })` returns a
  price (and optionally a minimum stay) per night per listing. A vendor's HTTP client is a
  plugin; the CSV reader needs no vendor at all and is what most properties actually use,
  since every engine exports one and §6.7 already promised it. Column names are matched by
  alias, money is read as minor units (rule 4) in both European and Anglo notation, and
  every unusable line is reported with its number instead of being skipped quietly.
- **RI-2 The engine's listings are mapped, never guessed.** A listing reference the
  property has no rate plan for is reported as unmapped, and a dry run is where the manager
  discovers and fixes it.
- **RI-3 Guard rails are absolute (YR-2).** Floor, ceiling and largest allowed move are
  per property. A recommendation outside them is refused **with its reason**, never clamped
  into something plausible; applying it anyway is an explicit override, recorded as a
  warning on the operation.
- **RI-4 Hand edits win (YR-5).** A night a person priced is left alone for the configured
  hold (default 48 h). Every `rate_day.source` that is not one of ours counts as a hand
  edit, so a new automated writer must be added to `AUTOMATED_RATE_SOURCES` or it will
  fight itself.
- **RI-5 Shadow mode is the default (YR-4).** A scheduled pull records what it would change
  and raises one `rate_import_pending` alert linking to the page; a human applies it. Only
  an explicit "apply without review" writes straight through.
- **RI-6 Nothing is unrecoverable.** An applied import is one reversible operation: the
  plan's inverse restores every night exactly, and the import is pushed to channels by the
  ordinary ARI queue, marked `source = rate_import` so the calendar says where the price
  came from.

**The page** leads with where prices come from and when (source, last import and how many
nights it changed, nights set by hand that imports leave alone, the next nightly pull at
02:40 UTC), then the rails per rate plan with today's price and its source, the future nights
priced outside the rails, the CSV import, and the connector (engine, listing ID, schedule,
default floor and ceiling in the property currency, largest move, hold, apply without review).

Acceptance: a PriceLabs CSV moves 90 nights in one dry run and one apply; a price below the
floor is named and refused rather than sold; last night's hand-typed New Year price is still
there after the morning pull.

## 6.6 Promotions and pricing tools

**Persona:** the `revenue_manager` and the owner-operator who prices by hand (spec 02).

- **Seasons** — named night ranges (inclusive of both ends, never overlapping inside one
  season) on a listing or the whole organization. **Shipped:** added and removed from the
  year view, which outlines their nights and shows what each actually charges, read from the
  nights themselves: the median weeknight and Friday–Saturday price and the most common
  minimum stay. Not stored next to the season, so they never disagree with the calendar.
- **Pricing & availability** (the calendar's gear) — one page per base rate plan:
  base and weekend price, minimum and maximum nights, each applied to every future night
  through a dry run, as one reversible bulk operation (BULK-1/2); the price-tips mode
  (suggest / apply within the rails / off) and the floor and ceiling, which are the rate
  import's own settings (§6.5b); derived plans; check-in and check-out days and the
  availability rules read from the nights; taxes; channel connections; promo codes.
- **Channel markup and rounding** — basis points per OTA (Airbnb, Booking.com, Vrbo,
  Expedia), kept in `property.settings.pricing`, and how a marked-up price is rounded (up to
  the next unit, the next five, or not at all; up so a guest never sees less than the local
  price). The calendar shows what each guest sees. Pushing the markup to the channel as the
  mapping's `derived_option` is not built yet; the page says so.
- **Length-of-stay and early-bird / last-minute discounts** — stored with the property in
  basis points. Sending them as each channel's own discount type, or as derived plans, is not
  built yet; today they change no price, and the page says so.
- **Rate templates** — saved value patterns ("Summer weekday", "Christmas") that
  can be applied to any range. Not built.
- **Rate parity view** — a per-channel table of the effective price after
  connection-level and mapping-level `derived_option` modifiers, so a manager can
  see what each OTA will actually display. Parity mistakes are expensive; they
  deserve a screen. The night card (CAL-2) is its first piece.

## 6.7 Import, export and the rolling horizon

- CSV/XLSX import of rates and restrictions with column mapping, validation report,
  and dry run before commit. Realistically, most properties arrive with a
  spreadsheet. **Shipped for rates in §6.5b**; restrictions beyond minimum stay, and XLSX,
  are still to come.
- Export of any calendar view, plus an iCal feed per room type for owners.
- **Rolling horizon job** extends the seeded date range daily so the far edge never
  runs out; new dates inherit from the same weekday pattern of the prior year, or a
  configured default, and are pushed like any other change.

## 6.8 Acceptance criteria

- A revenue manager can change a weekend price for 3 rate plans across 12 weeks in
  under 30 seconds, see a dry run first, and undo it in one click.
- Availability visibly and automatically decrements within seconds of a booking
  arriving, with no manual step.
- A derived plan can never be edited directly, and always reflects its parent.
- Every cell can answer "who set this, when, and is it live?" without leaving the
  calendar.
