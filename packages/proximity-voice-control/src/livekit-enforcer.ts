import { RoomServiceClient } from "livekit-server-sdk";

export interface PolicyEnforcer {
  enforceRoom(roomId: string, canHearByListener: Map<string, string[]>): Promise<void>;
}

export class LiveKitPolicyEnforcer implements PolicyEnforcer {
  private readonly roomService: RoomServiceClient;

  constructor(serverApiUrl: string, apiKey: string, apiSecret: string) {
    this.roomService = new RoomServiceClient(serverApiUrl, apiKey, apiSecret);
  }

  async enforceRoom(roomId: string, canHearByListener: Map<string, string[]>): Promise<void> {
    const participants = await this.roomService.listParticipants(roomId);
    const trackSidsByIdentity = new Map<string, string[]>();
    for (const participant of participants) {
      const audioTrackSids = participant.tracks
        .filter((track) => track.type === 0)
        .map((track) => track.sid)
        .filter((sid): sid is string => typeof sid === "string" && sid.length > 0);
      trackSidsByIdentity.set(participant.identity, audioTrackSids);
    }

    const updates: Promise<unknown>[] = [];
    for (const [listenerId, allowedSpeakerIds] of canHearByListener.entries()) {
      const allowedSet = new Set(allowedSpeakerIds);
      const toUnsubscribe: string[] = [];
      const toSubscribe: string[] = [];

      for (const [speakerId, trackSids] of trackSidsByIdentity.entries()) {
        if (speakerId === listenerId) {
          continue;
        }
        if (allowedSet.has(speakerId)) {
          toSubscribe.push(...trackSids);
        } else {
          toUnsubscribe.push(...trackSids);
        }
      }

      if (toUnsubscribe.length > 0) {
        updates.push(this.roomService.updateSubscriptions(roomId, listenerId, toUnsubscribe, false));
      }
      if (toSubscribe.length > 0) {
        updates.push(this.roomService.updateSubscriptions(roomId, listenerId, toSubscribe, true));
      }
    }

    await Promise.all(updates);
  }
}
