#!/usr/bin/env bash
# Restore a backup into an empty database (runbook restore-from-backup, NFR-6).
# Usage: DATABASE_URL=postgres://… scripts/restore.sh backups/pms-….dump
set -euo pipefail
DUMP="${1:?dump file required}"
pg_restore --list "$DUMP" >/dev/null
pg_restore --no-owner --no-privileges --exit-on-error --dbname "$DATABASE_URL" "$DUMP"
echo "restored $DUMP"
