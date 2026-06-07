#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/BackendAPI"
MOBILE_DIR="$ROOT_DIR/CyberSecurityApp"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
BACKEND_HEALTH_URL="http://127.0.0.1:${BACKEND_PORT}/health"

require_dir() {
  local path="$1"
  local label="$2"

  if [[ ! -d "$path" ]]; then
    echo "Missing directory for ${label}: $path" >&2
    exit 1
  fi
}

require_cmd() {
  local cmd="$1"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Missing required command: $cmd" >&2
    exit 1
  fi
}

require_dir "$BACKEND_DIR" "backend"
require_dir "$MOBILE_DIR" "mobile app"
require_cmd npm
require_cmd curl

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  echo "Backend virtual environment not found at $BACKEND_DIR/.venv" >&2
  echo "Create it first: cd BackendAPI && python3 -m venv .venv && source .venv/bin/activate && python3 -m pip install -r requirements.txt" >&2
  exit 1
fi

BACKEND_PY="$BACKEND_DIR/.venv/bin/python"
if [[ ! -x "$BACKEND_PY" ]]; then
  echo "Cannot execute backend Python interpreter: $BACKEND_PY" >&2
  exit 1
fi

BACKEND_ALEMBIC="$BACKEND_DIR/.venv/bin/alembic"
if [[ ! -x "$BACKEND_ALEMBIC" ]]; then
  echo "Alembic executable not found at $BACKEND_ALEMBIC" >&2
  echo "Install backend dependencies first: cd BackendAPI && source .venv/bin/activate && python3 -m pip install -r requirements.txt" >&2
  exit 1
fi

if [[ ! -f "$BACKEND_DIR/.env" ]]; then
  echo "Backend .env not found at $BACKEND_DIR/.env" >&2
  echo "Create it from BackendAPI/.env.example and set DATABASE_URL plus Firebase settings." >&2
  exit 1
fi

if [[ ! -f "$MOBILE_DIR/.env.local" ]]; then
  echo "Frontend .env.local not found at $MOBILE_DIR/.env.local" >&2
  echo "Create it from CyberSecurityApp/.env.example and set EXPO_PUBLIC_FIREBASE_API_KEY." >&2
  exit 1
fi

if [[ ! -d "$MOBILE_DIR/node_modules" ]]; then
  echo "Frontend dependencies are missing. Run: cd CyberSecurityApp && npm install" >&2
  exit 1
fi

PIDS=()

cleanup() {
  local code=$?
  trap - EXIT INT TERM

  if [[ "${#PIDS[@]}" -gt 0 ]]; then
    echo
    echo "Stopping services..."
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
      fi
    done
    for pid in "${PIDS[@]}"; do
      wait "$pid" >/dev/null 2>&1 || true
    done
  fi

  exit "$code"
}

trap cleanup INT TERM EXIT

echo "Applying backend database migrations ..."
(
  cd "$BACKEND_DIR"
  "$BACKEND_ALEMBIC" upgrade head
)

if curl -fsS "$BACKEND_HEALTH_URL" >/dev/null 2>&1; then
  echo "Backend API is already running at $BACKEND_HEALTH_URL." >&2
  echo "Stop the existing process before running this script." >&2
  exit 1
fi

echo "Starting Backend API on ${BACKEND_HOST}:${BACKEND_PORT} ..."
(
  cd "$BACKEND_DIR"
  "$BACKEND_PY" -m uvicorn main:app --host "$BACKEND_HOST" --port "$BACKEND_PORT"
) &
BACKEND_PID="$!"
PIDS+=("$BACKEND_PID")

echo "Waiting for Backend API health check ..."
for _ in {1..30}; do
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    wait "$BACKEND_PID" || true
    echo "Backend API exited before becoming ready." >&2
    exit 1
  fi

  if curl -fsS "$BACKEND_HEALTH_URL" >/dev/null 2>&1; then
    echo "Backend API is ready."
    break
  fi
  sleep 0.5
done

if ! curl -fsS "$BACKEND_HEALTH_URL" >/dev/null 2>&1; then
  echo "Backend API did not become ready at $BACKEND_HEALTH_URL." >&2
  exit 1
fi

echo "Starting Expo app ..."
(
  cd "$MOBILE_DIR"
  npm run start
) &
MOBILE_PID="$!"
PIDS+=("$MOBILE_PID")

echo "All services started. Press Ctrl+C to stop everything."
while true; do
  if ! kill -0 "$BACKEND_PID" >/dev/null 2>&1; then
    wait "$BACKEND_PID" || backend_code=$?
    echo "Backend API stopped unexpectedly." >&2
    exit "${backend_code:-1}"
  fi

  if ! kill -0 "$MOBILE_PID" >/dev/null 2>&1; then
    wait "$MOBILE_PID" || mobile_code=$?
    echo "Expo app stopped." >&2
    exit "${mobile_code:-1}"
  fi

  sleep 1
done
