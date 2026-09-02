# 11 — Dashboards & Analytics

**Status:** `accepted` — implemented in M6 (v0.5, 2026-09-02); see §11.7 for what shipped and what is deferred. Revised 2026-08-21: owner-facing KPIs and statement reconciliation included.

Two rules keep this module honest:

1. **Every dashboard belongs to one persona and answers one question.** A screen
   full of charts that serves everybody serves nobody.
2. **Every number is defined once, in code, from the KPI dictionary below.** If
   two screens disagree about occupancy, the product has lost the user's trust and
   will not get it back.

## 11.1 KPI dictionary

| KPI | Definition | Notes |
|---|---|---|
| **Rooms available** | `Σ count_of_rooms − out_of_order` per night | Excludes OOO, includes OOS. |
| **Rooms sold** | Confirmed room-nights (cancellations and no-shows excluded) | From `BookingRoomDay`. |
| **Occupancy %** | rooms sold ÷ rooms available | The single most-quoted number; must never disagree between screens. |
| **ADR** | room revenue ÷ rooms sold | Room revenue only — no extras, no taxes. |
| **RevPAR** | room revenue ÷ rooms available | = occupancy × ADR. |
| **TRevPAR** | total revenue (incl. extras) ÷ rooms available | |
| **Net ADR** | (room revenue − commission − withheld taxes) ÷ rooms sold | The number that tells you whether a channel is worth it. |
| **ALOS** | room-nights ÷ bookings | |
| **Booking lead time** | median days between booking and arrival | Per channel; drives yield windows. |
| **Pickup** | room-nights gained for a target period over the last N days | The pace metric revenue managers actually use. |
| **Pace / OTB vs STLY** | on-the-books vs the same time last year | Requires snapshotting on-the-books nightly (see §11.5). |
| **Cancellation rate** | cancelled bookings ÷ total bookings | Split by channel; correlates strongly with non-refundable mix. |
| **No-show rate** | no-shows ÷ arrivals | |
| **Channel mix** | share of room-nights and revenue per channel | Direct is included as a channel. |
| **Commission cost** | Σ OTA commission | Booking.com and Airbnb report it; others are estimated from a configured rate and **labelled as estimated**. |
| **Direct share** | direct room-nights ÷ total | The headline metric for the whole product. |
| **Forecast** | on-the-books + expected pickup − expected cancellations | Simple, explainable model in v1; extension point for better ones. |
| **Sync health** | pending / failed / drifted cells, unacked bookings | Operational, not commercial, but belongs on the manager dashboard. |
| **First response time** | median guest-message first reply | Per channel and per agent. |
| **Review score** | weighted average per channel, plus trend | |

Rules: all money in property currency with an org-level consolidated view at
snapshotted FX; every KPI carries a tooltip with its formula and data freshness;
every chart supports "compare to" (previous period, same period last year, budget).

## 11.2 Role dashboards

Each is a default widget layout the user can rearrange; widgets respect
permissions, so a widget whose data the user cannot see does not render.

### `property_manager` — "Is my hotel OK today?"
Today's arrivals / departures / in-house · occupancy tonight and next 7 days ·
revenue today, MTD, vs budget · **action queue** (unmapped bookings, failed syncs,
overbookings, unassigned rooms, breaching messages) · channel health strip ·
last 24 h bookings feed · review score trend.

### `revenue_manager` — "What should I price?"
90-day occupancy vs pace heatmap · pickup last 7 days by arrival month ·
ADR/RevPAR trend with STLY · **low-occupancy dates needing attention** and
**high-demand dates worth raising** · rate parity table across channels ·
booking-window distribution · yield rule activity and impact · competitor set
(optional plugin).

### `portfolio_manager` — "Which properties need me?"
Property league table (occupancy, ADR, RevPAR, pickup, vs budget) sortable and
exportable · portfolio KPI roll-up · outlier flags (properties down >10% YoY) ·
consolidated action queue by property · channel mix comparison · staff activity.

### `reservations_agent` — "What do I do next?"
Arrivals to check in · departures · unassigned rooms · payment actions ·
messages needing reply · today's notes and shift handover.

### `housekeeping` — "Which rooms, in what order?"
My assigned rooms by priority · departures ready to clean · stayovers ·
inspections pending · out-of-order rooms · maintenance issues raised.

### `guest_relations` — "Who is waiting on me?"
Unanswered threads by SLA remaining · inquiries expiring · response-time trend vs
target · new reviews needing response · sentiment/tag breakdown · templates used.

### `finance` — "Does the money reconcile?"
Revenue by day/channel/property · commission and withheld taxes · **expected vs
received OTA payouts** · outstanding balances and aged debt · tax summary by
jurisdiction · virtual cards expiring soon · invoices issued and credit notes ·
export centre.

### `owner` (external) — served by the owner portal ([17 §17.5](./17-owner-management.md#175-the-owner-portal))

### `viewer` (investor/analyst) — "How is the portfolio doing?"
Occupancy, ADR, RevPAR vs last year and budget · revenue trend · channel mix ·
review score · a printable monthly owner statement. No guest PII, no operational
noise.

### `platform_operator` — "Is the platform healthy?"
See [12](./12-platform-admin-and-billing.md).

## 11.3 Report catalogue

Every report is filterable, saveable as a view, exportable (CSV/XLSX/PDF), and
schedulable by email.

**Commercial** — production by day/month · KPI summary · pace & pickup · booking
window · channel performance (incl. net ADR after commission) · rate plan
performance · room type performance · market segment · forecast vs actual · budget
variance · promo code usage.

**Operational** — arrivals/departures/in-house manifests · housekeeping
productivity · room utilisation & OOO history · overbooking incidents · sync health
history · unmapped booking history · staff activity & audit extract.

**Financial** — daily revenue (daily close / night audit) · tax by jurisdiction ·
payments by method · commission reconciliation · OTA payout reconciliation · aged
balances · invoice register · **owner statement register with statement-to-report
reconciliation** (the sum of statement lines for a period must equal the revenue
report for the same basis — asserted by a scheduled job, alerting on mismatch) ·
owner profitability per agreement.

**Guest** — guest history & repeat rate · nationality/language mix ·
message response performance · review scores and trends · NPS (if collected).

## 11.4 Alerts and anomalies

Threshold and anomaly alerts, delivered per user preference (in-app, email, push,
Slack/webhook), each with a link to the drill-down:

- occupancy for a near date below a threshold ("next weekend at 40%, 6 days out");
- pickup significantly below the same point last year;
- a rate outside guard rails, or a suspected parity breach;
- cancellation spike on a channel;
- a channel producing zero bookings for N days after previously producing them —
  usually a silent mapping or connectivity failure, and the alert that saves the
  most money;
- sync degradation, drift growth, unacked bookings;
- SLA breaches and review-score drops.

**ALRT-1** Alerts must be actionable and rate-limited. An alert nobody acts on is
trained-ignored within a week, so each alert type tracks its own action rate and
noisy types are flagged for tuning.

## 11.5 Data architecture

Deliberately unfashionable, because a hotel is small data:

- **Nightly rollups** into `fact_room_night`, `fact_booking`, `fact_revenue`,
  `agg_daily_kpi`, computed in Postgres from operational tables. A 200-property
  portfolio produces a few million rows a year — no warehouse needed.
- **On-the-books snapshots** written nightly per (property, stay_date,
  snapshot_date). This is the only way pace and pickup can ever be computed
  correctly, and it must exist from day one because the data cannot be
  reconstructed later.
- **Realtime deltas** for today's numbers straight off operational tables, so the
  dashboard is never stale by a day.
- **Materialised views** with scheduled refresh for expensive aggregates; every
  widget declares its freshness and shows it.
- **Timezone correctness**: a night belongs to the property's local date; a
  portfolio roll-up across timezones uses each property's local date and says so.
- **Cancellation restatement**: a cancellation restates history at the original
  stay date. Reports state which basis they use, because "revenue in March"
  silently changing is a support nightmare.
- **Extension point**: a documented read-only reporting schema so an operator can
  point Metabase or Superset at it. We do not try to be a BI tool.

## 11.6 Acceptance criteria

- Occupancy for any date is identical on every screen and in every export.
- Pace vs STLY is available after 12 months of snapshots, and clearly marked as
  unavailable before that rather than silently wrong.
- Any dashboard widget can be drilled through to the underlying bookings.
- A monthly owner statement can be produced and emailed without manual work.
- No dashboard query exceeds 2 s p95 at 200 properties and 3 years of history.

## 11.7 Implementation notes (M6, v0.5)

- **Dictionary as code.** `core/analytics/kpis.ts` holds `KPI_DICTIONARY` (name, formula, unit) and
  `kpis(rows)`, the one function every screen and export calls. Ratios are basis points so two
  screens can be compared for exact equality; money stays in minor units. Property tests cover
  order independence, additivity across ranges and RevPAR = occupancy × ADR within rounding.
- **Rollups.** `fact_room_night`, `fact_booking` and `agg_daily_kpi` are rebuilt from operational
  tables per org and date range (`rollups.nightly` at 02:45, last 45 days plus 400 ahead;
  "Refresh now" on the dashboard). Because the range is recomputed, a cancellation restates its
  original stay dates and a no-show stops counting as a sold night. Commission per night is
  allocated by amount; channels without a reported commission carry an estimate at the channel's
  usual rate, flagged `commission_estimated` and labelled on every report.
- **Rooms available** = Σ `count_of_rooms` − maintenance/renovation blocks that reduce availability
  on that night (out of service is not deducted). Total revenue adds folio lines other than room,
  payment and deposit lines dated that day.
- **Snapshots.** The nightly on-the-books job now has a real source; `pickup` and `pace` read
  `otb_snapshot`. Pace reports `available: false` with a reason until a snapshot from the same
  date last year exists, and the report prints "needs a year of snapshots" rather than a number.
- **Realtime today.** Arrivals, departures, in-house, tonight's occupancy and the last 24 h of
  bookings come straight off operational tables; every KPI card shows the rollup's freshness.
- **Dashboards.** One layout per persona chosen from the user's highest role in the org; widgets
  read the same numbers. Portfolio: league table sortable by RevPAR with outliers (room revenue
  down more than 10 % YoY), action queue, channel mix. Property: today board, next 7 days,
  MTD vs budget, action queue, sync strip. Revenue: 90-day occupancy strip, pickup, pace, low and
  high demand dates, booking window. Reservations and guest relations: queues. Finance: revenue,
  commission, withheld taxes, disputes, expiring cards. Viewer: KPIs vs last year, no PII.
  Widget rearrangement, the rate-parity table, yield rule activity and the competitor plugin are
  deferred.
- **Reports.** Seventeen catalogue reports run through one `runReport`, export as CSV or PDF (the
  dependency-free writer; XLSX deferred) with the basis printed on every file, and can be
  scheduled daily, weekly or monthly by email. Financial reports need `report:read_financial`;
  every export is audited under `export:execute`.
- **Alerts.** Hourly rules (low occupancy within 7 days, zero-booking channel after 14 quiet days,
  cancellation spike, sync degradation, unacked revisions, SLA breaches, review-score drop,
  statement mismatch) raise one live alert per condition, resolve automatically when the condition
  clears, and track the action rate per type; types under 20 % are flagged noisy (ALRT-1).
  Delivery is in-app; email, push and Slack channels come with the notification transport.
- **Reconciliation.** `statements.reconcile` (daily) compares each sent statement's booking-revenue
  lines net of later restatements with the confirmed room revenue of the same property and period;
  a mismatch is a critical alert and shows on the owner statement register. Unit-scoped
  agreements are skipped.
- **BI extension point.** Migration 0015 creates the read-only `reporting` schema
  (`daily_kpi`, `room_night`, `booking` views) for Metabase or Superset.
- **Perf.** The portfolio dashboard on the 200-listing seed loads under 2 s in the e2e budget.
  Materialised views are not needed at this size and are deferred.
