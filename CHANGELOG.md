# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/) for the public API and plugin interfaces.

## [Unreleased]

### Added
- Console navigation rebuilt from a UX audit (`docs/ux/2026-09-console-ux-audit.md`): sections
  with icons and their pages beneath them, a header search for guests and reservations, breadcrumbs on property pages. The
  dashboard opens with a Getting started card whose steps are the ones a manager does (add a
  property, property live, connect a channel) with one primary action. The property wizard is
  three plain sections with selects for country, time zone and currency and prices typed per
  night; the property page leads with its state in words and what to do next, refreshes itself
  during setup, and keeps identifiers behind "Technical details". Derived plans and amounts are
  typed as percent and money, not basis points and cents.
- Import from Airbnb (spec 07 CH-5, from `docs/research/2026-09-competitors.md`): on an Airbnb
  connection, "Show my Airbnb listings" lists the host's listings not yet in OTAbridge; each is
  imported as a new property with Airbnb's title, place, capacity, photos, description and this
  year's per-day prices and minimum stays, or attached to an existing property. The pricing page
  states the four promises hosts check first (no onboarding fee, no commission, cancel any time,
  data leaves with you); the console header has a Help link.
- Empty pages now show the feature working: Properties, Channels, Inbox, Owners, Reports and
  Operations each carry a preview sketch, a sentence saying what the page is for and the one
  action that fills it, in English, French and Arabic. From the Guesty walkthrough recorded in
  `docs/research/2026-09-competitors.md`, where every unconnected page sells its feature rather
  than reporting that nothing is there.
- Guesty-parity round (`docs/research/2026-09-competitors.md`): the getting-started programme is
  three tracks of steps with the minutes each takes, later tracks locked until the one before is
  done, shown on the dashboard and condensed into every page header; Properties is a grid of
  photo cards with per-channel badges and the state; and direct bookings can be collected in
  instalments through named payment rules (spec 10 §10.4b) with a daily collection job.
- Fixed against the Channex docs, read in full (spec 09): a thread's booking comes from
  `relationships.booking`, so booked-guest conversations show the stay and stop counting as
  inquiries; review replies are posted as `{reply: {reply}}`, the shape Channex accepts, so a reply
  from the Reviews page reaches the OTA; "No reply needed" calls its own endpoint and leaves the
  thread open, as Booking.com's response-time scoring expects, instead of closing it; attachments
  go up through `POST /attachments` and are sent one per message with no text next to them, which
  is the only way Channex delivers them. Reviews now show the date the guest wrote them, link to
  the stay by the OTA's reservation code when the booking id is missing, say when the reply window
  has closed (`expired`) instead of asking for a reply Airbnb will refuse, and flag reviews Airbnb
  hides until the host reviews the guest. Every one of these has a fixture recorded from the real
  response shape and a contract test.
- Fixed: reconnecting a property to a different hotel on the same channel proposed the previous
  hotel's room and rate codes (the remembered mapping), which Channex rejected with "Channel has
  no rate", and the wizard hid the reason behind a masked production error. A remembered mapping
  is suggested only while the channel still offers that room and rate, and the create step returns
  a mapping error to the wizard instead of throwing it.
- Fixed, from the first live Booking.com connection on Channex staging: a mapping's occupancy is
  capped at the OTA rate's `max_persons` (Channex logged `occupancy_exceeds_max_persons` for a
  single room mapped at 2); `sync_error` webhooks become P2 events naming the channel's reason;
  `deactivate_channel` / `activate_channel` webhooks move the connection to error and back, so a
  channel switched off in Channex no longer shows as active here; a channel the provider deleted
  (a shared test hotel reclaimed, a removal in Channex) is marked removed by the health poll with
  one P1 alert instead of an info event every five minutes, and removing such a connection here
  succeeds although the provider answers 404.
- Fixed: a provider refusal during activation ("channel with the same settings already exists",
  a rejected mapping) surfaced as a blank React error in production. Channex's `details` now
  travel in the error message, the activate action returns the reason as a readiness issue and
  stores it as the connection's last error, and the Activate button never swallows a failure.
- Fixed: connecting Booking.com (and every other non-Airbnb channel) never created the connection
  on Channex. `POST /channels` requires `group_id` and takes the mapping structure under
  `rate_plans`, each entry with `occupancy`, `pricing_type`, `primary_occ` and `readonly` (docs:
  Channel API examples › Booking.com); we sent no group and a `mappings` key, Channex refused, and
  the console had already reported "created inactive". The provider now reads the property's
  group, activation fills the mapping fields from `mapping_details` (the hotel's pricing model,
  the rate's readonly flag, one primary mapping per room + rate pair) and the create call has a
  fixture and a contract test. Found by connecting Channex's shared Booking.com test hotel on
  staging (spec 07).
- Channex payload and quota fixes from the docs sweep: bookings carry `payment_collect` and
  `payment_type`, the reservation page says whether the guest already paid the channel or we
  collect (and how), and payment rules never schedule an instalment on an OTA-collected booking;
  `channel_removal_warning` and `property_removal_warning` webhooks are recorded as P1 alerts with
  the date Channex will delete the connection or the property, the date is kept on the row and
  shown on the health board and the property page, and the health poll reads
  `expected_removal_date` from `GET /channels/{id}` so a deactivation made in Channex is announced
  without the webhook; properties are created with `settings.state_length` at our 730-day horizon
  (Channex defaults to 500, dropping the last 230 days we push) and existing ones were updated with
  `PUT /properties/{id}`; the ARI rate limiter is keyed per property and endpoint at Channex's
  documented 10 + 10 calls a minute instead of one bucket per organisation.
- Host reviews of Airbnb guests (spec 09 §9.7): every Airbnb review on the Reviews page carries a
  short form (cleanliness, house rules, communication out of 5, recommend, public text, private
  note) that the worker posts to `POST /api/v1/reviews/{id}/guest_review`, the only way a review
  Airbnb hides until the host writes theirs becomes visible. Delivered once, kept on the review
  with its state, covered by a fixture, a contract test, an integration test and the inbox e2e.
- Airbnb requests (spec 09 §9.1, §9.10): inquiries, reservation requests and alteration requests
  are read from the Channex live feed (`GET /api/v1/live_feed`), the only place they carry an
  event id, and land in a requests queue under Reservations and as a card on the guest's
  conversation, with the stay the guest asked for, the payout and Airbnb's deadline. The card
  offers the answers Airbnb takes for that kind: pre-approve or send a special offer, accept or
  decline with a reason and a message, accept, decline or cancel an alteration. The decision is
  recorded first and carried to Airbnb by the worker (`POST /api/v1/live_feed/{id}/resolve`), so
  a provider outage never loses it; a request answered on Airbnb itself closes here on the next
  sync. New table `booking_request`; `requests.sync` on the five request webhooks and a two-minute
  poll; FakeProvider live feed with a ledger of resolutions; fixtures and contract tests for the
  list and resolve calls. Before this, the inquiry card parsed the system message and had no
  buttons, and reservation requests were invisible until Airbnb declined them for silence.
- Fixed: Airbnb guest messages never reached the inbox. Channex hands back a thread with only
  its last message; the conversation lives at `GET /api/v1/message_threads/{id}/messages`, which
  we never called, so threads synced with no messages in them and the guest's name (Channex puts
  it in the thread's `title`) was missing. `ChannexProvider.listThreads` now reads each changed
  thread's messages, oldest first, and a thread with no messages no longer has `last_message_at`
  pushed to the poll time. Covered by fixtures and a contract test, whose absence let the shape
  mismatch through in the first place. A reply typed in the OTA's own app now counts as a reply:
  the pulled outbound message sets `last_outbound_at` and the first-response time, so the thread
  stops showing "needs reply" and stops breaching its SLA. An inbox view with no conversations in
  it now says so and offers all conversations, instead of showing the first-run pitch as though
  no guest had ever written.
- Real cards on the two payment surfaces (spec 10 §10.4): with
  `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` set, `CardField` mounts Stripe's hosted Card Element on the
  guest checkout and on Settings → Billing and exchanges it for a payment-method id on submit, so
  a card number never reaches our DOM or our servers, and `js.stripe.com` loads on those two pages
  only. A 3-D Secure challenge is answered in place (`CardChallenge` over the intent's client
  secret) and the form re-submits; `confirmIntent` reads the intent before confirming, so one the
  browser already carried through is not confirmed twice. Without a publishable key the field
  stays a token input, which is what the fake provider and the tests expect. On Settings →
  Billing the card is set up through a SetupIntent (`startCardSetup` on `BillingProvider`,
  `POST /api/v1/billing/card-setup`), so a European card answers its challenge once, at the
  desk, and the invoices that follow are charged off-session. A tenant that chose its plan while
  the fake provider was wired keeps a `cus_fake_…` customer no real provider knows; cards and
  invoices now create the customer for real and store the new reference instead of failing.
- The sidebar shows every section (Dashboard, Inbox, Calendar, Reservations, Front desk,
  Operations, Properties, Channels, Direct bookings, Owners, Reports, Settings) with its pages
  unfolding underneath: no "More" drawer, and a section opens when you are inside it or when you
  open it, remembered per browser. The Settings tabs are gone, since the sidebar now lists those
  pages.

- Airbnb through Channex (spec 07 CH-5): "Connect Airbnb" asks Channex, the approved Airbnb
  partner, for Airbnb's authorisation link (`POST /meta/airbnb/connection_link`) for the live
  properties; the host consents on airbnb.com and returns with the new channel, which becomes one
  inactive `ChannelConnection` per property. The connection page lists the host's listings
  (`GET /channels/{id}/action/listings`) to map to rate plans; activation pushes the mappings
  (`POST /channels/{id}/mappings`), activates and imports future reservations. Channex's staging
  Airbnb app accepts real hosts, so this works against the staging key. `/channels/connect` embeds
  Channex's channel screen for the remaining provider-only channels and pulls Channex's connections
  into `ChannelConnection` rows. `ConnectivityProvider` gains `createAirbnbConnectionLink`,
  `listChannelListings`, `mapListing`, `loadFutureReservations`, `createChannelSession` and
  `listChannels` (Channex with docs fixtures, Fake, id-map). The direct Airbnb OAuth adapter is gone:
  Airbnb issues those credentials to partners, not operators.
- Cloudflare deployment target (ADR-0008): `apps/web` builds for Workers with
  `@opennextjs/cloudflare` (`build:cf`, `deploy:cf`); `apps/worker-cf` runs the job runtime on
  Cloudflare Queues, a one-minute Cron Trigger scheduler and a Durable Object lease per property;
  `@pms/cloudflare` holds the queue bindings and the outbox publisher over Queues; the outbox is
  drained after every request chokepoint through `waitUntil`; `db:migrate:neon` migrates Neon over
  a WebSocket; `MAIL_TRANSPORT=resend`; deploy workflow `deploy-cloudflare.yml`.
- `@pms/runtime/shims/*`: pure-JS Argon2id (PHC-compatible with the native hashes), a console JSON
  logger with the same redaction list, PGlite and ioredis stubs, aliased into Workers bundles only.

- Channex certification suite run against staging: provisioning with natural-key reconciliation
  (PROV-3), ARI round trip, property import and adapter descriptors, with recorded fixtures;
  provider corrections for the flat property address, `min_stay` mode and descriptor shape.

- M1 connectivity core: `ConnectivityProvider` port with the spec 05 error taxonomy; `ChannexProvider`
  over fetch/record/replay transports with docs-sourced fixtures and a contract suite; `FakeProvider`
  with seeded fault injection (429, 5xx, timeouts, partial 422, duplicate/reordered/dropped webhooks,
  unmapped bookings) and a ledger; ARI batch builder (run-length, weekday, base-plus-override with
  FIFO-safe merging) proven by property tests; push pipeline with adaptive token bucket, circuit
  breaker, per-cell versions and sampled read-back; booking ingestion with the ack loop, out-of-order
  handling and the ack sweep; availability derivation from booking diffs; webhook receiver
  (token + secret, persist-first, dedupe); nightly reconcile; Sync Health page; worker processors on
  BullMQ; chaos runner asserting no booking lost and no cell permanently wrong (200/200 seeds).

- M0 foundations: `packages/authz` generated from spec 02 with the matrix and evaluator tests;
  `packages/db` with tenancy schema, forced row-level security on every org table, hash-chained
  append-only audit log, transactional outbox and a PGlite test harness; identity (sign-up, login
  with lockout, TOTP, invitations, magic links, rotating refresh sessions); `withPermission`
  chokepoint with the unwrapped-handler build check; console shell with next-intl (en, fr, ar);
  worker container with the outbox publisher and the nightly on-the-books snapshot job;
  Playwright onboarding e2e; ADR-0001 to ADR-0005.

- Monorepo scaffold: `apps/web` (Next.js), `apps/worker` (BullMQ), `packages/core`
  (framework-free domain layer) with pnpm workspaces and Turborepo.
- `packages/core` value objects `Money`, `LocalDate` and `DateRange` with property-based tests.
- Docker Compose for local Postgres, Redis and MinIO.
- CI: lint, typecheck, test and build on every push and pull request.
- Fair-code licensing (Sustainable Use License, Enterprise License, CLA), README, community
  files and the landing page in `website/`.

### Changed

- The web app's components are HeroUI v3 (React Aria + Tailwind v4) behind the kit in
  `apps/web/src/components/ui` (ADR-0010): buttons, fields, selects, date pickers, cards, chips,
  alerts and server-rendered tables that reuse HeroUI's table styles. HeroUI's default theme is
  kept; the brand contributes the accent, the two typefaces and the logo. Pages may only import
  the kit (lint rule). Console screens were reorganised on the kit (reports, dashboard,
  reservations, inbox, owner portal); French and Arabic gained the ~310 strings each that were
  still English; report names are localised.
- OTAbridge design system: the console, auth, owner portal, booking engine and guest surfaces
  carry the OTAbridge name and logo mark, Bricolage Grotesque display and Manrope body type
  (self-hosted), an ink sidebar with grouped navigation, and one palette (ink, mint, sky, amber,
  rose) defined as Tailwind tokens in `globals.css`; every page title reads `… · OTAbridge`.
- The queue processors, the `system` job table and the schedule moved from `apps/worker` into
  `packages/jobs/src/worker` (`handleQueueJob`, `runSystemJob`, `SCHEDULE`, `dueJobs`);
  `apps/worker` is now a BullMQ adapter around them. Processors take a `JobControl` instead of a
  BullMQ `Job`.
- `packages/db` connects with one client per transaction when `DATABASE_PER_REQUEST=1` and loads
  PGlite on demand; `MIGRATIONS_FOLDER` became `migrationsFolder()`. With a request `scope`
  (the web app on Workers passes its request context) every transaction and query of one request
  shares a single connection, serialised as on the development database, closed shortly after
  the last use. `withTenant` applies the role switch and all settings in one statement. Together
  these cut a console page from 6 to 7 connections and 36 to 58 statements to 1 connection and
  roughly half the statements.
- The hosted web app moved to Vercel as the plain Node build, pinned to Neon's region
  (ADR-0009); the jobs Worker, Queues, the fallback copy of the web app and the landing page stay
  on Cloudflare. After a write, a web app hosted off Cloudflare pokes the jobs Worker's new
  `POST /outbox/drain` (shared secret) through Next's `after()`. Smart Placement was tried and
  reverted; the jobs Worker's minute tick keeps one web instance warm.

### Fixed

- Silent empty inbox (spec 05 CXMSG-1): Channex refuses the message threads list with 403 while
  the property has no Messages application installed, and the two-minute poll only logged it.
  The poll now records one open `messages_app_missing` event per property, the inbox shows a
  banner naming the property and the remedy (Applications → install Channex Messages), and the
  first successful sync clears it.
- Channel activation on real Channex (spec 07 CH-4): a freshly created channel is inactive by
  design, and the readiness check counted that as "not ready" with no reason, so activation
  bailed out before ever calling activate, stored an empty readiness ("Not ready: unknown" on
  the health board) and the button still said "Active". Readiness is now the provider's gaps
  only; the inactive flag travels on its own and is a regression only after activation. A failed
  activation always shows why, with a fallback message when the provider names nothing.
- ARI push: Channex's "Not found property for this change", answered to a push that lands right
  after provisioning created the objects, no longer burns every cell of the horizon as a
  permanent validation failure; those cells return to pending and the push retries (spec 05
  §5.10). A force resync now re-enters cells that failed validation, and the Airbnb button sends
  a person without a live property back to Channels with an explanation instead of raw JSON.
- Airbnb through Channex, reconciled with Channex's Airbnb guide: a second authorisation
  re-connects the account's existing channel instead of creating another; activation skips
  listing mappings the connection already holds and waits for Airbnb to confirm new ones before
  activating; future reservations load per listing; pausing or removing one property un-maps its
  listings rather than deactivating the account channel shared by the portfolio.
- A rate plan added after a property's setup finished was never created on Channex, and its
  calendar days made Channex refuse every push for the property. Setup now reopens for such
  plans (from the plan form and from "Retry setup"), the sweep also visits live properties whose
  setup was reopened, and a push skips plans the channel manager does not hold yet instead of
  blocking the others.
- ARI push on the hosted worker: cell states are now written in one statement per group
  instead of one per cell (a property's push touches thousands of cells and the worker is far
  from the database), so a push finishes in seconds instead of dying mid-way; cells a dead job
  left in flight re-enter the next push; the per-property lease lasts ten minutes.

- The console proxy no longer redirects the Channex webhook receiver (`/webhooks/*`) to the login
  page; the receiver authenticates by path token and secret.
- The cleaner app keeps not-yet-synced local updates when a day refresh lands, and syncs one queue
  at a time, so a fast accept → on-site sequence can no longer lose the second update.
- The storefront search keeps its organization scope across searches.
- Reservation saved views ("arrivals today" and friends) use the property-local date instead of
  UTC.
- The worker's per-property provider calls (ARI push, reconcile, booking pull, thread and review
  sync) now go out with the property's Channex ids and come back with local ones, as the
  test-hook drain always did; the queue path previously pushed local ids and Channex rejected
  every cell. ARI push jobs also read their ids from the outbox envelope.
- The Channex HTTP transport calls `fetch` on the global, which Cloudflare Workers require.

## [1.0.0] — 2026-09-02

### Added

- M8 hosted service and hardening: the `platform` module (launch plans with marginal tiers,
  peak-of-period metering, EU VAT with reverse charge and OSS, proration, the tenant lifecycle
  state machine, dunning schedule, quotas with the QUOTA-1 exemption, the `BillingProvider`
  port) with property tests; `StripeBillingProvider` over the transport port and
  `FakeBillingProvider`; subscription, usage, invoice, operator, flag, announcement,
  impersonation, support-access, plugin, delivery, export and job-request tables with RLS; jobs
  for metering, period close, dunning, trial expiry, signed plugin deliveries with breaker and
  backoff, exports, tenant purge and operator job requests; the worker schedulers; the `/ops`
  operator console behind the `withOperator` chokepoint with fleet health, tenants, sync
  inspector, dead letters, webhook explorer, flags, announcements, impersonation (approval or
  pre-granted access, 60-minute cap, read-only, PII closed, banner, transcript, break-glass with a
  second operator), jobs, operators and the operator audit; tenant settings for billing (plans,
  card, usage, invoices with explainer, cancel, export, leave), plugins (install with the
  permission grant, secret shown once, deliveries) and support (pre-granted access, approvals,
  diagnostics bundle); the onboarding checklist and state banners in the console shell; the
  suspended-tenant console gate that keeps sync running; extension-point interfaces and signing
  helpers in the Apache-2.0 SDK with two reference plugins; fifteen runbooks; install, operate,
  plugin and API docs; the security workflow (gitleaks, PAN scan, audit, SBOM, CodeQL), the
  drills workflow (backup → restore, upgrade → rollback, compose smoke) and k6 load scenarios;
  `es` and `pt` locales for the guest, owner and onboarding surfaces with English fallback.

### Changed

- Reports, exports and bulk operations check the plan quota in hosted mode; the PAN scan skips
  the negative tests that prove a card number is refused.

## [0.6.0] — 2026-09-02

### Added

- M7 direct booking engine: the direct channel as a `ChannelConnection` (`adapter_code = "direct"`);
  local search honouring every restriction with occupancy pricing (BE-2, BE-4) and a fast-check
  property that no offer violates a restriction or a held night; holds that count against
  availability on every channel and expire by a worker sweep (BE-5); a three-phase, idempotent
  confirm through the `PaymentProvider` port with `StripePaymentProvider` (PaymentIntents over
  REST, unit-tested) and `FakePaymentProvider` for tests and the demo, 3-D Secure round-trips and
  recoverable declines (BE-6); confirmation mail with `.ics` and the portal link (BE-7); guest
  audit entries from hold to cancellation (BE-8); the portfolio storefront with attribute filters
  and a dependency-free map, per-property pages with deep links, the `/widget.js` iframe embed
  with `postMessage` resizing, per-property colour theming, no third-party scripts (BE-9..11);
  promo codes, direct-only rate plans, extras to the folio, consent-gated abandonment mails;
  the guest portal (magic token, pre-check-in, access-code reveal at the configured window,
  house manual, extras, messaging into the direct thread, policy-driven cancellation with refund);
  console pages per property and a portfolio overview with the commission saved; every direct
  booking gets a door code at confirm and a line on the owner statement.

## [0.5.0] — 2026-09-02

### Added

- M6 dashboards and reporting: the KPI dictionary as code with property tests; nightly rollups
  into `fact_room_night`, `fact_booking` and `agg_daily_kpi` with cancellation restatement and
  labelled commission estimates; the live on-the-books snapshot source, pickup and pace (marked
  unavailable until a year of snapshots exists); realtime today deltas; role dashboards for
  portfolio, property, revenue, reservations, housekeeping, guest relations, finance and viewer
  with a league table, outlier flags, action queues, "vs previous period" and budgets; a
  seventeen-report catalogue with CSV and PDF export, basis printed on every file, saved
  schedules by email; hourly alerts with once-per-condition raising, auto-resolution and
  per-type action rates (ALRT-1); the daily statement-to-report reconciliation job; a read-only
  `reporting` schema for BI tools.

## [0.4.0] — 2026-09-02

### Added

- M5 owner management: owner records with documents and expiry flags, sealed payout
  destinations shown masked (PAY-1), portal access as a passwordless `owner` grant on the owner's
  group; versioned agreements for every model and commission basis with deductible, cleaning-fee,
  owner-stay, payout and VAT terms, overlap refusal (AGR-1, AGR-2, INV-12); expense capture with
  receipts, agreement-suggested rebill flag with override reason and approval with optional
  four-eyes (EXP-1, EXP-2); the pure statement engine with per-night attribution, per-version
  segments, labelled commission estimates, visible markup, owner-stay allowances, hold-back and
  minimum payout, property-based tests and byte-identical regeneration (STMT-1..3, OWN-1);
  restatement adjustments after send from the billed-night ledger (STMT-4, OWN-2); the
  draft → approved → sent → paid workflow with review flags, previous-period column, PDF and
  email, auto-send after N days (STMT-5); payouts through the `PayoutProvider` port with a fake
  and a Stripe Connect adapter, step-up and four-eyes (PAY-1..3); the owner portal (dashboard,
  calendar with self-service owner stays through ARI, statements with line drill-down, PDF and
  dispute threads, expenses, maintenance with raise, reviews, documents) scoped hard to the
  owner (PORT-1..3, OWN-3); worker schedulers `statements.sweep`, `statements.autosend`,
  `payouts.poll`.

## [0.3.0] — 2026-09-02

### Added

- M4 unified messaging: thread and message sync from the provider (webhook-triggered pull plus a
  2-minute poll, idempotent by provider message id, CXMSG-2/3), sealed bodies and guest names, a
  portfolio inbox with the spec's views, SLA chips and counts in the nav badge (MSG-1/2), a
  conversation view with booking sidebar, Airbnb inquiry cards, per-message delivery states with
  retry and capability-aware controls (close, Booking.com "no reply needed"); structurally
  separated guest and note composers, the send button naming guest and channel, re-confirmation
  on switching (MSG-3..5) and internal notes that cannot reach a provider at the type, runtime and
  database level (MSG-6); org-scoped templates with locale variants, real-value preview and
  promotional-pattern warnings (AUTO-7); the automation engine over the spec's triggers with
  property-local quiet hours, per-guest limits, guest-reply handover, rule-and-version labels,
  test-send with preview, a per-property kill switch and access-code delivery that waits for the
  window and resends on rotation (AUTO-1..6); reviews with responses and a response-SLA marker;
  a first-response KPI per property, channel and agent; worker consumers for `messages.sync` and
  `automation.run` and schedulers `messages.poll`, `automation.tick`, `reviews.sweep`; FakeProvider
  messaging and reviews with a ledger of everything it accepted.

## [0.2.0] — 2026-09-02

### Added

- M3 reservations and operations: reservation list with shipped and saved views, filters and CSV
  export; detail with human-readable revision timeline, acknowledgement badge, unit assignment and
  auto-assign, check-in/out and no-show, access credentials through the `LockProvider` port (sealed,
  masked, revoked and reissued within the revision's job, INV-14), audited guest PII and step-up
  gated payment instrument reveals; mapping resolution queue; turnover tasks generated and re-planned
  from booking diffs with same-day changeover windows, greedy routing, escalation, crews and
  checklists; the cleaner PWA with an offline queue, photo-required checklists and issue reporting;
  maintenance issues with availability blocks; unit blocks incl. owner stays; folios, charges,
  tourist tax, deposit holds, gapless invoices and credit-note-only corrections, idempotent daily
  close; front desk today board and room rack for hotel-kind properties; staff bookings and direct
  cancellations on the one booking-creation path; card-metadata retention purge (PCI-4).

## [0.1.0] — 2026-09-02

### Added

- M2 inventory, calendar and channels: property wizard with `kind` selection and system-managed
  room type and unit for `single_unit` listings (MODEL-1), templates, clone, CSV import and adoption
  of an existing Channex property; resumable idempotent provisioning (PROV-1..5) with webhook
  registration, provider-id translation and a rolling 730-day horizon job; derived rate plans
  recomputed with their parent (INV-6), room-type capacity changes flowing into availability,
  policies; the portfolio calendar (virtualised rows and columns, keyboard editing, range
  toolbar, `expected_version` conflicts with both values, server-backed undo, per-cell sync
  state over server-sent events); bulk update with mandatory dry run, guard rails and
  inverse-operation undo (BULK-1..4); channel accounts with Airbnb OAuth and bulk listing
  import (CH-5), descriptor-driven connection wizard (CH-1..4, CH-6), mapping with confidence-
  scored suggestions, coverage warnings, validation, diff-before-save and targeted re-push
  (MAP-1..4, MAP-6), health board with plain-language alerts and reversible pause (CH-7, CH-8),
  readiness polling; step-up re-authentication page for `!` permissions; `/api/v1` public
  endpoints with an OpenAPI 3.1 document and the Apache-2.0 `@channex-pms/sdk`; `packages/jobs`
  shared by the worker and the test hooks; `compose.selfhost.yml` with a multi-target Dockerfile.
