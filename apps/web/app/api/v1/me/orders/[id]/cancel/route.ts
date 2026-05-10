import { cancelCustomerOrder, insertAuditLog, withAuditContext } from "@commerce/db";

import { resolveCustomerContext } from "../../../../../../lib/auth-context";
import {
  orderEnvelope,
  orderErrorResponse,
  orderFailureResponse,
  projectOrderDetail,
} from "../../../../../../lib/order-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const auth = await resolveCustomerContext(request, { requireCsrf: true });
  if (!auth.ok) {
    return orderFailureResponse(
      crypto.randomUUID(),
      auth.failure.status,
      auth.failure.code,
      auth.failure.message,
    );
  }
  try {
    const cancelled = await withAuditContext(
      {
        actorType: "CUSTOMER",
        actorId: auth.ctx.session.customerId,
        ip: auth.ctx.ip,
        userAgent: auth.ctx.userAgent,
        requestId: auth.ctx.requestId,
      },
      async () => {
        const order = await cancelCustomerOrder({
          customerId: auth.ctx.session.customerId,
          orderId: id,
        });
        await insertAuditLog({
          action: "order.cancelled",
          targetType: "Order",
          targetId: order.id,
          after: { status: order.status },
        });
        return order;
      },
    );
    return orderEnvelope(projectOrderDetail(cancelled), auth.ctx.requestId);
  } catch (err) {
    return orderErrorResponse(err, auth.ctx.requestId);
  }
}
