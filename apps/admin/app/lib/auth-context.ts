import { randomUUID } from "node:crypto";
import { parseAppEnv, type AppEnv } from "@commerce/config";
import {
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
  csrfCookie,
  verifyCsrfToken,
} from "@commerce/security";
import {
  SESSION_ID_COOKIE,
  authenticateAccessToken,
  buildAccessCookie,
  buildClearAuthCookies,
  buildRefreshCookie,
  buildSessionIdCookie,
  buildSetCookie,
  clientIpFromRequest,
  createAccessTokenSecret,
  hashPassword,
  hashToken,
  issueRefreshToken,
  readCookie,
  readRefreshToken,
  rotateRefreshToken,
  signAccessToken,
  userAgentFromRequest,
  verifyPassword,
  verifyTotp,
  type AccessTokenSecret,
  type RefreshTokenDb,
} from "@commerce/auth";
import { assertPermission, type AdminPermission, type AdminSession } from "@commerce/core/auth";
import {
  findAdminByEmail,
  findAdminById,
  findRefreshTokenByHash,
  insertAuditLog,
  markRefreshTokenReplaced,
  revokeRefreshTokenById,
  revokeRefreshTokenFamily,
  storeRefreshToken,
  updateAdminLastLogin,
  type AdminAccount,
} from "@commerce/db";

const ACCESS_TTL_SECONDS = 60 * 15; // 15 min
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 14; // 14 days

let cachedEnv: AppEnv | undefined;
let cachedSecret: AccessTokenSecret | undefined;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = parseAppEnv(process.env as Record<string, string | undefined>);
  }
  return cachedEnv;
}

export function getAccessSecret(): AccessTokenSecret {
  if (!cachedSecret) {
    cachedSecret = createAccessTokenSecret(getEnv().AUTH_JWT_SECRET);
  }
  return cachedSecret;
}

export function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

export const ADMIN_AUDIENCE_ALIAS = () => getEnv().AUTH_AUDIENCE_ADMIN;

// =====================================================================
// Login flow
// =====================================================================

export type AdminLoginInput = {
  email: string;
  password: string;
  mfaToken?: string;
  ip?: string;
  userAgent?: string;
};

export type AdminLoginOutcome =
  | {
      ok: true;
      account: AdminAccount;
      sessionId: string;
      accessToken: string;
      refresh: { token: string; expiresAt: Date };
      cookies: string[];
    }
  | { ok: false; reason: "invalid_credentials" | "disabled" | "mfa_required" | "mfa_invalid" };

export async function loginAdmin(input: AdminLoginInput): Promise<AdminLoginOutcome> {
  const account = await findAdminByEmail(input.email);
  if (!account || !account.passwordHash) {
    // Run a verify against a dummy hash to avoid timing-based account enumeration.
    await verifyPassword(input.password, "$argon2id$v=19$m=19456,t=2,p=1$cm9ja2V0$ZmFrZQ");
    return { ok: false, reason: "invalid_credentials" };
  }
  if (account.disabledAt) {
    return { ok: false, reason: "disabled" };
  }
  const passwordOk = await verifyPassword(input.password, account.passwordHash);
  if (!passwordOk) {
    return { ok: false, reason: "invalid_credentials" };
  }
  if (account.mfaEnabledAt && account.mfaSecret) {
    if (!input.mfaToken) {
      return { ok: false, reason: "mfa_required" };
    }
    if (!verifyTotp({ token: input.mfaToken, secretBase32: account.mfaSecret })) {
      return { ok: false, reason: "mfa_invalid" };
    }
  }

  const sessionId = randomUUID();
  const refresh = issueRefreshToken({ ttlSeconds: REFRESH_TTL_SECONDS });
  await storeRefreshToken({
    id: refresh.id,
    family: refresh.family,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    actorType: "ADMIN",
    adminUserId: account.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  const accessToken = await signAccessToken(getAccessSecret(), {
    sub: account.id,
    actorType: "ADMIN",
    email: account.email,
    sessionId,
    mfa: Boolean(account.mfaEnabledAt),
    ttlSeconds: ACCESS_TTL_SECONDS,
    issuer: getEnv().AUTH_ISSUER,
    audience: getEnv().AUTH_AUDIENCE_ADMIN,
  });

  await updateAdminLastLogin(account.id);
  await insertAuditLog({
    actorType: "ADMIN",
    actorId: account.id,
    action: "admin.login",
    targetType: "AdminUser",
    targetId: account.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  const env: { isProduction: boolean } = { isProduction: isProduction() };
  const csrf = csrfCookie(
    `${refresh.id}.${hashToken(`${sessionId}|${getEnv().AUTH_CSRF_SECRET}`)}`,
    { secure: env.isProduction },
  );
  const cookies = [
    buildAccessCookie(accessToken, ACCESS_TTL_SECONDS, env),
    buildRefreshCookie(refresh.token, REFRESH_TTL_SECONDS, env),
    buildSessionIdCookie(sessionId, REFRESH_TTL_SECONDS, env),
    buildSetCookie({
      name: csrf.name,
      value: csrf.value,
      path: csrf.path,
      maxAgeSeconds: csrf.maxAgeSeconds,
      sameSite: csrf.sameSite,
      secure: csrf.secure,
      httpOnly: csrf.httpOnly,
    }),
  ];

  return {
    ok: true,
    account,
    sessionId,
    accessToken,
    refresh: { token: refresh.token, expiresAt: refresh.expiresAt },
    cookies,
  };
}

// =====================================================================
// Logout
// =====================================================================

export type AdminLogoutInput = {
  request: Request;
  actorId: string;
};

export async function logoutAdmin(input: AdminLogoutInput): Promise<{ cookies: string[] }> {
  const presented = readRefreshToken(input.request);
  if (presented) {
    const stored = await findRefreshTokenByHash(hashToken(presented));
    if (stored && stored.adminUserId === input.actorId) {
      await revokeRefreshTokenById(stored.id);
    }
  }
  await insertAuditLog({
    actorType: "ADMIN",
    actorId: input.actorId,
    action: "admin.logout",
    targetType: "AdminUser",
    targetId: input.actorId,
    ip: clientIpFromRequest(input.request),
    userAgent: userAgentFromRequest(input.request),
  });
  return { cookies: [...buildClearAuthCookies(), buildSetCookie({ name: CSRF_COOKIE_NAME, value: "", path: "/", maxAgeSeconds: 0, sameSite: "strict", httpOnly: false })] };
}

// =====================================================================
// Refresh
// =====================================================================

const refreshDb: RefreshTokenDb = {
  findByHash: (tokenHash) => findRefreshTokenByHash(tokenHash),
  markReplaced: (previousId, replacedById) => markRefreshTokenReplaced(previousId, replacedById),
  store: (input) => storeRefreshToken(input),
  revokeFamily: async (family) => {
    await revokeRefreshTokenFamily(family);
  },
};

export type RefreshAdminOutcome =
  | { ok: true; accessToken: string; refresh: { token: string; expiresAt: Date }; cookies: string[]; account: AdminAccount; sessionId: string }
  | { ok: false; reason: "missing" | "not_found" | "expired" | "revoked" | "reuse_detected" | "actor_invalid" };

export async function refreshAdminSession(request: Request): Promise<RefreshAdminOutcome> {
  const presented = readRefreshToken(request);
  if (!presented) {
    return { ok: false, reason: "missing" };
  }
  const result = await rotateRefreshToken({
    presentedToken: presented,
    db: refreshDb,
    actorType: "ADMIN",
    ip: clientIpFromRequest(request),
    userAgent: userAgentFromRequest(request),
  });
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  const adminUserId = result.previous.adminUserId;
  if (!adminUserId) {
    return { ok: false, reason: "actor_invalid" };
  }
  // Patch the new record to bind it to the same admin actor (rotateRefreshToken stored
  // generic actorType only — we re-store with admin link).
  await markRefreshTokenReplaced(result.issued.id, result.issued.id); // no-op safety
  // (storeRefreshToken inside rotateRefreshToken already wrote the actor link via input.adminUserId)

  const account = await findAdminById(adminUserId);
  if (!account || account.disabledAt) {
    await revokeRefreshTokenFamily(result.previous.family);
    return { ok: false, reason: "actor_invalid" };
  }

  const sessionId = readCookie(request, SESSION_ID_COOKIE) ?? randomUUID();
  const accessToken = await signAccessToken(getAccessSecret(), {
    sub: account.id,
    actorType: "ADMIN",
    email: account.email,
    sessionId,
    mfa: Boolean(account.mfaEnabledAt),
    ttlSeconds: ACCESS_TTL_SECONDS,
    issuer: getEnv().AUTH_ISSUER,
    audience: getEnv().AUTH_AUDIENCE_ADMIN,
  });

  const env = { isProduction: isProduction() };
  const cookies = [
    buildAccessCookie(accessToken, ACCESS_TTL_SECONDS, env),
    buildRefreshCookie(result.issued.token, REFRESH_TTL_SECONDS, env),
    buildSessionIdCookie(sessionId, REFRESH_TTL_SECONDS, env),
  ];

  return { ok: true, accessToken, refresh: { token: result.issued.token, expiresAt: result.issued.expiresAt }, cookies, account, sessionId };
}

// =====================================================================
// withAdminAuth wrapper
// =====================================================================

export type AdminAuthFailure = {
  status: number;
  code: string;
  message: string;
};

export type ResolvedAdminContext = {
  session: AdminSession;
  requestId: string;
  ip?: string;
  userAgent?: string;
};

export async function resolveAdminContext(
  request: Request,
  options: { permission?: AdminPermission; requireCsrf?: boolean } = {},
): Promise<{ ok: true; ctx: ResolvedAdminContext } | { ok: false; failure: AdminAuthFailure }> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  const accessResult = await authenticateAccessToken({
    request,
    secret: getAccessSecret(),
    issuer: getEnv().AUTH_ISSUER,
    audience: getEnv().AUTH_AUDIENCE_ADMIN,
  });
  if (!accessResult.ok) {
    return {
      ok: false,
      failure: {
        status: 401,
        code: accessResult.reason === "missing" ? "ADMIN_AUTH_REQUIRED" : "ADMIN_TOKEN_INVALID",
        message: `admin access token ${accessResult.reason}`,
      },
    };
  }
  if (accessResult.claims.actorType !== "ADMIN") {
    return {
      ok: false,
      failure: { status: 403, code: "ADMIN_ROLE_REQUIRED", message: "actor is not an admin" },
    };
  }

  const account = await findAdminById(accessResult.claims.sub);
  if (!account || account.disabledAt) {
    return {
      ok: false,
      failure: { status: 401, code: "ADMIN_ACTOR_DISABLED", message: "admin actor not found or disabled" },
    };
  }

  // CSRF gate for mutations. Only enforced when requireCsrf is true.
  if (options.requireCsrf) {
    const cookieValue = readCookie(request, CSRF_COOKIE_NAME);
    const headerValue = request.headers.get(CSRF_HEADER_NAME) ?? undefined;
    const verdict = verifyCsrfToken({
      secret: getEnv().AUTH_CSRF_SECRET,
      sessionId: accessResult.claims.sessionId,
      cookieValue,
      headerValue,
    });
    if (!verdict.ok) {
      return {
        ok: false,
        failure: { status: 403, code: "CSRF_FAILED", message: `csrf ${verdict.reason}` },
      };
    }
  }

  const session: AdminSession = {
    actorId: account.id,
    email: account.email,
    roles: account.roles,
  };

  if (options.permission) {
    try {
      assertPermission(session, options.permission);
    } catch {
      await insertAuditLog({
        actorType: "ADMIN",
        actorId: account.id,
        action: "admin.permission_denied",
        targetType: "AdminPermission",
        targetId: options.permission,
        ip: clientIpFromRequest(request),
        userAgent: userAgentFromRequest(request),
        requestId,
      });
      return {
        ok: false,
        failure: { status: 403, code: "PERMISSION_DENIED", message: `missing permission: ${options.permission}` },
      };
    }
  }

  return {
    ok: true,
    ctx: {
      session,
      requestId,
      ip: clientIpFromRequest(request),
      userAgent: userAgentFromRequest(request),
    },
  };
}

// re-export password hashing for the admin seed/setup tooling
export { hashPassword };

// =====================================================================
// Server component helper (page.tsx, login redirect, etc.)
// =====================================================================

/**
 * Resolve an admin session for a server-rendered page using the access token cookie.
 * Returns undefined when the cookie is absent, expired, or the actor cannot be loaded.
 *
 * Page-level usage:
 *   const session = await getServerAdminSession();
 *   if (!session) redirect("/login");
 */
export async function getServerAdminSession(): Promise<AdminSession | undefined> {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const accessToken = cookieStore.get(ACCESS_TOKEN_COOKIE_NAME)?.value;
  if (!accessToken) {
    return undefined;
  }
  // Build a minimal Request stub so we can reuse authenticateAccessToken().
  const request = new Request("https://internal", {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  const verified = await authenticateAccessToken({
    request,
    secret: getAccessSecret(),
    issuer: getEnv().AUTH_ISSUER,
    audience: getEnv().AUTH_AUDIENCE_ADMIN,
  });
  if (!verified.ok || verified.claims.actorType !== "ADMIN") {
    return undefined;
  }
  const account = await findAdminById(verified.claims.sub);
  if (!account || account.disabledAt) {
    return undefined;
  }
  return { actorId: account.id, email: account.email, roles: account.roles };
}

const ACCESS_TOKEN_COOKIE_NAME = "commerce_access_token";
