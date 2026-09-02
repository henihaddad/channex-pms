# ADR-0001: One deployable application plus a worker, organised as strict modules

**Status:** accepted (2026-08-21, spec 04 §4.2; recorded 2026-09-02)

## Context

The product's correctness properties (never lose a booking, never let ARI drift silently) depend on a single
Postgres transaction spanning "persist revision, recompute projection, enqueue availability recalculation".
A small team cannot chase distributed-systems bugs across services.

## Decision

A full-stack Next.js application (`apps/web`) and a separate plain-Node BullMQ worker (`apps/worker`), sharing
`packages/core` where all domain logic lives, framework-free. Seventeen modules with typed service interfaces;
cross-module communication is a direct typed call within a request transaction or a domain event via the outbox,
never a shared table read. No NestJS (spec 14, D3).

## Consequences

Any module can be extracted into a service later without rewriting callers. Route handlers and Server Actions
are thin adapters; lint enforces that `packages/core` imports no framework or infrastructure library.
