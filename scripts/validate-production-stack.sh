#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
API_PORT="${API_PORT:-8000}"
KEEP_STACK="${KEEP_STACK:-false}"
REMOVE_VOLUMES="${REMOVE_VOLUMES:-false}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Production environment file not found: $ENV_FILE" >&2
  echo "Create it from .env.production.example." >&2
  exit 1
fi

cleanup() {
  if [[ "$KEEP_STACK" != "true" ]]; then
    if [[ "$REMOVE_VOLUMES" == "true" ]]; then
      docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down --volumes
    else
      docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" down
    fi
  fi
}
trap cleanup EXIT

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" config --quiet
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" build api migrate
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d postgres redis
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" run --rm migrate
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d api

echo "Waiting for production API readiness..."
for _ in {1..60}; do
  if curl -fsS "http://127.0.0.1:${API_PORT}/health/ready" >/dev/null 2>&1; then
    API_BASE_URL="http://127.0.0.1:${API_PORT}" \
      python3 "$ROOT_DIR/scripts/production-smoke-test.py"
    echo "Production stack validation passed."
    exit 0
  fi
  sleep 2
done

docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" logs api postgres redis
echo "Production API did not become ready." >&2
exit 1
