import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  CartError,
  createOrderFromReservation,
  recordPaymentIntent,
  releaseReservationGroup,
} from "@commerce/db";
import {
  TossPaymentsProvider,
  type PaymentMode,
} from "@commerce/payments";
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  CheckoutOrderBody,
  CheckoutOrderCreated,
} from "@commerce/api/contracts";

import { resolveCustomerContext } from "../../../../lib/auth-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPPING_FEE_KRW = 3000;

function envProvider(): TossPaymentsProvider {
  const mode = (process.env.PAYMENT_MODE ?? "mock") as PaymentMode;
  return new TossPaymentsProvider({
    mode,
    secretKey: process.env.TOSS_SECRET_KEY,
    webhookSecret: process.env.TOSS_WEBHOOK_SECRET,
  });
}

function failure(
  requestId: string,
  status: number,
  code: string,
  message: string,
): NextResponse {
  const body: ApiErrorEnvelope = { requestId, error: { code, message } };
  return NextResponse.json(body, { status });
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const auth = await resolveCustomerContext(request, { requireCsrf: true });
  if (!auth.ok) {
    return failure(requestId, auth.failure.status, auth.failure.code, auth.failure.message);
  }

  let payload: CheckoutOrderBody;
  try {
    const json = (await request.json()) as Partial<CheckoutOrderBody>;
    if (typeof json.groupId !== "string" || !json.groupId.trim()) {
      return failure(requestId, 422, "INVALID_PAYLOAD", "groupId required");
    }
    if (typeof json.idempotencyKey !== "string" || json.idempotencyKey.length < 16) {
      return failure(requestId, 422, "INVALID_PAYLOAD", "idempotencyKey required (≥16 chars)");
    }
    if (typeof json.successUrl !== "string" || typeof json.failUrl !== "string") {
      return failure(requestId, 422, "INVALID_PAYLOAD", "successUrl and failUrl required");
    }
    payload = {
      groupId: json.groupId.trim(),
      shippingAddressId: json.shippingAddressId,
      paymentMethod: json.paymentMethod,
      successUrl: json.successUrl,
      failUrl: json.failUrl,
      idempotencyKey: json.idempotencyKey,
    };
  } catch {
    return failure(requestId, 400, "BAD_JSON", "invalid request body");
  }

  let order;
  try {
    order = await createOrderFromReservation({
      groupId: payload.groupId,
      customerId: auth.ctx.session.customerId,
      shippingFee: SHIPPING_FEE_KRW,
      discountPrice: 0,
    });
  } catch (err) {
    if (err instanceof CartError) {
      const status = err.code === "CART_NOT_FOUND" ? 404 : 422;
      return failure(requestId, status, err.code, err.message);
    }
    return failure(
      requestId,
      500,
      "ORDER_CREATE_FAILED",
      err instanceof Error ? err.message : "unknown",
    );
  }

  let intent;
  try {
    intent = await envProvider().createIntent({
      orderId: order.id,
      amount: order.totalPrice,
      currency: "KRW",
      method: payload.paymentMethod,
      customer: {
        id: auth.ctx.session.customerId,
        email: auth.ctx.session.email,
        name: auth.ctx.session.name,
      },
      successUrl: payload.successUrl,
      failUrl: payload.failUrl,
      idempotencyKey: payload.idempotencyKey,
    });
  } catch (err) {
    await releaseReservationGroup(payload.groupId);
    return failure(
      requestId,
      502,
      "PAYMENT_PROVIDER_FAILED",
      err instanceof Error ? err.message : "payment provider error",
    );
  }

  try {
    await recordPaymentIntent({
      orderId: order.id,
      externalId: intent.intentId,
      idempotencyKey: payload.idempotencyKey,
      amount: order.totalPrice,
      provider: "toss",
    });
  } catch (err) {
    if (err instanceof CartError) {
      return failure(requestId, 409, err.code, err.message);
    }
    return failure(
      requestId,
      500,
      "PAYMENT_PERSIST_FAILED",
      err instanceof Error ? err.message : "unknown",
    );
  }

  const data: CheckoutOrderCreated = {
    orderId: order.id,
    status: "PENDING_PAYMENT",
    paymentIntentId: intent.intentId,
    clientSecret: intent.clientSecret,
    redirectUrl: intent.redirectUrl,
    total: { amount: order.totalPrice, currency: "KRW" },
    expiresAt: order.expiresAt.toISOString(),
  };
  const body: ApiEnvelope<CheckoutOrderCreated> = { requestId, data };
  return NextResponse.json(body, { status: 201 });
}
