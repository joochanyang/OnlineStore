import { describe, expect, it } from "vitest";
import {
  createAccessTokenSecret,
  signAccessToken,
  verifyAccessToken,
} from "../src/jwt";

const HEX_SECRET = "0".repeat(64);
const ISSUER = "commerce-test";
const AUDIENCE = "commerce-web";

describe("access token jwt", () => {
  it("signs and verifies a token round-trip", async () => {
    const secret = createAccessTokenSecret(HEX_SECRET);
    const token = await signAccessToken(secret, {
      sub: "actor-1",
      actorType: "ADMIN",
      email: "ops@example.com",
      sessionId: "session-1",
      mfa: true,
      ttlSeconds: 60,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const result = await verifyAccessToken({
      token,
      secret,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("actor-1");
      expect(result.claims.actorType).toBe("ADMIN");
      expect(result.claims.mfa).toBe(true);
    }
  });

  it("rejects tampered signatures", async () => {
    const secret = createAccessTokenSecret(HEX_SECRET);
    const otherSecret = createAccessTokenSecret("f".repeat(64));
    const token = await signAccessToken(secret, {
      sub: "actor-2",
      actorType: "CUSTOMER",
      email: "user@example.com",
      sessionId: "session-x",
      mfa: false,
      ttlSeconds: 60,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const result = await verifyAccessToken({
      token,
      secret: otherSecret,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("invalid_signature");
  });

  it("rejects expired tokens", async () => {
    const secret = createAccessTokenSecret(HEX_SECRET);
    const token = await signAccessToken(secret, {
      sub: "actor-3",
      actorType: "CUSTOMER",
      email: "expired@example.com",
      sessionId: "session-e",
      mfa: false,
      ttlSeconds: -60,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const result = await verifyAccessToken({
      token,
      secret,
      issuer: ISSUER,
      audience: AUDIENCE,
      clockToleranceSec: 0,
    });

    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("expired");
  });

  it("rejects audience mismatch", async () => {
    const secret = createAccessTokenSecret(HEX_SECRET);
    const token = await signAccessToken(secret, {
      sub: "actor-4",
      actorType: "ADMIN",
      email: "owner@example.com",
      sessionId: "session-y",
      mfa: true,
      ttlSeconds: 60,
      issuer: ISSUER,
      audience: AUDIENCE,
    });

    const result = await verifyAccessToken({
      token,
      secret,
      issuer: ISSUER,
      audience: "other-audience",
    });

    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("claim_mismatch");
  });

  it("requires a sufficiently long secret", () => {
    expect(() => createAccessTokenSecret("short")).toThrow();
  });
});
