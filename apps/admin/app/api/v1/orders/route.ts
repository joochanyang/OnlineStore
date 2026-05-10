import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { listAdminOrders } from "@commerce/db";
import { NextResponse } from "next/server";

import { resolveAdminContext } from "../../../lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await resolveAdminContext(request, { permission: "order:read" });
  if (!auth.ok) {
    const body: ApiErrorEnvelope = {
      requestId: auth.failure.code,
      error: { code: auth.failure.code, message: auth.failure.message },
    };
    return NextResponse.json(body, { status: auth.failure.status });
  }
  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const status = url.searchParams.get("status") ?? undefined;

  try {
    const result = await listAdminOrders({
      status,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    });
    const body: ApiEnvelope<typeof result> = {
      requestId: auth.ctx.requestId,
      data: result,
    };
    return NextResponse.json(body);
  } catch (err) {
    const body: ApiErrorEnvelope = {
      requestId: auth.ctx.requestId,
      error: {
        code: "ORDERS_LIST_FAILED",
        message: err instanceof Error ? err.message : "unknown",
      },
    };
    return NextResponse.json(body, { status: 500 });
  }
}
