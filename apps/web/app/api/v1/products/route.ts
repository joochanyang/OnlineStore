import { randomUUID } from "node:crypto";
import { listCatalogProducts } from "@commerce/db";
import { NextResponse } from "next/server";
import type { ApiEnvelope, ProductSummary } from "@commerce/api/contracts";

export async function GET() {
  const products = await listCatalogProducts();
  const data: ProductSummary[] = products.map((product) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    status: product.status,
    price: {
      amount: product.price,
      currency: "KRW",
    },
    stock: product.stock,
    imageUrl: product.imageUrl,
    variants: product.variants.map((variant) => ({
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      stock: variant.stock,
      price: {
        amount: variant.price,
        currency: "KRW",
      },
    })),
  }));

  return NextResponse.json<ApiEnvelope<ProductSummary[]>>({
    data,
    requestId: randomUUID(),
  });
}
