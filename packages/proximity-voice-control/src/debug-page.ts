export function renderDebugPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Proximity Voice Debug</title>
    <style>
      body { font-family: Segoe UI, sans-serif; margin: 20px; background: #101419; color: #e7edf5; }
      .row { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
      label { display: flex; flex-direction: column; gap: 4px; min-width: 180px; }
      input, select, button { padding: 8px; border-radius: 6px; border: 1px solid #334155; background: #0f172a; color: #e7edf5; }
      button { cursor: pointer; }
      pre { background: #0b1020; border: 1px solid #334155; border-radius: 8px; padding: 10px; min-height: 180px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <h1>Proximity Voice Debug</h1>
    <p>Open two tabs in the same room. Use <b>speaker</b> in one and <b>listener</b> in the other.</p>

    <div class="row">
      <label>Control Auth Token
        <input id="authToken" value="change-me" />
      </label>
      <label>Room ID
        <input id="roomId" value="room1" />
      </label>
      <label>Participant ID
        <input id="participantId" value="" placeholder="speaker-a or listener-b" />
      </label>
      <label>Other Participant ID
        <input id="otherParticipantId" value="" placeholder="the other tab's id" />
      </label>
      <label>Role
        <select id="role">
          <option value="speaker">speaker (publish tone)</option>
          <option value="listener">listener (receive only)</option>
        </select>
      </label>
    </div>

    <div class="row">
      <button id="connectBtn">Connect</button>
      <button id="nearBtn">Post Near (10m)</button>
      <button id="farBtn">Post Far (40m)</button>
      <button id="disconnectBtn">Disconnect</button>
    </div>

    <div class="row">
      <div>Status: <span id="status">idle</span></div>
      <div>Audible Set: <span id="audible">[]</span></div>
    </div>

    <h3>Logs</h3>
    <pre id="log"></pre>

    <script src="/debug/livekit-client.umd.js"></script>
    <script>
      const authTokenInput = document.getElementById("authToken");
      const roomIdInput = document.getElementById("roomId");
      const participantIdInput = document.getElementById("participantId");
      const otherParticipantIdInput = document.getElementById("otherParticipantId");
      const roleInput = document.getElementById("role");
      const statusEl = document.getElementById("status");
      const audibleEl = document.getElementById("audible");
      const logEl = document.getElementById("log");
      const connectBtn = document.getElementById("connectBtn");
      const nearBtn = document.getElementById("nearBtn");
      const farBtn = document.getElementById("farBtn");
      const disconnectBtn = document.getElementById("disconnectBtn");

      let room = null;
      let policySocket = null;
      let localTrack = null;
      let osc = null;
      let toneContext = null;
      let toneDest = null;
      let canHear = new Set();
      const attachedAudioEls = new Map();

      function log(msg) {
        const line = "[" + new Date().toLocaleTimeString() + "] " + msg;
        logEl.textContent = line + "\\n" + logEl.textContent;
      }

      function setStatus(msg) {
        statusEl.textContent = msg;
      }

      function updateAudible() {
        audibleEl.textContent = JSON.stringify(Array.from(canHear));
      }

      async function post(path, body) {
        const res = await fetch(path, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "authorization": "Bearer " + authTokenInput.value.trim(),
          },
          body: JSON.stringify(body),
        });
        const payload = await res.json();
        if (!res.ok) {
          throw new Error(path + " " + res.status + " " + JSON.stringify(payload));
        }
        return payload;
      }

      function applySubscriptions() {
        if (!room) return;
        for (const participant of room.remoteParticipants.values()) {
          const shouldHear = canHear.has(participant.identity);
          for (const pub of participant.audioTrackPublications.values()) {
            pub.setSubscribed(shouldHear);
          }
          log("subscription " + participant.identity + " -> " + shouldHear);
        }
      }

      function attachAudio(track, participantId) {
        const el = track.attach();
        el.autoplay = true;
        el.controls = true;
        el.dataset.participantId = participantId;
        document.body.appendChild(el);
        attachedAudioEls.set(participantId, el);
        log("attached remote audio for " + participantId);
      }

      async function startToneAndPublish() {
        toneContext = new AudioContext();
        await toneContext.resume();

        osc = toneContext.createOscillator();
        const gain = toneContext.createGain();
        toneDest = toneContext.createMediaStreamDestination();
        osc.type = "sine";
        osc.frequency.value = 220 + Math.floor(Math.random() * 220);
        gain.gain.value = 0.08;
        osc.connect(gain);
        gain.connect(toneDest);
        osc.start();

        const mediaTrack = toneDest.stream.getAudioTracks()[0];
        localTrack = new LivekitClient.LocalAudioTrack(mediaTrack);
        await room.localParticipant.publishTrack(localTrack, {
          source: LivekitClient.Track.Source.Microphone,
        });
        log("published synthetic tone track");
      }

      async function connect() {
        const roomId = roomIdInput.value.trim();
        const participantId = participantIdInput.value.trim();
        if (!roomId || !participantId) {
          throw new Error("roomId and participantId are required");
        }

        const session = await post("/sessions", { roomId, participantId });
        room = new LivekitClient.Room();
        room.on(LivekitClient.RoomEvent.ParticipantConnected, (participant) => {
          log("participant connected: " + participant.identity);
          applySubscriptions();
        });
        room.on(LivekitClient.RoomEvent.ParticipantDisconnected, (participant) => {
          log("participant disconnected: " + participant.identity);
          const el = attachedAudioEls.get(participant.identity);
          if (el) {
            el.remove();
            attachedAudioEls.delete(participant.identity);
          }
        });
        room.on(LivekitClient.RoomEvent.TrackSubscribed, (track, _pub, participant) => {
          if (track.kind === "audio") {
            attachAudio(track, participant.identity);
          }
        });

        await room.connect(session.livekitUrl, session.token);
        log("connected to livekit room");

        if (roleInput.value === "speaker") {
          await startToneAndPublish();
        }

        const wsUrl = new URL(session.policySocketUrl);
        wsUrl.searchParams.set("token", session.policySocketToken);
        policySocket = new WebSocket(wsUrl.toString());
        policySocket.onopen = () => log("policy socket open");
        policySocket.onclose = () => log("policy socket closed");
        policySocket.onmessage = (event) => {
          let msg;
          try {
            msg = JSON.parse(String(event.data));
          } catch {
            return;
          }

          if (msg.type === "policy.snapshot" || msg.type === "policy.audibility.delta") {
            canHear = new Set(Array.isArray(msg.canHear) ? msg.canHear : []);
            updateAudible();
            applySubscriptions();
          }

          if (msg.type === "policy.error") {
            log("policy error: " + msg.code + " " + msg.message);
          }
        };

        setStatus("connected");
      }

      async function postDistance(distanceM) {
        const roomId = roomIdInput.value.trim();
        const participantId = participantIdInput.value.trim();
        const otherId = otherParticipantIdInput.value.trim();
        if (!roomId || !participantId || !otherId) {
          throw new Error("roomId, participantId, otherParticipantId are required");
        }
        const response = await post("/policy/poses", {
          roomId,
          timestampMs: Date.now(),
          poses: [
            { participantId, position: { x: 0, y: 0, z: 0 } },
            { participantId: otherId, position: { x: distanceM, y: 0, z: 0 } },
          ],
        });
        log("posted distance " + distanceM + "m (revision " + response.revision + ")");
      }

      async function disconnect() {
        if (policySocket) {
          policySocket.close();
          policySocket = null;
        }
        if (localTrack) {
          localTrack.stop();
          localTrack = null;
        }
        if (osc) {
          osc.stop();
          osc.disconnect();
          osc = null;
        }
        if (toneDest) {
          toneDest.disconnect();
          toneDest = null;
        }
        if (toneContext) {
          await toneContext.close();
          toneContext = null;
        }
        if (room) {
          room.disconnect();
          room = null;
        }
        canHear = new Set();
        updateAudible();
        for (const el of attachedAudioEls.values()) {
          el.remove();
        }
        attachedAudioEls.clear();
        setStatus("idle");
        log("disconnected");
      }

      connectBtn.addEventListener("click", async () => {
        connectBtn.disabled = true;
        try {
          await connect();
        } catch (err) {
          log("connect failed: " + err.message);
          setStatus("error");
        } finally {
          connectBtn.disabled = false;
        }
      });

      nearBtn.addEventListener("click", async () => {
        try {
          await postDistance(10);
        } catch (err) {
          log("near failed: " + err.message);
        }
      });

      farBtn.addEventListener("click", async () => {
        try {
          await postDistance(40);
        } catch (err) {
          log("far failed: " + err.message);
        }
      });

      disconnectBtn.addEventListener("click", async () => {
        try {
          await disconnect();
        } catch (err) {
          log("disconnect failed: " + err.message);
        }
      });
    </script>
  </body>
</html>`;
}
