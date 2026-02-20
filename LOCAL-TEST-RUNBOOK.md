# Local Test Runbook

Use this file when you want to run the project quickly and reliably without remembering details.

## Purpose
This runbook is for local Windows testing of:
- Control plane behavior.
- Policy socket behavior.
- Real media hear/unhear behavior in browser tabs.

It does not require Nginx or coturn.

## One-Time Setup
1. Install Node.js and npm.
2. In repo root, run:
   - `npm install`
3. Ensure LiveKit binary exists at:
   - `tools/livekit/livekit-server.exe`

Notes:
- `tools/livekit/` is ignored by git on purpose.
- Local test env values are in `test-env/control.env`.

## Start Environment
Preferred:
1. `npm run testenv:start`

This starts:
- LiveKit in dev mode (`--dev`) on `127.0.0.1:7880`.
- Control plane on `127.0.0.1:8080` with env from `test-env/control.env`.

## Verify Environment
Run:
1. `npm run testenv:check`

Expected:
- `smoke` passes.
- `e2e:policy` passes.

## Browser Media Test (No Microphone)
1. Open two tabs:
   - `http://127.0.0.1:8080/debug`
2. Tab A:
   - `roomId`: `room1`
   - `participantId`: `speaker-a`
   - `otherParticipantId`: `listener-b`
   - `role`: `speaker`
   - `Control Auth Token`: `change-me`
   - Click `Connect`
3. Tab B:
   - `roomId`: `room1`
   - `participantId`: `listener-b`
   - `otherParticipantId`: `speaker-a`
   - `role`: `listener`
   - `Control Auth Token`: `change-me`
   - Click `Connect`
4. Click `Post Near (10m)` then `Post Far (40m)`.

Expected:
- Near: listener hears synthetic tone.
- Far: listener audio stops.

## Common Problems
1. `connect failed: failed to fetch`
- Usually control plane is down.
- Check `http://127.0.0.1:8080/health`.

2. `401 unauthorized` from `/sessions` or `/policy/poses`
- Wrong token in debug UI.
- Must match `CONTROL_AUTH_TOKEN` in `test-env/control.env`.

3. Listener never hears anything
- Ensure both tabs use same `roomId`.
- Ensure `otherParticipantId` points to the other tab participant.
- Ensure `Post Near (10m)` was clicked after both connected.

4. Random failures after many restarts
- Duplicate/stale processes can happen.
- Stop everything and start clean again:
  - Close test terminals.
  - `npm run testenv:start`

## Stop Environment
There is no single stop script yet.

Safe manual stop:
1. Close terminals opened by `testenv:start`.
2. Or stop by process in Task Manager:
   - `livekit-server.exe`
   - Node process running `@manidkdontmatter/proximity-voice-control dev`

## Files Worth Remembering
- `README.md`
- `LOCAL-TEST-RUNBOOK.md`
- `API.md`
- `HANDOFF.md`
- `test-env/control.env`
