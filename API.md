# API

## Auth
Server-to-server endpoints require:
- `Authorization: Bearer <CONTROL_AUTH_TOKEN>`

All HTTP responses include:
- `x-request-id` for correlation

Rate limits (per IP):
- `POST /sessions`: `SESSIONS_PER_MINUTE_PER_IP` (default `120`)
- `POST /policy/poses`: `POSE_BATCHES_PER_MINUTE_PER_IP` (default `600`)

## `GET /health`
Returns liveness.

## `GET /ready`
Returns readiness and active gameplay constants.

## `POST /sessions`
Creates or refreshes a voice session.

Request:
```json
{
  "participantId": "p_123",
  "roomId": "room_alpha",
  "displayName": "Player 123",
  "metadata": { "role": "default" }
}
```

Response:
```json
{
  "roomId": "room_alpha",
  "participantId": "p_123",
  "livekitUrl": "ws://localhost/livekit",
  "token": "<livekit-jwt>",
  "tokenExpiresAtMs": 1760000000000,
  "policySocketUrl": "ws://localhost/policy-socket",
  "policySocketToken": "<policy-jwt>",
  "policyRevision": 0
}
```

## `POST /policy/poses`
Feeds room-scoped pose batches used by `radius_compute`.

Request:
```json
{
  "roomId": "room_alpha",
  "timestampMs": 1760000000999,
  "poses": [
    {
      "participantId": "p_123",
      "position": { "x": 10.1, "y": 1.8, "z": -2.2 }
    }
  ]
}
```

Response:
```json
{
  "ok": true,
  "roomId": "room_alpha",
  "revision": 12
}
```

## `GET /policy-socket?token=<policySocketToken>`
WebSocket endpoint for audibility policy updates.

Server -> client messages:
- `policy.snapshot`
- `policy.audibility.delta`
- `policy.error`

Client -> server messages:
- `policy.snapshot.request`

Close/error examples:
- `4400` invalid JSON/message
- `4401` socket auth failed
- `4404` room missing
- `4408` stale session timeout

### Snapshot
```json
{
  "type": "policy.snapshot",
  "roomId": "room_alpha",
  "participantId": "p_123",
  "revision": 12,
  "canHear": ["p_200", "p_201"],
  "timestampMs": 1760000001000
}
```

### Delta
```json
{
  "type": "policy.audibility.delta",
  "roomId": "room_alpha",
  "participantId": "p_123",
  "revision": 13,
  "canHear": ["p_201"],
  "timestampMs": 1760000001250
}
```
## Local Windows Profile
For local Windows development without Nginx/TURN, use:
- `packages/proximity-voice-control/.env.windows-local.example`

Key local values:
- `HOST=127.0.0.1`
- `LIVEKIT_URL=ws://127.0.0.1:7880`
- `LIVEKIT_SERVER_API_URL=http://127.0.0.1:7880`
