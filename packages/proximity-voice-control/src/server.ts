import Fastify, { type FastifyInstance } from "fastify";
import websocket from "@fastify/websocket";
import { AccessToken } from "livekit-server-sdk";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  PolicySocketInboundSchema,
  PoseBatchSchema,
  VoiceSessionRequestSchema,
  type PolicySocketOutbound,
} from "@manidkdontmatter/proximity-voice-contracts";
import { assertControlAuth, mintPolicySocketToken, verifyPolicySocketToken } from "./auth.js";
import type { AppConfig } from "./config.js";
import { renderDebugPage } from "./debug-page.js";
import { LiveKitPolicyEnforcer, type PolicyEnforcer } from "./livekit-enforcer.js";
import { recomputeAudibility } from "./policy-engine.js";
import { FixedWindowRateLimiter } from "./rate-limit.js";
import { InMemoryStore } from "./store.js";

interface SocketBinding {
  roomId: string;
  participantId: string;
  send: (message: PolicySocketOutbound) => void;
  close: (code: number, reason: string) => void;
}

interface ServerDeps {
  enforcer?: PolicyEnforcer;
}

function asWsConnection(connection: unknown): {
  send: (data: string) => void;
  close: (code?: number, reason?: string) => void;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  readyState: number;
  OPEN: number;
} {
  if (typeof connection !== "object" || connection === null) {
    throw new Error("Invalid websocket connection object");
  }

  const maybeWrapped = connection as { socket?: unknown };
  const ws = (maybeWrapped.socket ?? connection) as {
    send?: (data: string) => void;
    close?: (code?: number, reason?: string) => void;
    on?: (event: string, listener: (...args: unknown[]) => void) => void;
    readyState?: number;
    OPEN?: number;
  };

  if (
    typeof ws.send !== "function" ||
    typeof ws.close !== "function" ||
    typeof ws.on !== "function" ||
    typeof ws.readyState !== "number" ||
    typeof ws.OPEN !== "number"
  ) {
    throw new Error("Unsupported websocket object shape");
  }

  return ws as {
    send: (data: string) => void;
    close: (code?: number, reason?: string) => void;
    on: (event: string, listener: (...args: unknown[]) => void) => void;
    readyState: number;
    OPEN: number;
  };
}

function policySocketUrlFromRequest(request: { headers: Record<string, unknown>; protocol: string }): string {
  const forwardedProto = typeof request.headers["x-forwarded-proto"] === "string"
    ? request.headers["x-forwarded-proto"]
    : undefined;
  const forwardedHost = typeof request.headers["x-forwarded-host"] === "string"
    ? request.headers["x-forwarded-host"]
    : undefined;
  const host = typeof request.headers.host === "string" ? request.headers.host : "127.0.0.1:8080";

  const proto = (forwardedProto ?? request.protocol) === "https" ? "wss" : "ws";
  return `${proto}://${forwardedHost ?? host}/policy-socket`;
}

export async function buildServer(config: AppConfig, deps: ServerDeps = {}): Promise<FastifyInstance> {
  const app = Fastify({
    bodyLimit: 1_000_000,
    logger: {
      transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
    },
  });

  await app.register(websocket);

  const store = new InMemoryStore();
  const sockets = new Set<SocketBinding>();
  const rateLimiter = new FixedWindowRateLimiter();
  const enforcer: PolicyEnforcer = deps.enforcer ?? new LiveKitPolicyEnforcer(
    config.livekitServerApiUrl,
    config.livekitApiKey,
    config.livekitApiSecret,
  );

  function sendSnapshot(roomId: string, participantId: string, target?: SocketBinding): void {
    const room = store.listRoom(roomId);
    if (!room) {
      return;
    }
    const snapshot: PolicySocketOutbound = {
      type: "policy.snapshot",
      roomId,
      participantId,
      revision: room.revision,
      canHear: room.canHearByListener.get(participantId) ?? [],
      timestampMs: Date.now(),
    };

    if (target) {
      target.send(snapshot);
      return;
    }

    for (const socket of sockets) {
      if (socket.roomId === roomId && socket.participantId === participantId) {
        socket.send(snapshot);
      }
    }
  }

  function sendRoomSnapshots(roomId: string): void {
    const room = store.listRoom(roomId);
    if (!room) {
      return;
    }
    for (const socket of sockets) {
      if (socket.roomId !== roomId) {
        continue;
      }
      socket.send({
        type: "policy.snapshot",
        roomId,
        participantId: socket.participantId,
        revision: room.revision,
        canHear: room.canHearByListener.get(socket.participantId) ?? [],
        timestampMs: Date.now(),
      });
    }
  }

  function publishDeltas(roomId: string, changed: Map<string, string[]>, revision: number): void {
    const ts = Date.now();
    for (const [participantId, canHear] of changed.entries()) {
      for (const socket of sockets) {
        if (socket.roomId !== roomId || socket.participantId !== participantId) {
          continue;
        }
        socket.send({
          type: "policy.audibility.delta",
          roomId,
          participantId,
          revision,
          canHear,
          timestampMs: ts,
        });
      }
    }
  }

  function cleanupInactiveParticipants(roomId: string, nowMs = Date.now()): void {
    const room = store.listRoom(roomId);
    if (!room) {
      return;
    }

    const cutoffMs = nowMs - (config.reconnectGraceSec * 1000);
    const removed = new Set<string>();

    for (const [participantId, state] of room.participants.entries()) {
      if (state.lastSeenMs < cutoffMs) {
        room.participants.delete(participantId);
        room.canHearByListener.delete(participantId);
        removed.add(participantId);
      }
    }

    if (removed.size === 0) {
      return;
    }

    const changed = new Map<string, string[]>();
    for (const [listenerId, canHear] of room.canHearByListener.entries()) {
      const next = canHear.filter((speakerId) => !removed.has(speakerId));
      if (next.length !== canHear.length) {
        room.canHearByListener.set(listenerId, next);
        changed.set(listenerId, next);
      }
    }

    room.revision += 1;
    if (changed.size > 0) {
      publishDeltas(roomId, changed, room.revision);
    } else {
      sendRoomSnapshots(roomId);
    }

    for (const socket of sockets) {
      if (socket.roomId === roomId && removed.has(socket.participantId)) {
        socket.send({
          type: "policy.error",
          code: "stale_session",
          message: "Session timed out during reconnect grace window",
          recoverable: true,
        });
        socket.close(4408, "stale_session");
      }
    }
  }

  async function recomputeAndFanout(roomId: string): Promise<void> {
    const room = store.listRoom(roomId);
    if (!room) {
      return;
    }
    const changed = recomputeAudibility(room, {
      maxSubscribedVoices: config.maxSubscribedVoices,
      radiusEnterM: config.radiusEnterM,
      radiusExitM: config.radiusExitM,
    });

    if (changed.size === 0) {
      return;
    }

    publishDeltas(roomId, changed, room.revision);

    try {
      await enforcer.enforceRoom(roomId, room.canHearByListener);
    } catch (error) {
      app.log.error({ err: error, roomId }, "failed to enforce livekit subscriptions");
    }
  }

  const recomputeInterval = setInterval(async () => {
    const roomIds = store.listRoomIds();
    for (const roomId of roomIds) {
      cleanupInactiveParticipants(roomId);
      await recomputeAndFanout(roomId);
    }
  }, Math.max(100, Math.round(1000 / config.recomputeHz)));

  app.addHook("onClose", async () => {
    clearInterval(recomputeInterval);
  });

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
  });

  app.setErrorHandler((error, request, reply) => {
    request.log.error({ err: error }, "unhandled request error");
    reply.code(500).send({ error: "internal_error", requestId: request.id });
  });

  app.get("/health", async () => ({ ok: true, ts: Date.now() }));

  app.get("/ready", async () => ({
    ok: true,
    recomputeHz: config.recomputeHz,
    radiusEnterM: config.radiusEnterM,
    radiusExitM: config.radiusExitM,
    maxSubscribedVoices: config.maxSubscribedVoices,
  }));

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const livekitUmdCandidates = [
    path.resolve(__dirname, "../../../../node_modules/livekit-client/dist/livekit-client.umd.js"),
    path.resolve(__dirname, "../../../node_modules/livekit-client/dist/livekit-client.umd.js"),
    path.resolve(process.cwd(), "node_modules/livekit-client/dist/livekit-client.umd.js"),
  ];

  app.get("/debug", async (_request, reply) => {
    reply.type("text/html; charset=utf-8").send(renderDebugPage());
  });

  app.get("/debug/livekit-client.umd.js", async (_request, reply) => {
    for (const candidate of livekitUmdCandidates) {
      try {
        const file = await readFile(candidate, "utf8");
        reply.type("application/javascript; charset=utf-8").send(file);
        return;
      } catch {
        // Try the next candidate path.
      }
    }

    reply.code(500).send({ error: "livekit_umd_not_found" });
  });

  app.post("/sessions", async (request, reply) => {
    const sessionsKey = `sessions:${request.ip}`;
    if (!rateLimiter.allow(sessionsKey, config.sessionsPerMinutePerIp, 60_000)) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    try {
      assertControlAuth(request.headers.authorization, config.controlAuthToken);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parsed = VoiceSessionRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const input = parsed.data;
    const now = Date.now();
    const expiresAtMs = now + (config.sessionTokenTtlSec * 1000);

    store.createOrRefreshSession({
      roomId: input.roomId,
      participantId: input.participantId,
      expiresAtMs,
      displayName: input.displayName,
      metadata: input.metadata,
    });

    const at = new AccessToken(config.livekitApiKey, config.livekitApiSecret, {
      identity: input.participantId,
      ttl: `${config.sessionTokenTtlSec}s`,
      name: input.displayName,
      metadata: input.metadata ? JSON.stringify(input.metadata) : undefined,
    });

    at.addGrant({
      room: input.roomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    const token = await at.toJwt();

    const policySocketToken = mintPolicySocketToken(
      { roomId: input.roomId, participantId: input.participantId },
      config.policySocketSecret,
      config.policySocketTokenTtlSec,
    );

    const room = store.getOrCreateRoom(input.roomId);

    return reply.send({
      roomId: input.roomId,
      participantId: input.participantId,
      livekitUrl: config.livekitUrl,
      token,
      tokenExpiresAtMs: expiresAtMs,
      policySocketUrl: policySocketUrlFromRequest(request),
      policySocketToken,
      policyRevision: room.revision,
    });
  });

  app.post("/policy/poses", async (request, reply) => {
    const posesKey = `poses:${request.ip}`;
    if (!rateLimiter.allow(posesKey, config.poseBatchesPerMinutePerIp, 60_000)) {
      return reply.code(429).send({ error: "rate_limited" });
    }

    try {
      assertControlAuth(request.headers.authorization, config.controlAuthToken);
    } catch {
      return reply.code(401).send({ error: "unauthorized" });
    }

    const parsed = PoseBatchSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "invalid_request", details: parsed.error.flatten() });
    }

    const batch = parsed.data;
    for (const poseUpdate of batch.poses) {
      store.upsertPose(batch.roomId, poseUpdate.participantId, {
        position: poseUpdate.position,
        orientation: poseUpdate.orientation,
        timestampMs: batch.timestampMs,
      });
    }

    await recomputeAndFanout(batch.roomId);
    const room = store.getOrCreateRoom(batch.roomId);

    return reply.send({ ok: true, roomId: batch.roomId, revision: room.revision });
  });

  app.get("/policy-socket", { websocket: true }, (connection, request) => {
    let ws: ReturnType<typeof asWsConnection>;
    try {
      ws = asWsConnection(connection);
    } catch {
      return;
    }

    const requestUrl = new URL(request.url, "http://localhost");
    const token = requestUrl.searchParams.get("token") ?? "";

    let claims: { roomId: string; participantId: string };
    try {
      claims = verifyPolicySocketToken(token, config.policySocketSecret);
    } catch {
      ws.send(JSON.stringify({
        type: "policy.error",
        code: "auth_failed",
        message: "Invalid socket token",
        recoverable: true,
      }));
      ws.close(4401, "unauthorized");
      return;
    }

    const binding: SocketBinding = {
      roomId: claims.roomId,
      participantId: claims.participantId,
      send: (message) => {
        if (ws.readyState === ws.OPEN) {
          ws.send(JSON.stringify(message));
        }
      },
      close: (code, reason) => {
        if (ws.readyState === ws.OPEN) {
          ws.close(code, reason);
        }
      },
    };

    sockets.add(binding);
    sendSnapshot(claims.roomId, claims.participantId, binding);

    ws.on("message", (raw: unknown) => {
      let payload: string;
      if (typeof raw === "string") {
        payload = raw;
      } else if (raw instanceof Uint8Array) {
        payload = Buffer.from(raw).toString("utf8");
      } else if (Array.isArray(raw) && raw.every((chunk) => chunk instanceof Uint8Array)) {
        payload = Buffer.concat(raw.map((chunk) => Buffer.from(chunk))).toString("utf8");
      } else if (raw instanceof ArrayBuffer) {
        payload = Buffer.from(raw).toString("utf8");
      } else {
        binding.send({
          type: "policy.error",
          code: "invalid_frame",
          message: "Inbound socket frame type is not supported",
          recoverable: false,
        });
        ws.close(4400, "invalid_frame");
        return;
      }
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(payload);
      } catch {
        binding.send({
          type: "policy.error",
          code: "invalid_json",
          message: "Inbound socket payload is not valid JSON",
          recoverable: false,
        });
        ws.close(4400, "invalid_json");
        return;
      }
      const parsedMessage = PolicySocketInboundSchema.safeParse(parsedJson);
      if (!parsedMessage.success) {
        binding.send({
          type: "policy.error",
          code: "invalid_message",
          message: "Inbound socket message failed validation",
          recoverable: false,
        });
        ws.close(4400, "invalid_message");
        return;
      }

      if (parsedMessage.data.type === "policy.snapshot.request") {
        const room = store.listRoom(binding.roomId);
        if (!room) {
          binding.send({
            type: "policy.error",
            code: "room_missing",
            message: "Room no longer exists",
            recoverable: true,
          });
          ws.close(4404, "room_missing");
          return;
        }
        sendSnapshot(binding.roomId, binding.participantId, binding);
      }
    });

    ws.on("close", () => {
      sockets.delete(binding);
    });
  });

  return app;
}
