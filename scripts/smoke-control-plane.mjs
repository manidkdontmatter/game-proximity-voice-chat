const baseUrl = process.env.BASE_URL ?? "http://127.0.0.1:8080";
const auth = process.env.CONTROL_AUTH_TOKEN ?? "change-me";

async function post(path, body) {
  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${auth}`,
    },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function main() {
  const sessionA = await post("/sessions", { participantId: "a", roomId: "room1" });
  const sessionB = await post("/sessions", { participantId: "b", roomId: "room1" });

  console.log("sessions", sessionA.status, sessionB.status);

  const poses = await post("/policy/poses", {
    roomId: "room1",
    timestampMs: Date.now(),
    poses: [
      { participantId: "a", position: { x: 0, y: 0, z: 0 } },
      { participantId: "b", position: { x: 10, y: 0, z: 0 } },
    ],
  });

  console.log("poses", poses.status, poses.body);

  if (poses.status !== 200 || poses.body.revision < 1) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
