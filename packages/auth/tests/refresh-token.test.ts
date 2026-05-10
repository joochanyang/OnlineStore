import { describe, expect, it } from "vitest";
import { decideRotation, hashToken, issueRefreshToken } from "../src/refresh-token";

describe("refresh token rotation", () => {
  it("issues a token, hash, family, and expiry", () => {
    const issued = issueRefreshToken({ ttlSeconds: 60 });
    expect(issued.token.split(".").length).toBe(2);
    expect(issued.tokenHash).toBe(hashToken(issued.token));
    expect(issued.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(issued.family).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("decides to rotate when token matches an active record", () => {
    const issued = issueRefreshToken();
    const decision = decideRotation(issued.token, {
      id: issued.id,
      family: issued.family,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      revokedAt: null,
      replacedById: null,
    });
    expect(decision.kind).toBe("rotate");
  });

  it("flags reuse when a replaced token is presented again", () => {
    const issued = issueRefreshToken();
    const decision = decideRotation(issued.token, {
      id: issued.id,
      family: issued.family,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      revokedAt: null,
      replacedById: "next-token-id",
    });
    expect(decision.kind).toBe("reuse_detected");
  });

  it("returns expired when past the deadline", () => {
    const issued = issueRefreshToken();
    const decision = decideRotation(issued.token, {
      id: issued.id,
      family: issued.family,
      tokenHash: issued.tokenHash,
      expiresAt: new Date(Date.now() - 1_000),
      revokedAt: null,
      replacedById: null,
    });
    expect(decision.kind).toBe("expired");
  });

  it("returns revoked when explicitly revoked", () => {
    const issued = issueRefreshToken();
    const decision = decideRotation(issued.token, {
      id: issued.id,
      family: issued.family,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      revokedAt: new Date(),
      replacedById: null,
    });
    expect(decision.kind).toBe("revoked");
  });

  it("returns not_found when nothing matches", () => {
    const issued = issueRefreshToken();
    const decision = decideRotation("bogus.token", {
      id: issued.id,
      family: issued.family,
      tokenHash: issued.tokenHash,
      expiresAt: issued.expiresAt,
      revokedAt: null,
      replacedById: null,
    });
    expect(decision.kind).toBe("not_found");
  });
});
