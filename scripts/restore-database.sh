#!/usr/bin/env bash

set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: ALLOW_DATABASE_RESTORE=true $0 /path/to/backup.dump" >&2
  exit 1
fi

if [[ "${ALLOW_DATABASE_RESTORE:-false}" != "true" ]]; then
  echo "Restore is destructive. Set ALLOW_DATABASE_RESTORE=true to continue." >&2
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
BACKUP_PATH="$1"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Production environment file not found: $ENV_FILE" >&2
  exit 1
fi

if [[ ! -s "$BACKUP_PATH" ]]; then
  echo "Backup file does not exist or is empty: $BACKUP_PATH" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  stop api

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  exec -T postgres \
  pg_restore --clean --if-exists --no-owner --no-acl \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" < "$BACKUP_PATH"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  up -d api

echo "Database restored from: $BACKUP_PATH"
