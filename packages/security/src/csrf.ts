import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Double-submit cookie CSRF protection.
 *
 * Flow:
 *   1. Server issues `csrfToken` (random 32B) + sets cookie `csrf_token=<token>`.
 *   2. Client includes the same token in the `X-CSRF-Token` header on mutations.
 *   3. Server verifies cookie === header AND HMAC signature is valid.
 *
 * The HMAC binds the token to the session secret so a stolen cookie alone is not enough
 * to forge a request from another origin.
 */

export const CSRF_COOKIE_NAME = "csrf_token";
export const CSRF_HEADER_NAME = "x-csrf-token";

export type CsrfTokenInput = {
  /** Hex-encoded HMAC key (>= 32 bytes recommended). Pulled from env at boot. */
  secret: string;
  /** Optional binding: per-session id, makes tokens session-scoped. */
  sessionId?: string;
};

export type IssuedCsrfToken = {
  token: string;
  cookieValue: string;
  headerValue: string;
};

const TOKEN_BYTES = 32;
const SEPARATOR = ".";

export function issueCsrfToken(input: CsrfTokenInput): IssuedCsrfToken {
  assertSecret(input.secret);
  const random = randomBytes(TOKEN_BYTES).toString("base64url");
  const signature = sign(input.secret, [random, input.sessionId ?? ""]);
  const token = `${random}${SEPARATOR}${signature}`;

  return {
    token,
    cookieValue: token,
    headerValue: token,
  };
}

export type CsrfVerifyInput = {
  secret: string;
  sessionId?: string;
  cookieValue: string | undefined;
  headerValue: string | undefined;
};

export type CsrfVerifyResult =
  | { ok: true }
  | { ok: false; reason: "missing" | "mismatch" | "invalid_signature" };

export function verifyCsrfToken(input: CsrfVerifyInput): CsrfVerifyResult {
  assertSecret(input.secret);
  const cookieValue = input.cookieValue?.trim();
  const headerValue = input.headerValue?.trim();

  if (!cookieValue || !headerValue) {
    return { ok: false, reason: "missing" };
  }

  if (!constantTimeEqual(cookieValue, headerValue)) {
    return { ok: false, reason: "mismatch" };
  }

  const [random, signature] = cookieValue.split(SEPARATOR);
  if (!random || !signature) {
    return { ok: false, reason: "invalid_signature" };
  }

  const expected = sign(input.secret, [random, input.sessionId ?? ""]);
  if (!constantTimeEqual(signature, expected)) {
    return { ok: false, reason: "invalid_signature" };
  }

  return { ok: true };
}

/**
 * Returns the Set-Cookie attributes appropriate for a CSRF cookie. The cookie must NOT
 * be HttpOnly (the client needs to read it to mirror into the header), but it should be
 * Secure + SameSite=Strict in production.
 */
export type CsrfCookieAttributes = {
  name: string;
  value: string;
  path: string;
  sameSite: "strict" | "lax" | "none";
  secure: boolean;
  httpOnly: false;
  maxAgeSeconds: number;
};

export function csrfCookie(value: string, options: { secure: boolean }): CsrfCookieAttributes {
  return {
    name: CSRF_COOKIE_NAME,
    value,
    path: "/",
    sameSite: "strict",
    secure: options.secure,
    httpOnly: false,
    maxAgeSeconds: 60 * 60 * 8,
  };
}

function sign(secret: string, parts: readonly string[]): string {
  return createHmac("sha256", secret).update(parts.join("|")).digest("base64url");
}

function constantTimeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function assertSecret(secret: string): void {
  if (!secret || secret.length < 32) {
    throw new Error("CSRF secret must be at least 32 characters");
  }
}
