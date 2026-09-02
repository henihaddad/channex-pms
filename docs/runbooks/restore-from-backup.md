# Runbook: Restore from backup

**Symptom.** Data loss or corruption; a failed migration that cannot roll forward; a compliance request to restore a point in time.

**How to confirm.** Identify the last good backup (`scripts/backup.sh` writes `backups/<timestamp>.dump`); confirm its size and `pg_restore --list`.

**Blast radius.** Everything after the restore point is lost unless re-ingested: bookings re-arrive from Channex (they are re-sent until acked), ARI is re-pushed from local state.

**Immediate mitigation.** Stop web and worker. `scripts/restore.sh <dump>` into a fresh database. Run `pnpm --filter @pms/db db:migrate`. Start the worker first: it pulls the booking feed and re-pushes pending ARI. Verify the audit chain (`audit.verify` job).

**Root cause.** Record the incident, re-apply any erasure requests made after the restore point (spec 13 §13.4), rotate secrets if the cause was a compromise.

**Who to tell.** Every tenant whose data window was affected; the DPO if personal data was involved.
