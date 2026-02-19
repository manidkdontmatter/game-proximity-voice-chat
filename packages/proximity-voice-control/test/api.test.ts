import { afterEach, describe, expect, it } from "vitest";
import type { AppConfig } from "../src/config.js";
import { buildServer } from "../src/server.js";

class MockEnforcer {
  calls: Array<{ roomId: string; listeners: number }> = [];

  async enforceRoom(roomId: string, canHearByListener: Map<string, string[]>): Promise<void> {
    this.calls.push({ roomId, listeners: canHearByListener.size });
  }
}

function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 8080,
    host: "127.0.0.1",
    controlAuthToken: "secret-token",
    livekitUrl: "ws://localhost/livekit",
    livekitApiKey: "devkey",
    livekitApiSecret: "devsecret",
    livekitServerApiUrl: "http://localhost:7880",
    policySocketSecret: "policy-secret",
    sessionTokenTtlSec: 900,
    policySocketTokenTtlSec: 900,
    maxSubscribedVoices: 12,
    radiusEnterM: 24,
    radiusExitM: 26,
    recomputeHz: 4,
    reconnectGraceSec: 20,
    sessionsPerMinutePerIp: 120,
    poseBatchesPerMinutePerIp: 600,
    ...overrides,
  };
}

const apps: Array<{ close: () => Promise<void> }> = [];

afterEach(async () => {
  while (apps.length > 0) {
    const app = apps.pop();
    if (app) {
      await app.close();
    }
  }
});

describe("control-plane api", () => {
  it("returns health and ready", async () => {
    const app = await buildServer(makeConfig(), { enforcer: new MockEnforcer() });
    apps.push(app);

    const health = await app.inject({ method: "GET", url: "/health" });
    expect(health.statusCode).toBe(200);
    expect(health.json().ok).toBe(true);
    expect(health.headers["x-request-id"]).toBeDefined();

    const ready = await app.inject({ method: "GET", url: "/ready" });
    expect(ready.statusCode).toBe(200);
    expect(ready.json().recomputeHz).toBe(4);
  });

  it("rejects unauthorized sessions and policy poses", async () => {
    const app = await buildServer(makeConfig(), { enforcer: new MockEnforcer() });
    apps.push(app);

    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      payload: { participantId: "p1", roomId: "room1" },
    });
    expect(sessionRes.statusCode).toBe(401);

    const posesRes = await app.inject({
      method: "POST",
      url: "/policy/poses",
      payload: { roomId: "room1", timestampMs: Date.now(), poses: [] },
    });
    expect(posesRes.statusCode).toBe(401);
  });

  it("creates session and computes audibility on pose ingestion", async () => {
    const enforcer = new MockEnforcer();
    const app = await buildServer(makeConfig(), { enforcer });
    apps.push(app);

    const auth = { authorization: "Bearer secret-token" };

    const sessionRes = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: auth,
      payload: { participantId: "a", roomId: "room1" },
    });
    expect(sessionRes.statusCode).toBe(200);
    const sessionBody = sessionRes.json();
    expect(sessionBody.token).toBeTypeOf("string");
    expect(sessionBody.policySocketToken).toBeTypeOf("string");

    await app.inject({
      method: "POST",
      url: "/sessions",
      headers: auth,
      payload: { participantId: "b", roomId: "room1" },
    });

    const posesRes = await app.inject({
      method: "POST",
      url: "/policy/poses",
      headers: auth,
      payload: {
        roomId: "room1",
        timestampMs: Date.now(),
        poses: [
          { participantId: "a", position: { x: 0, y: 0, z: 0 } },
          { participantId: "b", position: { x: 10, y: 0, z: 0 } },
        ],
      },
    });

    expect(posesRes.statusCode).toBe(200);
    expect(posesRes.json().revision).toBe(1);
    expect(enforcer.calls.length).toBeGreaterThan(0);
    expect(enforcer.calls[0]?.roomId).toBe("room1");
  });

  it("enforces session rate limiting", async () => {
    const app = await buildServer(makeConfig({ sessionsPerMinutePerIp: 1 }), { enforcer: new MockEnforcer() });
    apps.push(app);

    const auth = { authorization: "Bearer secret-token" };

    const first = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: auth,
      payload: { participantId: "a", roomId: "room1" },
    });
    expect(first.statusCode).toBe(200);

    const second = await app.inject({
      method: "POST",
      url: "/sessions",
      headers: auth,
      payload: { participantId: "b", roomId: "room1" },
    });
    expect(second.statusCode).toBe(429);
  });
});
