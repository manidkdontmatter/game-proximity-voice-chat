# Game Proximity Voice Chat

Single-VPS MVP proximity voice stack for a multiplayer browser game.

## Packages
- `packages/proximity-voice-contracts`: shared zod schemas + TS types.
- `packages/proximity-voice-control`: control plane API, policy socket, radius compute, LiveKit enforcement.
- `packages/proximity-voice-client`: browser runtime package using LiveKit.

## Quick Start
1. `npm install`
2. Copy `packages/proximity-voice-control/.env.example` to `.env` and set secrets/URLs.
3. `npm run build`
4. `npm run dev`

## Windows Local Testing (No Nginx/TURN Required)
This is for local development and policy validation on your home PC.

1. Copy `packages/proximity-voice-control/.env.windows-local.example` to `packages/proximity-voice-control/.env`.
2. Start control plane: `npm run dev`
3. In another shell, run:
   - `npm run smoke`
   - `npm run e2e:policy`

Notes:
- Local tests do not require `coturn` or `nginx`.
- For real media tests, run a local `livekit-server` binary on `127.0.0.1:7880`.

## Easiest Local Test Setup (Recommended)
All local test setup is centralized in `test-env/`.

1. Start everything (opens 2 terminals automatically):
   - `npm run testenv:start`
2. Validate control-plane checks:
   - `npm run testenv:check`
3. Open browser test page:
   - `http://127.0.0.1:8080/debug`

Manual options:
- `npm run testenv:livekit`
- `npm run testenv:control`

## No-Mic Browser Media Test (Tone Generator)
Use this to verify real hear/unhear behavior without a microphone.

1. Start LiveKit locally (`127.0.0.1:7880`) and start control plane (`npm run dev`).
2. Open two tabs at `http://127.0.0.1:8080/debug`.
3. Use the same `roomId` in both tabs.
4. Tab A:
   - `participantId`: `speaker-a`
   - `otherParticipantId`: `listener-b`
   - `role`: `speaker`
   - Click `Connect`
5. Tab B:
   - `participantId`: `listener-b`
   - `otherParticipantId`: `speaker-a`
   - `role`: `listener`
   - Click `Connect`
6. In either tab, click:
   - `Post Near (10m)` -> listener should hear a tone.
   - `Post Far (40m)` -> listener should stop hearing it.

## Linux Production Deployment
No Docker required. Use `deploy/DEPLOY.md` for a systemd + Nginx + LiveKit + coturn setup.

## Runtime Constants (MVP)
- Pose ingest: `4 Hz`
- Recompute: `4 Hz`
- `R_enter=24m`
- `R_exit=26m`
- `maxSubscribedVoices=12`
- Reconnect grace: `20s` (host app policy)

See `API.md` for endpoint/socket contracts.

Session memory/handoff for future work:
- `HANDOFF.md`
