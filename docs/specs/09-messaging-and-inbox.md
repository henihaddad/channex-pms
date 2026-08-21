# 09 — Messaging & the Unified Inbox

**Status:** `review` — revised 2026-08-21: templates and automation are org-scoped; access-code delivery is a core automation.

**Primary personas:** `guest_relations`, `reservations_agent`, `property_manager`.

Channex unifies guest chat for **Booking.com, Expedia and Airbnb** (EPS/EAN
bookings excepted) behind one Messages API, and it requires the Messages
application to be installed on the property. That single API is what makes a
credible open-source unified inbox possible at all.

Booking.com scores properties on response time, and Airbnb inquiries convert or
expire within hours. So the inbox is not a nice-to-have — it is revenue.

## 9.1 Inbox layout

Three panes: **filters** · **thread list** · **conversation**.

Thread list rows show: guest name, channel badge, last message preview, unread
count, stay dates, an **SLA chip** (time remaining to first response), assignee
avatar, and state (`open` / `closed` / `no reply needed`).

Filters and views:

| View | Definition |
|---|---|
| **Needs reply** *(default)* | Open, last message inbound, no staff reply since |
| **Breaching SLA** | First-response due within 30 min, or already breached |
| **Assigned to me** | — |
| **Unassigned** | Open with no assignee |
| **Inquiries** | Threads with no booking (Airbnb pre-booking) |
| **Arriving today / tomorrow** | Linked booking arrival window |
| **In house** | Guest currently staying |
| **Snoozed** | Hidden until a chosen time |
| **All / Closed** | — |

Additional filters: channel, property (portfolio inbox across properties),
language, tag, date range. Full-text search across message bodies, guest names and
OTA references.

- **MSG-1** Portfolio roles get a **cross-property inbox** with a property column;
  property roles see only theirs.
- **MSG-2** Unread and SLA counts appear in the global nav badge and are pushed in
  realtime.

## 9.2 Conversation view

- Chronological messages with clear authorship: **guest**, **staff** (named),
  **system** (OTA notices), **automation** (rule name shown).
- A **booking context sidebar**: dates, room, rate plan, total, balance, arrival
  status, special requests, previous stays, and quick actions (assign room, add
  note, view booking). Answering "can I check in early" should not require opening
  another tab.
- **Airbnb inquiry cards**: the parsed system message (requested dates, guests,
  price) rendered as a structured card with quote/accept/decline actions.
- Attachments inline (images previewed, documents downloadable), stored in our
  object store and pushed to the provider.
- Delivery states per message: `queued`, `sent`, `failed` with a retry button. A
  failed OTA send is shown as failed. We never render an undelivered message as
  delivered.
- Channel capability awareness: attachment upload, thread closing and Booking.com's
  **"no reply needed"** control appear only where the provider supports them.

### Internal notes vs guest messages

**The single most dangerous UI in this product is a composer that can send an
internal note to a guest.** Therefore:

- **MSG-3** Notes and guest replies are separate, visually distinct composers —
  different background colour, different label, different button text.
- **MSG-4** The guest composer always names the recipient and channel on the send
  button: "Send to Ana via Booking.com".
- **MSG-5** Switching composer mode clears nothing but requires re-confirmation if
  text is present.
- **MSG-6** Internal notes are never transmitted to any provider, enforced at the
  domain layer with a dedicated test, not merely by UI wiring.

## 9.3 Composing

- **Templates** (org-scoped — 200 listings share one library) with variable
  interpolation (`{{guest.first_name}}`, `{{booking.arrival}}`,
  `{{unit.wifi_name}}`, `{{unit.access_instructions}}`, `{{property.address}}`), organised by
  category, filtered to the current channel, and previewed with real values before
  sending.
- **Multi-language templates** — a locale variant is auto-selected from the guest's
  language, with a manual override.
- **Snippets** for `/`-triggered quick insertion.
- **Translation** — inbound messages can be translated for staff and outbound
  drafts translated to the guest's language, always showing both versions before
  send. Never send a translation the sender has not seen.
- **AI-assisted drafts** — **optional, opt-in, off by default**, implemented as a
  plugin behind the `LlmProvider` port so a self-hoster can point it at a local
  model or nothing at all. A generated draft is always clearly labelled and always
  requires a human to press send. No guest PII leaves the deployment unless the
  operator explicitly configures an external provider and accepts it in writing.
- **Scheduled send** with quiet hours (§9.5).

## 9.4 Assignment, collision and SLA

- Manual and rule-based assignment (by channel, language, property, round-robin).
- **Collision detection**: presence indicators show who is viewing or typing in a
  thread, plus a warning when someone else has an unsent draft. Two staff answering
  the same guest is a visible embarrassment worth engineering against.
- **SLA timers** per channel with configurable targets (default: first response
  30 min, resolution 24 h), business hours awareness, escalation notifications, and
  a breach report.
- **"No reply needed"** on Booking.com threads is a first-class action, because it
  protects the response-time score without a fake reply.
- **Snooze**, **tag**, **close** and **reopen**, with reasons recorded.

## 9.5 Automation

Rules over triggers, with conditions and quiet hours:

| Trigger | Typical automation |
|---|---|
| Booking confirmed | Thank-you + directions + check-in instructions |
| T-3 days before arrival | Pre-arrival details, upsell, early check-in offer |
| T-1 day | Arrival-day logistics, door code where applicable |
| Access window opens (configurable, e.g. T-1 day 17:00) | **Door code / lockbox delivery** — the STR-critical automation; pulls from `AccessCredential`, never sends before the window, resends on rotation |
| Check-in completed | Wi-Fi, amenities, house manual, contact details |
| Mid-stay (stay ≥ 3 nights) | Satisfaction check |
| Check-out day | Departure info, late-checkout offer |
| T+1 after departure | Thank-you + review request |
| Inquiry received (Airbnb) | Immediate acknowledgement + availability answer |
| Message received outside business hours | Auto-acknowledge with response window |
| Booking cancelled | Cancellation confirmation |

Requirements:

- **AUTO-1** Quiet hours in **property-local** time; nothing sends at 03:00.
- **AUTO-2** Rate limits per guest (default max 1 automated message per day, 4 per
  stay) — automation must never feel like spam.
- **AUTO-3** Automation pauses on a thread the moment a guest replies, handing over
  to a human, until a human closes the loop.
- **AUTO-4** Every automated message is labelled in the thread with its rule and
  version, and is fully audited.
- **AUTO-5** Test-send to a staff address before enabling, plus a preview against a
  real upcoming booking.
- **AUTO-6** A per-property kill switch stops all automated messaging instantly.
- **AUTO-7** **No marketing content through OTA channels.** OTA messaging is for
  the reservation; direct-marketing consent lives with the guest's own contact
  details and email channel, never inside a Booking.com thread. The template
  editor warns on obvious promotional patterns.

## 9.6 Beyond OTA channels (v2)

The thread model is provider-agnostic, so later additions do not need a new inbox:
direct email (via our own transport, threaded by reference), WhatsApp Business,
SMS, and a website chat widget tied to the booking engine. Each arrives as a
`provider` value with declared capabilities.

## 9.7 Reviews

Reviews live next to messaging because it is the same team's job: list by property
and channel, filter by rating and response state, respond where the OTA allows it,
templates for responses, and a response-SLA timer. Rating trends and per-channel
reputation feed [11](./11-dashboards-and-analytics.md).

## 9.8 Privacy and retention

- Message bodies and attachments are **guest PII**: encrypted at rest, gated by
  `message:read`, excluded from logs, and never sent to analytics.
- Configurable retention (default: 25 months after departure) with automatic
  purge; a GDPR erasure request removes bodies while retaining the non-personal
  metadata needed for aggregate reporting.
- Attachment scanning for malware before staff download.
- An exportable per-guest conversation transcript for data-subject access requests.

## 9.9 Acceptance criteria

- A guest message from any supported OTA appears in the inbox within 60 seconds and
  raises an unread badge.
- Staff can reply with an interpolated template in under 15 seconds.
- It is structurally impossible to send an internal note to a guest.
- Median first response time is visible per property, per channel, per agent.
- Airbnb inquiries with no booking are fully usable, not a broken edge case.
