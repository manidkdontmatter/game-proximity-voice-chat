# @manidkdontmatter/proximity-voice-client

Browser package for LiveKit proximity voice.

## Usage
```ts
import { ProximityVoiceClient } from "@manidkdontmatter/proximity-voice-client";

const voice = new ProximityVoiceClient();
await voice.connect({ session, autoPublishMic: true });
voice.setListenerPose({ x: 0, y: 1.8, z: 0 });
voice.upsertRemotePose("p_2", { x: 5, y: 1.8, z: 1 });
```

Policy updates come from `policy-socket` and control local subscriptions.
