# Proximity Voice MVP Build Checklist

Use this checklist to execute the MVP end-to-end. Do not skip required gates.

## 1. Preflight Decisions (Required)

- [ ] Confirm deployment mode for MVP (`single_vps` recommended).
- [ ] Confirm authority mode (`radius_compute` required for MVP).
- [ ] Confirm domain names and TLS strategy.
- [ ] Lock constants: `R_enter=24m`, `R_exit=26m`, pose/recompute at 4 Hz, `maxSubscribedVoices=12`, reconnect grace `20s`.

## 2. Repo Bootstrap

- [ ] Create packages:
  - [ ] `packages/proximity-voice-client`
  - [ ] `packages/proximity-voice-control`
- [ ] Add workspace config.
- [ ] Add root scripts (`build`, `test`, `lint`, `dev`).
- [ ] Add root formatting and lint rules.
- [ ] Add CI workflow skeleton.

## 3. Shared Contracts

- [ ] Create shared TypeScript contracts for:
  - [ ] session request/response
  - [ ] audibility payloads
  - [ ] pose payloads
  - [ ] policy socket messages
- [ ] Add runtime schema validation (zod or equivalent).
- [ ] Add contract tests for invalid payload rejection.
- [ ] Freeze contract naming and field casing conventions.

## 4. Control Plane: Core Service

- [ ] Initialize HTTP service with structured logging.
- [ ] Implement `GET /health`.
- [ ] Implement `GET /ready`.
- [ ] Integrate configuration loader with strict env validation.
- [ ] Add request ID middleware and correlation IDs.
- [ ] Add centralized error handling with standard error model.

## 5. Control Plane: Auth and Sessions

- [ ] Implement external authority auth (shared secret or JWT).
- [ ] Implement `POST /sessions`.
- [ ] Integrate LiveKit token minting.
- [ ] Enforce token TTL and room/participant constraints.
- [ ] Add idempotent reconnect behavior.
- [ ] Add rate limits for session issuance.

## 6. Control Plane: Policy Ingestion

- [ ] Implement room-scoped monotonic revision checks.
- [ ] Implement required `POST /policy/poses` for `radius_compute`.
- [ ] Enforce pose ingestion target of 4 Hz.
- [ ] Enforce audibility at LiveKit subscription level (server-side, not client-only).
- [ ] Enforce max payload size and batch limits.
- [ ] Persist latest room snapshot state.

## 7. Control Plane: Policy Socket

- [ ] Implement `wss /policy-socket` endpoint.
- [ ] Implement socket auth handshake.
- [ ] Send `policy.snapshot` after successful auth.
- [ ] Send `policy.audibility.delta` updates on revisions.
- [ ] Implement `policy.snapshot.request` and stale/gap revision recovery (`snapshot` resync).
- [ ] Implement `policy.error` handling and close-code aware reconnect behavior.
- [ ] Add socket connection and backpressure safeguards.

## 8. Client Package: LiveKit Integration

- [ ] Implement `connect` and `disconnect`.
- [ ] Implement mic capture + publish lifecycle.
- [ ] Implement input device switching API.
- [ ] Implement push-to-talk state handling.
- [ ] Expose connection and error events.

## 9. Client Package: Subscription Manager

- [ ] Implement current audibility set state.
- [ ] Implement diff (`toSubscribe`, `toUnsubscribe`).
- [ ] Apply unsubscribe before subscribe.
- [ ] Enforce `maxSubscribedVoices` cap.
- [ ] Implement deterministic cap pruning behavior.
- [ ] Wire policy socket updates to audibility manager.

## 10. Client Package: Spatial Audio

- [ ] Build per-participant node chain:
  - [ ] source node
  - [ ] gain node
  - [ ] panner node
  - [ ] master voice gain
- [ ] Implement `setListenerPose`.
- [ ] Implement `upsertRemotePose`.
- [ ] Add smoothing/fade ramps to prevent pops.
- [ ] Validate panner defaults from MVP spec.

## 11. Data Path Validation

- [ ] Validate session create -> connect -> publish -> hear flow.
- [ ] Validate audibility changes apply without reconnect.
- [ ] Validate reconnect restores policy state.
- [ ] Validate non-audible audio is not forwarded even if a client attempts unauthorized subscriptions.
- [ ] Validate unsupported browser capability errors.

## 12. Deployment Assets

- [ ] Add non-Docker deployment assets for single VPS:
  - [ ] `deploy/proximity-voice-control.service`
  - [ ] `deploy/livekit.service`
  - [ ] `deploy/DEPLOY.md`
- [ ] Add `deploy/livekit.yaml`.
- [ ] Add `deploy/coturn.conf`.
- [ ] Add Nginx reverse proxy config.
- [ ] Add `.env.example` files for all services.

## 13. Security Hardening

- [ ] Enforce HTTPS/WSS only.
- [ ] Enforce CORS allowlist.
- [ ] Enforce request body limits.
- [ ] Enforce auth on all policy ingestion endpoints.
- [ ] Add per-route rate limiting.
- [ ] Add secret rotation procedure docs.

## 14. Test Coverage

### Unit
- [ ] Revision monotonicity behavior.
- [ ] Audibility diff behavior.
- [ ] Hysteresis behavior (if radius mode enabled).
- [ ] Deterministic pruning behavior.

### Integration
- [ ] Sessions endpoint + token issuance.
- [ ] Policy ingestion + room revisioning.
- [ ] Policy socket snapshot/delta flow.
- [ ] Snapshot resync flow after revision gap.

### End-to-End
- [ ] Multi-client room connect.
- [ ] Live audibility transitions.
- [ ] Reconnect recovery.
- [ ] Device/mic state transitions.
- [ ] Run acceptance scenario: 10 browser clients in one room, move in/out of radius, verify hear/not-hear transitions complete within 2 seconds.

## 15. Documentation Gate

- [ ] Keep `MVP.md` in docs and up to date.
- [ ] Write `API.md` with endpoint and socket examples.
- [ ] Write package README for `proximity-voice-client`.

## 16. Final Acceptance Checklist

- [ ] Host app can install npm client package and connect participants.
- [ ] Participants only hear allowed audibility set members.
- [ ] Audibility changes apply live.
- [ ] Spatial audio works for moving participants.
- [ ] Self-hosted deployment works on one VPS.
- [ ] Reconnect restores state automatically.

## 17. Fast Fail Conditions

If any condition below is true, stop and fix before progressing:
- [ ] API contracts changed without corresponding schema/doc updates.
- [ ] Revision monotonicity can be bypassed.
- [ ] Client can hear non-authorized participants.
- [ ] Control plane runs without auth on policy ingestion routes.
- [ ] Deployment requires manual undocumented steps.

---

Execution rule: a box is only checked when implementation and verification evidence both exist.
