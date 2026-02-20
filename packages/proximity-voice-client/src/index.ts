import type {
  PolicySocketOutbound,
  Vec3,
  VoiceSessionResponse,
} from "@manidkdontmatter/proximity-voice-contracts";
import { PolicySocketOutboundSchema } from "@manidkdontmatter/proximity-voice-contracts";
import { LocalAudioTrack, RemoteParticipant, Room, RoomEvent, Track, TrackPublication, createLocalAudioTrack } from "livekit-client";

export interface ConnectOptions {
  session: VoiceSessionResponse;
  autoPublishMic?: boolean;
}

export interface ProximityVoiceClientOptions {
  maxSubscribedVoices?: number;
  attenuationMaxDistanceM?: number;
}

export class ProximityVoiceClient extends EventTarget {
  private room: Room | null = null;
  private policySocket: WebSocket | null = null;
  private localTrack: LocalAudioTrack | null = null;
  private readonly audibleSet = new Set<string>();
  private listenerPosition: Vec3 = { x: 0, y: 0, z: 0 };
  private readonly remotePositions = new Map<string, Vec3>();
  private readonly maxSubscribedVoices: number;
  private readonly attenuationMaxDistanceM: number;

  constructor(options: ProximityVoiceClientOptions = {}) {
    super();
    this.maxSubscribedVoices = options.maxSubscribedVoices ?? 12;
    this.attenuationMaxDistanceM = options.attenuationMaxDistanceM ?? 40;
  }

  async connect(options: ConnectOptions): Promise<void> {
    const room = new Room();
    this.room = room;

    room
      .on(RoomEvent.Disconnected, () => {
        this.dispatchEvent(new CustomEvent("disconnected"));
      })
      .on(RoomEvent.ParticipantConnected, (participant) => {
        this.applyParticipantSubscriptions(participant);
      })
      .on(RoomEvent.TrackSubscribed, (_track, _publication, participant) => {
        this.applySpatialization(participant.identity);
      });

    await room.connect(options.session.livekitUrl, options.session.token);

    if (options.autoPublishMic ?? true) {
      await this.publishMicrophone();
    }

    this.connectPolicySocket(options.session.policySocketUrl, options.session.policySocketToken);
    this.dispatchEvent(new CustomEvent("connected"));
  }

  async disconnect(): Promise<void> {
    if (this.policySocket) {
      this.policySocket.close();
      this.policySocket = null;
    }

    if (this.room) {
      this.room.disconnect();
      this.room = null;
    }

    if (this.localTrack) {
      this.localTrack.stop();
      this.localTrack = null;
    }
  }

  async publishMicrophone(deviceId?: string): Promise<void> {
    if (!this.room) {
      throw new Error("Room not connected");
    }

    if (this.localTrack) {
      this.localTrack.stop();
    }

    this.localTrack = await createLocalAudioTrack(deviceId ? { deviceId } : undefined);
    await this.room.localParticipant.publishTrack(this.localTrack, {
      source: Track.Source.Microphone,
    });
  }

  async setInputDevice(deviceId: string): Promise<void> {
    await this.publishMicrophone(deviceId);
  }

  setPushToTalk(enabled: boolean): void {
    if (!this.localTrack) {
      return;
    }
    this.localTrack.mute();
    if (enabled) {
      this.localTrack.unmute();
    }
  }

  setListenerPose(position: Vec3): void {
    this.listenerPosition = position;
    for (const participantId of this.remotePositions.keys()) {
      this.applySpatialization(participantId);
    }
  }

  upsertRemotePose(participantId: string, position: Vec3): void {
    this.remotePositions.set(participantId, position);
    this.applySpatialization(participantId);
  }

  private connectPolicySocket(baseUrl: string, token: string): void {
    const socketUrl = new URL(baseUrl);
    socketUrl.searchParams.set("token", token);

    const ws = new WebSocket(socketUrl.toString());
    this.policySocket = ws;

    ws.onmessage = (event) => {
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(event.data));
      } catch {
        return;
      }

      const message = PolicySocketOutboundSchema.safeParse(parsed);
      if (!message.success) {
        return;
      }
      this.handlePolicyMessage(message.data);
    };

    ws.onclose = () => {
      this.dispatchEvent(new CustomEvent("policy-socket-closed"));
    };
  }

  private handlePolicyMessage(message: PolicySocketOutbound): void {
    if (message.type === "policy.error") {
      this.dispatchEvent(new CustomEvent("policy-error", { detail: message }));
      return;
    }

    const nextCanHear = message.canHear.slice(0, this.maxSubscribedVoices);
    this.applyAudibility(nextCanHear);
    this.dispatchEvent(new CustomEvent("audibility", { detail: message }));
  }

  private applyAudibility(next: string[]): void {
    const nextSet = new Set(next);

    if (!this.room) {
      return;
    }

    for (const participant of this.room.remoteParticipants.values()) {
      const shouldHear = nextSet.has(participant.identity);
      this.setParticipantSubscribed(participant, shouldHear);
    }

    this.audibleSet.clear();
    for (const id of nextSet) {
      this.audibleSet.add(id);
    }
  }

  private applyParticipantSubscriptions(participant: RemoteParticipant): void {
    this.setParticipantSubscribed(participant, this.audibleSet.has(participant.identity));
  }

  private setParticipantSubscribed(participant: RemoteParticipant, subscribed: boolean): void {
    for (const publication of participant.audioTrackPublications.values()) {
      publication.setSubscribed(subscribed);
    }
  }

  private applySpatialization(participantId: string): void {
    if (!this.room) {
      return;
    }

    const participant = this.room.remoteParticipants.get(participantId);
    const sourcePos = this.remotePositions.get(participantId);
    if (!participant || !sourcePos) {
      return;
    }

    const dx = sourcePos.x - this.listenerPosition.x;
    const dy = sourcePos.y - this.listenerPosition.y;
    const dz = sourcePos.z - this.listenerPosition.z;
    const distance = Math.sqrt((dx * dx) + (dy * dy) + (dz * dz));
    const t = Math.min(distance / this.attenuationMaxDistanceM, 1);
    const volume = 1 - t;

    for (const publication of participant.audioTrackPublications.values()) {
      this.setPublicationVolume(publication, volume);
    }
  }

  private setPublicationVolume(publication: TrackPublication, volume: number): void {
    const track = publication.audioTrack;
    if (!track) {
      return;
    }
    if ("setVolume" in track && typeof track.setVolume === "function") {
      track.setVolume(Math.max(0, Math.min(1, volume)));
    }
  }
}
