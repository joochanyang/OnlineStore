import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { NextResponse } from "next/server";
import { logoutAdmin, resolveAdminContext } from "../../../../lib/auth-context";

export async function POST(request: Request) {
  // CSRF intentionally NOT required: a forced logout is, at worst, a nuisance, not a
  // privilege escalation. Refresh cookie is SameSite=Strict so cross-site replay can't
  // harvest a fresh refresh token regardless.
  const auth = await resolveAdminContext(request, { requireCsrf: false });
  if (!auth.ok) {
    return failure(auth.failure.status, auth.failure.code, auth.failure.message, request);
  }

  const { cookies } = await logoutAdmin({
    request,
    actorId: auth.ctx.session.actorId,
  });

  const body: ApiEnvelope<{ ok: true }> = {
    requestId: auth.ctx.requestId,
    data: { ok: true },
  };
  const response = NextResponse.json(body);
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}

function failure(status: number, code: string, message: string, request: Request) {
  const body: ApiErrorEnvelope = {
    requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
    error: { code, message },
  };
  return NextResponse.json(body, { status });
}
