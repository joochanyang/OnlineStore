import { getOrCreateCart } from "@commerce/db";

import { resolveCartIdentity } from "../../../../lib/cart-context";
import {
  cartEnvelope,
  cartErrorResponse,
  failureResponse,
  projectCart,
} from "../../../../lib/cart-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const resolution = await resolveCartIdentity(request);
  if (!resolution.ok) {
    return failureResponse(
      crypto.randomUUID(),
      resolution.failure.status,
      resolution.failure.code,
      resolution.failure.message,
    );
  }
  try {
    const cart = await getOrCreateCart(resolution.identity);
    return cartEnvelope(
      { cart: projectCart(cart) },
      resolution.requestId,
      resolution.mintedSetCookie,
    );
  } catch (err) {
    return cartErrorResponse(err, resolution.requestId);
  }
}
