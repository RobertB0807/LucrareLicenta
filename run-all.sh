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

if [[ ! -d "$BACKEND_DIR/.venv" ]]; then
  echo "Backend virtual environment not found at $BACKEND_DIR/.venv" >&2
  echo "Create it first: cd BackendAPI && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt" >&2
  exit 1
fi

BACKEND_PY="$BACKEND_DIR/.venv/bin/python"
if [[ ! -x "$BACKEND_PY" ]]; then
  echo "Cannot execute backend Python interpreter: $BACKEND_PY" >&2
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

echo "Starting Backend API on http://0.0.0.0:8000 ..."
(
  cd "$BACKEND_DIR"
  "$BACKEND_PY" -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
) &
PIDS+=("$!")

echo "Starting Expo app ..."
(
  cd "$MOBILE_DIR"
  npm run start
) &
PIDS+=("$!")

echo "All services started. Press Ctrl+C to stop everything."
wait
