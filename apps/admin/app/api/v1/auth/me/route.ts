import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { buildAdminWorkspaceAccess } from "@commerce/core/auth";
import { NextResponse } from "next/server";
import { resolveAdminContext } from "../../../../lib/auth-context";

export async function GET(request: Request) {
  const auth = await resolveAdminContext(request);
  if (!auth.ok) {
    const body: ApiErrorEnvelope = {
      requestId: request.headers.get("x-request-id") ?? crypto.randomUUID(),
      error: { code: auth.failure.code, message: auth.failure.message },
    };
    return NextResponse.json(body, { status: auth.failure.status });
  }

  const body: ApiEnvelope<{
    actor: { id: string; email: string; roles: readonly string[] };
    workspaces: ReturnType<typeof buildAdminWorkspaceAccess>;
  }> = {
    requestId: auth.ctx.requestId,
    data: {
      actor: {
        id: auth.ctx.session.actorId,
        email: auth.ctx.session.email,
        roles: auth.ctx.session.roles,
      },
      workspaces: buildAdminWorkspaceAccess(auth.ctx.session),
    },
  };

  return NextResponse.json(body);
}
