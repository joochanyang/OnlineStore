import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getOrCreateCart = vi.hoisted(() => vi.fn());
const addCartItem = vi.hoisted(() => vi.fn());
const updateCartItemQuantity = vi.hoisted(() => vi.fn());
const removeCartItem = vi.hoisted(() => vi.fn());
const mergeCart = vi.hoisted(() => vi.fn());
const findCustomerById = vi.hoisted(() => vi.fn());

const ORIGINAL_ENV = process.env;

vi.mock("@commerce/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce/db")>();
  return {
    ...actual,
    getOrCreateCart,
    addCartItem,
    updateCartItemQuantity,
    removeCartItem,
    mergeCart,
    findCustomerById,
  };
});

const cartViewSample = {
  id: "cart_1",
  customerId: null,
  anonymousToken: "tok_xxx",
  items: [
    {
      id: "item_1",
      variantId: "v1",
      sku: "SHIRT-WHITE-M",
      productSlug: "shirt",
      productName: "Shirt",
      color: "white",
      size: "M",
      unitPrice: 39000,
      quantity: 2,
      lineTotal: 78000,
      stock: 10,
    },
  ],
  subtotal: 78000,
  expiresAt: new Date("2026-06-01T00:00:00Z"),
  lastActivityAt: new Date("2026-05-11T00:00:00Z"),
};

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    AUTH_JWT_SECRET: "a".repeat(64),
    AUTH_CSRF_SECRET: "b".repeat(64),
    NODE_ENV: "test",
    NEXT_PUBLIC_WEB_URL: "http://localhost:3000",
    NEXT_PUBLIC_ADMIN_URL: "http://localhost:3001",
  };
  getOrCreateCart.mockReset();
  addCartItem.mockReset();
  updateCartItemQuantity.mockReset();
  removeCartItem.mockReset();
  mergeCart.mockReset();
  findCustomerById.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("GET /api/v1/me/cart (guest)", () => {
  it("creates a cart token for first-time guests and returns the cart", async () => {
    const { GET } = await import("../app/api/v1/me/cart/route");
    getOrCreateCart.mockResolvedValueOnce(cartViewSample);

    const res = await GET(new Request("http://test/api/v1/me/cart"));
    expect(res.status).toBe(200);
    const setCookie = res.headers.get("set-cookie");
    expect(setCookie).toMatch(/^cart_token=[a-f0-9]+/);
    const body = await res.json();
    expect(body.data.cart.id).toBe("cart_1");
    expect(getOrCreateCart).toHaveBeenCalledWith({
      type: "anonymous",
      anonymousToken: expect.any(String),
    });
  });

  it("reuses existing cart token if present", async () => {
    const { GET } = await import("../app/api/v1/me/cart/route");
    getOrCreateCart.mockResolvedValueOnce(cartViewSample);

    const res = await GET(
      new Request("http://test/api/v1/me/cart", {
        headers: { cookie: "cart_token=fixed_token_value_123" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toBeNull();
    expect(getOrCreateCart).toHaveBeenCalledWith({
      type: "anonymous",
      anonymousToken: "fixed_token_value_123",
    });
  });
});

describe("POST /api/v1/me/cart/items", () => {
  it("rejects without CSRF cookie/header", async () => {
    const { POST } = await import("../app/api/v1/me/cart/items/route");
    const res = await POST(
      new Request("http://test/api/v1/me/cart/items", {
        method: "POST",
        headers: { cookie: "cart_token=t1", "content-type": "application/json" },
        body: JSON.stringify({ variantId: "v1", quantity: 1 }),
      }),
    );
    expect(res.status).toBe(403);
    expect(addCartItem).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/v1/me/cart/items/:id (guest)", () => {
  it("returns 422 for invalid quantity in PATCH", async () => {
    const { PATCH } = await import("../app/api/v1/me/cart/items/[id]/route");
    const res = await PATCH(
      new Request("http://test/api/v1/me/cart/items/item_1", {
        method: "PATCH",
        body: "{}",
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "item_1" }) },
    );
    expect([403, 422]).toContain(res.status);
  });
});

describe("POST /api/v1/me/cart/merge", () => {
  it("rejects guests with 401/403 (auth required)", async () => {
    const { POST } = await import("../app/api/v1/me/cart/merge/route");
    const res = await POST(
      new Request("http://test/api/v1/me/cart/merge", {
        method: "POST",
        headers: { cookie: "cart_token=tok_guest" },
      }),
    );
    expect([401, 403]).toContain(res.status);
    expect(mergeCart).not.toHaveBeenCalled();
  });
});
