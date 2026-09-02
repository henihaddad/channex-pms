# Operate

What to watch, what runs when, and where to look when something is off.

## Health

- `GET /api/health` on the web service; the worker logs a `heartbeat` every minute.
- **Sync Health** (console) per organization; the **operator console** (`/ops`, hosted mode or
  any operator account) for the fleet: queue depths, dead letters, webhook lag, unacked
  bookings, pending ARI cells, provider 429s, worst properties.
- Metrics named per spec 04 §4.9 are logged as structured events; `ari_drift_cells` and
  `booking_unacked_count` are the two that page.

## Scheduled jobs (worker)

| Job                                                                             | When         | What                                                       |
| ------------------------------------------------------------------------------- | ------------ | ---------------------------------------------------------- |
| `booking.ack_sweep`, `booking.poll`                                             | every minute | Acknowledge stored revisions; pull the feed (BK-3, HOOK-6) |
| `holds.expire`                                                                  | every minute | Release expired booking-engine holds (BE-5)                |
| `messages.poll`                                                                 | 2 min        | Mirror threads for properties without webhooks             |
| `automation.tick`, `ops.escalate`                                               | every minute | Guest automation, turnover escalation                      |
| `plugins.deliver`, `ops.jobs`                                                   | 30 s         | Signed plugin deliveries; operator-requested jobs          |
| `exports.run`                                                                   | every minute | Build requested data exports                               |
| `otb.snapshot`, `daily_close`, `payouts.poll`, `reviews.sweep`                  | hourly       | Snapshots, night audit, payouts, reviews                   |
| `horizon.extend`                                                                | 02:15        | Roll the 730-day ARI horizon                               |
| `usage.meter`                                                                   | 02:45        | Active-unit metering (hosted)                              |
| `reconcile.nightly`                                                             | 03:30        | Read every cell back and repair drift                      |
| `tenants.purge`                                                                 | 03:15        | Purge tenants 30 days into offboarding                     |
| `rollups.nightly`, `statements.sweep`, `statements.autosend`, `retention.purge` | 04:00–04:40  | Analytics, owner statements, retention                     |
| `billing.close`, `dunning.run`                                                  | 05:00, 05:30 | Period invoices, dunning and trial expiry (hosted)         |

## Runbooks

`docs/runbooks/` holds the fifteen runbooks of spec 12 §12.2, one per failure the system is
designed to survive. Start with the symptom you see.

## Tenant lifecycle (hosted)

`trial → active → past_due → suspended → offboarding`. Suspension closes the console except
billing; **sync, ingestion and acknowledgements keep running**. Offboarding produces a full
JSON export and purges after 30 days, leaving the audit chain and an organization tombstone.

## Security workflow

`.github/workflows/security.yml` runs secret scanning, the PAN scan over fixtures and seeds,
`pnpm audit`, an SBOM and CodeQL on every push. `SECURITY.md` is the disclosure policy.

## Load and soak

`load/k6/` holds the k6 scenarios for the spec 13 §13.7 budgets; `.github/workflows/load.yml`
runs them on demand and weekly against the FakeProvider with a seeded portfolio.
