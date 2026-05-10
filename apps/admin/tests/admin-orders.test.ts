import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const listAdminOrders = vi.hoisted(() => vi.fn());
const findAdminOrder = vi.hoisted(() => vi.fn());
const createFulfillment = vi.hoisted(() => vi.fn());
const createRefund = vi.hoisted(() => vi.fn());
const findAdminById = vi.hoisted(() => vi.fn());
const insertAuditLog = vi.hoisted(() => vi.fn());

const ORIGINAL_ENV = process.env;

vi.mock("@commerce/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce/db")>();
  return {
    ...actual,
    listAdminOrders,
    findAdminOrder,
    createFulfillment,
    createRefund,
    findAdminById,
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
    PAYMENT_MODE: "mock",
  };
  listAdminOrders.mockReset();
  findAdminOrder.mockReset();
  createFulfillment.mockReset();
  createRefund.mockReset();
  findAdminById.mockReset();
  insertAuditLog.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("admin order routes", () => {
  it("GET /api/v1/orders returns 401 without admin auth", async () => {
    const { GET } = await import("../app/api/v1/orders/route");
    const res = await GET(new Request("http://test/api/v1/orders"));
    expect(res.status).toBe(401);
    expect(listAdminOrders).not.toHaveBeenCalled();
  });

  it("GET /api/v1/orders/[id] returns 401 without admin auth", async () => {
    const { GET } = await import("../app/api/v1/orders/[id]/route");
    const res = await GET(
      new Request("http://test/api/v1/orders/o1"),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect(res.status).toBe(401);
    expect(findAdminOrder).not.toHaveBeenCalled();
  });

  it("POST /api/v1/orders/[id]/fulfillments rejects without auth/CSRF", async () => {
    const { POST } = await import("../app/api/v1/orders/[id]/fulfillments/route");
    const res = await POST(
      new Request("http://test/api/v1/orders/o1/fulfillments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lines: [{ orderLineId: "ol1", quantity: 1 }] }),
      }),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect([401, 403]).toContain(res.status);
    expect(createFulfillment).not.toHaveBeenCalled();
  });

  it("POST /api/v1/orders/[id]/refunds rejects without auth/CSRF", async () => {
    const { POST } = await import("../app/api/v1/orders/[id]/refunds/route");
    const res = await POST(
      new Request("http://test/api/v1/orders/o1/refunds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lines: [{ orderLineId: "ol1", quantity: 1 }],
          reason: "단순변심",
          idempotencyKey: "idem_refund_test_001234",
        }),
      }),
      { params: Promise.resolve({ id: "o1" }) },
    );
    expect([401, 403]).toContain(res.status);
    expect(createRefund).not.toHaveBeenCalled();
  });
});
