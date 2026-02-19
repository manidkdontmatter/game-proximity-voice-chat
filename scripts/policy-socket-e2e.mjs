import WebSocket from "ws";

const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:8080";
const auth = process.env.CONTROL_AUTH_TOKEN ?? "change-me";

function toWs(url) {
  if (url.startsWith("https://")) return `wss://${url.slice(8)}`;
  if (url.startsWith("http://")) return `ws://${url.slice(7)}`;
  return url;
}

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json();
  if (!res.ok) {
    throw new Error(`${path} failed ${res.status}: ${JSON.stringify(payload)}`);
  }
  return payload;
}

function createMessageBuffer(ws) {
  const messages = [];
  const waiters = [];

  function flush() {
    for (let i = 0; i < waiters.length; i += 1) {
      const waiter = waiters[i];
      const idx = messages.findIndex(waiter.predicate);
      if (idx === -1) {
        continue;
      }
      const [found] = messages.splice(idx, 1);
      clearTimeout(waiter.timer);
      waiters.splice(i, 1);
      i -= 1;
      waiter.resolve(found);
    }
  }

  ws.on("message", (raw) => {
    let parsed;
    try {
      parsed = JSON.parse(raw.toString("utf8"));
    } catch {
      return;
    }
    messages.push(parsed);
    flush();
  });

  function waitForMessage(predicate, timeoutMs = 6000) {
    const idx = messages.findIndex(predicate);
    if (idx !== -1) {
      const [found] = messages.splice(idx, 1);
      return Promise.resolve(found);
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const waiterIdx = waiters.findIndex((w) => w.timer === timer);
        if (waiterIdx !== -1) {
          waiters.splice(waiterIdx, 1);
        }
        reject(new Error("Timed out waiting for policy message"));
      }, timeoutMs);

      waiters.push({ predicate, resolve, timer });
    });
  }

  return { waitForMessage };
}

async function connectPolicySocket(policySocketUrl, policySocketToken) {
  const wsUrl = new URL(toWs(policySocketUrl));
  wsUrl.searchParams.set("token", policySocketToken);

  const ws = new WebSocket(wsUrl.toString());

  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });

  return ws;
}

async function main() {
  console.log("Creating sessions...");
  const a = await post("/sessions", { participantId: "a", roomId: "room1" });
  await post("/sessions", { participantId: "b", roomId: "room1" });

  const ws = await connectPolicySocket(a.policySocketUrl, a.policySocketToken);
  const buffer = createMessageBuffer(ws);
  console.log("Policy socket connected");

  ws.send(JSON.stringify({
    type: "policy.snapshot.request",
    roomId: "room1",
    lastAppliedRevision: -1,
    reason: "bootstrap",
  }));

  const snapshot = await buffer.waitForMessage((m) => m.type === "policy.snapshot");
  console.log("Initial snapshot", snapshot);

  console.log("Posting far poses...");
  await post("/policy/poses", {
    roomId: "room1",
    timestampMs: Date.now(),
    poses: [
      { participantId: "a", position: { x: 0, y: 0, z: 0 } },
      { participantId: "b", position: { x: 40, y: 0, z: 0 } },
    ],
  });

  console.log("Posting near poses (should become audible)...");
  await post("/policy/poses", {
    roomId: "room1",
    timestampMs: Date.now(),
    poses: [
      { participantId: "a", position: { x: 0, y: 0, z: 0 } },
      { participantId: "b", position: { x: 10, y: 0, z: 0 } },
    ],
  });

  const nearDelta = await buffer.waitForMessage(
    (m) => m.type === "policy.audibility.delta" && Array.isArray(m.canHear) && m.canHear.includes("b"),
  );
  console.log("Near delta", nearDelta);

  console.log("Posting far poses (should become inaudible)...");
  await post("/policy/poses", {
    roomId: "room1",
    timestampMs: Date.now(),
    poses: [
      { participantId: "a", position: { x: 0, y: 0, z: 0 } },
      { participantId: "b", position: { x: 40, y: 0, z: 0 } },
    ],
  });

  const farDelta = await buffer.waitForMessage(
    (m) => m.type === "policy.audibility.delta" && Array.isArray(m.canHear) && !m.canHear.includes("b"),
  );
  console.log("Far delta", farDelta);

  ws.close();
  console.log("PASS: policy socket audibility transitions verified");
}

main().catch((error) => {
  console.error("FAIL:", error.message);
  process.exit(1);
});
