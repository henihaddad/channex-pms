# Runbook: Provider outage

**Symptom.** Every provider call fails (5xx, timeouts); breaker opens for all orgs; Sync Health turns red across the fleet.

**How to confirm.** Fleet health provider errors; `curl https://staging.channex.io/api/v1/...` from the host; Channex status page.

**Blast radius.** No updates reach OTAs; bookings queue at the provider and arrive when it recovers. Local edits are safe (CX-4).

**Immediate mitigation.** Post an **Announcement** (incident) so tenants know. Do nothing to the data. When the provider recovers the breaker half-opens, pending cells push, and the reconcile job repairs drift.

**Root cause.** Provider incident. After recovery run `reconcile.nightly` from **Jobs** to compare every cell.

**Who to tell.** All tenants through the announcement; Channex support.
