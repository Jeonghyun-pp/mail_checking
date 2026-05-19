#!/usr/bin/env bash
# Nightly Postgres backup. Run from the repo root (or via cron, see DEPLOY.md).
# Keeps the most recent 14 dumps in ./backups.
set -euo pipefail
cd "$(dirname "$0")/.."

set -a
# shellcheck disable=SC1091
source .env.production
set +a

mkdir -p backups
ts=$(date +%Y%m%d-%H%M%S)
out="backups/db-${ts}.sql.gz"

docker compose --env-file .env.production -f docker-compose.prod.yml \
  exec -T postgres pg_dump -U "${POSTGRES_USER}" "${POSTGRES_DB}" \
  | gzip > "${out}"

# Prune: keep newest 14.
ls -1t backups/db-*.sql.gz 2>/dev/null | tail -n +15 | xargs -r rm --

echo "backup written: ${out}"
