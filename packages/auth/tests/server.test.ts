import { describe, expect, it } from "vitest";
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  authenticateAccessToken,
  buildAccessCookie,
  buildClearAuthCookies,
  buildRefreshCookie,
  buildSetCookie,
  clientIpFromRequest,
  readAccessToken,
  readBearerToken,
  readCookie,
  rotateRefreshToken,
  type RefreshTokenDb,
} from "../src/server";
import {
  createAccessTokenSecret,
  signAccessToken,
} from "../src/jwt";
import { hashToken, issueRefreshToken } from "../src/refresh-token";

const HEX = "0".repeat(64);
const ISSUER = "commerce-test";
const AUDIENCE_WEB = "commerce-web";

function makeRequest(init?: { headers?: Record<string, string> }): Request {
  return new Request("https://example.com", { headers: init?.headers });
}

describe("cookie helpers", () => {
  it("builds a Set-Cookie string with attributes", () => {
    const cookie = buildSetCookie({
      name: "test",
      value: "value with space",
      path: "/",
      sameSite: "strict",
      secure: true,
      httpOnly: true,
      maxAgeSeconds: 60,
    });
    expect(cookie).toContain("test=value%20with%20space");
    expect(cookie).toContain("Path=/");
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("Secure");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Max-Age=60");
  });

  it("reads cookies from a Cookie header", () => {
    const request = makeRequest({
      headers: { cookie: `${ACCESS_TOKEN_COOKIE}=abc; ${REFRESH_TOKEN_COOKIE}=def` },
    });
    expect(readCookie(request, ACCESS_TOKEN_COOKIE)).toBe("abc");
    expect(readCookie(request, REFRESH_TOKEN_COOKIE)).toBe("def");
    expect(readCookie(request, "missing")).toBeUndefined();
  });

  it("reads bearer token from Authorization header", () => {
    const request = makeRequest({ headers: { authorization: "Bearer abc.def.ghi" } });
    expect(readBearerToken(request)).toBe("abc.def.ghi");
  });

  it("falls back to access cookie when no bearer is present", () => {
    const request = makeRequest({ headers: { cookie: `${ACCESS_TOKEN_COOKIE}=cookie-token` } });
    expect(readAccessToken(request)).toBe("cookie-token");
  });

  it("buildAccessCookie sets Lax + HttpOnly + Secure when prod", () => {
    const cookie = buildAccessCookie("token", 60, { isProduction: true });
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("Secure");
  });

  it("buildRefreshCookie sets Strict + HttpOnly", () => {
    const cookie = buildRefreshCookie("token", 60, { isProduction: false });
    expect(cookie).toContain("SameSite=Strict");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).not.toContain("Secure");
  });

  it("buildClearAuthCookies emits 3 cleared cookies", () => {
    const cookies = buildClearAuthCookies();
    expect(cookies).toHaveLength(3);
    for (const cookie of cookies) {
      expect(cookie).toContain("Max-Age=0");
    }
  });

  it("clientIpFromRequest prefers cf-connecting-ip", () => {
    const request = makeRequest({
      headers: {
        "cf-connecting-ip": "1.2.3.4",
        "x-forwarded-for": "9.9.9.9, 8.8.8.8",
      },
    });
    expect(clientIpFromRequest(request)).toBe("1.2.3.4");
  });
});

describe("authenticateAccessToken", () => {
  it("returns missing when no token is present", async () => {
    const secret = createAccessTokenSecret(HEX);
    const result = await authenticateAccessToken({
      request: makeRequest(),
      secret,
      issuer: ISSUER,
      audience: AUDIENCE_WEB,
    });
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("missing");
  });

  it("returns claims when bearer token is valid", async () => {
    const secret = createAccessTokenSecret(HEX);
    const token = await signAccessToken(secret, {
      sub: "actor-1",
      actorType: "ADMIN",
      email: "ops@example.com",
      sessionId: "sess-1",
      mfa: true,
      ttlSeconds: 60,
      issuer: ISSUER,
      audience: AUDIENCE_WEB,
    });
    const request = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    const result = await authenticateAccessToken({
      request,
      secret,
      issuer: ISSUER,
      audience: AUDIENCE_WEB,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.claims.sub).toBe("actor-1");
      expect(result.claims.actorType).toBe("ADMIN");
      expect(result.claims.mfa).toBe(true);
    }
  });

  it("rejects forged tokens with invalid_signature", async () => {
    const secret = createAccessTokenSecret(HEX);
    const otherSecret = createAccessTokenSecret("f".repeat(64));
    const token = await signAccessToken(otherSecret, {
      sub: "evil",
      actorType: "ADMIN",
      email: "evil@example.com",
      sessionId: "sess-evil",
      mfa: true,
      ttlSeconds: 60,
      issuer: ISSUER,
      audience: AUDIENCE_WEB,
    });
    const request = makeRequest({ headers: { authorization: `Bearer ${token}` } });
    const result = await authenticateAccessToken({
      request,
      secret,
      issuer: ISSUER,
      audience: AUDIENCE_WEB,
    });
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("invalid_signature");
  });
});

describe("rotateRefreshToken", () => {
  function createInMemoryDb(): RefreshTokenDb & {
    snapshot: Map<string, {
      id: string;
      family: string;
      tokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
      replacedById: string | null;
    }>;
  } {
    const records = new Map<string, {
      id: string;
      family: string;
      tokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
      replacedById: string | null;
    }>();

    return {
      snapshot: records,
      async findByHash(tokenHash) {
        for (const record of records.values()) {
          if (record.tokenHash === tokenHash) return record;
        }
        return undefined;
      },
      async markReplaced(previousId, replacedById) {
        const record = records.get(previousId);
        if (record) {
          record.replacedById = replacedById;
          record.revokedAt = new Date();
        }
      },
      async store(input) {
        records.set(input.id, {
          id: input.id,
          family: input.family,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          revokedAt: null,
          replacedById: null,
        });
      },
      async revokeFamily(family) {
        for (const record of records.values()) {
          if (record.family === family && !record.revokedAt) {
            record.revokedAt = new Date();
          }
        }
      },
    };
  }

  it("rotates a valid token and stores the replacement", async () => {
    const db = createInMemoryDb();
    const initial = issueRefreshToken();
    db.snapshot.set(initial.id, {
      id: initial.id,
      family: initial.family,
      tokenHash: initial.tokenHash,
      expiresAt: initial.expiresAt,
      revokedAt: null,
      replacedById: null,
    });

    const result = await rotateRefreshToken({
      presentedToken: initial.token,
      db,
      actorType: "CUSTOMER",
      customerId: "cust-1",
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.issued.family).toBe(initial.family);
      expect(db.snapshot.get(initial.id)?.replacedById).toBe(result.issued.id);
      expect(db.snapshot.get(result.issued.id)?.tokenHash).toBe(hashToken(result.issued.token));
    }
  });

  it("revokes the entire family on reuse", async () => {
    const db = createInMemoryDb();
    const initial = issueRefreshToken();
    // Already-rotated record (replacedById set) — anyone presenting this is suspicious
    db.snapshot.set(initial.id, {
      id: initial.id,
      family: initial.family,
      tokenHash: initial.tokenHash,
      expiresAt: initial.expiresAt,
      revokedAt: null,
      replacedById: "next-id",
    });
    // Sibling token in same family
    db.snapshot.set("sibling", {
      id: "sibling",
      family: initial.family,
      tokenHash: "sibling-hash",
      expiresAt: initial.expiresAt,
      revokedAt: null,
      replacedById: null,
    });

    const result = await rotateRefreshToken({
      presentedToken: initial.token,
      db,
      actorType: "CUSTOMER",
    });

    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("reuse_detected");
    expect(db.snapshot.get("sibling")?.revokedAt).toBeInstanceOf(Date);
  });

  it("returns expired for stale tokens", async () => {
    const db = createInMemoryDb();
    const initial = issueRefreshToken({ ttlSeconds: 1 });
    db.snapshot.set(initial.id, {
      id: initial.id,
      family: initial.family,
      tokenHash: initial.tokenHash,
      expiresAt: new Date(Date.now() - 1000),
      revokedAt: null,
      replacedById: null,
    });

    const result = await rotateRefreshToken({
      presentedToken: initial.token,
      db,
      actorType: "CUSTOMER",
    });
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("expired");
  });
});
