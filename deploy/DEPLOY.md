# Single VPS Deployment (No Docker)

This guide is for Linux production deployment.

## Services
- `proximity-voice-control` (Node.js process)
- `livekit-server` (binary)
- `coturn`
- `nginx`

## 1. Build App
```bash
npm install
npm run build
```

## 2. Configure Control Plane
1. Copy `packages/proximity-voice-control/.env.example` to `packages/proximity-voice-control/.env`.
2. Set real secrets and public URLs.
3. Keep MVP defaults unless needed:
   - `RADIUS_ENTER_M=24`, `RADIUS_EXIT_M=26`, `RECOMPUTE_HZ=4`
   - `RECONNECT_GRACE_SEC=20`

## 3. Install LiveKit + Coturn
- Put `deploy/livekit.yaml` at `/etc/livekit/livekit.yaml`.
- Put `deploy/coturn.conf` at `/etc/turnserver.conf` (or distro equivalent).

## 4. Install systemd units
- `deploy/proximity-voice-control.service` -> `/etc/systemd/system/proximity-voice-control.service`
- `deploy/livekit.service` -> `/etc/systemd/system/livekit.service`

Then:
```bash
sudo systemctl daemon-reload
sudo systemctl enable --now proximity-voice-control
sudo systemctl enable --now livekit
```

## 5. Nginx
- Install `deploy/nginx.conf` as your site config.
- Ensure TLS certs are configured for production.

## 6. Verify
```bash
curl -s http://127.0.0.1:8080/health
curl -s http://127.0.0.1:8080/ready
```

## 7. Local Windows Reminder
For local Windows tests, use the `README.md` Windows section and skip `coturn` + `nginx`.
