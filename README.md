# Game Proximity Voice Chat

Standalone proximity voice stack for a multiplayer browser game.

This repo contains:
- A browser client package.
- A Node control plane.
- Contracts shared across both.
- Local test tooling.
- Production deployment configs.

## What This Project Is
- Voice transport is handled by LiveKit (SFU).
- Proximity policy is computed in the control plane (`radius_compute`).
- The control plane authoritatively decides who can hear who.
- The client follows policy updates and applies local subscription/spatial behavior.

High-level flow:
1. Host app creates session via `POST /sessions`.
2. Browser connects to LiveKit using returned token.
3. Browser also connects to `policy-socket`.
4. External authority posts poses via `POST /policy/poses`.
5. Control plane recomputes audibility and pushes deltas/snapshots.
6. LiveKit subscriptions are enforced server-side.

## Repo Layout
- `packages/proximity-voice-contracts`: shared zod schemas + TS types.
- `packages/proximity-voice-control`: API + policy socket + policy compute + LiveKit enforcement.
- `packages/proximity-voice-client`: browser runtime package.
- `scripts`: smoke and policy e2e scripts.
- `test-env`: local test environment (recommended daily path).
- `deploy`: production config files (systemd, Nginx, LiveKit, coturn).

## TL;DR: Daily Local Use
If you forget everything, run this:

1. `npm install`
2. `npm run testenv:start`
3. `npm run testenv:check`
4. Open two tabs at `http://127.0.0.1:8080/debug`

Detailed steps and troubleshooting are in `LOCAL-TEST-RUNBOOK.md`.

## Command Reference
- `npm run build`: build all packages.
- `npm run test`: run workspace tests.
- `npm run typecheck`: typecheck all packages.
- `npm run smoke`: quick control-plane sanity check.
- `npm run e2e:policy`: policy socket transition test.
- `npm run testenv:start`: start LiveKit + control plane using local test env.
- `npm run testenv:check`: run smoke + policy e2e with local test env vars loaded.
- `npm run testenv:livekit`: start only local LiveKit (`--dev`).
- `npm run testenv:control`: start only control plane with test env vars loaded.

## Local Test Environment (Recommended)
Everything local-test-specific is centralized:
- Config: `test-env/control.env`
- Start scripts: `test-env/start-*.ps1`
- Runbook: `LOCAL-TEST-RUNBOOK.md`

Local defaults:
- Control plane: `http://127.0.0.1:8080`
- LiveKit signaling: `ws://127.0.0.1:7880`
- Control auth token: `change-me`

## No-Mic Browser Media Test
Use `http://127.0.0.1:8080/debug` in two tabs.

Example setup:
- Tab A: `roomId=room1`, `participantId=speaker-a`, `otherParticipantId=listener-b`, role `speaker`
- Tab B: `roomId=room1`, `participantId=listener-b`, `otherParticipantId=speaker-a`, role `listener`

Expected:
- Click `Post Near (10m)` => listener hears tone.
- Click `Post Far (40m)` => listener stops hearing tone.

## Runtime Constants (MVP)
- Pose ingest: `4 Hz`
- Recompute: `4 Hz`
- `R_enter=24m`
- `R_exit=26m`
- `maxSubscribedVoices=12`
- Reconnect grace: `20s`

## Production
Use `deploy/DEPLOY.md` for Linux single-VPS deployment with systemd + Nginx + LiveKit + coturn.

## GitHub Packages
This repo is configured to publish reusable packages to GitHub Packages (not npmjs):
- `@manidkdontmatter/proximity-voice-contracts`
- `@manidkdontmatter/proximity-voice-client`

How to publish:
1. Bump versions in package manifests.
2. Push to GitHub.
3. Run the `publish-github-packages` workflow from Actions.

How to install from another project:
1. Add to that project's `.npmrc`:
   - `@manidkdontmatter:registry=https://npm.pkg.github.com`
2. Set `NODE_AUTH_TOKEN` to a GitHub token with package read access.
3. Install packages with npm.

## Core Docs
- `LOCAL-TEST-RUNBOOK.md`: quickest path to local testing, startup, shutdown, troubleshooting.
- `API.md`: endpoint and websocket contracts.
- `HANDOFF.md`: current status and implementation notes.
- `MVP.md`: full product spec and constraints.
- `MVP-CHECKLIST.md`: implementation checklist.
