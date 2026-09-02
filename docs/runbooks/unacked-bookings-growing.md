# Runbook: Unacked bookings growing

**Symptom.** `booking_unacked_count` climbs; Fleet health shows unacked bookings; `booking.ack.lagging` errors in the worker log.

**How to confirm.** **Sync inspector → unacked** lists revisions with `received_at`. Check `booking.ack_sweep` is running (worker heartbeat) and the provider answers acks (`sync_operation` kind `ack`).

**Blast radius.** Channex re-sends unacknowledged revisions; duplicates are handled, but the provider may escalate after hours and the OTA sees us as unresponsive.

**Immediate mitigation.** Restart the worker if the sweep stopped; re-run `booking.ack_sweep` from **Jobs**. If acks return 4xx, the revision id changed at the provider: pull the feed and ack the new one.

**Root cause.** Worker crash between commit and ack (by design safe: BK-2), provider 429 storms (`provider-429-storm`), or a database lock.

**Who to tell.** The on-call engineer; Channex support with request ids if acks are rejected.
