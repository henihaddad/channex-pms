# Runbook: Channel disconnected

**Symptom.** A connection shows `error` or `paused` on the channel health board; the OTA stops receiving updates; alerts of type `channel_disconnected`.

**How to confirm.** **Channels → connection** shows `lastError`. In the operator console **Sync inspector** lists the failing operations; a 401/403 means credentials, a 404 a removed listing, repeated 5xx a provider outage.

**Blast radius.** No rates or availability reach that OTA; bookings still arrive through Channex. Overbooking risk grows with every hour.

**Immediate mitigation.** Credentials: reconnect the account (OAuth) or re-enter the key (spec 07 CH-2). Removed listing: fix the mapping. Outage: see `provider-outage`. Pause the connection deliberately if the OTA is spamming errors; the pause is reversible and audited.

**Root cause.** Read the channel event log for the first failure; compare the mapping diff; verify the listing exists on the OTA side.

**Who to tell.** The property manager; the OTA's partner support when the listing was removed.
