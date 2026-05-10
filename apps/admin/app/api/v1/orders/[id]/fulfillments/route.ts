import type { ApiEnvelope, ApiErrorEnvelope, FulfillmentRequest } from "@commerce/api/contracts";
import {
  OrderError,
  createFulfillment,
  insertAuditLog,
  withAuditContext,
} from "@commerce/db";
import { NextResponse } from "next/server";

import { resolveAdminContext } from "../../../../../lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function fail(requestId: string, status: number, code: string, message: string): NextResponse {
  const body: ApiErrorEnvelope = { requestId, error: { code, message } };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const auth = await resolveAdminContext(request, {
    permission: "order:write",
    requireCsrf: true,
  });
  if (!auth.ok) {
    return fail(auth.failure.code, auth.failure.status, auth.failure.code, auth.failure.message);
  }

  let payload: FulfillmentRequest;
  try {
    const json = (await request.json()) as Partial<FulfillmentRequest>;
    if (!Array.isArray(json.lines) || json.lines.length === 0) {
      return fail(auth.ctx.requestId, 422, "INVALID_PAYLOAD", "lines required");
    }
    payload = {
      lines: json.lines.map((line) => ({
        orderLineId: String(line.orderLineId),
        quantity: Math.trunc(Number(line.quantity)),
      })),
      shipment: json.shipment
        ? {
            carrier: String(json.shipment.carrier),
            trackingNumber: json.shipment.trackingNumber
              ? String(json.shipment.trackingNumber)
              : undefined,
          }
        : undefined,
    };
  } catch {
    return fail(auth.ctx.requestId, 400, "BAD_JSON", "invalid request body");
  }

  try {
    const order = await withAuditContext(
      {
        actorType: "ADMIN",
        actorId: auth.ctx.session.actorId,
        ip: auth.ctx.ip,
        userAgent: auth.ctx.userAgent,
        requestId: auth.ctx.requestId,
      },
      async () => {
        const result = await createFulfillment({
          orderId: id,
          lines: payload.lines,
          shipment: payload.shipment,
        });
        await insertAuditLog({
          action: "order.fulfilled",
          targetType: "Order",
          targetId: result.id,
          after: { lines: payload.lines, shipment: payload.shipment, status: result.status },
        });
        return result;
      },
    );
    const body: ApiEnvelope<typeof order> = { requestId: auth.ctx.requestId, data: order };
    return NextResponse.json(body, { status: 201 });
  } catch (err) {
    if (err instanceof OrderError) {
      const status =
        err.code === "ORDER_NOT_FOUND"
          ? 404
          : err.code === "INVALID_STATE"
            ? 409
            : err.code === "FULFILLMENT_OVERDRAW" || err.code === "INVALID_QUANTITY"
              ? 422
              : 500;
      return fail(auth.ctx.requestId, status, err.code, err.message);
    }
    return fail(
      auth.ctx.requestId,
      500,
      "FULFILLMENT_FAILED",
      err instanceof Error ? err.message : "unknown",
    );
  }
}
