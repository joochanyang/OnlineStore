import { removeCartItem, updateCartItemQuantity } from "@commerce/db";
import type { CartUpdateItemRequest } from "@commerce/api/contracts";

import { resolveCartIdentity } from "../../../../../../lib/cart-context";
import {
  cartEnvelope,
  cartErrorResponse,
  failureResponse,
  projectCart,
} from "../../../../../../lib/cart-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const resolution = await resolveCartIdentity(request, { requireCsrf: true });
  if (!resolution.ok) {
    return failureResponse(
      crypto.randomUUID(),
      resolution.failure.status,
      resolution.failure.code,
      resolution.failure.message,
    );
  }
  let payload: CartUpdateItemRequest;
  try {
    const json = (await request.json()) as Partial<CartUpdateItemRequest>;
    if (typeof json.quantity !== "number" || !Number.isFinite(json.quantity)) {
      return failureResponse(
        resolution.requestId,
        422,
        "INVALID_PAYLOAD",
        "quantity required",
      );
    }
    payload = { quantity: Math.trunc(json.quantity) };
  } catch {
    return failureResponse(resolution.requestId, 400, "BAD_JSON", "invalid request body");
  }

  try {
    const cart = await updateCartItemQuantity({
      identity: resolution.identity,
      itemId: id,
      quantity: payload.quantity,
    });
    return cartEnvelope(
      { cart: projectCart(cart) },
      resolution.requestId,
      resolution.mintedSetCookie,
    );
  } catch (err) {
    return cartErrorResponse(err, resolution.requestId);
  }
}

export async function DELETE(request: Request, ctx: Params) {
  const { id } = await ctx.params;
  const resolution = await resolveCartIdentity(request, { requireCsrf: true });
  if (!resolution.ok) {
    return failureResponse(
      crypto.randomUUID(),
      resolution.failure.status,
      resolution.failure.code,
      resolution.failure.message,
    );
  }

  try {
    const cart = await removeCartItem({
      identity: resolution.identity,
      itemId: id,
    });
    return cartEnvelope(
      { cart: projectCart(cart) },
      resolution.requestId,
      resolution.mintedSetCookie,
    );
  } catch (err) {
    return cartErrorResponse(err, resolution.requestId);
  }
}
