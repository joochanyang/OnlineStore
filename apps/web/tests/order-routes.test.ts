import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listCustomerOrders = vi.hoisted(() => vi.fn());
const findCustomerOrder = vi.hoisted(() => vi.fn());
const cancelCustomerOrder = vi.hoisted(() => vi.fn());
const findCustomerById = vi.hoisted(() => vi.fn());
const insertAuditLog = vi.hoisted(() => vi.fn());

const ORIGINAL_ENV = process.env;

vi.mock("@commerce/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce/db")>();
  return {
    ...actual,
    listCustomerOrders,
    findCustomerOrder,
    cancelCustomerOrder,
    findCustomerById,
    insertAuditLog,
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
  };
  listCustomerOrders.mockReset();
  findCustomerOrder.mockReset();
  cancelCustomerOrder.mockReset();
  findCustomerById.mockReset();
  insertAuditLog.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("GET /api/v1/me/orders", () => {
  it("returns 401 without auth", async () => {
    const { GET } = await import("../app/api/v1/me/orders/route");
    const res = await GET(new Request("http://test/api/v1/me/orders"));
    expect(res.status).toBe(401);
    expect(listCustomerOrders).not.toHaveBeenCalled();
  });
});

describe("GET /api/v1/me/orders/[id]", () => {
  it("returns 401 without auth", async () => {
    const { GET } = await import("../app/api/v1/me/orders/[id]/route");
    const res = await GET(
      new Request("http://test/api/v1/me/orders/o1"),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(res.status).toBe(401);
    expect(findCustomerOrder).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/me/orders/[id]/cancel", () => {
  it("returns 401/403 without auth/CSRF", async () => {
    const { POST } = await import("../app/api/v1/me/orders/[id]/cancel/route");
    const res = await POST(
      new Request("http://test/api/v1/me/orders/o1/cancel", { method: "POST" }),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect([401, 403]).toContain(res.status);
    expect(cancelCustomerOrder).not.toHaveBeenCalled();
  });
});
