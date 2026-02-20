import type { Pose } from "@manidkdontmatter/proximity-voice-contracts";
import type { ParticipantState, RoomState } from "./types.js";

export interface PolicyConstants {
  maxSubscribedVoices: number;
  radiusEnterM: number;
  radiusExitM: number;
}

function distance3dMeters(a: Pose, b: Pose): number {
  const dx = a.position.x - b.position.x;
  const dy = a.position.y - b.position.y;
  const dz = a.position.z - b.position.z;
  return Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
}

function computeEligible(
  listener: ParticipantState,
  speaker: ParticipantState,
  previouslyAudible: Set<string>,
  constants: PolicyConstants,
): { eligible: boolean; distanceMeters: number } {
  if (!listener.pose || !speaker.pose) {
    return { eligible: false, distanceMeters: Number.POSITIVE_INFINITY };
  }

  const d = distance3dMeters(listener.pose, speaker.pose);
  if (previouslyAudible.has(speaker.participantId)) {
    return { eligible: d <= constants.radiusExitM, distanceMeters: d };
  }
  return { eligible: d <= constants.radiusEnterM, distanceMeters: d };
}

export function recomputeAudibility(
  room: RoomState,
  constants: PolicyConstants,
  nowMs = Date.now(),
): Map<string, string[]> {
  const updates = new Map<string, string[]>();
  const participants = Array.from(room.participants.values());

  for (const listener of participants) {
    const previous = new Set(room.canHearByListener.get(listener.participantId) ?? []);
    const candidates: Array<{ participantId: string; distanceMeters: number }> = [];

    for (const speaker of participants) {
      if (speaker.participantId === listener.participantId) {
        continue;
      }
      const result = computeEligible(listener, speaker, previous, constants);
      if (result.eligible) {
        candidates.push({
          participantId: speaker.participantId,
          distanceMeters: result.distanceMeters,
        });
      }
    }

    candidates.sort((a, b) => {
      if (a.distanceMeters !== b.distanceMeters) {
        return a.distanceMeters - b.distanceMeters;
      }
      return a.participantId.localeCompare(b.participantId);
    });

    const next = candidates.slice(0, constants.maxSubscribedVoices).map((entry) => entry.participantId);
    const prev = room.canHearByListener.get(listener.participantId) ?? [];
    const changed = next.length !== prev.length || next.some((id, i) => id !== prev[i]);

    if (changed) {
      updates.set(listener.participantId, next);
      room.canHearByListener.set(listener.participantId, next);
    }
  }

  if (updates.size > 0) {
    room.revision += 1;
    for (const listenerId of room.participants.keys()) {
      if (!room.canHearByListener.has(listenerId)) {
        room.canHearByListener.set(listenerId, []);
      }
    }
  }

  return updates;
}
