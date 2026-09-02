# Runbook: Upgrade and rollback

**Symptom.** A new release to deploy; a release that must be reverted.

**How to confirm.** Read the release notes (CHANGELOG): every release states its migration duration. Take a backup (`scripts/backup.sh`).

**Blast radius.** Migrations are forward-only (spec 12 §12.8); rolling back means restoring the backup taken before the upgrade.

**Immediate mitigation.** Upgrade: `git fetch && git checkout vX.Y`, `pnpm install`, `pnpm build`, `pnpm --filter @pms/db db:migrate`, restart worker then web, check `/api/health` and Sync Health. Rollback: stop services, `scripts/restore.sh` the pre-upgrade dump, check out the previous tag, restart.

**Root cause.** The drills workflow (`.github/workflows/drills.yml`) rehearses exactly this against the previous tag on every push to main.

**Who to tell.** Tenants through an announcement when downtime exceeds the deploy window.
