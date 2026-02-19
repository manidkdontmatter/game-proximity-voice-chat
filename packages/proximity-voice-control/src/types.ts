import type { Pose } from "@voice/proximity-voice-contracts";

export interface ParticipantState {
  participantId: string;
  displayName?: string;
  metadata?: Record<string, string>;
  pose?: Pose;
  lastSeenMs: number;
}

export interface RoomState {
  roomId: string;
  revision: number;
  participants: Map<string, ParticipantState>;
  canHearByListener: Map<string, string[]>;
}

export interface SessionRecord {
  roomId: string;
  participantId: string;
  createdAtMs: number;
  expiresAtMs: number;
}
