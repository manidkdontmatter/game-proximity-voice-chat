import type { Pose } from "@manidkdontmatter/proximity-voice-contracts";
import type { ParticipantState, RoomState, SessionRecord } from "./types.js";

export class InMemoryStore {
  private readonly rooms = new Map<string, RoomState>();
  private readonly sessions = new Map<string, SessionRecord>();

  getOrCreateRoom(roomId: string): RoomState {
    let room = this.rooms.get(roomId);
    if (!room) {
      room = {
        roomId,
        revision: 0,
        participants: new Map(),
        canHearByListener: new Map(),
      };
      this.rooms.set(roomId, room);
    }
    return room;
  }

  createOrRefreshSession(input: {
    roomId: string;
    participantId: string;
    expiresAtMs: number;
    displayName?: string;
    metadata?: Record<string, string>;
  }): void {
    const sessionKey = `${input.roomId}:${input.participantId}`;
    this.sessions.set(sessionKey, {
      roomId: input.roomId,
      participantId: input.participantId,
      createdAtMs: Date.now(),
      expiresAtMs: input.expiresAtMs,
    });

    const room = this.getOrCreateRoom(input.roomId);
    const existing = room.participants.get(input.participantId);
    room.participants.set(input.participantId, {
      participantId: input.participantId,
      displayName: input.displayName,
      metadata: input.metadata,
      pose: existing?.pose,
      lastSeenMs: Date.now(),
    });

    if (!room.canHearByListener.has(input.participantId)) {
      room.canHearByListener.set(input.participantId, []);
    }
  }

  upsertPose(roomId: string, participantId: string, pose: Pose): void {
    const room = this.getOrCreateRoom(roomId);
    const participant: ParticipantState = room.participants.get(participantId) ?? {
      participantId,
      lastSeenMs: Date.now(),
    };
    participant.pose = pose;
    participant.lastSeenMs = Date.now();
    room.participants.set(participantId, participant);
    if (!room.canHearByListener.has(participantId)) {
      room.canHearByListener.set(participantId, []);
    }
  }

  listRoom(roomId: string): RoomState | undefined {
    return this.rooms.get(roomId);
  }

  listRoomIds(): string[] {
    return Array.from(this.rooms.keys());
  }
}
