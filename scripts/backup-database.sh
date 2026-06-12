#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
BACKUP_DIR="${BACKUP_DIR:-$ROOT_DIR/backups}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Production environment file not found: $ENV_FILE" >&2
  exit 1
fi

set -a
source "$ENV_FILE"
set +a

: "${POSTGRES_USER:?POSTGRES_USER is required}"
: "${POSTGRES_DB:?POSTGRES_DB is required}"

mkdir -p "$BACKUP_DIR"
timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_path="$BACKUP_DIR/${POSTGRES_DB}-${timestamp}.dump"

docker compose \
  --env-file "$ENV_FILE" \
  -f "$COMPOSE_FILE" \
  exec -T postgres \
  pg_dump --format=custom --no-owner --no-acl \
  --username "$POSTGRES_USER" \
  --dbname "$POSTGRES_DB" > "$backup_path"

test -s "$backup_path"
echo "Database backup created: $backup_path"
