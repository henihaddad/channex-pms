# Runbook: Payment provider failure

**Symptom.** Booking engine confirms fail with `payment failed` for every card; billing charges fail; Stripe status page shows an incident.

**How to confirm.** The engine's confirm returns `declined` with a provider message for good test cards; the worker logs `billing.charge.unavailable`.

**Blast radius.** Direct bookings cannot complete; OTA bookings are unaffected. Billing invoices stay `open` (BILL-1: nothing else changes).

**Immediate mitigation.** Switch the engine to `pay_at_property` guarantee for the affected properties if the outage is long. Do not retry billing manually; dunning retries on schedule.

**Root cause.** Provider incident, or a rotated `STRIPE_SECRET_KEY` (see `rotate-channex-key` for the rotation pattern).

**Who to tell.** Property managers running the direct channel; finance.
