#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ENV_FILE="$ROOT/server/.env"
BACKUP_DIR="$ROOT/backups/postgres"
mkdir -p "$BACKUP_DIR"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
fi

HOST="${INVENTORY_PGHOST:-127.0.0.1}"
PORT="${INVENTORY_PGPORT:-5432}"
DB="${INVENTORY_PGDATABASE:-inventory_db}"
USER="${INVENTORY_PGUSER:-postgres}"
STAMP="$(date +%Y%m%d_%H%M%S)"
OUT="$BACKUP_DIR/inventory_db_${STAMP}.dump"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump bulunamadı (Postgres client tools kurulu olmalı)." >&2
  exit 1
fi

export PGPASSWORD="${INVENTORY_PGPASSWORD:-}"

pg_dump -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -Fc -f "$OUT"

unset PGPASSWORD

echo "Yedek: $OUT"
ls -lh "$OUT"
