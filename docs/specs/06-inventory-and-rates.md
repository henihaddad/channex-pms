# 06 — Inventory, Rates & the Calendar

**Status:** `accepted` (2026-09-02) — implemented in M2: property wizard with `kind`, templates, clone and CSV import; derived plans recomputed in the same transaction as the parent edit; the portfolio grid (virtualised rows and columns, keyboard editing, range toolbar, `expected_version` conflicts, server-backed undo, SSE cell states); bulk update with mandatory dry run and inverse-operation undo; rolling 730-day horizon. Not yet built: year heatmap, presence avatars (CAL-6), history popover UI (the audit-backed endpoint exists), mobile day view (CAL-9), yield rules (§6.5) and promotions (§6.6), which M6/M7 pick up.

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
- **CAL-2** Drag-select a rectangle of cells → inline toolbar for set price,
  adjust by %/amount, set restrictions, close/open.
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
- **CAL-9** Mobile: read-optimised with a single-day column view and a quick
  "close out today" action. We do not pretend a 400-cell grid works on a phone.

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

## 6.6 Promotions and pricing tools

- **Seasons** — named date ranges that colour the calendar and act as bulk-edit
  targets.
- **Rate templates** — saved value patterns ("Summer weekday", "Christmas") that
  can be applied to any range.
- **Length-of-stay and early-bird / last-minute discounts** — expressed as derived
  plans or restriction+rate combinations, whichever the channel supports.
- **Rate parity view** — a per-channel table of the effective price after
  connection-level and mapping-level `derived_option` modifiers, so a manager can
  see what each OTA will actually display. Parity mistakes are expensive; they
  deserve a screen.

## 6.7 Import, export and the rolling horizon

- CSV/XLSX import of rates and restrictions with column mapping, validation report,
  and dry run before commit. Realistically, most properties arrive with a
  spreadsheet.
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
