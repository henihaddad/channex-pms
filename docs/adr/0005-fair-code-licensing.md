# ADR-0005: Fair-code licensing on the n8n model

**Status:** accepted (2026-09-02, decision D5)

## Context

The project runs a hosted service on the same code it publishes (D4). AGPL would stop a closed fork but not a
competing hosted offering, and calling a service-protecting licence "open source" would be dishonest.

## Decision

Sustainable Use License 1.0 for the platform; the Enterprise License for files marked `.ee.`; Apache-2.0 for the
SDK, plugin interfaces and booking widget; a four-sentence CLA so the project can relicense contributions.

## Consequences

Self-hosters get the complete product free for their own business. Reselling it as a hosted service or white-label
needs an enterprise licence. The project says "fair-code" and "source-available", never "open source".
