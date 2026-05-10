import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { NextResponse } from "next/server";
import { logoutCustomer, resolveCustomerContext } from "../../../../lib/auth-context";

export async function POST(request: Request) {
  const auth = await resolveCustomerContext(request, { requireCsrf: true });
  if (!auth.ok) {
    const body: ApiErrorEnvelope = {
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      error: { code: auth.failure.code, message: auth.failure.message },
    };
    return NextResponse.json(body, { status: auth.failure.status });
  }

  const { cookies } = await logoutCustomer({
    request,
    actorId: auth.ctx.session.customerId,
  });

  const body: ApiEnvelope<{ ok: true }> = { requestId: auth.ctx.requestId, data: { ok: true } };
  const response = NextResponse.json(body);
  for (const cookie of cookies) {
    response.headers.append("set-cookie", cookie);
  }
  return response;
}
