# Runbook: Night audit failed

**Symptom.** `daily_close` job errored; folios for the day have no room lines; invoices missing.

**How to confirm.** Worker log for `daily_close`; **Jobs** history; `sync_operation` is not involved. Check the `invoice_sequence` table for a gap.

**Blast radius.** Reports for the day are wrong until re-run; invoicing is blocked for that property.

**Immediate mitigation.** Re-run `daily_close` from **Jobs**: it is idempotent (posting keys). If it fails again the error names the folio.

**Root cause.** A folio in an impossible state (negative balance with an issued invoice), a timezone change on the property, a database restore that reset sequences (`restore-from-backup`).

**Who to tell.** Finance; the property manager.
