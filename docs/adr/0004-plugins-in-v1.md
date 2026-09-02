# ADR-0004: Extension points and two reference plugins in v1; registry and sandboxing later

**Status:** accepted (2026-09-02), applies at M8

## Context

The roadmap defers the plugin ecosystem (registry, sandboxing) past v1, while spec 12 §12.7 lists five reference
plugins the project ships.

## Decision

M8 ships the extension-point interfaces (domain event subscribers, scheduled jobs, provider implementations,
webhook transformers) and two in-repo reference plugins: an accounting CSV export and Slack notifications. Plugins
run out-of-process as webhooks with scoped tokens, rate limits and timeouts, so a misbehaving plugin cannot delay an
ARI push or a booking ack. The registry, sandboxed workers and the other three reference plugins are post-v1.

## Consequences

Third parties can build against stable, Apache-2.0 interfaces from v1.0; the project does not carry a registry it
cannot yet moderate.
