# RayMonitor Uptime

RayMonitor Uptime is a lightweight uptime-robot style web app. You can monitor:

- an IP/host with ICMP ping checks, or
- a specific TCP port on a host/IP.

The app marks a monitor as offline only after a configurable sustained failure window (for example: "offline after 60s"), then sends alerts.

## Features

- Dark minimal dashboard for monitor creation and status tracking.
- Monitor types:
  - `icmp` (machine reachability)
  - `port` (TCP port connect)
- Per-monitor settings:
  - check interval
  - timeout
  - offline threshold
- Live updates through server-sent events (no manual refresh needed).
- Notifications:
  - in-app event feed
  - browser notifications (when dashboard tab is open)
  - optional webhook notifications for offline/recovered events
- Persistent monitor definitions on disk (`.raymonitor/state.json`).

## Requirements

- Linux host with Node.js 18+.
- `ping` binary available in PATH (standard on Ubuntu/Lightsail images).

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:4173`.

### Optional environment variables

- `PORT` (default `4173`)
- `HOST` (default `0.0.0.0`)
- `ALERT_WEBHOOK_URL` (optional, used for offline/recovered webhook notifications)

## Lightsail deployment notes

1. Open inbound traffic for your app port (for example, 4173) in Lightsail networking.
2. Keep the process running with `systemd`, `pm2`, or Docker.
3. If your instance is behind a reverse proxy (Nginx/Caddy), proxy to the Node process and keep SSE enabled.
4. If monitoring your home network, ensure your router/firewall allows inbound traffic to the target service/port and forwards traffic correctly.

## Build

```bash
npm run build
```

This copies the runtime files into `dist/` for packaging.

## API overview

- `GET /api/state` - full dashboard state
- `POST /api/monitors` - create monitor
- `DELETE /api/monitors/:id` - delete monitor
- `POST /api/settings/webhook` - save/update webhook URL
- `GET /api/stream` - live SSE updates
- `GET /healthz` - health endpoint
