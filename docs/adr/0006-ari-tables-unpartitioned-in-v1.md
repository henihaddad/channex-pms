# ADR-0006: ARI tables are not partitioned in v1

**Status:** accepted (2026-09-02)

## Context

Spec 03 §3.3 suggests range-partitioning `availability_day` and `rate_day` by date. At the load
reference (200 properties, 730 days, 4 rate plans) the tables hold under a million rows, and Drizzle
Kit cannot express partitioned tables, so partitioning would have to bypass the migration drift check.

## Decision

Plain tables with composite primary keys `(room_type_id, date)` and `(rate_plan_id, date)` plus a
`(property_id, sync_state)` index. Revisit when a single installation exceeds roughly ten million
ARI rows; a partition migration can be written by hand at that point without changing any query.

## Consequences

The drift check stays authoritative for the whole schema. Query plans stay index-driven at v1 scale.
