import type { ApiEnvelope, ApiErrorEnvelope } from "@commerce/api/contracts";
import { insertAuditLog, updateProductStatus } from "@commerce/db";
import { NextResponse } from "next/server";
import { resolveAdminContext } from "../../../../../lib/auth-context";

const productStatuses = ["DRAFT", "ACTIVE", "ARCHIVED"] as const;
type ProductStatus = (typeof productStatuses)[number];

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await resolveAdminContext(request, {
    permission: "product:write",
    requireCsrf: true,
  });
  if (!auth.ok) {
    return failureResponse(auth.failure);
  }

  try {
    const payload = await parseStatusPayload(request);
    const status = parseProductStatus(payload.status);
    const { id } = await context.params;
    const product = await updateProductStatus(id, status);
    if (!product) {
      return NextResponse.json<ApiErrorEnvelope>(
        {
          error: { code: "PRODUCT_NOT_FOUND", message: "Product was not found" },
          requestId: auth.ctx.requestId,
        },
        { status: 404 },
      );
    }

    await insertAuditLog({
      actorType: "ADMIN",
      actorId: auth.ctx.session.actorId,
      action: "product.status_update",
      targetType: "Product",
      targetId: id,
      after: { status },
      ip: auth.ctx.ip,
      userAgent: auth.ctx.userAgent,
      requestId: auth.ctx.requestId,
    });

    return NextResponse.json<ApiEnvelope<typeof product>>({
      data: product,
      requestId: auth.ctx.requestId,
    });
  } catch (error) {
    return NextResponse.json<ApiErrorEnvelope>(
      {
        error: {
          code: "PRODUCT_STATUS_UPDATE_FAILED",
          message: error instanceof Error ? error.message : "Unable to update product status",
        },
        requestId: auth.ctx.requestId,
      },
      { status: 400 },
    );
  }
}

export async function POST(request: Request, context: RouteContext) {
  return PATCH(request, context);
}

function failureResponse(failure: { status: number; code: string; message: string }) {
  return NextResponse.json<ApiErrorEnvelope>(
    { requestId: crypto.randomUUID(), error: { code: failure.code, message: failure.message } },
    { status: failure.status },
  );
}

async function parseStatusPayload(request: Request): Promise<{ status?: string }> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    return { status: String(formData.get("status") ?? "") };
  }
  return (await request.json()) as { status?: string };
}

function parseProductStatus(value: string | undefined): ProductStatus {
  if (isProductStatus(value)) {
    return value;
  }
  throw new Error("Invalid product status");
}

function isProductStatus(value: string | undefined): value is ProductStatus {
  return productStatuses.some((status) => status === value);
}
