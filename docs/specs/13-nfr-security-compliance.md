# 13 — Non-Functional Requirements, Security & Compliance

**Status:** `review` — revised 2026-08-21: access credentials added to the threat model; owner isolation added.

We hold guest identity data, OTA credentials, and the integrity of what a property
sells. A breach or a systemic overbooking would end the project's credibility
permanently, so this spec is a gate, not a wish list.

## 13.1 Assets and threat model

| Asset | Threat | Primary controls |
|---|---|---|
| Guest PII (name, contact, ID documents, messages) | Exfiltration, cross-tenant leakage, insider browsing | Per-tenant encryption, RLS, `booking:read_pii` gating, access logging, retention purge |
| Payment instrument metadata | Card fraud, PCI scope creep | No PAN ever stored, tokenisation, step-up auth, per-view audit, PAN-shaped-data check constraint + scanner |
| OTA / Channex credentials | Account takeover, malicious inventory changes | Envelope encryption, write-only fields, `channel:read_credentials` gating, rotation |
| **Guest access credentials** (door codes, lock tokens) | Physical intrusion into homes | Encrypted at rest, never logged, time-boxed validity, auto-revocation on cancellation (INV-14), masked display, per-read audit |
| Owner data isolation | One owner reading another's revenue or bookings | `⊙` row-filtered permissions in SQL, RBAC-9 test suite, portal scoping |
| ARI integrity | Malicious or accidental mass rate change; overbooking | Guard rails, blast-radius limits, optional four-eyes, full audit, reversible bulk ops |
| Availability integrity | Overbooking via race conditions | Per-property serialised pushes, keep-back buffers, holds during checkout, overbooking alerts |
| Audit log | Tampering to hide an action | Append-only, per-org hash chain, no update/delete grants |
| Webhook endpoint | Forged bookings, replay, DoS | Path token + secret header, IP allowlist, size limits, pull-authoritative-state, dedupe |
| Tenant isolation | One customer reading another's data | RLS + tenant-scoped repositories + CI cross-tenant tests + prefixed storage keys |
| Availability of service | DoS, provider outage, queue saturation | Rate limits, circuit breakers, priority lanes, graceful degradation |

## 13.2 Payment data (PCI DSS)

**Target posture: SAQ-A.** Card data must never touch our infrastructure.

- **PCI-1** No raw PAN, CVV, or full magnetic-stripe data is stored, logged,
  cached, or transmitted through our servers — ever, in any environment.
- **PCI-2** Card entry uses provider-hosted fields (Stripe Elements or equivalent);
  we receive tokens only.
- **PCI-3** OTA-supplied card metadata is stored as masked digits + type + expiry +
  cardholder only. Enforced by an `INV-7` check constraint and a repository-level
  PAN-shaped-string scanner that raises rather than writes.
- **PCI-4** Card metadata is purged on the Channex-mandated retention schedule; the
  purge job is monitored and its failure is a P1.
- **PCI-5** Every read of payment metadata is audited with actor, reason, IP, and
  is rate-limited per subject. Bulk export of payment metadata is not possible
  through any interface.
- **PCI-6** CI blocks merges on secret-scanning and PAN-pattern hits in fixtures,
  seeds and tests.

## 13.3 Privacy (GDPR and equivalents)

Roles: the **property is the controller**, the platform operator is a **processor**
(a self-hoster is both). We ship the artefacts a processor needs: a DPA template, a
sub-processor list, records-of-processing documentation, and a data-flow diagram.

| Obligation | Implementation |
|---|---|
| Lawful basis | Contract for reservation data; consent for marketing; documented per data category. |
| Data minimisation | We store what the OTA sends and what operations require. ID documents are optional per property and off unless legally required. |
| Right of access | One-click guest data export (bookings, messages, invoices) as JSON + PDF. |
| Right to erasure | An erasure job pseudonymises the guest, deletes message bodies, attachments and ID documents, and retains only non-personal aggregates. Financial records are kept where law requires and the reason is recorded. |
| Retention | Enforced schedule (§13.4), automatic, auditable. |
| Breach notification | Documented 72-hour process with templates and a decision tree (`runbooks/security-incident`). |
| Data residency | Deployment-region configurable; EU-only deployment supported and documented. |
| Sub-processors | Channex, the payment provider, email/SMS transport, object storage, and any operator-enabled LLM provider — listed, versioned, and change-notified. |
| DPIA | A template covering guest messaging and any AI-assisted features. |

- **PRIV-1** PII is encrypted at rest with per-tenant keys; keys are managed by a
  KMS in SaaS mode and by an operator-supplied master key when self-hosted.
- **PRIV-2** PII never appears in logs, traces, error reports, or analytics
  payloads. A CI check greps log/telemetry calls for known-sensitive field names.
- **PRIV-3** Non-production environments use synthetic data. Copying production
  data into staging is prohibited by policy and by tooling.
- **PRIV-4** Any AI feature is opt-in per property, discloses where data is sent,
  and defaults to off. A self-hoster can run it fully locally or not at all.

## 13.4 Retention schedule

| Data | Default retention | Notes |
|---|---|---|
| Booking + revisions (financial core) | 7 years | Usually a legal minimum for tax. |
| Guest PII on bookings | 25 months after departure, then pseudonymised | Configurable per jurisdiction. |
| Message bodies + attachments | 25 months after departure | Metadata retained for aggregates. |
| ID / registration documents | Statutory minimum for the jurisdiction, else 30 days | Off unless required. |
| Payment instrument metadata | Per Channex/OTA window, typically days | Purged aggressively. |
| Audit log | 2 years (7 for financial and security events) | Append-only. |
| ARI history | 13 months | Enough for YoY comparison. |
| Inbound webhook payloads | 90 days | Debugging window. |
| Provider call logs (redacted) | 30 days | |
| Backups | 35 days PITR | Erasure requests are re-applied after any restore, tracked as a task. |

## 13.5 Application security

- OWASP ASVS L2 as the baseline; the OWASP Top 10 covered by explicit tests.
- Argon2id password hashing, TOTP 2FA, breached-password checks, account lockout
  with backoff, secure session cookies (`HttpOnly`, `Secure`, `SameSite=Lax`).
- Strict CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy`, subresource
  integrity on the widget; CSRF protection on cookie-authenticated routes.
- Input validation on every boundary via a shared schema library; output encoding by
  default in the view layer.
- Parameterised queries only; no string-built SQL, enforced by lint.
- File uploads: type and size limits, malware scanning, stored off the app domain,
  served via short-lived signed URLs, never executed.
- Secrets in environment or a secret manager — never in the repo. Pre-commit and CI
  secret scanning. Documented rotation for every credential type.
- Dependencies: lockfiles, automated update PRs, CVE gating in CI, an SBOM
  published per release, and signed release artefacts.
- SAST on every PR; DAST against staging on a schedule.
- A published `SECURITY.md` with a disclosure policy and response targets, and an
  **independent penetration test before the v1 tag** — non-negotiable, given the
  data we hold.

## 13.6 Reliability

| Target | Value |
|---|---|
| API availability (SaaS) | 99.9% monthly |
| Webhook endpoint availability | 99.95% — a missed webhook window costs bookings |
| RPO | ≤ 5 minutes (PITR) |
| RTO | ≤ 1 hour |
| Booking loss | **Zero tolerance.** Any confirmed loss is a P0 with a public post-mortem. |
| Degraded-mode behaviour | Local edits and check-ins continue during a provider outage; queues drain on recovery |

Backups nightly plus continuous WAL; restores tested quarterly and documented for
self-hosters. Failure injection for provider outages and Redis loss is part of CI
([04 §4.11](./04-architecture.md#411-testing-strategy)).

## 13.7 Performance budgets

| Surface | Target |
|---|---|
| Calendar first paint (30 days × 40 rows) | < 1 s p95 |
| Calendar cell edit → optimistic render | < 100 ms |
| ARI change → live on channel | < 60 s p95 |
| Booking webhook → visible in UI | < 30 s p95 |
| Reservation list (10k rows, filtered) | < 500 ms p95 |
| Inbox thread open | < 300 ms p95 |
| Dashboard widget load | < 2 s p95 |
| Booking engine LCP (mobile 4G) | < 2.0 s |
| API read p95 / write p95 | < 200 ms / < 400 ms |

Load reference: 200 properties, 40 room types each, 3 years of history, 500
bookings/day, 2k messages/day on commodity hardware (4 vCPU API, 4 vCPU worker,
managed Postgres).

## 13.8 Accessibility, i18n and usability

- **WCAG 2.2 AA** across the staff console, booking engine and guest portal; audited
  with automated checks in CI plus manual keyboard and screen-reader passes on the
  calendar, inbox and booking funnel.
- Full keyboard operability — a hard requirement for the calendar
  ([06 §6.2](./06-inventory-and-rates.md#62-the-calendar-grid)).
- i18n from day one: externalised strings, ICU pluralisation, locale-aware dates,
  numbers and currencies, RTL layout support, and per-user locale independent of
  property locale.
- Housekeeping and front-desk surfaces are usable one-handed on a phone, with large
  touch targets and offline tolerance.
- Every error message states what happened, why, and what to do next, and carries a
  trace ID.

## 13.9 Sector-specific compliance

Not glamorous, and a genuine reason properties abandon software:

- **Guest registration / police reporting** — several countries (Italy Alloggiati,
  Spain SES/Hospedajes, Portugal SEF/AIMA, Greece, Croatia eVisitor) require guest
  data submission on arrival. Modelled as **plugins** implementing a
  `GuestRegistrationProvider` port so jurisdictions can be added without touching
  core.
- **Tourist / city tax** — per-jurisdiction rules (per person per night, age
  exemptions, seasonal caps) as configurable tax logic.
- **Fiscal invoicing** — gapless sequential numbering, credit notes, and hooks for
  country e-invoicing regimes (Italy SDI, Spain TicketBAI/Verifactu, Portugal SAF-T)
  as plugins.
- **Consumer price display** — jurisdictions requiring tax-inclusive display are
  handled by the tax-set configuration and honoured by the booking engine.

## 13.10 Requirements summary

- **NFR-1** No confirmed booking may be lost under any single-component failure.
- **NFR-2** No cross-tenant data access is possible, proven by automated tests.
- **NFR-3** No PAN in any store, log, or backup.
- **NFR-4** Every state change is attributable and reversible or compensable.
- **NFR-5** The platform degrades gracefully when Channex is unavailable and
  self-heals on recovery.
- **NFR-6** A self-hoster can back up, restore, upgrade and roll back using only
  published documentation.
