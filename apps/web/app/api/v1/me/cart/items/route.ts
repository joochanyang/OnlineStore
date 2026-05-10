import { addCartItem } from "@commerce/db";
import type { CartAddItemRequest } from "@commerce/api/contracts";

import { resolveCartIdentity } from "../../../../../lib/cart-context";
import {
  cartEnvelope,
  cartErrorResponse,
  failureResponse,
  projectCart,
} from "../../../../../lib/cart-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const resolution = await resolveCartIdentity(request, { requireCsrf: true });
  if (!resolution.ok) {
    return failureResponse(
      crypto.randomUUID(),
      resolution.failure.status,
      resolution.failure.code,
      resolution.failure.message,
    );
  }
  let payload: CartAddItemRequest;
  try {
    const json = (await request.json()) as Partial<CartAddItemRequest>;
    if (typeof json?.variantId !== "string" || !json.variantId.trim()) {
      return failureResponse(
        resolution.requestId,
        422,
        "INVALID_PAYLOAD",
        "variantId required",
      );
    }
    if (typeof json.quantity !== "number" || !Number.isFinite(json.quantity)) {
      return failureResponse(
        resolution.requestId,
        422,
        "INVALID_PAYLOAD",
        "quantity required",
      );
    }
    payload = { variantId: json.variantId.trim(), quantity: Math.trunc(json.quantity) };
  } catch {
    return failureResponse(resolution.requestId, 400, "BAD_JSON", "invalid request body");
  }

  try {
    const cart = await addCartItem({
      identity: resolution.identity,
      variantId: payload.variantId,
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
