import { randomUUID } from "node:crypto";
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  CheckoutOrderRequest,
  CheckoutOrderResult,
} from "@commerce/api/contracts";
import { reserveStockBatch } from "@commerce/core/inventory";
import { createOrderDraft } from "@commerce/core/order";
import { createMockPaymentProvider } from "@commerce/core/payment";
import { createCheckoutOrder, findCheckoutVariants } from "@commerce/db";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  try {
    const payload = await parseCheckoutOrderRequest(request);
    const lines = payload.lines ?? [];
    const variants = await findCheckoutVariants(lines.map((line) => line.sku));
    const variantsBySku = new Map(variants.map((variant) => [variant.sku, variant]));
    const orderLines = lines.map((line) => {
      const sku = line.sku.trim().toUpperCase();
      const variant = variantsBySku.get(sku);

      if (!variant) {
        throw new Error(`Unknown SKU: ${sku}`);
      }

      return {
        sku,
        quantity: line.quantity,
        unitPrice: variant.price,
      };
    });

    reserveStockBatch(variants, orderLines);

    const draft = createOrderDraft({
      customerId: payload.customerId ?? "",
      lines: orderLines,
      shippingFee: 3000,
      discountPrice: payload.couponCode ? 5000 : 0,
    });
    const order = await createCheckoutOrder({
      customerId: draft.customerId,
      lines: draft.lines,
      subtotalPrice: draft.subtotalPrice,
      shippingFee: draft.shippingFee,
      discountPrice: draft.discountPrice,
      totalPrice: draft.totalPrice,
    });
    const paymentProvider = createMockPaymentProvider();
    const paymentIntent = await paymentProvider.createIntent({
      orderId: order.id,
      amount: order.totalPrice,
      provider: payload.paymentProvider ?? "mock",
      idempotencyKey: payload.idempotencyKey ?? `${order.id}:payment:create`,
    });
    const orderStatus = order.status === "PAID" ? "PAID" : "PENDING_PAYMENT";

    const data: CheckoutOrderResult = {
      orderId: order.id,
      status: orderStatus,
      subtotal: { amount: order.subtotalPrice, currency: "KRW" },
      shippingFee: { amount: order.shippingFee, currency: "KRW" },
      discount: { amount: order.discountPrice, currency: "KRW" },
      total: { amount: order.totalPrice, currency: "KRW" },
      payment: {
        provider: paymentIntent.provider,
        status: paymentIntent.status,
        idempotencyKey: paymentIntent.idempotencyKey,
      },
    };

    return NextResponse.json<ApiEnvelope<CheckoutOrderResult>>({ data, requestId }, { status: 201 });
  } catch (error) {
    return NextResponse.json<ApiErrorEnvelope>(
      {
        error: {
          code: "CHECKOUT_ORDER_FAILED",
          message: error instanceof Error ? error.message : "Unable to create checkout order",
        },
        requestId,
      },
      { status: 400 },
    );
  }
}

async function parseCheckoutOrderRequest(request: Request): Promise<Partial<CheckoutOrderRequest>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const sku = String(formData.get("sku") ?? "");
    const quantity = Number(formData.get("quantity") ?? 1);

    return {
      customerId: String(formData.get("customerId") ?? ""),
      lines: sku ? [{ sku, quantity }] : [],
      couponCode: String(formData.get("couponCode") ?? "") || undefined,
      paymentProvider: "mock",
    };
  }

  return (await request.json()) as Partial<CheckoutOrderRequest>;
}
