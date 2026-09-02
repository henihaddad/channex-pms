# Runbook: ARI drift detected

**Symptom.** The nightly reconcile (`reconcile.nightly`) reports `ari_drift_cells > 0`, or Sync Health shows cells in `conflicted`; a guest reports a price on an OTA that differs from the calendar.

**How to confirm.** Open **Sync Health** for the property and count conflicted cells. In the operator console open **Sync inspector → property** and look at the last `reconcile` operation: `rejected` and `last_error` name the cells. Compare a cell with `GET /api/v1/ari/grid` and the OTA extranet.

**Blast radius.** Every night with drift can sell at the wrong price or oversell; blast radius is the property and the channels mapped to it.

**Immediate mitigation.** Press **Force resync** in the inspector (or `ari:force_resync` in the console). Pending cells re-push within a minute; watch them reach `synced`. If the provider rejects them, the rejection reason is on the operation.

**Root cause.** Look for an unmapped rate plan (spec 07), a restriction the channel refuses (min stay through vs arrival, spec 05 §5.4), or an edit made on the OTA extranet outside the PMS (local state is authoritative: the re-push wins). Check `sync_operation.last_error` for 422 bodies.

**Who to tell.** The property manager if the drift touched a sold night; Channex support with the request ids if the provider rejects valid values.
