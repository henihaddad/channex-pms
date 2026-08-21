# 17 — Owner Management & Statements

**Status:** `review` — added 2026-08-21 with the STR segment decision.

**Primary personas:** `org_owner`, `finance`, `property_manager`, and the external
`owner`.

Most STR managers run owner accounting in a spreadsheet, and it is the most
error-prone, most disputed, most time-consuming thing they do each month. It is
also the module no channel manager ships. Done well, it is the single strongest
reason to adopt this platform. The domain model lives in
[03 §3.8](./03-domain-model.md#38-owner-management); this spec covers behaviour.

## 17.1 Owners and agreements

- Owner records: individuals or companies, contacts, tax IDs, documents (contracts,
  insurance, tax forms) with expiry reminders, and an optional portal login
  (magic-link by default).
- An **agreement** binds an owner to a property (or specific units) for a date
  range, and encodes the commercial terms:

| Term | Options |
|---|---|
| Model | `commission_pct` (the norm), `fixed_fee`, `tiered` (rate varies by revenue band), `guaranteed_rent` |
| **Commission basis** | `gross` \| `net_of_ota_commission` \| `net_of_tax` — explicit, versioned, printed on every statement. This is the field every dispute is about. |
| Deductibles | Which costs pass through to the owner: cleaning, consumables, maintenance, linen — each with its own rule (at cost / marked up / absorbed). |
| Cleaning fees | Kept by manager \| passed to owner \| split. |
| Owner stays | Free \| at cost \| at a configured rate; annual allowance optional. |
| Payout schedule | Monthly / fortnightly, day-of-month, minimum payout threshold, hold-back percentage for future expenses. |
| VAT treatment | Whether the management fee carries VAT, and the rate. |

- **AGR-1** Agreements are versioned; a mid-month change produces two calculation
  segments in the same statement, each labelled with its version.
- **AGR-2** Overlapping agreements for the same unit and dates are refused
  (INV-12).
- **AGR-3** An agreement template can be applied when onboarding a new owner, and
  the platform's numbers are always derived from the *recorded* terms — never from
  a number typed into a statement.

## 17.2 Statement generation

Runs automatically on each agreement's schedule; regenerable on demand while draft.

```
gross booking revenue (nights in period, per BookingRoomDay)
− OTA commission                        (actual where reported, labelled-estimate otherwise)
− OTA-withheld taxes                    (the `withheld_by_ota` flag from Channex)
= revenue basis                         (per the agreement's commission_basis)
− management fee                        (per model, per segment)
− rebillable expenses                   (approved OwnerExpenses in period)
− cleaning fees per agreement rule
± adjustments                           (late cancellations, prior-period corrections)
± owner stay charges/credits
= net due to owner
```

- **STMT-1** Every line traces to a booking night, an expense with a receipt, or a
  signed adjustment. **No unexplained totals** — the statement is an argument, and
  it must be self-evidencing.
- **STMT-2** Statement arithmetic is pure and property-based tested; regenerating a
  draft for the same period is byte-identical (OWN-1).
- **STMT-3** Revenue attribution follows **nights in the period**, not booking
  totals: a stay spanning the month boundary splits by night. Cancellation
  restatement follows the same rule as reporting
  ([11 §11.5](./11-dashboards-and-analytics.md#115-data-architecture)).
- **STMT-4** A revision arriving after `sent` (late cancellation, OTA correction)
  creates an adjustment line on the **next** statement linking back to the origin —
  a sent statement is never edited (INV-13).
- **STMT-5** Workflow: `draft` → (review, with a diff against the previous period
  and anomaly flags) → `approved` → `sent` (PDF + portal + email) → `paid`.
  Approval is `statement:approve`; sending can be automated after N days if the org
  enables it.
- **STMT-6** Statements render in the owner's locale and the agreement's currency;
  when property currency differs, the conversion date and rate are printed.
- **STMT-7** Consolidated statements for owners with multiple properties, with
  per-property sections and a portfolio summary.

## 17.3 Expenses

- Captured in the field ([08 §8.8](./08-operations-and-turnover.md#88-maintenance))
  with photographed receipts, or entered by finance, or imported (CSV).
- Categorised; `rebillable` flag per the agreement's deductible rules, suggested
  automatically, overridable with a reason.
- **EXP-1** Approval (`expense:approve`) is required before an expense reaches a
  statement; the approver cannot be the submitter where the org enables four-eyes.
- **EXP-2** Markup rules (e.g. maintenance at cost + 10%) come from the agreement
  and are shown as separate lines — hidden markup is how managers lose owners.

## 17.4 Payouts

- Via the `PayoutProvider` port: Stripe Connect transfers as the reference
  implementation; **manual bank-transfer recording is fully supported** and will be
  the majority case initially.
- **PAY-1** `payout:execute` is step-up gated; four-eyes above a configurable
  amount. Bank details are stored as provider tokens or encrypted references, never
  plain, and are never displayed in full after entry.
- **PAY-2** Payout state (`pending` → `in_transit` → `paid` / `failed`) reflects to
  the statement and the portal. Failures alert `finance` with the provider reason.
- **PAY-3** Minimum-threshold and hold-back rules from the agreement are applied
  and itemised on the statement.

## 17.5 The owner portal

Scoped hard to the `owner` role (`⊙` rows only, RBAC-9). Mobile-first, magic-link
login, in the owner's language.

| Area | Contents |
|---|---|
| **Dashboard** | This month: nights sold, occupancy, gross revenue, projected net. Next arrivals. YoY sparkline. |
| **Calendar** | Their units' bookings (guest first name, dates, channel — no contact details, no financial detail beyond their share basis), blocks, and **self-service owner-stay booking** subject to agreement terms and existing reservations. |
| **Statements** | Every statement with drill-down to line level; PDF download; a dispute button that opens a thread with the manager rather than an email into the void. |
| **Expenses** | Receipts and photos for everything billed to them. |
| **Maintenance** | Issues on their units, with photos and status; ability to raise one. |
| **Reviews** | Guest reviews for their units. |
| **Documents** | Their agreement, insurance, tax documents. |

- **PORT-1** The portal never exposes: other owners' anything, guest contact
  details, staff identities beyond a display name, or manager-side margins beyond
  what the agreement discloses.
- **PORT-2** Owner actions (block dates, raise issue, dispute a statement) notify
  the responsible manager and appear in the audit log like any other actor.
- **PORT-3** An owner blocking dates pushes availability changes through the normal
  ARI pipeline — an owner stay is distribution-relevant inventory, not a note.

## 17.6 Owner acquisition surface (v1.1)

A shareable, white-labelled "owner report" — anonymised occupancy and ADR for a
prospective owner's area from the manager's own portfolio — as a sales tool.
Deferred, but the statement data model already supports it.

## 17.7 Acceptance criteria

- A 50-unit manager closes their month — statements generated, reviewed, sent, and
  payouts recorded — in under one hour, with zero spreadsheet steps.
- An owner can answer "why is my March payment €212 lower?" from the portal alone,
  down to the booking or receipt, without calling anyone.
- A late cancellation after statement send is visibly and automatically corrected
  on the next statement.
- No test can produce two statements paying out the same booking night twice.
