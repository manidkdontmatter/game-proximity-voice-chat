# Proximity Voice Chat MVP Specification

## 1. Purpose

Build a standalone, production-oriented proximity voice system for browser clients, for multiplayer browser games.

The system must:
- Be self-hosted.
- Accept externally provided identity and spatial policy inputs.
- Provide low-latency, room-based proximity voice with 3D spatial audio.
- Expose a browser client package that can be installed as a library for separate browser apps to install and use.

## 2. Core Constraints

- Runtime stack: browser client + Node.js server components.
- Media transport: WebRTC via LiveKit SFU.
- NAT fallback: coturn.
- Architecture split:
  - Media plane: LiveKit (audio transport).
  - Control plane: custom service (tokens, policy ingestion, policy distribution).
  - Client runtime: reusable proximity voice npm package.
- Must run as separate services/processes, but may be co-located on one VPS initially, but probably actually will remain on one VPS for convenience.

## 3. Non-Goals (MVP)

- No custom media transport implementation.
- No custom codec implementation.
- No text chat or video.
- No moderation tooling (reporting, review queues, enforcement workflows).
- No mobile-specific optimization work, this is for desktop browser games.

### 3.1 First Playable Non-Goals

- No persistence of room/audibility state across control-plane restarts.
- No admin or moderation UI.
- No performance optimization work beyond supporting the current 100-player game target.

## 4. High-Level Architecture

```text
External Authority (positions)
            |
            | HTTPS/WebSocket (signed)
            v
   Proximity Voice Control Plane
      - session auth/token minting
      - participant registry
      - policy revisioning + fanout
            |
            | LiveKit Server API
            v
        LiveKit SFU
      (WebRTC signaling/media)
            |
            | WebRTC
            v
Browser Proximity Voice Client
      - mic capture/publish
      - remote track subscribe/unsubscribe
      - 3D panning + attenuation

coturn runs alongside LiveKit for ICE relay fallback.
```

## 5. Components and Responsibilities

### 5.1 `proximity-voice-client` (browser package)

Responsibilities:
- Connect/disconnect to room using token + LiveKit URL.
- Publish local mic track.
- Subscribe only to allowed remote participants (those in the same room and within proximity).
- Apply 3D spatial audio for subscribed participants.
- Handle push-to-talk.
- Expose events and diagnostics to host app.

Not responsible for:
- Authoritative proximity decisions (the position of audio sources is provided from outside the process, by whatever game server passes that information in).
- User identity trust decisions.
- Session entitlement validation.

### 5.2 `proximity-voice-control` (server control plane)

Responsibilities:
- Validate external session requests.
- Mint short-lived LiveKit access tokens.
- Maintain participant registry by room.
- Accept external pose feeds.
- Distribute policy updates to connected clients.
- Enforce audibility server-side by applying subscription policy at the LiveKit layer so non-audible audio is not forwarded.

Not responsible for:
- Raw media transport.
- Mixing audio.

### 5.3 LiveKit (SFU)

Responsibilities:
- WebRTC signaling and transport.
- Forward published tracks to subscribed participants.
- Handle congestion behavior and subscriber management.

### 5.4 coturn

Responsibilities:
- STUN/TURN for connectivity fallback when direct paths fail.

## 6. External Integration Model

The voice system is application-agnostic. It consumes external inputs via a strict contract.

### 6.1 Required external inputs

- Identity/session create request:
  - `participantId`
  - `roomId`
  - `displayName` (optional)
  - `metadata` (optional)
- Pose stream:
  - `position` and `orientation` for radius-based proximity compute and spatialization

Presence source of truth:
- Derived by control plane from `/sessions` lifecycle and LiveKit participant connect/disconnect events.

### 6.2 Authority mode (MVP)

MVP authority mode is `radius_compute` only.

- External authority sends poses only.
- Control plane computes audibility via configured radius + hysteresis.

### 6.3 Fixed Gameplay Constants (MVP)

- Pose ingest rate: 4 Hz (`POST /policy/poses` batches every 250ms).
- Audibility recompute rate: 4 Hz.
- Proximity enter radius (`R_enter`): 24m.
- Proximity exit radius (`R_exit`): 26m.
- `maxSubscribedVoices`: 12.
- Reconnect grace window: 20 seconds.

## 7. Data Models

All timestamps are Unix epoch milliseconds.

```ts
export type VoiceRoomId = string;
export type VoiceParticipantId = string;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface Orientation {
  forward: Vec3;
  up: Vec3;
}

export interface Pose {
  position: Vec3;
  orientation?: Orientation;
  timestampMs: number;
}

export interface VoiceSessionRequest {
  participantId: VoiceParticipantId;
  roomId: VoiceRoomId;
  displayName?: string;
  metadata?: Record<string, string>;
}

export interface VoiceSessionResponse {
  roomId: VoiceRoomId;
  participantId: VoiceParticipantId;
  livekitUrl: string;
  token: string;
  tokenExpiresAtMs: number;
  policySocketUrl: string;
  policySocketToken: string;
  policyRevision: number;
}

export interface AudibilitySet {
  roomId: VoiceRoomId;
  participantId: VoiceParticipantId;
  canHear: VoiceParticipantId[];
  revision: number;
  timestampMs: number;
}
```

Coordinate convention (MVP):
- Right-handed, meter units.
- `+X` right, `+Y` up, `+Z` forward.
- `orientation.forward` and `orientation.up` should be normalized and approximately orthogonal.
- Host engines using different conventions must convert before sending poses.

## 8. Control Plane API

### 8.1 Auth model

- External authority -> control plane:
  - Use server-to-server signed bearer token (shared secret or JWT keypair).
- Browser client -> control plane:
  - Use short-lived policy socket token issued by `/sessions`.

### 8.2 Endpoints

#### `POST /sessions`

Purpose:
- Create or refresh voice session credentials.

Request body:
```json
{
  "participantId": "p_123",
  "roomId": "room_alpha",
  "displayName": "Player 123",
  "metadata": {
    "role": "default"
  }
}
```

Response body:
```json
{
  "roomId": "room_alpha",
  "participantId": "p_123",
  "livekitUrl": "wss://voice.example.com",
  "token": "<livekit-jwt>",
  "tokenExpiresAtMs": 1760000000000,
  "policySocketUrl": "wss://voice.example.com/policy-socket",
  "policySocketToken": "<short-lived-token>",
  "policyRevision": 42
}
```

Behavior:
- Idempotent by `participantId + roomId` for a short window (for reconnects).
- Token TTL target: 5 to 15 minutes.

#### `POST /policy/poses` (required for `radius_compute`)

Purpose:
- Feed per-participant poses for radius compute mode and spatial audio.

Request body:
```json
{
  "roomId": "room_alpha",
  "timestampMs": 1760000000999,
  "poses": [
    {
      "participantId": "p_123",
      "position": { "x": 10.1, "y": 1.8, "z": -2.2 },
      "orientation": {
        "forward": { "x": 0, "y": 0, "z": 1 },
        "up": { "x": 0, "y": 1, "z": 0 }
      }
    }
  ]
}
```

Behavior:
- Accept batched updates at 4 Hz (every 250ms).
- Drop updates older than configured staleness threshold.

#### `GET /health`
- Liveness check.

#### `GET /ready`
- Readiness check (LiveKit API reachable, storage/registry healthy).

## 9. Policy Socket Protocol

Transport: WebSocket (`/policy-socket`)

All client and server messages must include:
- `type`

Client sends on connect:
```json
{
  "type": "auth",
  "token": "<policySocketToken>"
}
```

Server message types:

1. `policy.snapshot`
```json
{
  "type": "policy.snapshot",
  "roomId": "room_alpha",
  "participantId": "p_123",
  "revision": 44,
  "canHear": ["p_101", "p_205"]
}
```

2. `policy.audibility.delta`
```json
{
  "type": "policy.audibility.delta",
  "roomId": "room_alpha",
  "revision": 45,
  "canHear": ["p_205", "p_333"]
}
```

3. `policy.pose.batch` (optional)
```json
{
  "type": "policy.pose.batch",
  "roomId": "room_alpha",
  "timestampMs": 1760000002000,
  "poses": [
    {
      "participantId": "p_205",
      "position": { "x": 5, "y": 2, "z": 3 },
      "orientation": {
        "forward": { "x": 1, "y": 0, "z": 0 },
        "up": { "x": 0, "y": 1, "z": 0 }
      }
    }
  ]
}
```

4. `policy.snapshot.request` (client -> server, for gap/stale recovery)
```json
{
  "type": "policy.snapshot.request",
  "roomId": "room_alpha",
  "lastAppliedRevision": 47,
  "reason": "revision_gap"
}
```

5. `policy.error` (server -> client)
```json
{
  "type": "policy.error",
  "code": "UNAUTHORIZED",
  "message": "Policy socket token is invalid or expired"
}
```

Client rules:
- Ignore stale revisions.
- Apply only monotonic room revision.
- If gap detected (e.g. received revision 50 while local is 47), send `policy.snapshot.request` and wait for `policy.snapshot` before applying newer deltas.
- On `policy.error`, emit client error event and reconnect only if error is retryable.

Socket close behavior:
- `1008`: policy/auth violation (do not auto-retry until credentials are refreshed).
- `1011`: transient server failure (retry with backoff).
- Client reconnect backoff: exponential, `250ms` to `5000ms` jittered.

## 10. Client Package API (MVP)

```ts
export interface ProximityVoiceClientConfig {
  livekitUrl: string;
  token: string;
  participantId: string;
  roomId: string;
  policySocketUrl: string;
  policySocketToken: string;
  audioContext?: AudioContext;
  maxSubscribedVoices?: number; // default 12
  panner?: {
    distanceModel?: 'inverse' | 'linear' | 'exponential';
    refDistance?: number; // default 1
    maxDistance?: number; // default 75
    rolloffFactor?: number; // default 1
    coneInnerAngle?: number; // default 360
    coneOuterAngle?: number; // default 360
    coneOuterGain?: number; // default 1
  };
}

export interface ListenerPose {
  position: Vec3;
  orientation: Orientation;
}

export interface RemotePose {
  participantId: string;
  position: Vec3;
  orientation?: Orientation;
  timestampMs?: number;
}

export interface MicState {
  enabled: boolean;
  pushToTalk: boolean;
  pushToTalkActive: boolean;
}

export interface ProximityVoiceClient {
  connect(config: ProximityVoiceClientConfig): Promise<void>;
  disconnect(): Promise<void>;

  setListenerPose(pose: ListenerPose): void;
  upsertRemotePose(pose: RemotePose): void;
  removeRemoteParticipant(participantId: string): void;

  setMicState(next: Partial<MicState>): Promise<void>;
  setInputDevice(deviceId: string): Promise<void>;
  setOutputDevice?(deviceId: string): Promise<void>; // browser support dependent

  getDiagnostics(): VoiceDiagnostics;

  on(event: 'connected', cb: () => void): void;
  on(event: 'disconnected', cb: (reason?: string) => void): void;
  on(event: 'participant-speaking', cb: (participantId: string, speaking: boolean) => void): void;
  on(event: 'error', cb: (error: Error) => void): void;
}

export interface VoiceDiagnostics {
  roomId: string;
  participantId: string;
  connected: boolean;
  publishedTrack: boolean;
  subscribedCount: number;
  audibleCount: number;
  turnLikelyInUse: boolean | null;
  lastPolicyRevision: number;
  policySocketConnected: boolean;
}
```

## 11. Client Audio Pipeline

For each remote participant:

```text
MediaStreamTrack
 -> MediaStreamAudioSourceNode
 -> GainNode (smoothing/level control)
 -> PannerNode (3D attenuation/pan)
 -> Master Voice Gain
 -> AudioDestinationNode
```

Rules:
- Keep one node chain per active remote participant.
- On unsubscribe, fade gain down over 40 to 80 ms before node teardown.
- Avoid pops by ramping gain (`linearRampToValueAtTime`).
- Listener pose updates should drive `AudioListener` orientation and position.

Defaults:
- Distance model: `inverse`
- `refDistance`: 1
- `rolloffFactor`: 1
- `maxDistance`: 75

## 12. Subscription and Proximity Strategy

### 12.1 Source of truth

- Control plane-computed audibility set is authoritative input.
- Control plane enforcement at LiveKit is authoritative for what audio can actually be forwarded.
- Client never expands audibility beyond policy.

### 12.2 Diff algorithm

On each audibility update:
- `toSubscribe = nextSet - currentSet`
- `toUnsubscribe = currentSet - nextSet`
- Apply unsubscribe first, then subscribe.

### 12.3 Caps

- `maxSubscribedVoices` default: 12.
- If policy set exceeds cap:
  - Keep nearest participants by latest known pose.
  - If no pose data, stable-sort by participant ID for deterministic behavior.

### 12.4 Hysteresis guidance

If using `radius_compute` mode:
- Distance metric is Euclidean 3D distance: `d = sqrt((dx*dx) + (dy*dy) + (dz*dz))`.
- Enter radius: `R_enter = 24m`
- Exit radius: `R_exit = 26m`
- Recompute at 4 Hz.

## 13. Control Plane Internal Behavior

### 13.1 Session lifecycle

- Register participant on `/sessions` issue.
- Track room membership.
- Expire idle sessions after TTL.
- Support reconnect grace window of 20 seconds.

### 13.2 Revisioning

- Room-scoped monotonic `revision` counter.
- Each audibility change increments revision.
- Persist latest snapshot for fast rejoin recovery.

### 13.3 Storage

MVP default:
- In-memory room state in the control plane process.

Post-MVP optional:
- Redis-backed state for process restarts or multi-instance fanout.

## 14. Security Requirements

- HTTPS/WSS required everywhere.
- Policy ingestion endpoints require server auth.
- Reject oversized payloads and enforce schema validation.
- Token TTL short (5 to 15 min).
- Rotate signing secrets.
- CORS allowlist for trusted origins.
- Rate limit:
  - `/sessions`
  - policy ingestion endpoints
  - policy socket auth attempts

## 15. Deployment Topology (Single VPS Starter)

Services:
- `reverse-proxy` (Nginx)
- `proximity-voice-control`
- `livekit`
- `coturn`

Recommended port exposure pattern:
- 443 TCP: HTTPS/WSS (reverse proxy)
- 3478 UDP/TCP: TURN/STUN
- 5349 TCP: TURN over TLS (optional but recommended)
- `LIVEKIT_RTC_PORT_RANGE_START` to `LIVEKIT_RTC_PORT_RANGE_END` UDP: LiveKit RTC media ports (publicly reachable).

Notes:
- LiveKit and control plane can be behind reverse proxy and not directly exposed except required ports.
- coturn requires public UDP reachability for best reliability.
- Nginx does not proxy WebRTC UDP media; expose LiveKit RTC UDP ports on the host/firewall directly.

## 16. Environment Variables

### 16.1 `proximity-voice-control`

- `NODE_ENV`
- `PORT`
- `PUBLIC_BASE_URL`
- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `POLICY_SOCKET_JWT_SECRET`
- `EXTERNAL_AUTH_MODE` (`shared_secret` | `jwt`)
- `EXTERNAL_SHARED_SECRET` (if shared secret mode)
- `SESSION_TOKEN_TTL_SECONDS`
- `POLICY_SOCKET_TOKEN_TTL_SECONDS`
- `MAX_ROOM_SIZE`
- `MAX_POLICY_BATCH_SIZE`

### 16.2 LiveKit

- `LIVEKIT_KEYS`
- `LIVEKIT_PORT`
- `LIVEKIT_RTC_PORT_RANGE_START`
- `LIVEKIT_RTC_PORT_RANGE_END`
- TURN integration settings as required by deployment mode.

### 16.3 coturn

- `TURN_REALM`
- `TURN_STATIC_AUTH_SECRET`
- `TURN_LISTEN_PORT`
- `TURN_TLS_LISTEN_PORT`
- `TURN_EXTERNAL_IP`

## 17. Repo and Package Layout

```text
voice-platform/
  packages/
    proximity-voice-client/
      src/
      package.json
      tsconfig.json
      README.md
    proximity-voice-control/
      src/
        api/
        sockets/
        policy/
        livekit/
        auth/
        models/
      package.json
      tsconfig.json
      README.md
  deploy/
    DEPLOY.md
    proximity-voice-control.service
    livekit.service
    livekit.yaml
    coturn.conf
    nginx.conf
  docs/
    MVP.md
    API.md
    README.md
  package.json
```

## 18. API Error Model

Standard error response:

```json
{
  "error": {
    "code": "STALE_REVISION",
    "message": "Policy revision must be greater than current revision",
    "details": {
      "currentRevision": 44,
      "receivedRevision": 43
    }
  }
}
```

Required error codes:
- `UNAUTHORIZED`
- `FORBIDDEN`
- `INVALID_PAYLOAD`
- `ROOM_NOT_FOUND`
- `PARTICIPANT_NOT_FOUND`
- `STALE_REVISION`
- `RATE_LIMITED`
- `INTERNAL_ERROR`

## 19. Logging and Observability (Minimal MVP)

### 19.1 Structured logs

Every log line should include:
- `timestamp`
- `level`
- `service`
- `roomId` (when available)
- `participantId` (when available)
- `requestId` or `connectionId`
- `message`

### 19.2 Optional post-MVP metrics

- Add metrics/dashboards/alerts only after gameplay validation if needed.

## 20. Testing Strategy

### 20.1 Unit tests

- Audibility diff correctness.
- Revision monotonic handling.
- Hysteresis enter/exit logic.
- Deterministic cap pruning behavior.

### 20.2 Integration tests

- Session issuance and reconnect.
- Policy socket auth + snapshot + delta stream.
- Subscription updates on audibility changes.
- Snapshot recovery on revision gap (`policy.snapshot.request`).

### 20.3 End-to-end tests

- Two to ten browser clients in one room.
- Dynamic movement updates and audible transitions.
- Recovery from temporary network interruption.
- Acceptance scenario: 10 browser clients in one room, move participants in/out of `R_enter`/`R_exit`, and verify hear/not-hear transitions complete within 2 seconds.

## 21. MVP Delivery Phases

### Phase 1: Skeleton and Contracts
- Monorepo scaffolding.
- Shared TypeScript contracts package or folder.
- Control plane health endpoints.

### Phase 2: Session + LiveKit Integration
- `/sessions` endpoint.
- LiveKit token minting.
- Minimal browser client connect/publish.

### Phase 3: Policy Socket + Audibility
- Policy socket auth.
- Snapshot + delta protocol.
- Client subscription diff application.

### Phase 4: Spatial Audio
- Remote node graph.
- Listener/remote pose APIs.
- Smooth gain + panner updates.

### Phase 5: Verification
- Integration and E2E coverage.

## 22. Definition of Done (MVP)

All items must pass:

1. A host application can install `proximity-voice-client` via npm and connect participants using external token/session flow.
2. Participants can speak and hear only members in their current audibility set.
3. Audibility updates are applied live without reconnect.
4. 3D positional attenuation works for moving participants.
5. System runs self-hosted on one VPS using LiveKit + coturn + control plane.
6. Reconnect flow restores session and policy state automatically.

## 23. Out-of-Scope for MVP (Future)

- Cross-room relay and mega-sharding.
- Recording, replay, transcription.
- Advanced moderation pipeline and trust tooling.
- Global QoS routing across regions.
- Native mobile SDK wrappers.

## 24. Implementation Notes for the Next AI

- Do not assume any specific host application semantics.
- Keep public APIs narrow and explicit.
- Prefer strict schema validation (zod or equivalent) at ingress boundaries.
- Keep revision semantics deterministic and room-scoped.
- Keep audibility compute simple first: O(n^2) pair checks are acceptable for 100 players.
- Add spatial partitioning (uniform grid / spatial hash or RBush) only if profiling shows policy compute is a bottleneck.
- Keep browser package dependency surface small.
- Avoid hidden global state in the client package.
- Write docs alongside code for every public endpoint/event.

## 25. Suggested First Backlog (Concrete Tasks)

1. Initialize monorepo and two packages (`proximity-voice-client`, `proximity-voice-control`).
2. Add shared contract types and JSON schema definitions.
3. Implement `/health`, `/ready`, `/sessions`.
4. Integrate LiveKit token minting and basic room join.
5. Implement policy socket with snapshot handshake.
6. Implement `POST /policy/poses`, room audibility compute, and room revisioning.
7. Implement client audibility diff and subscription manager.
8. Implement spatial audio node graph and pose update methods.
9. Add non-Docker deployment assets for single VPS (systemd units, Nginx, LiveKit, coturn).
10. Add integration tests for session, policy, and subscription behavior.

## 26. Minimal Example: Host Application Integration

```ts
import { createProximityVoiceClient } from '@org/proximity-voice-client';

const voice = createProximityVoiceClient();

await voice.connect({
  livekitUrl: session.livekitUrl,
  token: session.token,
  participantId: session.participantId,
  roomId: session.roomId,
  policySocketUrl: session.policySocketUrl,
  policySocketToken: session.policySocketToken,
});

voice.setListenerPose({
  position: { x: 0, y: 1.7, z: 0 },
  orientation: {
    forward: { x: 0, y: 0, z: 1 },
    up: { x: 0, y: 1, z: 0 },
  },
});

voice.upsertRemotePose({
  participantId: 'p_205',
  position: { x: 3, y: 1.7, z: -2 },
  timestampMs: Date.now(),
});

await voice.setMicState({ enabled: true, pushToTalk: true, pushToTalkActive: false });
```
