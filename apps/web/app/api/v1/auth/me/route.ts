import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { NextResponse } from "next/server";
import { resolveCustomerContext } from "../../../../lib/auth-context";

export async function GET(request: Request) {
  const auth = await resolveCustomerContext(request);
  if (!auth.ok) {
    const body: ApiErrorEnvelope = {
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      error: { code: auth.failure.code, message: auth.failure.message },
    };
    return NextResponse.json(body, { status: auth.failure.status });
  }

  const body: ApiEnvelope<{ customer: { id: string; email: string; name: string } }> = {
    requestId: auth.ctx.requestId,
    data: {
      customer: {
        id: auth.ctx.session.customerId,
        email: auth.ctx.session.email,
        name: auth.ctx.session.name,
      },
    },
  };
  return NextResponse.json(body);
}
