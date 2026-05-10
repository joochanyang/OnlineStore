import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { clientIpFromRequest, userAgentFromRequest } from "@commerce/auth";
import { NextResponse } from "next/server";
import { loginCustomer } from "../../../../lib/auth-context";

type LoginRequest = { email?: string; password?: string };

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();

  let payload: LoginRequest;
  try {
    payload = (await request.json()) as LoginRequest;
  } catch {
    return error(requestId, 400, "INVALID_PAYLOAD", "request body must be JSON");
  }

  const email = payload.email?.trim();
  const password = payload.password ?? "";
  if (!email || !password) {
    return error(requestId, 400, "MISSING_CREDENTIALS", "email and password are required");
  }

  const outcome = await loginCustomer({
    email,
    password,
    ip: clientIpFromRequest(request),
    userAgent: userAgentFromRequest(request),
  });

  if (!outcome.ok) {
    if (outcome.reason === "disabled") {
      return error(requestId, 403, "ACCOUNT_DISABLED", "account disabled");
    }
    if (outcome.reason === "dormant") {
      return error(requestId, 403, "ACCOUNT_DORMANT", "account is dormant; please reactivate");
    }
    return error(requestId, 401, "INVALID_CREDENTIALS", "invalid email or password");
  }

  const body: ApiEnvelope<{ customer: { id: string; email: string; name: string } }> = {
    requestId,
    data: {
      customer: { id: outcome.account.id, email: outcome.account.email, name: outcome.account.name },
    },
  };

  const response = NextResponse.json(body);
  for (const cookie of outcome.cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

function error(requestId: string, status: number, code: string, message: string) {
  const body: ApiErrorEnvelope = { requestId, error: { code, message } };
  return NextResponse.json(body, { status });
}
