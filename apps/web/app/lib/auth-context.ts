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
  validatePasswordPolicy,
  verifyPassword,
  type AccessTokenSecret,
  type RefreshTokenDb,
} from "@commerce/auth";
import {
  createCustomerWithConsents,
  findCustomerByEmail,
  findCustomerById,
  findRefreshTokenByHash,
  insertAuditLog,
  markRefreshTokenReplaced,
  revokeRefreshTokenById,
  revokeRefreshTokenFamily,
  storeRefreshToken,
  updateCustomerLastLogin,
  type ConsentSource,
  type ConsentType,
  type CustomerAccount,
} from "@commerce/db";

const ACCESS_TTL_SECONDS = 60 * 15;
const REFRESH_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 days for shoppers

let cachedEnv: AppEnv | undefined;
let cachedSecret: AccessTokenSecret | undefined;

export function getEnv(): AppEnv {
  if (!cachedEnv) {
    cachedEnv = parseAppEnv(process.env as Record<string, string | undefined>);
  }
  return cachedEnv;
}

function getAccessSecret(): AccessTokenSecret {
  if (!cachedSecret) {
    cachedSecret = createAccessTokenSecret(getEnv().AUTH_JWT_SECRET);
  }
  return cachedSecret;
}

function isProduction(): boolean {
  return getEnv().NODE_ENV === "production";
}

const refreshDb: RefreshTokenDb = {
  findByHash: (tokenHash) => findRefreshTokenByHash(tokenHash),
  markReplaced: (previousId, replacedById) => markRefreshTokenReplaced(previousId, replacedById),
  store: (input) => storeRefreshToken(input),
  revokeFamily: async (family) => {
    await revokeRefreshTokenFamily(family);
  },
};

// =====================================================================
// Signup
// =====================================================================

export type CustomerSignupConsent = {
  type: ConsentType;
  granted: boolean;
  source?: ConsentSource;
};

export type CustomerSignupInput = {
  email: string;
  name: string;
  phone?: string;
  password: string;
  consents: CustomerSignupConsent[];
  ip?: string;
  userAgent?: string;
};

export type CustomerSignupOutcome =
  | {
      ok: true;
      account: CustomerAccount;
      sessionId: string;
      cookies: string[];
    }
  | { ok: false; reason: "weak_password" | "email_in_use" | "missing_required_consent" };

const REQUIRED_SIGNUP_CONSENTS: ConsentType[] = ["TERMS", "PRIVACY"];

export async function signupCustomer(input: CustomerSignupInput): Promise<CustomerSignupOutcome> {
  const policy = validatePasswordPolicy(input.password);
  if (!policy.ok) {
    return { ok: false, reason: "weak_password" };
  }

  const consentMap = new Map(input.consents.map((c) => [c.type, c.granted]));
  for (const required of REQUIRED_SIGNUP_CONSENTS) {
    if (!consentMap.get(required)) {
      return { ok: false, reason: "missing_required_consent" };
    }
  }

  const existing = await findCustomerByEmail(input.email);
  if (existing) {
    return { ok: false, reason: "email_in_use" };
  }

  const passwordHash = await hashPassword(input.password);
  const account = await createCustomerWithConsents({
    email: input.email,
    name: input.name,
    phone: input.phone,
    passwordHash,
    consents: input.consents.map((consent) => ({
      type: consent.type,
      granted: consent.granted,
      source: consent.source ?? "SIGNUP",
      ip: input.ip,
      userAgent: input.userAgent,
    })),
  });

  const session = await issueCustomerSession(account, input.ip, input.userAgent);
  await insertAuditLog({
    actorType: "CUSTOMER",
    actorId: account.id,
    action: "customer.signup",
    targetType: "Customer",
    targetId: account.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { ok: true, account, sessionId: session.sessionId, cookies: session.cookies };
}

// =====================================================================
// Login
// =====================================================================

export type CustomerLoginInput = {
  email: string;
  password: string;
  ip?: string;
  userAgent?: string;
};

export type CustomerLoginOutcome =
  | { ok: true; account: CustomerAccount; sessionId: string; cookies: string[] }
  | { ok: false; reason: "invalid_credentials" | "disabled" | "dormant" };

export async function loginCustomer(input: CustomerLoginInput): Promise<CustomerLoginOutcome> {
  const account = await findCustomerByEmail(input.email);
  if (!account || !account.passwordHash) {
    await verifyPassword(input.password, "$argon2id$v=19$m=19456,t=2,p=1$cm9ja2V0$ZmFrZQ");
    return { ok: false, reason: "invalid_credentials" };
  }
  if (account.disabledAt) {
    return { ok: false, reason: "disabled" };
  }
  if (account.dormantAt) {
    // Dormant accounts must be reactivated via email re-verification (out of scope here).
    return { ok: false, reason: "dormant" };
  }
  const passwordOk = await verifyPassword(input.password, account.passwordHash);
  if (!passwordOk) {
    return { ok: false, reason: "invalid_credentials" };
  }

  const session = await issueCustomerSession(account, input.ip, input.userAgent);
  await updateCustomerLastLogin(account.id);
  await insertAuditLog({
    actorType: "CUSTOMER",
    actorId: account.id,
    action: "customer.login",
    targetType: "Customer",
    targetId: account.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { ok: true, account, sessionId: session.sessionId, cookies: session.cookies };
}

// =====================================================================
// Logout
// =====================================================================

export type CustomerLogoutInput = {
  request: Request;
  actorId: string;
};

export async function logoutCustomer(input: CustomerLogoutInput): Promise<{ cookies: string[] }> {
  const presented = readRefreshToken(input.request);
  if (presented) {
    const stored = await findRefreshTokenByHash(hashToken(presented));
    if (stored && stored.customerId === input.actorId) {
      await revokeRefreshTokenById(stored.id);
    }
  }
  await insertAuditLog({
    actorType: "CUSTOMER",
    actorId: input.actorId,
    action: "customer.logout",
    targetType: "Customer",
    targetId: input.actorId,
    ip: clientIpFromRequest(input.request),
    userAgent: userAgentFromRequest(input.request),
  });

  return {
    cookies: [
      ...buildClearAuthCookies(),
      buildSetCookie({
        name: CSRF_COOKIE_NAME,
        value: "",
        path: "/",
        maxAgeSeconds: 0,
        sameSite: "strict",
        httpOnly: false,
      }),
    ],
  };
}

// =====================================================================
// Refresh
// =====================================================================

export type RefreshCustomerOutcome =
  | { ok: true; account: CustomerAccount; sessionId: string; cookies: string[]; refresh: { token: string; expiresAt: Date } }
  | { ok: false; reason: "missing" | "not_found" | "expired" | "revoked" | "reuse_detected" | "actor_invalid" };

export async function refreshCustomerSession(request: Request): Promise<RefreshCustomerOutcome> {
  const presented = readRefreshToken(request);
  if (!presented) {
    return { ok: false, reason: "missing" };
  }
  const result = await rotateRefreshToken({
    presentedToken: presented,
    db: refreshDb,
    actorType: "CUSTOMER",
    customerId: undefined,
    ip: clientIpFromRequest(request),
    userAgent: userAgentFromRequest(request),
  });
  if (!result.ok) {
    return { ok: false, reason: result.reason };
  }
  const customerId = result.previous.customerId;
  if (!customerId) {
    return { ok: false, reason: "actor_invalid" };
  }
  const account = await findCustomerById(customerId);
  if (!account || account.disabledAt || account.dormantAt) {
    await revokeRefreshTokenFamily(result.previous.family);
    return { ok: false, reason: "actor_invalid" };
  }

  const sessionId = readCookie(request, SESSION_ID_COOKIE) ?? randomUUID();
  const accessToken = await signAccessToken(getAccessSecret(), {
    sub: account.id,
    actorType: "CUSTOMER",
    email: account.email,
    sessionId,
    mfa: false,
    ttlSeconds: ACCESS_TTL_SECONDS,
    issuer: getEnv().AUTH_ISSUER,
    audience: getEnv().AUTH_AUDIENCE_WEB,
  });

  const env = { isProduction: isProduction() };
  const cookies = [
    buildAccessCookie(accessToken, ACCESS_TTL_SECONDS, env),
    buildRefreshCookie(result.issued.token, REFRESH_TTL_SECONDS, env),
    buildSessionIdCookie(sessionId, REFRESH_TTL_SECONDS, env),
  ];

  return { ok: true, account, sessionId, cookies, refresh: result.issued };
}

// =====================================================================
// withCustomerAuth
// =====================================================================

export type CustomerAuthFailure = {
  status: number;
  code: string;
  message: string;
};

export type CustomerSession = {
  customerId: string;
  email: string;
  name: string;
};

export type ResolvedCustomerContext = {
  session: CustomerSession;
  requestId: string;
  ip?: string;
  userAgent?: string;
};

export async function resolveCustomerContext(
  request: Request,
  options: { requireCsrf?: boolean } = {},
): Promise<{ ok: true; ctx: ResolvedCustomerContext } | { ok: false; failure: CustomerAuthFailure }> {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  const accessResult = await authenticateAccessToken({
    request,
    secret: getAccessSecret(),
    issuer: getEnv().AUTH_ISSUER,
    audience: getEnv().AUTH_AUDIENCE_WEB,
  });
  if (!accessResult.ok) {
    return {
      ok: false,
      failure: {
        status: 401,
        code: accessResult.reason === "missing" ? "AUTH_REQUIRED" : "TOKEN_INVALID",
        message: `customer access token ${accessResult.reason}`,
      },
    };
  }
  if (accessResult.claims.actorType !== "CUSTOMER") {
    return {
      ok: false,
      failure: { status: 403, code: "CUSTOMER_ROLE_REQUIRED", message: "actor is not a customer" },
    };
  }

  const account = await findCustomerById(accessResult.claims.sub);
  if (!account || account.disabledAt || account.dormantAt) {
    return {
      ok: false,
      failure: { status: 401, code: "CUSTOMER_ACTOR_DISABLED", message: "customer not active" },
    };
  }

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

  return {
    ok: true,
    ctx: {
      session: { customerId: account.id, email: account.email, name: account.name },
      requestId,
      ip: clientIpFromRequest(request),
      userAgent: userAgentFromRequest(request),
    },
  };
}

// =====================================================================
// Internal
// =====================================================================

async function issueCustomerSession(
  account: CustomerAccount,
  ip: string | undefined,
  userAgent: string | undefined,
): Promise<{ sessionId: string; cookies: string[] }> {
  const sessionId = randomUUID();
  const refresh = issueRefreshToken({ ttlSeconds: REFRESH_TTL_SECONDS });
  await storeRefreshToken({
    id: refresh.id,
    family: refresh.family,
    tokenHash: refresh.tokenHash,
    expiresAt: refresh.expiresAt,
    actorType: "CUSTOMER",
    customerId: account.id,
    ip,
    userAgent,
  });

  const accessToken = await signAccessToken(getAccessSecret(), {
    sub: account.id,
    actorType: "CUSTOMER",
    email: account.email,
    sessionId,
    mfa: false,
    ttlSeconds: ACCESS_TTL_SECONDS,
    issuer: getEnv().AUTH_ISSUER,
    audience: getEnv().AUTH_AUDIENCE_WEB,
  });

  const env = { isProduction: isProduction() };
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

  return { sessionId, cookies };
}
