import { getOrCreateCart, mergeCart } from "@commerce/db";
import { buildSetCookie, readCookie } from "@commerce/auth";

import {
  CART_TOKEN_COOKIE,
  resolveCartIdentity,
} from "../../../../../lib/cart-context";
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
  if (resolution.kind !== "customer" || resolution.identity.type !== "customer") {
    return failureResponse(
      resolution.requestId,
      401,
      "AUTH_REQUIRED",
      "merge requires an authenticated customer",
    );
  }

  const customerId = resolution.identity.customerId;
  const guestToken = readCookie(request, CART_TOKEN_COOKIE);

  try {
    if (!guestToken) {
      const cart = await getOrCreateCart({ type: "customer", customerId });
      return cartEnvelope(
        { cart: projectCart(cart), merged: false },
        resolution.requestId,
      );
    }
    const cart = await mergeCart({ anonymousToken: guestToken, customerId });
    const response = cartEnvelope(
      { cart: projectCart(cart), merged: true },
      resolution.requestId,
    );
    response.headers.append(
      "set-cookie",
      buildSetCookie({
        name: CART_TOKEN_COOKIE,
        value: "",
        path: "/",
        maxAgeSeconds: 0,
        expires: new Date(0),
        sameSite: "lax",
        httpOnly: true,
      }),
    );
    return response;
  } catch (err) {
    return cartErrorResponse(err, resolution.requestId);
  }
}
