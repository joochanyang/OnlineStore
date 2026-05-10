import { randomUUID } from "node:crypto";
import { createOrderDraft } from "@commerce/core/order";
import { reserveStockBatch } from "@commerce/core/inventory";
import { findCheckoutVariants } from "@commerce/db";
import { NextResponse } from "next/server";
import type {
  ApiEnvelope,
  ApiErrorEnvelope,
  CheckoutPreview,
  CheckoutRequest,
} from "@commerce/api/contracts";

export async function POST(request: Request) {
  const requestId = randomUUID();

  try {
    const payload = await parseCheckoutRequest(request);
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

    const data: CheckoutPreview = {
      subtotal: { amount: draft.subtotalPrice, currency: "KRW" },
      shippingFee: { amount: draft.shippingFee, currency: "KRW" },
      discount: { amount: draft.discountPrice, currency: "KRW" },
      total: { amount: draft.totalPrice, currency: "KRW" },
    };

    return NextResponse.json<ApiEnvelope<CheckoutPreview>>({ data, requestId });
  } catch (error) {
    return NextResponse.json<ApiErrorEnvelope>(
      {
        error: {
          code: "CHECKOUT_PREVIEW_FAILED",
          message: error instanceof Error ? error.message : "Unable to preview checkout",
        },
        requestId,
      },
      { status: 400 },
    );
  }
}

async function parseCheckoutRequest(request: Request): Promise<Partial<CheckoutRequest>> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const sku = String(formData.get("sku") ?? "");
    const quantity = Number(formData.get("quantity") ?? 1);

    return {
      customerId: String(formData.get("customerId") ?? ""),
      lines: sku ? [{ sku, quantity }] : [],
      couponCode: String(formData.get("couponCode") ?? "") || undefined,
    };
  }

  return (await request.json()) as Partial<CheckoutRequest>;
}
