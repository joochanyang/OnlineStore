import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { createProductDraft, type ProductDraftInput, type ProductStatus } from "@commerce/core/product";
import { createAdminProduct, insertAuditLog, listAdminCatalogProducts } from "@commerce/db";
import { NextResponse } from "next/server";
import { resolveAdminContext } from "../../../lib/auth-context";

const productStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;

export async function GET(request: Request) {
  const auth = await resolveAdminContext(request, { permission: "product:read" });
  if (!auth.ok) {
    return failureResponse(auth.failure);
  }
  const data = await listAdminCatalogProducts();
  return NextResponse.json<ApiEnvelope<typeof data>>({ data, requestId: auth.ctx.requestId });
}

export async function POST(request: Request) {
  const auth = await resolveAdminContext(request, { permission: "product:write", requireCsrf: true });
  if (!auth.ok) {
    return failureResponse(auth.failure);
  }

  try {
    const payload = await parseProductPayload(request);
    const draft = createProductDraft(payload.product);
    const product = await createAdminProduct({
      ...draft,
      status: parseProductStatus(payload.status),
    });

    await insertAuditLog({
      actorType: "ADMIN",
      actorId: auth.ctx.session.actorId,
      action: "product.create",
      targetType: "Product",
      targetId: product.id,
      after: product,
      ip: auth.ctx.ip,
      userAgent: auth.ctx.userAgent,
      requestId: auth.ctx.requestId,
    });

    return NextResponse.json<ApiEnvelope<typeof product>>(
      { data: product, requestId: auth.ctx.requestId },
      { status: 201 },
    );
  } catch (error) {
    return NextResponse.json<ApiErrorEnvelope>(
      {
        error: {
          code: "PRODUCT_CREATE_FAILED",
          message: error instanceof Error ? error.message : "Unable to create product",
        },
        requestId: auth.ctx.requestId,
      },
      { status: 400 },
    );
  }
}

function failureResponse(failure: { status: number; code: string; message: string }) {
  return NextResponse.json<ApiErrorEnvelope>(
    {
      requestId: crypto.randomUUID(),
      error: { code: failure.code, message: failure.message },
    },
    { status: failure.status },
  );
}

async function parseProductPayload(request: Request): Promise<{ product: ProductDraftInput; status?: string }> {
  const contentType = request.headers.get("content-type") ?? "";

  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();

    return {
      status: String(formData.get("status") ?? "") || undefined,
      product: {
        name: String(formData.get("name") ?? ""),
        slug: String(formData.get("slug") ?? ""),
        description: String(formData.get("description") ?? ""),
        categorySlugs: splitList(String(formData.get("categorySlugs") ?? "")),
        imageUrls: splitList(String(formData.get("imageUrls") ?? "")),
        variants: [
          {
            sku: String(formData.get("sku") ?? ""),
            color: String(formData.get("color") ?? ""),
            size: String(formData.get("size") ?? ""),
            price: Number(formData.get("price") ?? 0),
            compareAtPrice: optionalNumber(formData.get("compareAtPrice")),
            stock: Number(formData.get("stock") ?? 0),
            safetyStock: optionalNumber(formData.get("safetyStock")),
          },
        ],
      },
    };
  }

  const payload = (await request.json()) as Partial<ProductDraftInput> & { status?: string };

  return {
    status: payload.status,
    product: {
      name: payload.name ?? "",
      slug: payload.slug ?? "",
      description: payload.description,
      categorySlugs: payload.categorySlugs ?? [],
      imageUrls: payload.imageUrls ?? [],
      variants: payload.variants ?? [],
    },
  };
}

function parseProductStatus(value: string | undefined): ProductStatus {
  if (!value) {
    return "DRAFT";
  }
  if (productStatuses.some((status) => status === value)) {
    return value as ProductStatus;
  }
  throw new Error("Invalid product status");
}

function splitList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function optionalNumber(value: FormDataEntryValue | null) {
  const normalizedValue = String(value ?? "").trim();
  return normalizedValue ? Number(normalizedValue) : undefined;
}
