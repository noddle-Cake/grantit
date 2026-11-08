#!/usr/bin/env bash
# Daily pg_dump of the Grantit database into $SITE/db-backups, picked up by the host's nightly srv-backup.
# Runs as websvc via grantit-db-backup.service/.timer (installed by 31-grantit.sh). Keeps 14 days.
set -euo pipefail

DIR=/srv/websvc/sites/grantit/db-backups
mkdir -p "$DIR"
out="$DIR/grantit-$(date +%F-%H%M).pgdump"

podman exec grantit-db pg_dump -U grantit --format=custom grantit > "$out"
[[ -s $out ]] || { rm -f "$out"; echo "backup produced an empty dump" >&2; exit 1; }
find "$DIR" -name 'grantit-*.pgdump' -mtime +14 -delete
echo "Wrote $out ($(du -h "$out" | cut -f1))"
