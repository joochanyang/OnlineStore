import { createHash, randomBytes, randomUUID } from "node:crypto";

/**
 * Refresh token primitives.
 *
 * Storage: only the SHA-256 of the token is persisted (`tokenHash`). The plaintext
 * `token` is returned to the client once via Set-Cookie and never stored.
 *
 * Rotation: every refresh issues a new token AND marks the previous one as
 * `replacedById = newToken.id`. If a *replaced* token is presented again, that's a
 * reuse signal — revoke the entire family and force the user to re-authenticate.
 */

export type IssuedRefreshToken = {
  id: string;
  family: string;
  token: string;
  tokenHash: string;
  expiresAt: Date;
};

export type IssueRefreshTokenInput = {
  family?: string;
  ttlSeconds?: number;
};

const DEFAULT_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

export function issueRefreshToken(input: IssueRefreshTokenInput = {}): IssuedRefreshToken {
  const id = randomUUID();
  const random = randomBytes(48).toString("base64url");
  const token = `${id}.${random}`;
  const family = input.family ?? randomUUID();
  const ttl = input.ttlSeconds ?? DEFAULT_TTL_SECONDS;

  return {
    id,
    family,
    token,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttl * 1000),
  };
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

import type { ActorType } from "./types";

export type StoredRefreshToken = {
  id: string;
  family: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  /** Optional metadata; populated by the DB layer when wiring in actor identity. */
  actorType?: ActorType;
  customerId?: string | null;
  adminUserId?: string | null;
};

export type RotationDecision =
  | { kind: "rotate"; previousId: string; family: string }
  | { kind: "reuse_detected"; family: string }
  | { kind: "expired" }
  | { kind: "revoked" }
  | { kind: "not_found" };

export function decideRotation(
  presented: string,
  stored: StoredRefreshToken | null,
): RotationDecision {
  if (!stored) {
    return { kind: "not_found" };
  }
  if (stored.tokenHash !== hashToken(presented)) {
    return { kind: "not_found" };
  }
  if (stored.replacedById) {
    // The token has already been rotated. Anyone presenting it again is suspicious.
    return { kind: "reuse_detected", family: stored.family };
  }
  if (stored.revokedAt) {
    return { kind: "revoked" };
  }
  if (stored.expiresAt.getTime() <= Date.now()) {
    return { kind: "expired" };
  }
  return { kind: "rotate", previousId: stored.id, family: stored.family };
}
