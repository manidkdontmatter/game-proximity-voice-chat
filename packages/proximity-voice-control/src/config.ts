export interface AppConfig {
  port: number;
  host: string;
  controlAuthToken: string;
  livekitUrl: string;
  livekitApiKey: string;
  livekitApiSecret: string;
  livekitServerApiUrl: string;
  policySocketSecret: string;
  sessionTokenTtlSec: number;
  policySocketTokenTtlSec: number;
  maxSubscribedVoices: number;
  radiusEnterM: number;
  radiusExitM: number;
  recomputeHz: number;
  reconnectGraceSec: number;
  sessionsPerMinutePerIp: number;
  poseBatchesPerMinutePerIp: number;
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
}

function numberEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) {
    return fallback;
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid numeric env var ${name}: ${value}`);
  }
  return parsed;
}

export function loadConfig(): AppConfig {
  return {
    port: numberEnv("PORT", 8080),
    host: process.env.HOST ?? "0.0.0.0",
    controlAuthToken: required("CONTROL_AUTH_TOKEN"),
    livekitUrl: required("LIVEKIT_URL"),
    livekitApiKey: required("LIVEKIT_API_KEY"),
    livekitApiSecret: required("LIVEKIT_API_SECRET"),
    livekitServerApiUrl: process.env.LIVEKIT_SERVER_API_URL ?? "http://127.0.0.1:7880",
    policySocketSecret: required("POLICY_SOCKET_SECRET"),
    sessionTokenTtlSec: numberEnv("SESSION_TOKEN_TTL_SEC", 900),
    policySocketTokenTtlSec: numberEnv("POLICY_SOCKET_TOKEN_TTL_SEC", 900),
    maxSubscribedVoices: numberEnv("MAX_SUBSCRIBED_VOICES", 12),
    radiusEnterM: numberEnv("RADIUS_ENTER_M", 24),
    radiusExitM: numberEnv("RADIUS_EXIT_M", 26),
    recomputeHz: numberEnv("RECOMPUTE_HZ", 4),
    reconnectGraceSec: numberEnv("RECONNECT_GRACE_SEC", 20),
    sessionsPerMinutePerIp: numberEnv("SESSIONS_PER_MINUTE_PER_IP", 120),
    poseBatchesPerMinutePerIp: numberEnv("POSE_BATCHES_PER_MINUTE_PER_IP", 600),
  };
}
