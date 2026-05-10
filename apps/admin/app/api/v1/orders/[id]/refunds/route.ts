import type { ApiEnvelope, ApiErrorEnvelope, RefundRequest } from "@commerce/api/contracts";
import {
  OrderError,
  createRefund,
  insertAuditLog,
  withAuditContext,
} from "@commerce/db";
import { TossPaymentsProvider, type PaymentMode } from "@commerce/payments";
import { NextResponse } from "next/server";

import { resolveAdminContext } from "../../../../../lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

function fail(requestId: string, status: number, code: string, message: string): NextResponse {
  const body: ApiErrorEnvelope = { requestId, error: { code, message } };
  return NextResponse.json(body, { status });
}

function tossProvider(): TossPaymentsProvider {
  const mode = (process.env.PAYMENT_MODE ?? "mock") as PaymentMode;
  return new TossPaymentsProvider({
    mode,
    secretKey: process.env.TOSS_SECRET_KEY,
    webhookSecret: process.env.TOSS_WEBHOOK_SECRET,
  });
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

  let payload: RefundRequest;
  try {
    const json = (await request.json()) as Partial<RefundRequest>;
    if (!Array.isArray(json.lines) || json.lines.length === 0) {
      return fail(auth.ctx.requestId, 422, "INVALID_PAYLOAD", "lines required");
    }
    if (typeof json.reason !== "string" || !json.reason.trim()) {
      return fail(auth.ctx.requestId, 422, "INVALID_PAYLOAD", "reason required");
    }
    if (typeof json.idempotencyKey !== "string" || json.idempotencyKey.length < 16) {
      return fail(auth.ctx.requestId, 422, "INVALID_PAYLOAD", "idempotencyKey required (≥16 chars)");
    }
    payload = {
      lines: json.lines.map((line) => ({
        orderLineId: String(line.orderLineId),
        quantity: Math.trunc(Number(line.quantity)),
      })),
      reason: json.reason.trim(),
      idempotencyKey: json.idempotencyKey,
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
        const provider = tossProvider();
        const result = await createRefund({
          orderId: id,
          lines: payload.lines,
          reason: payload.reason,
          idempotencyKey: payload.idempotencyKey,
          provider: {
            refund: async (input) => {
              const r = await provider.refund(input);
              return {
                externalRefundId: r.externalRefundId,
                refundedAmount: r.refundedAmount,
                remainingAmount: r.remainingAmount,
              };
            },
          },
        });
        await insertAuditLog({
          action: "order.refunded",
          targetType: "Order",
          targetId: result.id,
          after: { lines: payload.lines, reason: payload.reason, status: result.status },
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
          : err.code === "PAYMENT_NOT_APPROVED" || err.code === "INVALID_STATE"
            ? 409
            : err.code === "REFUND_OVERDRAW" || err.code === "INVALID_QUANTITY"
              ? 422
              : 500;
      return fail(auth.ctx.requestId, status, err.code, err.message);
    }
    return fail(
      auth.ctx.requestId,
      500,
      "REFUND_FAILED",
      err instanceof Error ? err.message : "unknown",
    );
  }
}
