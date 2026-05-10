import { randomBytes, randomUUID } from "node:crypto";

import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  verifyCsrfToken,
} from "@commerce/security";
import {
  authenticateAccessToken,
  buildSetCookie,
  clientIpFromRequest,
  readCookie,
  userAgentFromRequest,
} from "@commerce/auth";
import { findCustomerById, type CartIdentity } from "@commerce/db";

import { getEnv } from "./auth-context";

export const CART_TOKEN_COOKIE = "cart_token";
const CART_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60;
const CART_TOKEN_BYTES = 32;
const ANON_CSRF_SESSION_PREFIX = "cart:";

let cachedAccessSecret: import("@commerce/auth").AccessTokenSecret | undefined;

async function getAccessSecret(): Promise<import("@commerce/auth").AccessTokenSecret> {
  if (!cachedAccessSecret) {
    const { createAccessTokenSecret } = await import("@commerce/auth");
    cachedAccessSecret = createAccessTokenSecret(getEnv().AUTH_JWT_SECRET);
  }
  return cachedAccessSecret;
}

export type CartIdentityResolution =
  | {
      ok: true;
      identity: CartIdentity;
      kind: "customer" | "anonymous";
      mintedSetCookie?: string;
      requestId: string;
      csrfSessionId: string;
      ip?: string;
      userAgent?: string;
    }
  | {
      ok: false;
      failure: { status: number; code: string; message: string };
    };

function mintCartToken(): { token: string; setCookie: string } {
  const token = randomBytes(CART_TOKEN_BYTES).toString("hex");
  const isProd = getEnv().NODE_ENV === "production";
  const setCookie = buildSetCookie({
    name: CART_TOKEN_COOKIE,
    value: token,
    path: "/",
    maxAgeSeconds: CART_TOKEN_TTL_SECONDS,
    sameSite: "lax",
    httpOnly: true,
    secure: isProd,
  });
  return { token, setCookie };
}

export async function resolveCartIdentity(
  request: Request,
  options: { requireCsrf?: boolean } = {},
): Promise<CartIdentityResolution> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  const accessResult = await authenticateAccessToken({
    request,
    secret: await getAccessSecret(),
    issuer: getEnv().AUTH_ISSUER,
    audience: getEnv().AUTH_AUDIENCE_WEB,
  });

  if (accessResult.ok && accessResult.claims.actorType === "CUSTOMER") {
    const account = await findCustomerById(accessResult.claims.sub);
    if (!account || account.disabledAt || account.dormantAt) {
      return {
        ok: false,
        failure: {
          status: 401,
          code: "CUSTOMER_ACTOR_DISABLED",
          message: "customer not active",
        },
      };
    }

    if (options.requireCsrf) {
      const verdict = verifyCsrfToken({
        secret: getEnv().AUTH_CSRF_SECRET,
        sessionId: accessResult.claims.sessionId,
        cookieValue: readCookie(request, CSRF_COOKIE_NAME),
        headerValue: request.headers.get(CSRF_HEADER_NAME) ?? undefined,
      });
      if (!verdict.ok) {
        return {
          ok: false,
          failure: { status: 403, code: "CSRF_FAILED", message: `csrf ${verdict.reason}` },
        };
      }
    }

    return {
      ok: true,
      identity: { type: "customer", customerId: account.id },
      kind: "customer",
      requestId,
      csrfSessionId: accessResult.claims.sessionId,
      ip: clientIpFromRequest(request),
      userAgent: userAgentFromRequest(request),
    };
  }

  // Guest path. Re-use existing cart_token, mint a new one if missing.
  const existing = readCookie(request, CART_TOKEN_COOKIE);
  let token = existing;
  let mintedSetCookie: string | undefined;
  if (!token) {
    const minted = mintCartToken();
    token = minted.token;
    mintedSetCookie = minted.setCookie;
  }

  if (options.requireCsrf) {
    const verdict = verifyCsrfToken({
      secret: getEnv().AUTH_CSRF_SECRET,
      sessionId: `${ANON_CSRF_SESSION_PREFIX}${token}`,
      cookieValue: readCookie(request, CSRF_COOKIE_NAME),
      headerValue: request.headers.get(CSRF_HEADER_NAME) ?? undefined,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        failure: { status: 403, code: "CSRF_FAILED", message: `csrf ${verdict.reason}` },
      };
    }
  }

  return {
    ok: true,
    identity: { type: "anonymous", anonymousToken: token },
    kind: "anonymous",
    mintedSetCookie,
    requestId,
    csrfSessionId: `${ANON_CSRF_SESSION_PREFIX}${token}`,
    ip: clientIpFromRequest(request),
    userAgent: userAgentFromRequest(request),
  };
}

export function appendSetCookie(headers: Headers, setCookieValue: string | undefined): void {
  if (!setCookieValue) return;
  headers.append("set-cookie", setCookieValue);
}
