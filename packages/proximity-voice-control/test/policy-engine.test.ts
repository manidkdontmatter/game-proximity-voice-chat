import { describe, expect, it } from "vitest";
import { recomputeAudibility } from "../src/policy-engine.js";
import type { RoomState } from "../src/types.js";

function roomWithParticipants(): RoomState {
  return {
    roomId: "room-a",
    revision: 0,
    participants: new Map([
      ["a", { participantId: "a", lastSeenMs: Date.now(), pose: { timestampMs: 1, position: { x: 0, y: 0, z: 0 } } }],
      ["b", { participantId: "b", lastSeenMs: Date.now(), pose: { timestampMs: 1, position: { x: 5, y: 0, z: 0 } } }],
      ["c", { participantId: "c", lastSeenMs: Date.now(), pose: { timestampMs: 1, position: { x: 30, y: 0, z: 0 } } }],
    ]),
    canHearByListener: new Map([
      ["a", []],
      ["b", []],
      ["c", []],
    ]),
  };
}

describe("recomputeAudibility", () => {
  it("adds nearby participants and increments revision", () => {
    const room = roomWithParticipants();

    const changed = recomputeAudibility(room, {
      maxSubscribedVoices: 12,
      radiusEnterM: 24,
      radiusExitM: 26,
    });

    expect(changed.get("a")).toEqual(["b"]);
    expect(changed.get("b")).toEqual(["a"]);
    expect(changed.has("c")).toBe(false);
    expect(room.revision).toBe(1);
  });

  it("uses hysteresis exit radius for previously audible participants", () => {
    const room = roomWithParticipants();
    room.canHearByListener.set("a", ["b"]);
    room.participants.get("b")!.pose!.position.x = 25;

    const changed = recomputeAudibility(room, {
      maxSubscribedVoices: 12,
      radiusEnterM: 24,
      radiusExitM: 26,
    });

    expect(changed.has("a")).toBe(false);

    room.participants.get("b")!.pose!.position.x = 27;
    const changed2 = recomputeAudibility(room, {
      maxSubscribedVoices: 12,
      radiusEnterM: 24,
      radiusExitM: 26,
    });
    expect(changed2.get("a")).toEqual([]);
  });

  it("prunes deterministically by distance then id", () => {
    const room: RoomState = {
      roomId: "room-b",
      revision: 0,
      participants: new Map([
        ["listener", { participantId: "listener", lastSeenMs: 0, pose: { timestampMs: 0, position: { x: 0, y: 0, z: 0 } } }],
        ["z", { participantId: "z", lastSeenMs: 0, pose: { timestampMs: 0, position: { x: 1, y: 0, z: 0 } } }],
        ["a", { participantId: "a", lastSeenMs: 0, pose: { timestampMs: 0, position: { x: 1, y: 0, z: 0 } } }],
        ["far", { participantId: "far", lastSeenMs: 0, pose: { timestampMs: 0, position: { x: 2, y: 0, z: 0 } } }],
      ]),
      canHearByListener: new Map([["listener", []]]),
    };

    recomputeAudibility(room, {
      maxSubscribedVoices: 2,
      radiusEnterM: 24,
      radiusExitM: 26,
    });

    expect(room.canHearByListener.get("listener")).toEqual(["a", "z"]);
  });
});
