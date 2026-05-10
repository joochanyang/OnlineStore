import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import {
  CartError,
  getOrCreateCart,
  reserveCheckoutInventory,
} from "@commerce/db";
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  CheckoutPreviewBody,
  CheckoutPreviewResult,
} from "@commerce/api/contracts";

import { resolveCartIdentity } from "../../../../lib/cart-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SHIPPING_FEE_KRW = 3000;
const COUPON_DISCOUNT_KRW = 5000;

function krw(amount: number) {
  return { amount, currency: "KRW" as const };
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();
  const resolution = await resolveCartIdentity(request, { requireCsrf: true });
  if (!resolution.ok) {
    const body: ApiErrorEnvelope = {
      requestId,
      error: { code: resolution.failure.code, message: resolution.failure.message },
    };
    return NextResponse.json(body, { status: resolution.failure.status });
  }

  let payload: CheckoutPreviewBody = {};
  try {
    if (request.headers.get("content-type")?.includes("application/json")) {
      payload = ((await request.json()) ?? {}) as CheckoutPreviewBody;
    }
  } catch {
    return errorResponse(requestId, 400, "BAD_JSON", "invalid request body");
  }

  try {
    const cart = await getOrCreateCart(resolution.identity);
    if (cart.items.length === 0) {
      return errorResponse(requestId, 422, "CART_EMPTY", "cart is empty");
    }

    const reservation = await reserveCheckoutInventory({
      cartId: cart.id,
      items: cart.items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
    });

    const subtotal = reservation.lines.reduce(
      (sum, line) => sum + line.unitPrice * line.quantity,
      0,
    );
    const discount = payload.couponCode ? COUPON_DISCOUNT_KRW : 0;
    const shippingFee = SHIPPING_FEE_KRW;
    const total = Math.max(0, subtotal - discount) + shippingFee;

    const data: CheckoutPreviewResult = {
      groupId: reservation.groupId,
      expiresAt: reservation.expiresAt.toISOString(),
      lines: reservation.lines.map((line) => ({
        reservationId: line.reservationId,
        sku: line.sku,
        quantity: line.quantity,
        unitPrice: krw(line.unitPrice),
        lineTotal: krw(line.unitPrice * line.quantity),
      })),
      subtotal: krw(subtotal),
      shippingFee: krw(shippingFee),
      discount: krw(discount),
      total: krw(total),
    };
    const body: ApiEnvelope<CheckoutPreviewResult> = { requestId, data };
    const response = NextResponse.json(body, { status: 201 });
    if (resolution.mintedSetCookie) {
      response.headers.append("set-cookie", resolution.mintedSetCookie);
    }
    return response;
  } catch (err) {
    if (err instanceof CartError) {
      const status = err.code === "INSUFFICIENT_STOCK" ? 409
        : err.code === "VARIANT_INACTIVE" ? 410
        : err.code === "VARIANT_NOT_FOUND" ? 404
        : err.code === "NO_DATABASE" ? 503
        : 422;
      return errorResponse(requestId, status, err.code, err.message);
    }
    return errorResponse(
      requestId,
      500,
      "CHECKOUT_PREVIEW_FAILED",
      err instanceof Error ? err.message : "unknown",
    );
  }
}

function errorResponse(
  requestId: string,
  status: number,
  code: string,
  message: string,
): NextResponse {
  const body: ApiErrorEnvelope = {
    requestId,
    error: { code, message },
  };
  return NextResponse.json(body, { status });
}
