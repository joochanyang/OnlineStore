import { listCustomerOrders } from "@commerce/db";

import { resolveCustomerContext } from "../../../../lib/auth-context";
import {
  orderEnvelope,
  orderErrorResponse,
  orderFailureResponse,
  projectOrderList,
} from "../../../../lib/order-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await resolveCustomerContext(request);
  if (!auth.ok) {
    return orderFailureResponse(
      crypto.randomUUID(),
      auth.failure.status,
      auth.failure.code,
      auth.failure.message,
    );
  }

  const url = new URL(request.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Number(url.searchParams.get("pageSize") ?? "20");
  const status = url.searchParams.get("status") ?? undefined;

  try {
    const result = await listCustomerOrders({
      customerId: auth.ctx.session.customerId,
      status,
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 20,
    });
    return orderEnvelope(projectOrderList(result), auth.ctx.requestId);
  } catch (err) {
    return orderErrorResponse(err, auth.ctx.requestId);
  }
}
