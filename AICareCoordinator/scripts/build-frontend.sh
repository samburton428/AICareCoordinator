#!/usr/bin/env bash
set -euo pipefail

echo "Building frontend..."

if [ -n "${VITE_API_URL:-}" ]; then
  echo "Using API URL: $VITE_API_URL"
fi

cd packages/frontend
VITE_API_URL="${VITE_API_URL:-}" npx vite build

echo "Frontend build complete."
