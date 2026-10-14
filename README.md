# Slipway

Slipway is a small web app you clone onto a Raspberry Pi, build, and open from any other device on the same local network. It listens on port **8787** and on every network interface (`0.0.0.0`), so a phone or laptop on the same LAN can open it before you deploy the real app.

The page shows the Pi’s hostname, architecture, and the LAN address to use. A note left in the page is stored in the Node process. Restarting the app clears notes.

## 1. Install Node.js on the Pi

SSH into the Pi. Slipway needs Node.js 20 or newer.

```bash
node -v
```

If that fails, or the version is older than v20:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
```

## 2. Clone the repository

On the Pi:

```bash
git clone <repository-url> slipway
cd slipway
```

Use the clone URL from this repository. The folder name `slipway` is only local; you can pick another name.

## 3. Build it and put it on port 8787

From the repo root, this installs dependencies, builds the static app, and serves that build:

```bash
npm ci
npm run build
HOST=0.0.0.0 PORT=8787 npm start
```

`HOST=0.0.0.0` is what makes the port reachable from the rest of the network. `127.0.0.1` would keep it on the Pi only.

The same three steps are wrapped in one script:

```bash
bash scripts/pi-up.sh
```

Leave that SSH session open. When the server is up it prints:

```text
Slipway is listening on port 8787
  local    http://127.0.0.1:8787
  network  http://192.168.1.42:8787
```

`local` only works on the Pi. From a phone or laptop on the same network, open the `network` URL.

Stop it with Ctrl+C.

### Pick a different port

```bash
PORT=8790 bash scripts/pi-up.sh
```

Or, after a build already exists in `dist/`:

```bash
HOST=0.0.0.0 PORT=8790 npm start
```

### Check that the port is open

On the Pi:

```bash
curl -s http://127.0.0.1:8787/api/health
hostname -I
```

`hostname -I` prints the Pi’s LAN address. Open `http://<that-address>:8787` from another device. The page lists the same address.

A Pi 4 or Pi 5 on 64-bit Raspberry Pi OS is the expected machine. The same commands work on 32-bit Raspberry Pi OS when Node.js itself is a 32-bit build.

## 4. Keep it on the port after SSH closes

Build once, stop the foreground process with Ctrl+C, then install a systemd service. The service runs `node server/index.js` as your user, bound to `0.0.0.0` on port 8787, and restarts it if it exits.

```bash
bash scripts/install-service.sh
```

```bash
sudo systemctl status slipway
sudo systemctl restart slipway
journalctl -u slipway -f
```

To install the service on another port, set `PORT` before the install. The unit file records that port:

```bash
PORT=8790 bash scripts/install-service.sh
```

Rebuild after you pull new code, then restart the service:

```bash
git pull
npm ci
npm run build
sudo systemctl restart slipway
```

## Work on the app from another computer

```bash
npm install
npm run dev
```

The dev server is at [http://127.0.0.1:47321](http://127.0.0.1:47321) and includes the same `/api/health` and `/api/checks` routes.

```bash
npm test
npm run build
npm start
```

## If another device cannot open the page

- The phone and the Pi have to be on the same LAN. A guest network that isolates clients will block the page.
- Use the `network` address, not `127.0.0.1`. That address always means “this device.”
- Confirm the process was started with `HOST=0.0.0.0`. The page shows the bind address under **This machine**.
- Raspberry Pi OS does not enable a firewall by default. If you turned one on, allow the port: `sudo ufw allow 8787/tcp`.
