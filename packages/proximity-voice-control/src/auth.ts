import jwt from "jsonwebtoken";

export interface PolicySocketClaims {
  roomId: string;
  participantId: string;
}

export function assertControlAuth(headerValue: string | undefined, expectedToken: string): void {
  const [scheme, token] = (headerValue ?? "").split(" ");
  if (scheme !== "Bearer" || token !== expectedToken) {
    throw new Error("Unauthorized");
  }
}

export function mintPolicySocketToken(claims: PolicySocketClaims, secret: string, expiresInSec: number): string {
  return jwt.sign(claims, secret, {
    algorithm: "HS256",
    expiresIn: expiresInSec,
  });
}

export function verifyPolicySocketToken(token: string, secret: string): PolicySocketClaims {
  const decoded = jwt.verify(token, secret);
  if (typeof decoded !== "object" || decoded === null) {
    throw new Error("Invalid socket token");
  }
  const roomId = decoded["roomId"];
  const participantId = decoded["participantId"];
  if (typeof roomId !== "string" || typeof participantId !== "string") {
    throw new Error("Invalid socket claims");
  }
  return { roomId, participantId };
}
