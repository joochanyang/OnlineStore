import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { OrderError, findAdminOrder } from "@commerce/db";
import { NextResponse } from "next/server";

import { resolveAdminContext } from "../../../../lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const auth = await resolveAdminContext(request, { permission: "order:read" });
  if (!auth.ok) {
    const body: ApiErrorEnvelope = {
      requestId: auth.failure.code,
      error: { code: auth.failure.code, message: auth.failure.message },
    };
    return NextResponse.json(body, { status: auth.failure.status });
  }

  try {
    const order = await findAdminOrder(id);
    const body: ApiEnvelope<typeof order> = {
      requestId: auth.ctx.requestId,
      data: order,
    };
    return NextResponse.json(body);
  } catch (err) {
    if (err instanceof OrderError) {
      const status = err.code === "ORDER_NOT_FOUND" ? 404 : 500;
      const body: ApiErrorEnvelope = {
        requestId: auth.ctx.requestId,
        error: { code: err.code, message: err.message },
      };
      return NextResponse.json(body, { status });
    }
    const body: ApiErrorEnvelope = {
      requestId: auth.ctx.requestId,
      error: {
        code: "ORDER_FETCH_FAILED",
        message: err instanceof Error ? err.message : "unknown",
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
