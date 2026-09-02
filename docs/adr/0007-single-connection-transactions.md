# ADR-0007: Outbound calls never hold a database transaction; jobs run in the caller's transaction

**Status:** accepted (2026-09-02, M2)

## Context

Development and the sandbox test suites run on PGlite, a single-connection Postgres. Two
patterns deadlocked it during M2: a handler that opened a second transaction while its own
`withTenant` transaction was still open (the step-up check, a nested `asSystem` in a job called
from a Server Action), and a route handler that made an HTTP call to the same process (the OAuth
token exchange) while holding a transaction, so the callee's middleware waited on the connection
the caller held.

Real Postgres would not deadlock, but both patterns are wrong there too: they hold a connection
across network latency and split what should be one atomic change into two transactions.

## Decision

1. Inside `withPermission`, every read uses the handler's transaction; nothing opens a second one.
2. Job functions in `packages/jobs` that a web action may call take a `TxRunner`. The worker passes
   `systemRunner(db, orgId)` (one system transaction per call); a web action passes
   `(fn) => fn(ctx.tx)` so the job's writes commit with the action's audit entry.
3. Route handlers do outbound HTTP (provider calls, OAuth exchanges) in the `input` phase or from
   the handler before any write, never with a transaction open. Provider calls that must precede a
   write (test connection, mapping details) are reads; the write happens after they return.
4. The end-to-end suite runs on PGlite on purpose: a deadlock there is a design error caught before
   it costs a connection-pool slot in production.

## Consequences

- `activateConnection` and `pauseConnection` changed signature to accept the runner.
- The OAuth callback exchanges the code in `input`, then seals the tokens inside the transaction.
- The realtime SSE endpoint checks the permission at open and reads each tick in its own short
  system transaction, so a long-lived stream never pins a connection.
