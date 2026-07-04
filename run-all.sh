#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MOBILE_DIR="$ROOT_DIR/CyberSecurityApp"
BACKEND_ENV_FILE="$ROOT_DIR/BackendAPI/.env"
ENV_FILE="${ENV_FILE:-$ROOT_DIR/.env.production}"
COMPOSE_FILE="$ROOT_DIR/docker-compose.production.yml"
FRONTEND_MODE="${FRONTEND_MODE:-web}"
FRONTEND_PORT="${FRONTEND_PORT:-8081}"
RUN_SMOKE_TEST="${RUN_SMOKE_TEST:-false}"
PHONE_LAN_IP="${PHONE_LAN_IP:-}"

require_cmd() {
  local command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required command: $command_name" >&2
    exit 1
  fi
}

read_env_value() {
  local file_path="$1"
  local key="$2"
  local line
  local value

  [[ -f "$file_path" ]] || return 1

  while true; do
    line=""
    IFS= read -r line || [[ -n "$line" ]] || break
    line="${line%$'\r'}"
    [[ "$line" == "$key="* ]] || continue

    value="${line#*=}"
    if [[ ${#value} -ge 2 ]]; then
      if [[ "${value:0:1}" == '"' && "${value: -1}" == '"' ]]; then
        value="${value:1:${#value}-2}"
      elif [[ "${value:0:1}" == "'" && "${value: -1}" == "'" ]]; then
        value="${value:1:${#value}-2}"
      fi
    fi
    printf '%s' "$value"
    return 0
  done <"$file_path"

  return 1
}

export_backend_setting() {
  local key="$1"
  local value

  value="$(read_env_value "$BACKEND_ENV_FILE" "$key" || true)"
  if [[ -n "$value" ]]; then
    export "$key=$value"
  fi
}

detect_lan_ip() {
  local interface_name
  local detected_ip

  if command -v route >/dev/null 2>&1 && command -v ipconfig >/dev/null 2>&1; then
    interface_name="$(
      route -n get default 2>/dev/null |
        awk '/interface:/{print $2; exit}'
    )"
    if [[ -n "$interface_name" ]]; then
      detected_ip="$(ipconfig getifaddr "$interface_name" 2>/dev/null || true)"
      if [[ -n "$detected_ip" ]]; then
        printf '%s' "$detected_ip"
        return 0
      fi
    fi

    for interface_name in en0 en1; do
      detected_ip="$(ipconfig getifaddr "$interface_name" 2>/dev/null || true)"
      if [[ -n "$detected_ip" ]]; then
        printf '%s' "$detected_ip"
        return 0
      fi
    done
  fi

  return 1
}

create_local_production_env() {
  local database_password
  local jwt_secret

  database_password="$(openssl rand -hex 24)"
  jwt_secret="$(openssl rand -hex 48)"

  umask 077
  {
    printf 'POSTGRES_DB=cyber_training\n'
    printf 'POSTGRES_USER=cyber_training\n'
    printf 'POSTGRES_PASSWORD=%s\n\n' "$database_password"
    printf 'JWT_SECRET_KEY=%s\n' "$jwt_secret"
    printf 'APP_CORS_ORIGINS=http://localhost:%s,http://127.0.0.1:%s\n\n' \
      "$FRONTEND_PORT" "$FRONTEND_PORT"
    printf 'SENTRY_DSN=\n'
    printf 'SENTRY_TRACES_SAMPLE_RATE=0.1\n\n'
    printf 'API_WORKERS=1\n'
    printf 'API_PORT=8000\n'
  } >"$ENV_FILE"

  echo "Created private local production configuration: $ENV_FILE"
}

require_cmd docker
require_cmd npm
require_cmd curl
require_cmd openssl

if [[ ! -d "$MOBILE_DIR" ]]; then
  echo "Frontend directory not found: $MOBILE_DIR" >&2
  exit 1
fi

case "$FRONTEND_MODE" in
  web | start | phone | ios | android) ;;
  *)
    echo "FRONTEND_MODE must be one of: web, start, phone, ios, android" >&2
    exit 1
    ;;
esac

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is unavailable. Install Docker Desktop with Compose support." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Start Docker Desktop and run this command again." >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  create_local_production_env
fi

if grep -q 'replace-with-' "$ENV_FILE"; then
  echo "$ENV_FILE still contains example placeholder secrets." >&2
  echo "Replace them or delete the file and rerun this script to generate local secrets." >&2
  exit 1
fi

for key in \
  FIREBASE_SERVICE_ACCOUNT_JSON \
  FIREBASE_PROJECT_ID \
  LLM_ENABLED \
  LLM_PROVIDER \
  OLLAMA_BASE_URL \
  OLLAMA_MODEL \
  LLM_TIMEOUT_SECONDS \
  LIVE_DRILL_EMAIL_ENABLED \
  LIVE_DRILL_SMTP_HOST \
  LIVE_DRILL_SMTP_PORT \
  LIVE_DRILL_SMTP_USERNAME \
  LIVE_DRILL_SMTP_PASSWORD \
  LIVE_DRILL_SMTP_TLS \
  LIVE_DRILL_EMAIL_FROM \
  LIVE_DRILL_PUBLIC_BASE_URL
do
  export_backend_setting "$key"
done

firebase_credentials_path="$(
  read_env_value "$BACKEND_ENV_FILE" "GOOGLE_APPLICATION_CREDENTIALS" || true
)"
if [[ -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" && -n "$firebase_credentials_path" ]]; then
  if [[ ! -r "$firebase_credentials_path" ]]; then
    echo "Firebase service account file is not readable: $firebase_credentials_path" >&2
    exit 1
  fi
  FIREBASE_SERVICE_ACCOUNT_JSON="$(<"$firebase_credentials_path")"
  export FIREBASE_SERVICE_ACCOUNT_JSON
fi

frontend_firebase_key="$(
  read_env_value "$MOBILE_DIR/.env.local" "EXPO_PUBLIC_FIREBASE_API_KEY" || true
)"
if [[ -n "$frontend_firebase_key" && -z "${FIREBASE_SERVICE_ACCOUNT_JSON:-}" ]]; then
  echo "The frontend uses Firebase, but backend Firebase credentials are unavailable." >&2
  echo "Configure GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT_JSON in BackendAPI/.env." >&2
  exit 1
fi

if [[ "${LLM_ENABLED:-false}" == "true" ]]; then
  case "${OLLAMA_BASE_URL:-}" in
    http://127.0.0.1:*)
      OLLAMA_BASE_URL="http://host.docker.internal:${OLLAMA_BASE_URL##*:}"
      ;;
    http://localhost:*)
      OLLAMA_BASE_URL="http://host.docker.internal:${OLLAMA_BASE_URL##*:}"
      ;;
  esac
  export OLLAMA_BASE_URL
fi

API_PORT="${API_PORT:-$(read_env_value "$ENV_FILE" "API_PORT" || true)}"
API_PORT="${API_PORT:-8000}"
API_BASE_URL="http://127.0.0.1:${API_PORT}"
FRONTEND_API_BASE_URL="$API_BASE_URL"
FRONTEND_NPM_SCRIPT="$FRONTEND_MODE"
FRONTEND_ARGS=(--port "$FRONTEND_PORT")

if [[ "$FRONTEND_MODE" == "phone" ]]; then
  if [[ -z "$PHONE_LAN_IP" ]]; then
    PHONE_LAN_IP="$(detect_lan_ip || true)"
  fi
  if [[ -z "$PHONE_LAN_IP" ]]; then
    echo "Could not detect this Mac's Wi-Fi IP address." >&2
    echo "Run again with PHONE_LAN_IP=192.168.x.x FRONTEND_MODE=phone ./run-all.sh" >&2
    exit 1
  fi

  FRONTEND_API_BASE_URL="http://${PHONE_LAN_IP}:${API_PORT}"
  FRONTEND_NPM_SCRIPT="start"
  FRONTEND_ARGS+=(--lan)

  if [[ -z "${LIVE_DRILL_PUBLIC_BASE_URL:-}" ]]; then
    LIVE_DRILL_PUBLIC_BASE_URL="$FRONTEND_API_BASE_URL"
    export LIVE_DRILL_PUBLIC_BASE_URL
  fi
fi

FRONTEND_ENV=(
  "EXPO_PUBLIC_API_BASE_URL=$FRONTEND_API_BASE_URL"
)

if [[ "$FRONTEND_MODE" == "phone" ]]; then
  FRONTEND_ENV+=("REACT_NATIVE_PACKAGER_HOSTNAME=$PHONE_LAN_IP")
fi

COMPOSE=(
  docker compose
  --profile monitoring
  --env-file "$ENV_FILE"
  -f "$COMPOSE_FILE"
)

cleanup() {
  local exit_code=$?
  trap - EXIT INT TERM

  echo
  echo "Stopping Expo and Docker services..."
  "${COMPOSE[@]}" down >/dev/null 2>&1 || true
  echo "Stopped. PostgreSQL, Redis, and Prometheus data were preserved."
  exit "$exit_code"
}

trap cleanup EXIT INT TERM

if [[ ! -d "$MOBILE_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  (
    cd "$MOBILE_DIR"
    npm install
  )
fi

echo "Validating Docker configuration..."
"${COMPOSE[@]}" config --quiet

echo "Starting PostgreSQL, Redis, migrations, API, and Prometheus..."
"${COMPOSE[@]}" up -d --build

echo "Waiting for API readiness at $API_BASE_URL/health/ready ..."
api_ready=false
for _ in {1..90}; do
  if curl -fsS "$API_BASE_URL/health/ready" >/dev/null 2>&1; then
    api_ready=true
    break
  fi
  sleep 2
done

if [[ "$api_ready" != "true" ]]; then
  "${COMPOSE[@]}" logs --tail=150 api migrate postgres redis
  echo "The API did not become ready." >&2
  exit 1
fi

if [[ "$RUN_SMOKE_TEST" == "true" ]]; then
  echo "Running the production smoke test..."
  API_BASE_URL="$API_BASE_URL" python3 "$ROOT_DIR/scripts/production-smoke-test.py"
fi

echo
echo "Backend:    $API_BASE_URL"
if [[ "$FRONTEND_MODE" == "phone" ]]; then
  echo "Phone API:  $FRONTEND_API_BASE_URL"
  echo "Expo host:  $PHONE_LAN_IP"
  echo "Live URL:   ${LIVE_DRILL_PUBLIC_BASE_URL:-$FRONTEND_API_BASE_URL}"
fi
echo "Readiness:  $API_BASE_URL/health/ready"
echo "Metrics:    $API_BASE_URL/metrics"
echo "Prometheus: http://127.0.0.1:9090"
echo "Frontend:   Expo $FRONTEND_MODE mode on port $FRONTEND_PORT"
echo
echo "Press Ctrl+C to stop the app. Database and Redis data will be kept."
echo

cd "$MOBILE_DIR"
env "${FRONTEND_ENV[@]}" npm run "$FRONTEND_NPM_SCRIPT" -- "${FRONTEND_ARGS[@]}"
