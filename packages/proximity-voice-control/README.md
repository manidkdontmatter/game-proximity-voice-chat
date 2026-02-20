# @manidkdontmatter/proximity-voice-control

Control plane for proximity voice.

## Features
- `POST /sessions` for LiveKit + policy socket credentials.
- `POST /policy/poses` for radius-based proximity updates.
- `GET /policy-socket` for snapshot/delta policy fanout.
- Server-side LiveKit subscription enforcement.

## Env Profiles
- Linux production baseline: `.env.example`
- Windows local testing: `.env.windows-local.example`

## Local Smoke Tests
1. Start control plane (`npm run dev`).
2. In another shell run:
   - `npm run smoke`
   - `npm run e2e:policy`

## Browser Debug Harness (No Mic Needed)
- Route: `http://127.0.0.1:8080/debug`
- `speaker` role publishes a synthetic sine tone from WebAudio (no mic permission required).
- `listener` role receives audio based on policy audibility.
- Use `Post Near (10m)` / `Post Far (40m)` to validate hear/unhear transitions.
