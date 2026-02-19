import { z } from "zod";

export const Vec3Schema = z.object({
  x: z.number(),
  y: z.number(),
  z: z.number(),
});

export const OrientationSchema = z.object({
  forward: Vec3Schema,
  up: Vec3Schema,
});

export const PoseSchema = z.object({
  position: Vec3Schema,
  orientation: OrientationSchema.optional(),
  timestampMs: z.number().int().nonnegative(),
});

export const VoiceSessionRequestSchema = z.object({
  participantId: z.string().min(1),
  roomId: z.string().min(1),
  displayName: z.string().min(1).optional(),
  metadata: z.record(z.string()).optional(),
});

export const VoiceSessionResponseSchema = z.object({
  roomId: z.string(),
  participantId: z.string(),
  livekitUrl: z.string().url(),
  token: z.string().min(1),
  tokenExpiresAtMs: z.number().int().nonnegative(),
  policySocketUrl: z.string().url(),
  policySocketToken: z.string().min(1),
  policyRevision: z.number().int().nonnegative(),
});

export const PoseUpdateSchema = z.object({
  participantId: z.string().min(1),
  position: Vec3Schema,
  orientation: OrientationSchema.optional(),
});

export const PoseBatchSchema = z.object({
  roomId: z.string().min(1),
  timestampMs: z.number().int().nonnegative(),
  poses: z.array(PoseUpdateSchema).max(500),
});

export const AudibilitySetSchema = z.object({
  roomId: z.string(),
  participantId: z.string(),
  canHear: z.array(z.string()),
  revision: z.number().int().nonnegative(),
  timestampMs: z.number().int().nonnegative(),
});

export const PolicySnapshotMessageSchema = z.object({
  type: z.literal("policy.snapshot"),
  roomId: z.string(),
  participantId: z.string(),
  revision: z.number().int().nonnegative(),
  canHear: z.array(z.string()),
  timestampMs: z.number().int().nonnegative(),
});

export const PolicyDeltaMessageSchema = z.object({
  type: z.literal("policy.audibility.delta"),
  roomId: z.string(),
  participantId: z.string(),
  revision: z.number().int().nonnegative(),
  canHear: z.array(z.string()),
  timestampMs: z.number().int().nonnegative(),
});

export const PolicyErrorMessageSchema = z.object({
  type: z.literal("policy.error"),
  code: z.string(),
  message: z.string(),
  recoverable: z.boolean(),
});

export const PolicySnapshotRequestMessageSchema = z.object({
  type: z.literal("policy.snapshot.request"),
  fromRevision: z.number().int().nonnegative().optional(),
});

export const PolicySocketInboundSchema = z.discriminatedUnion("type", [
  PolicySnapshotRequestMessageSchema,
]);

export const PolicySocketOutboundSchema = z.discriminatedUnion("type", [
  PolicySnapshotMessageSchema,
  PolicyDeltaMessageSchema,
  PolicyErrorMessageSchema,
]);

export type Vec3 = z.infer<typeof Vec3Schema>;
export type Orientation = z.infer<typeof OrientationSchema>;
export type Pose = z.infer<typeof PoseSchema>;
export type VoiceSessionRequest = z.infer<typeof VoiceSessionRequestSchema>;
export type VoiceSessionResponse = z.infer<typeof VoiceSessionResponseSchema>;
export type PoseBatch = z.infer<typeof PoseBatchSchema>;
export type AudibilitySet = z.infer<typeof AudibilitySetSchema>;
export type PolicySocketInbound = z.infer<typeof PolicySocketInboundSchema>;
export type PolicySocketOutbound = z.infer<typeof PolicySocketOutboundSchema>;
