import { decideRotation, hashToken, issueRefreshToken, type StoredRefreshToken } from "./refresh-token";
import { verifyAccessToken, type AccessTokenClaims, type AccessTokenSecret } from "./jwt";
import type { ActorType } from "./types";

/**
 * Server-side primitives for HTTP route handlers (Next.js Route Handlers, Hono, etc.).
 * Framework-neutral: relies only on Web `Request`/`Headers`. Database-neutral: refresh
 * rotation accepts a `RefreshTokenDb` adapter so callers wire their own persistence.
 */

export const ACCESS_TOKEN_COOKIE = "commerce_access_token";
export const REFRESH_TOKEN_COOKIE = "commerce_refresh_token";
export const SESSION_ID_COOKIE = "commerce_session_id";

export type CookieAttributes = {
  name: string;
  value: string;
  path?: string;
  domain?: string;
  maxAgeSeconds?: number;
  expires?: Date;
  sameSite?: "strict" | "lax" | "none";
  secure?: boolean;
  httpOnly?: boolean;
};

export function buildSetCookie(attrs: CookieAttributes): string {
  const parts: string[] = [`${attrs.name}=${encodeURIComponent(attrs.value)}`];
  if (attrs.path) parts.push(`Path=${attrs.path}`);
  if (attrs.domain) parts.push(`Domain=${attrs.domain}`);
  if (attrs.maxAgeSeconds !== undefined) parts.push(`Max-Age=${attrs.maxAgeSeconds}`);
  if (attrs.expires) parts.push(`Expires=${attrs.expires.toUTCString()}`);
  if (attrs.sameSite) parts.push(`SameSite=${capitalize(attrs.sameSite)}`);
  if (attrs.secure) parts.push("Secure");
  if (attrs.httpOnly) parts.push("HttpOnly");
  return parts.join("; ");
}

export function buildClearCookie(name: string, path = "/"): string {
  return buildSetCookie({
    name,
    value: "",
    path,
    maxAgeSeconds: 0,
    expires: new Date(0),
    sameSite: "lax",
    httpOnly: true,
  });
}

export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) {
    return undefined;
  }
  for (const fragment of header.split(";")) {
    const trimmed = fragment.trim();
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq);
    if (key !== name) continue;
    const value = trimmed.slice(eq + 1);
    return decodeSafe(value);
  }
  return undefined;
}

export function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization");
  if (!authorization?.toLowerCase().startsWith("bearer ")) {
    return undefined;
  }
  const token = authorization.slice(7).trim();
  return token || undefined;
}

export function readAccessToken(request: Request): string | undefined {
  return readBearerToken(request) ?? readCookie(request, ACCESS_TOKEN_COOKIE);
}

export function readRefreshToken(request: Request): string | undefined {
  return readCookie(request, REFRESH_TOKEN_COOKIE);
}

export type AuthCookieEnv = {
  isProduction: boolean;
  /** Domain to bind the cookie to. Default: omit (host-only). */
  domain?: string;
};

export function buildAccessCookie(token: string, ttlSeconds: number, env: AuthCookieEnv): string {
  return buildSetCookie({
    name: ACCESS_TOKEN_COOKIE,
    value: token,
    path: "/",
    domain: env.domain,
    maxAgeSeconds: ttlSeconds,
    sameSite: "lax",
    secure: env.isProduction,
    httpOnly: true,
  });
}

export function buildRefreshCookie(token: string, ttlSeconds: number, env: AuthCookieEnv): string {
  return buildSetCookie({
    name: REFRESH_TOKEN_COOKIE,
    value: token,
    path: "/",
    domain: env.domain,
    maxAgeSeconds: ttlSeconds,
    sameSite: "strict",
    secure: env.isProduction,
    httpOnly: true,
  });
}

export function buildSessionIdCookie(sessionId: string, ttlSeconds: number, env: AuthCookieEnv): string {
  // Mirrors the refresh cookie lifetime; readable by JS for CSRF binding only when needed.
  return buildSetCookie({
    name: SESSION_ID_COOKIE,
    value: sessionId,
    path: "/",
    domain: env.domain,
    maxAgeSeconds: ttlSeconds,
    sameSite: "strict",
    secure: env.isProduction,
    httpOnly: true,
  });
}

export function buildClearAuthCookies(): string[] {
  return [
    buildClearCookie(ACCESS_TOKEN_COOKIE),
    buildClearCookie(REFRESH_TOKEN_COOKIE),
    buildClearCookie(SESSION_ID_COOKIE),
  ];
}

// =====================================================================
// Access-token authentication
// =====================================================================

export type AuthenticateAccessTokenInput = {
  request: Request;
  secret: AccessTokenSecret;
  issuer: string;
  audience: string;
  /** Allow N seconds clock skew. Default 5. */
  clockToleranceSec?: number;
};

export type AuthenticateAccessTokenResult =
  | { ok: true; claims: AccessTokenClaims }
  | { ok: false; reason: "missing" | "expired" | "invalid_signature" | "claim_mismatch" | "malformed" };

export async function authenticateAccessToken(
  input: AuthenticateAccessTokenInput,
): Promise<AuthenticateAccessTokenResult> {
  const token = readAccessToken(input.request);
  if (!token) {
    return { ok: false, reason: "missing" };
  }
  const verified = await verifyAccessToken({
    token,
    secret: input.secret,
    issuer: input.issuer,
    audience: input.audience,
    clockToleranceSec: input.clockToleranceSec,
  });
  if (!verified.ok) {
    return verified;
  }
  // Drop the JWTPayload extras (iat/exp/iss/aud) — caller doesn't need them.
  return {
    ok: true,
    claims: {
      sub: verified.claims.sub,
      actorType: verified.claims.actorType,
      email: verified.claims.email,
      sessionId: verified.claims.sessionId,
      mfa: verified.claims.mfa,
    },
  };
}

export function requireActorType(claims: AccessTokenClaims, expected: ActorType): boolean {
  return claims.actorType === expected;
}

// =====================================================================
// Refresh-token rotation
// =====================================================================

export type RefreshTokenDb = {
  findByHash(tokenHash: string): Promise<StoredRefreshToken | undefined>;
  markReplaced(previousId: string, replacedById: string): Promise<void>;
  store(input: {
    id: string;
    family: string;
    tokenHash: string;
    expiresAt: Date;
    actorType: ActorType;
    customerId?: string;
    adminUserId?: string;
    ip?: string;
    userAgent?: string;
  }): Promise<void>;
  revokeFamily(family: string): Promise<void>;
};

export type RotateRefreshTokenInput = {
  presentedToken: string;
  db: RefreshTokenDb;
  actorType: ActorType;
  customerId?: string;
  adminUserId?: string;
  newTtlSeconds?: number;
  ip?: string;
  userAgent?: string;
};

export type RotateRefreshTokenResult =
  | {
      ok: true;
      issued: {
        id: string;
        family: string;
        token: string;
        expiresAt: Date;
      };
      previous: StoredRefreshToken;
    }
  | { ok: false; reason: "not_found" | "expired" | "revoked" | "reuse_detected" };

export async function rotateRefreshToken(input: RotateRefreshTokenInput): Promise<RotateRefreshTokenResult> {
  const stored = await input.db.findByHash(hashToken(input.presentedToken));
  const decision = decideRotation(input.presentedToken, stored ?? null);

  if (decision.kind === "reuse_detected") {
    // Burn the entire family — someone replayed a rotated token.
    await input.db.revokeFamily(decision.family);
    return { ok: false, reason: "reuse_detected" };
  }
  if (decision.kind !== "rotate") {
    return { ok: false, reason: decision.kind };
  }

  const next = issueRefreshToken({
    family: decision.family,
    ttlSeconds: input.newTtlSeconds,
  });

  await input.db.store({
    id: next.id,
    family: next.family,
    tokenHash: next.tokenHash,
    expiresAt: next.expiresAt,
    actorType: input.actorType,
    customerId: input.customerId,
    adminUserId: input.adminUserId,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  await input.db.markReplaced(decision.previousId, next.id);

  // We know stored is defined when decision.kind === "rotate"
  if (!stored) {
    throw new Error("invariant violated: rotate decision without stored token");
  }

  return {
    ok: true,
    issued: {
      id: next.id,
      family: next.family,
      token: next.token,
      expiresAt: next.expiresAt,
    },
    previous: stored,
  };
}

// =====================================================================
// Helpers
// =====================================================================

export function clientIpFromRequest(request: Request): string | undefined {
  // Trust common proxy headers in this priority order.
  const candidates = [
    request.headers.get("cf-connecting-ip"),
    request.headers.get("x-real-ip"),
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim(),
  ];
  for (const candidate of candidates) {
    if (candidate) {
      return candidate;
    }
  }
  return undefined;
}

export function userAgentFromRequest(request: Request): string | undefined {
  return request.headers.get("user-agent") ?? undefined;
}

function decodeSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}
