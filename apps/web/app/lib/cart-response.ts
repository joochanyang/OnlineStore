import { NextResponse } from "next/server";

import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  CartDto,
  CartItemDto,
  Money,
} from "@commerce/api/contracts";
import { CartError, type CartView } from "@commerce/db";

import { appendSetCookie } from "./cart-context";

function krw(amount: number): Money {
  return { amount, currency: "KRW" };
}

export function projectCartItem(item: CartView["items"][number]): CartItemDto {
  return {
    id: item.id,
    variantId: item.variantId,
    sku: item.sku,
    productSlug: item.productSlug,
    productName: item.productName,
    color: item.color,
    size: item.size,
    unitPrice: krw(item.unitPrice),
    quantity: item.quantity,
    lineTotal: krw(item.lineTotal),
    stock: item.stock,
  };
}

export function projectCart(cart: CartView): CartDto {
  return {
    id: cart.id,
    customerId: cart.customerId,
    items: cart.items.map(projectCartItem),
    subtotal: krw(cart.subtotal),
    expiresAt: cart.expiresAt.toISOString(),
    lastActivityAt: cart.lastActivityAt.toISOString(),
  };
}

export function cartEnvelope<T>(
  data: T,
  requestId: string,
  mintedSetCookie?: string,
): NextResponse {
  const body: ApiEnvelope<T> = { requestId, data };
  const res = NextResponse.json(body);
  appendSetCookie(res.headers, mintedSetCookie);
  return res;
}

export function cartErrorResponse(
  err: unknown,
  requestId: string,
): NextResponse {
  if (err instanceof CartError) {
    const status = cartErrorStatus(err.code);
    const body: ApiErrorEnvelope = {
      requestId,
      error: { code: err.code, message: err.message },
    };
    return NextResponse.json(body, { status });
  }
  const body: ApiErrorEnvelope = {
    requestId,
    error: {
      code: "CART_INTERNAL",
      message: err instanceof Error ? err.message : "unknown",
    },
  };
  return NextResponse.json(body, { status: 500 });
}

function cartErrorStatus(code: import("@commerce/db").CartErrorCode): number {
  switch (code) {
    case "VARIANT_NOT_FOUND":
    case "ITEM_NOT_FOUND":
    case "CART_NOT_FOUND":
      return 404;
    case "VARIANT_INACTIVE":
      return 410;
    case "INSUFFICIENT_STOCK":
      return 409;
    case "INVALID_QUANTITY":
      return 422;
    case "NO_DATABASE":
      return 503;
    default:
      return 500;
  }
}

export function failureResponse(
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
