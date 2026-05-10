import { NextResponse } from "next/server";

import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  Money,
  OrderDetailDto,
  OrderDetailLineDto,
  OrderDetailRefundDto,
  OrderDetailShipmentDto,
  OrderListItemDto,
  OrderListResponse,
  OrderStatusValue,
} from "@commerce/api/contracts";
import {
  OrderError,
  type OrderDetail,
  type OrderErrorCode,
  type OrderListResult,
} from "@commerce/db";

function krw(amount: number): Money {
  return { amount, currency: "KRW" };
}

export function projectOrderList(result: OrderListResult): OrderListResponse {
  const items: OrderListItemDto[] = result.items.map((o) => ({
    id: o.id,
    status: o.status as OrderStatusValue,
    totalPrice: krw(o.totalPrice),
    subtotalPrice: krw(o.subtotalPrice),
    itemCount: o.itemCount,
    createdAt: o.createdAt.toISOString(),
    paidAt: o.paidAt ? o.paidAt.toISOString() : null,
  }));
  return { items, total: result.total, page: result.page, pageSize: result.pageSize };
}

export function projectOrderDetail(order: NonNullable<OrderDetail>): OrderDetailDto {
  const lines: OrderDetailLineDto[] = order.lines.map((line) => {
    const fulfilled = line.fulfillments
      .filter((f) => f.status !== "CANCELLED")
      .reduce((sum, f) => sum + f.quantity, 0);
    const refunded = line.refunds
      .filter((r) => r.status !== "CANCELLED" && r.status !== "FAILED")
      .reduce((sum, r) => sum + r.quantity, 0);
    return {
      id: line.id,
      sku: line.variant.sku,
      productName: line.variant.product.name,
      productSlug: line.variant.product.slug,
      color: line.variant.color,
      size: line.variant.size,
      quantity: line.quantity,
      unitPrice: krw(line.unitPrice),
      lineTotal: krw(line.unitPrice * line.quantity),
      fulfilledQuantity: fulfilled,
      refundedQuantity: refunded,
    };
  });
  const refunds: OrderDetailRefundDto[] = order.payments.flatMap((payment) =>
    payment.refunds.map((r) => ({
      id: r.id,
      amount: krw(r.amount),
      reason: r.reason,
      status: r.status as OrderDetailRefundDto["status"],
      requestedAt: r.requestedAt.toISOString(),
      completedAt: r.completedAt ? r.completedAt.toISOString() : null,
    })),
  );
  const shipments: OrderDetailShipmentDto[] = order.shipments.map((s) => ({
    id: s.id,
    carrier: s.carrier,
    trackingNumber: s.trackingNumber,
    shippedAt: s.shippedAt ? s.shippedAt.toISOString() : null,
    deliveredAt: s.deliveredAt ? s.deliveredAt.toISOString() : null,
  }));
  return {
    id: order.id,
    customerId: order.customerId,
    status: order.status as OrderStatusValue,
    subtotalPrice: krw(order.subtotalPrice),
    shippingFee: krw(order.shippingFee),
    discountPrice: krw(order.discountPrice),
    totalPrice: krw(order.totalPrice),
    createdAt: order.createdAt.toISOString(),
    paidAt: order.paidAt ? order.paidAt.toISOString() : null,
    lines,
    shipments,
    refunds,
  };
}

export function orderEnvelope<T>(data: T, requestId: string): NextResponse {
  const body: ApiEnvelope<T> = { requestId, data };
  return NextResponse.json(body);
}

export function orderErrorResponse(err: unknown, requestId: string): NextResponse {
  if (err instanceof OrderError) {
    const status = orderErrorStatus(err.code);
    const body: ApiErrorEnvelope = {
      requestId,
      error: { code: err.code, message: err.message },
    };
    return NextResponse.json(body, { status });
  }
  const body: ApiErrorEnvelope = {
    requestId,
    error: {
      code: "ORDER_INTERNAL",
      message: err instanceof Error ? err.message : "unknown",
    },
  };
  return NextResponse.json(body, { status: 500 });
}

function orderErrorStatus(code: OrderErrorCode): number {
  switch (code) {
    case "ORDER_NOT_FOUND":
      return 404;
    case "FORBIDDEN":
      return 403;
    case "INVALID_STATE":
      return 409;
    case "INVALID_QUANTITY":
    case "FULFILLMENT_OVERDRAW":
    case "REFUND_OVERDRAW":
      return 422;
    case "PAYMENT_NOT_APPROVED":
      return 409;
    case "NO_DATABASE":
      return 503;
    default:
      return 500;
  }
}

export function orderFailureResponse(
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
