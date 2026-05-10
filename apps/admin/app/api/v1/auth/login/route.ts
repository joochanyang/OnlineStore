import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { clientIpFromRequest, userAgentFromRequest } from "@commerce/auth";
import { NextResponse } from "next/server";
import { loginAdmin } from "../../../../lib/auth-context";

type LoginRequest = {
  email?: string;
  password?: string;
  mfaToken?: string;
};

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const contentType = request.headers.get("content-type") ?? "";
  const isFormSubmission =
    contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data");

  let payload: LoginRequest;
  if (isFormSubmission) {
    const formData = await request.formData();
    payload = {
      email: String(formData.get("email") ?? ""),
      password: String(formData.get("password") ?? ""),
      mfaToken: String(formData.get("mfaToken") ?? "") || undefined,
    };
  } else {
    try {
      payload = (await request.json()) as LoginRequest;
    } catch {
      return errorResponse(requestId, 400, "INVALID_PAYLOAD", "request body must be JSON or form-encoded");
    }
  }

  const email = payload.email?.trim();
  const password = payload.password ?? "";
  if (!email || !password) {
    return errorResponse(requestId, 400, "MISSING_CREDENTIALS", "email and password are required");
  }

  const outcome = await loginAdmin({
    email,
    password,
    mfaToken: payload.mfaToken,
    ip: clientIpFromRequest(request),
    userAgent: userAgentFromRequest(request),
  });

  if (!outcome.ok) {
    if (isFormSubmission) {
      const reasonParam =
        outcome.reason === "mfa_required"
          ? "mfa-required"
          : outcome.reason === "mfa_invalid"
            ? "mfa-invalid"
            : outcome.reason === "disabled"
              ? "disabled"
              : "invalid";
      return NextResponse.redirect(new URL(`/login?error=${reasonParam}`, request.url), 303);
    }
    if (outcome.reason === "mfa_required") {
      return errorResponse(requestId, 401, "MFA_REQUIRED", "MFA token is required");
    }
    if (outcome.reason === "mfa_invalid") {
      return errorResponse(requestId, 401, "MFA_INVALID", "MFA token rejected");
    }
    if (outcome.reason === "disabled") {
      return errorResponse(requestId, 403, "ACCOUNT_DISABLED", "admin account disabled");
    }
    return errorResponse(requestId, 401, "INVALID_CREDENTIALS", "invalid email or password");
  }

  if (isFormSubmission) {
    const response = NextResponse.redirect(new URL("/", request.url), 303);
    for (const cookie of outcome.cookies) {
      response.headers.append("set-cookie", cookie);
    }
    return response;
  }

  const body: ApiEnvelope<{
    actor: { id: string; email: string; name: string; roles: readonly string[] };
    refresh: { expiresAt: string };
  }> = {
    requestId,
    data: {
      actor: {
        id: outcome.account.id,
        email: outcome.account.email,
        name: outcome.account.name,
        roles: outcome.account.roles,
      },
      refresh: { expiresAt: outcome.refresh.expiresAt.toISOString() },
    },
  };

  const response = NextResponse.json(body, { status: 200 });
  for (const cookie of outcome.cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

function errorResponse(requestId: string, status: number, code: string, message: string) {
  const body: ApiErrorEnvelope = {
    requestId,
    error: { code, message },
  };
  return NextResponse.json(body, { status });
}
