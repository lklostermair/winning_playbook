#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
FRONTEND_DIR="$ROOT_DIR/frontend"
BACKEND_HOST="${BACKEND_HOST:-127.0.0.1}"
BACKEND_PORT="${BACKEND_PORT:-8000}"
FRONTEND_PORT="${FRONTEND_PORT:-5173}"

cleanup() {
  if [[ -n "${BACKEND_PID:-}" ]] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
  fi
  if [[ -n "${FRONTEND_PID:-}" ]] && kill -0 "$FRONTEND_PID" 2>/dev/null; then
    kill "$FRONTEND_PID" 2>/dev/null || true
  fi
}

trap cleanup EXIT INT TERM

if ! command -v uv >/dev/null 2>&1; then
  echo "uv is required but was not found in PATH." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required but was not found in PATH." >&2
  exit 1
fi

cd "$ROOT_DIR"

if [[ ! -d "$FRONTEND_DIR/node_modules" ]]; then
  echo "Installing frontend dependencies..."
  npm --prefix "$FRONTEND_DIR" install
fi

export VITE_API_BASE_URL="${VITE_API_BASE_URL:-http://$BACKEND_HOST:$BACKEND_PORT}"

echo "Starting backend at http://$BACKEND_HOST:$BACKEND_PORT"
uv run uvicorn app.main:app \
  --app-dir backend \
  --host "$BACKEND_HOST" \
  --port "$BACKEND_PORT" &
BACKEND_PID=$!

echo "Waiting for backend health..."
for _ in {1..40}; do
  if curl -fsS "http://$BACKEND_HOST:$BACKEND_PORT/health" >/dev/null 2>&1; then
    break
  fi
  sleep 0.25
done

if ! curl -fsS "http://$BACKEND_HOST:$BACKEND_PORT/health" >/dev/null 2>&1; then
  echo "Backend did not become healthy at http://$BACKEND_HOST:$BACKEND_PORT/health" >&2
  exit 1
fi

echo "Starting frontend at http://localhost:$FRONTEND_PORT"
npm --prefix "$FRONTEND_DIR" run dev -- --host 127.0.0.1 --port "$FRONTEND_PORT" &
FRONTEND_PID=$!

echo
echo "Backend:  http://$BACKEND_HOST:$BACKEND_PORT"
echo "Frontend: http://localhost:$FRONTEND_PORT"
echo "Press Ctrl+C to stop both."

wait "$BACKEND_PID" "$FRONTEND_PID"
