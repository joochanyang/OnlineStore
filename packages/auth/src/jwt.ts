import { SignJWT, jwtVerify, type JWTPayload } from "jose";
import type { ActorType } from "./types";

export type AccessTokenClaims = {
  sub: string;
  actorType: ActorType;
  email: string;
  sessionId: string;
  mfa: boolean;
};

export type AccessTokenSignInput = AccessTokenClaims & {
  /** Expiry in seconds. Recommend 900 (15 min) for access tokens. */
  ttlSeconds: number;
  issuer: string;
  audience: string;
};

export type AccessTokenSecret = {
  /** Symmetric key (HS256). Must be >= 32 bytes. */
  key: Uint8Array;
};

export function createAccessTokenSecret(rawHex: string): AccessTokenSecret {
  if (!rawHex || rawHex.length < 64) {
    throw new Error("JWT secret must be a hex string of at least 64 chars (32 bytes)");
  }
  return { key: hexToBytes(rawHex) };
}

export async function signAccessToken(
  secret: AccessTokenSecret,
  input: AccessTokenSignInput,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({
    actorType: input.actorType,
    email: input.email,
    sessionId: input.sessionId,
    mfa: input.mfa,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.sub)
    .setIssuer(input.issuer)
    .setAudience(input.audience)
    .setIssuedAt(now)
    .setExpirationTime(now + input.ttlSeconds)
    .sign(secret.key);
}

export type VerifyAccessTokenInput = {
  token: string;
  secret: AccessTokenSecret;
  issuer: string;
  audience: string;
  /** Allow up to N seconds of clock skew. Default 5. */
  clockToleranceSec?: number;
};

export type VerifyAccessTokenResult =
  | { ok: true; claims: AccessTokenClaims & JWTPayload }
  | { ok: false; reason: "expired" | "invalid_signature" | "claim_mismatch" | "malformed" };

export async function verifyAccessToken(
  input: VerifyAccessTokenInput,
): Promise<VerifyAccessTokenResult> {
  try {
    const { payload } = await jwtVerify(input.token, input.secret.key, {
      issuer: input.issuer,
      audience: input.audience,
      clockTolerance: input.clockToleranceSec ?? 5,
    });

    if (
      typeof payload.sub !== "string" ||
      typeof payload.email !== "string" ||
      typeof payload.sessionId !== "string" ||
      typeof payload.mfa !== "boolean" ||
      typeof payload.actorType !== "string"
    ) {
      return { ok: false, reason: "claim_mismatch" };
    }

    return {
      ok: true,
      claims: {
        ...payload,
        sub: payload.sub,
        actorType: payload.actorType as ActorType,
        email: payload.email,
        sessionId: payload.sessionId,
        mfa: payload.mfa,
      },
    };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ERR_JWT_EXPIRED") {
      return { ok: false, reason: "expired" };
    }
    if (code === "ERR_JWS_SIGNATURE_VERIFICATION_FAILED") {
      return { ok: false, reason: "invalid_signature" };
    }
    if (code === "ERR_JWT_CLAIM_VALIDATION_FAILED") {
      return { ok: false, reason: "claim_mismatch" };
    }
    return { ok: false, reason: "malformed" };
  }
}

function hexToBytes(hex: string): Uint8Array {
  const clean = hex.startsWith("0x") ? hex.slice(2) : hex;
  if (clean.length % 2 !== 0) {
    throw new Error("hex string must have even length");
  }
  const bytes = new Uint8Array(clean.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Number.parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}
