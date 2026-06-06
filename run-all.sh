#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKEND_DIR="$ROOT_DIR/BackendAPI"
MOBILE_DIR="$ROOT_DIR/CyberSecurityApp"

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
  if [[ "${#PIDS[@]}" -gt 0 ]]; then
    echo
    echo "Stopping services..."
    for pid in "${PIDS[@]}"; do
      if kill -0 "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
      fi
    done
  fi
  exit "$code"
}

trap cleanup INT TERM EXIT

echo "Starting Backend API on http://127.0.0.1:8000 ..."
(
  cd "$BACKEND_DIR"
  "$BACKEND_PY" -m uvicorn main:app --host 127.0.0.1 --port 8000 --lifespan off
) &
PIDS+=("$!")

echo "Waiting for Backend API health check ..."
for _ in {1..30}; do
  if curl -fsS "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
    echo "Backend API is ready."
    break
  fi
  sleep 0.5
done

if ! curl -fsS "http://127.0.0.1:8000/health" >/dev/null 2>&1; then
  echo "Backend API did not become ready on http://127.0.0.1:8000." >&2
  exit 1
fi

echo "Starting Expo app ..."
(
  cd "$MOBILE_DIR"
  npm run start
) &
PIDS+=("$!")

echo "All services started. Press Ctrl+C to stop everything."
wait
