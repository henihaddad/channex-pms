# Runbook: GDPR erasure request

**Symptom.** A guest (or a property on their behalf) asks for erasure.

**How to confirm.** Verify identity through the property; find the guest by booking reference (never by searching PII in logs).

**Blast radius.** Financial records stay (legal basis recorded); everything else about the person is pseudonymised.

**Immediate mitigation.** Run the erasure: pseudonymise the guest row, delete message bodies and attachments, revoke portal sessions, keep aggregates. Record the request id and completion date in the audit log. Add the request to the restore checklist (spec 13 §13.4).

**Root cause.** Check exports taken after the request (`data_export` rows) and ask the tenant to delete their copies.

**Who to tell.** The requester within 30 days; the DPO.
