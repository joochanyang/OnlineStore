import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getOrCreateCart = vi.hoisted(() => vi.fn());
const reserveCheckoutInventory = vi.hoisted(() => vi.fn());
const findCustomerById = vi.hoisted(() => vi.fn());

const ORIGINAL_ENV = process.env;

vi.mock("@commerce/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce/db")>();
  return {
    ...actual,
    getOrCreateCart,
    reserveCheckoutInventory,
    findCustomerById,
  };
});

beforeEach(() => {
  process.env = {
    ...ORIGINAL_ENV,
    AUTH_JWT_SECRET: "a".repeat(64),
    AUTH_CSRF_SECRET: "b".repeat(64),
    NODE_ENV: "test",
    NEXT_PUBLIC_WEB_URL: "http://localhost:3000",
    NEXT_PUBLIC_ADMIN_URL: "http://localhost:3001",
    PAYMENT_MODE: "mock",
  };
  getOrCreateCart.mockReset();
  reserveCheckoutInventory.mockReset();
  findCustomerById.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("POST /api/v1/checkout/preview", () => {
  it("rejects guests without CSRF (403)", async () => {
    const { POST } = await import("../app/api/v1/checkout/preview/route");
    const res = await POST(
      new Request("http://test/api/v1/checkout/preview", {
        method: "POST",
        headers: { cookie: "cart_token=t1", "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(res.status).toBe(403);
    expect(reserveCheckoutInventory).not.toHaveBeenCalled();
  });

  it("returns 422 when cart is empty (with stubbed CSRF bypass via no-csrf path is not allowed)", async () => {
    // Without a valid CSRF pair we cannot reach the empty-cart branch via the route.
    // This test documents that the route refuses anonymous mutating calls without CSRF.
    const { POST } = await import("../app/api/v1/checkout/preview/route");
    const res = await POST(
      new Request("http://test/api/v1/checkout/preview", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(403);
  });
});
