import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { NextResponse } from "next/server";
import { refreshCustomerSession } from "../../../../lib/auth-context";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? crypto.randomUUID();
  const result = await refreshCustomerSession(request);
  if (!result.ok) {
    const code =
      result.reason === "reuse_detected"
        ? "REFRESH_REUSE_DETECTED"
        : result.reason === "expired"
          ? "REFRESH_EXPIRED"
          : result.reason === "revoked"
            ? "REFRESH_REVOKED"
            : result.reason === "actor_invalid"
              ? "ACTOR_INVALID"
              : result.reason === "missing"
                ? "REFRESH_MISSING"
                : "REFRESH_INVALID";
    const body: ApiErrorEnvelope = { requestId, error: { code, message: code.toLowerCase().replace(/_/g, " ") } };
    return NextResponse.json(body, { status: 401 });
  }

  const body: ApiEnvelope<{
    customer: { id: string; email: string; name: string };
    refresh: { expiresAt: string };
  }> = {
    requestId,
    data: {
      customer: { id: result.account.id, email: result.account.email, name: result.account.name },
      refresh: { expiresAt: result.refresh.expiresAt.toISOString() },
    },
  };

  const response = NextResponse.json(body);
  for (const cookie of result.cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
