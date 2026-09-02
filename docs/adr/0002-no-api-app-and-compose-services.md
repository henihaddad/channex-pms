# ADR-0002: No separate API application; Compose services fixed

**Status:** accepted (2026-09-02)

## Context

Spec 05 §5.11 mentions `apps/api` shipping the certification suite and spec 04 §4.8 lists an `api` container,
while spec 14 (accepted) decides there is no separate API application in v1.

## Decision

There is no `apps/api`. The REST API `/v1` and the Channex webhook receiver live in `apps/web`. The Channex
certification suite lives in `packages/connectivity/certification/`. Self-host Compose services are `web`,
`worker`, `migrate` (one-shot), `postgres`, `redis`, `minio`, `caddy`. Migrations never run on boot.

## Consequences

One deploy, one type system. If a partner API becomes a product surface, `apps/api` can be extracted later
because every handler already calls `packages/core` services (spec 14 §14.5).
