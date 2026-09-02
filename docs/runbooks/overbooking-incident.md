# Runbook: Overbooking incident

**Symptom.** Two bookings for the last unit on the same night; the `overbooked` P1 alert; a guest without a room.

**How to confirm.** **Reservations** for the night; `availability_day` for the room type (should be 0, not negative); **Sync inspector** for the push that should have sent the 0.

**Blast radius.** A guest is affected right now. Money and reputation.

**Immediate mitigation.** Find alternative accommodation first. Then in the PMS: relocate one booking (assign a different unit or property), block the night, force resync so every OTA sees 0.

**Root cause.** A hold or booking that did not decrement (check `recomputeAvailability` sources in the audit log), a late push (429 storm), or an OTA that ignored a stop-sell. Keep the revision ids for the OTA dispute.

**Who to tell.** The property manager immediately; the OTA if it sold against a pushed 0; the owner if the relocation costs money.
