# Runbook: Security incident

**Symptom.** A credential leak, unusual audit entries, a vulnerability report through SECURITY.md, an impersonation session nobody requested.

**How to confirm.** Operator audit and the tenant audit chain (`audit.verify`); session table for unknown devices; `impersonation_session` rows.

**Blast radius.** Depends on scope; assume tenant data may be exposed until proven otherwise.

**Immediate mitigation.** Revoke sessions and API keys involved; rotate secrets (master key requires re-wrapping DEKs); end impersonations; post an incident announcement if tenants are affected.

**Root cause.** Preserve logs; reconstruct the timeline from the audit chain; decide notification within 72 hours (spec 13 §13.3).

**Who to tell.** Affected tenants and their DPOs; the supervisory authority where the assessment requires it.
