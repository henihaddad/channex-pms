#!/usr/bin/env bash
# Nightly backup (spec 12 §12.8, NFR-6): custom-format pg_dump the restore script understands.
# Usage: DATABASE_URL=postgres://… scripts/backup.sh [dir]
set -euo pipefail
DIR="${1:-backups}"
mkdir -p "$DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$DIR/pms-$STAMP.dump"
pg_dump --format=custom --no-owner --no-privileges --file "$OUT" "$DATABASE_URL"
echo "$OUT"
# keep 35 days (spec 13 §13.4)
find "$DIR" -name 'pms-*.dump' -mtime +35 -delete
