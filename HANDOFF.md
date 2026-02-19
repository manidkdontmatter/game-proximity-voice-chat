# Session Handoff: Proximity Voice MVP

Last updated: 2026-02-19

## 1) What this project is

Standalone proximity voice chat for a multiplayer browser game (target ~100 players), with:
- Browser client package
- Node.js control plane
- LiveKit as SFU (media transport)
- coturn for NAT fallback in production
- Nginx for production reverse proxy

## 2) Final product decisions (important)

- Authority mode: `radius_compute` only
- Policy ingest endpoint: `POST /policy/poses` only
- Server authority is first: no client audibility override feature
- No forced mute/deafen subsystem in this MVP
- No `/v1` API version prefix
- Coordinate system: right-handed, meters, `+X` right, `+Y` up, `+Z` forward
- Distance: Euclidean 3D
- Fixed constants:
  - pose ingest: 4 Hz
  - policy recompute: 4 Hz
  - `R_enter = 24m`
  - `R_exit = 26m`
  - `maxSubscribedVoices = 12`
  - reconnect grace: 20s
- Single VPS deployment target; Redis is not required for MVP
- O(n^2) audibility checks are acceptable for current target; spatial partitioning is optional post-profiling

## 3) Current implementation status

Implemented:
- Monorepo with 3 packages:
  - `packages/proximity-voice-contracts`
  - `packages/proximity-voice-control`
  - `packages/proximity-voice-client`
- Control plane endpoints:
  - `GET /health`
  - `GET /ready`
  - `POST /sessions`
  - `POST /policy/poses`
  - `GET /policy-socket` (WebSocket)
- Policy socket messages:
  - outbound: `policy.snapshot`, `policy.audibility.delta`, `policy.error`
  - inbound: `policy.snapshot.request`
- Server-side policy engine:
  - hysteresis radius logic
  - deterministic pruning to `maxSubscribedVoices`
  - room revisions
- LiveKit subscription enforcement adapter (server-side)
- Basic hardening:
  - request IDs (`x-request-id`)
  - centralized error handling
  - per-IP fixed-window rate limiting
  - socket input validation + close behavior
  - reconnect-grace cleanup of inactive participants
- Docs and deployment assets:
  - `README.md`
  - `API.md`
  - `deploy/DEPLOY.md`
  - `deploy/nginx.conf`
  - `deploy/livekit.yaml`
  - `deploy/coturn.conf`
  - `deploy/proximity-voice-control.service`
  - `deploy/livekit.service`

Validation done:
- `npm run build` passes
- `npm test` passes
- `npm run typecheck` passes

## 4) What is still not fully proven

- Real media path E2E in actual browser/game environment (hearing audio cut-in/out live)
- Client-side spatial audio is currently basic attenuation via track volume, not full panner-node graph polish

## 5) Local Windows development/testing profile

Local Windows testing does NOT require Nginx or coturn.

Use:
- `test-env/control.env` (recommended)
- `LOCAL-TEST-RUNBOOK.md` (recommended)

Expected local services:
- control plane on `127.0.0.1:8080`
- local LiveKit on `127.0.0.1:7880` (for real media tests)

Run:
1. `npm install`
2. `npm run build`
3. `npm run testenv:start`
4. `npm run testenv:check`
5. Browser media validation:
   - open two tabs at `http://127.0.0.1:8080/debug`
   - run near/far transition test

Notes:
- `npm run smoke` checks session + pose flow quickly
- `npm run e2e:policy` checks audibility transition events over policy socket

## 6) Linux production deployment profile

Production target uses:
- control plane (Node)
- LiveKit
- coturn
- Nginx
- systemd units

Canonical guide:
- `deploy/DEPLOY.md`

High-level steps:
1. Build app (`npm install && npm run build`)
2. Configure control plane `.env` from `.env.example`
3. Install LiveKit config from `deploy/livekit.yaml`
4. Install coturn config from `deploy/coturn.conf`
5. Install systemd units from `deploy/*.service`
6. Configure Nginx with `deploy/nginx.conf`
7. Verify `/health` and `/ready`

## 7) Scripts currently available

Root scripts:
- `npm run build`
- `npm run dev`
- `npm run test`
- `npm run typecheck`
- `npm run smoke`
- `npm run e2e:policy`
- `npm run testenv:start`
- `npm run testenv:check`
- `npm run testenv:livekit`
- `npm run testenv:control`

## 8) Next-session priorities

1. Run real local E2E with LiveKit running and verify actual hear/unhear behavior in browser tabs
2. Add/finish client spatial audio panner-node pipeline if needed
3. Execute acceptance scenario from MVP docs (10 clients, in/out radius transitions <= 2s)
4. Tighten integration tests around socket reconnect and stale-session behavior

## 9) Files to read first next session

1. `HANDOFF.md`
2. `README.md`
3. `API.md`
4. `LOCAL-TEST-RUNBOOK.md`
5. `MVP.md`
6. `MVP-CHECKLIST.md`
