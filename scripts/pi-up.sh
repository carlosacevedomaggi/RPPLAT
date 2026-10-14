#!/usr/bin/env bash
# Install dependencies, build the app, and serve it on the local network.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "${ROOT}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20 or newer is required. See README.md for the Raspberry Pi install."
  exit 1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [[ "${NODE_MAJOR}" -lt 20 ]]; then
  echo "Node.js $(node -v) is too old. Install Node.js 20 or newer."
  exit 1
fi

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

npm run build

export HOST="${HOST:-0.0.0.0}"
export PORT="${PORT:-8787}"

echo "Starting Slipway on ${HOST}:${PORT}"
exec node server/index.js
