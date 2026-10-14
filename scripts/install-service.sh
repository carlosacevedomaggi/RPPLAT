#!/usr/bin/env bash
# Install a systemd service so Slipway keeps serving after you close SSH.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE="$(command -v node || true)"
PORT="${PORT:-8787}"
RUN_USER="${SUDO_USER:-$(id -un)}"
UNIT="/etc/systemd/system/slipway.service"

if [[ -z "${NODE}" ]]; then
  echo "Node.js was not found on PATH."
  exit 1
fi

if [[ ! -f "${ROOT}/dist/index.html" ]]; then
  echo "Build first: npm run build"
  exit 1
fi

sudo tee "${UNIT}" >/dev/null <<EOF
[Unit]
Description=Slipway LAN preview
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=${RUN_USER}
WorkingDirectory=${ROOT}
Environment=HOST=0.0.0.0
Environment=PORT=${PORT}
ExecStart=${NODE} ${ROOT}/server/index.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable --now slipway.service
sudo systemctl --no-pager --full status slipway.service
echo
echo "Slipway is installed as a service on port ${PORT}."
echo "Status:  sudo systemctl status slipway"
echo "Restart: sudo systemctl restart slipway"
echo "Logs:    journalctl -u slipway -f"
