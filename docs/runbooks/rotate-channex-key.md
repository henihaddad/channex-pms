# Runbook: Rotate the Channex API key

**Symptom.** Scheduled rotation, a suspected leak, or a staff departure.

**How to confirm.** Confirm which key is active: the certification workflow and Sync Health show the environment.

**Blast radius.** Between removing the old key and starting with the new one every push fails; keep the window under a minute.

**Immediate mitigation.** Create the new key in Channex; set `CHANNEX_API_KEY` in the environment; restart worker then web; run a push from Sync Health and a `booking.poll`. Revoke the old key last.

**Root cause.** If pushes fail after rotation the key lacks a property scope: check the Channex user's property access.

**Who to tell.** The on-call engineer; Channex support if the old key cannot be revoked.
