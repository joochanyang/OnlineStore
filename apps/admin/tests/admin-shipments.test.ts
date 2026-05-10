import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const findShipment = vi.hoisted(() => vi.fn());
const recordShipmentTracking = vi.hoisted(() => vi.fn());
const insertAuditLog = vi.hoisted(() => vi.fn());
const findAdminById = vi.hoisted(() => vi.fn());

const ORIGINAL_ENV = process.env;

vi.mock("@commerce/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@commerce/db")>();
  return {
    ...actual,
    findShipment,
    recordShipmentTracking,
    insertAuditLog,
    findAdminById,
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
    SHIPPING_MODE: "mock",
  };
  findShipment.mockReset();
  recordShipmentTracking.mockReset();
  insertAuditLog.mockReset();
  findAdminById.mockReset();
});

afterEach(() => {
  process.env = ORIGINAL_ENV;
});

describe("admin shipment tracking route", () => {
  it("POST /api/v1/shipments/[id]/track rejects without auth/CSRF", async () => {
    const { POST } = await import("../app/api/v1/shipments/[id]/track/route");
    const res = await POST(
      new Request("http://test/api/v1/shipments/s1/track", {
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
      { params: Promise.resolve({ id: "s1" }) },
    );
    expect([401, 403]).toContain(res.status);
    expect(findShipment).not.toHaveBeenCalled();
    expect(recordShipmentTracking).not.toHaveBeenCalled();
  });

  it("does not invoke shipping provider before authentication passes", async () => {
    const { POST } = await import("../app/api/v1/shipments/[id]/track/route");
    const res = await POST(
      new Request("http://test/api/v1/shipments/missing/track", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // CSRF header without a valid session is still 401 — verifies provider isn't reached.
          "x-csrf-token": "fake",
        },
      }),
      { params: Promise.resolve({ id: "missing" }) },
    );
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).toBeLessThan(500);
    expect(findShipment).not.toHaveBeenCalled();
  });
});
