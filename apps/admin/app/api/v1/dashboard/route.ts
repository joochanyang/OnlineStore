import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { getAdminDashboard } from "@commerce/db";
import { NextResponse } from "next/server";
import { resolveAdminContext } from "../../../lib/auth-context";

export async function GET(request: Request) {
  const auth = await resolveAdminContext(request, { permission: "report:read" });
  if (!auth.ok) {
    const body: ApiErrorEnvelope = {
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      error: { code: auth.failure.code, message: auth.failure.message },
    };
    return NextResponse.json(body, { status: auth.failure.status });
  }

  const data = await getAdminDashboard({
    actorId: auth.ctx.session.actorId,
    email: auth.ctx.session.email,
    roles: auth.ctx.session.roles,
  });
  return NextResponse.json<ApiEnvelope<typeof data>>({ data, requestId: auth.ctx.requestId });
}
