import { findCustomerOrder } from "@commerce/db";

import { resolveCustomerContext } from "../../../../../lib/auth-context";
import {
  orderEnvelope,
  orderErrorResponse,
  orderFailureResponse,
  projectOrderDetail,
} from "../../../../../lib/order-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function GET(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const auth = await resolveCustomerContext(request);
  if (!auth.ok) {
    return orderFailureResponse(
      crypto.randomUUID(),
      auth.failure.status,
      auth.failure.code,
      auth.failure.message,
    );
  }
  try {
    const order = await findCustomerOrder({
      customerId: auth.ctx.session.customerId,
      orderId: id,
    });
    return orderEnvelope(projectOrderDetail(order), auth.ctx.requestId);
  } catch (err) {
    return orderErrorResponse(err, auth.ctx.requestId);
  }
}
