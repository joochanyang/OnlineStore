import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

type Args = Record<string, unknown>;
const pick = <T = unknown>(o: Args, k: string) => o[k] as T;

type ShipmentRow = {
  id: string;
  orderId: string;
  carrier: string;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  lastTrackedAt: Date | null;
  statusDetail: string | null;
};

type OrderRow = {
  id: string;
  status: string;
};

class FakeShipmentDb {
  shipments = new Map<string, ShipmentRow>();
  orders = new Map<string, OrderRow>();

  shipment = {
    findUnique: async (args: Args) => {
      const where = pick<{ id: string }>(args, "where");
      return this.shipments.get(where.id) ?? null;
    },
    findMany: async (args: Args) => {
      const where = pick<{ orderId?: string }>(args, "where") ?? {};
      const all = [...this.shipments.values()];
      return where.orderId ? all.filter((s) => s.orderId === where.orderId) : all;
    },
    update: async (args: Args) => {
      const where = pick<{ id: string }>(args, "where");
      const data = pick<Partial<ShipmentRow>>(args, "data");
      const row = this.shipments.get(where.id);
      if (!row) throw new Error("shipment not found");
      Object.assign(row, data);
      return row;
    },
  };

  order = {
    findUnique: async (args: Args) => {
      const where = pick<{ id: string }>(args, "where");
      return this.orders.get(where.id) ?? null;
    },
    update: async (args: Args) => {
      const where = pick<{ id: string }>(args, "where");
      const data = pick<Partial<OrderRow>>(args, "data");
      const row = this.orders.get(where.id);
      if (!row) throw new Error("order not found");
      Object.assign(row, data);
      return row;
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }
}

const fake = new FakeShipmentDb();
const getPrismaClientMock = vi.hoisted(() => vi.fn());

vi.mock("../src/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/index")>();
  return { ...actual, getPrismaClient: getPrismaClientMock };
});

import { OrderError, findShipment, recordShipmentTracking } from "../src/orders-repository";

beforeEach(() => {
  fake.shipments.clear();
  fake.orders.clear();
  fake.orders.set("o1", { id: "o1", status: "SHIPPED" });
  getPrismaClientMock.mockReturnValue(fake);
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function seedShipment(id: string, opts: Partial<ShipmentRow> = {}): ShipmentRow {
  const row: ShipmentRow = {
    id,
    orderId: opts.orderId ?? "o1",
    carrier: opts.carrier ?? "cj",
    trackingNumber: opts.trackingNumber ?? "1234567890",
    shippedAt: opts.shippedAt ?? new Date(),
    deliveredAt: opts.deliveredAt ?? null,
    lastTrackedAt: opts.lastTrackedAt ?? null,
    statusDetail: opts.statusDetail ?? null,
  };
  fake.shipments.set(id, row);
  return row;
}

describe("recordShipmentTracking", () => {
  it("updates lastTrackedAt + statusDetail without transitioning order on IN_TRANSIT", async () => {
    seedShipment("s1");
    const result = await recordShipmentTracking({
      shipmentId: "s1",
      result: {
        status: "IN_TRANSIT",
        statusDetail: "passing through hub",
        lastUpdatedAt: new Date("2026-05-11T01:00:00Z"),
      },
    });
    expect(result.shipmentDelivered).toBe(false);
    expect(result.orderTransitionedToDelivered).toBe(false);
    const row = fake.shipments.get("s1")!;
    expect(row.lastTrackedAt).toEqual(new Date("2026-05-11T01:00:00Z"));
    expect(row.statusDetail).toBe("passing through hub");
    expect(row.deliveredAt).toBeNull();
    expect(fake.orders.get("o1")!.status).toBe("SHIPPED");
  });

  it("transitions order to DELIVERED when this is the only shipment and it delivers", async () => {
    seedShipment("s1");
    const at = new Date("2026-05-11T03:00:00Z");
    const result = await recordShipmentTracking({
      shipmentId: "s1",
      result: { status: "DELIVERED", lastUpdatedAt: at },
    });
    expect(result.shipmentDelivered).toBe(true);
    expect(result.orderTransitionedToDelivered).toBe(true);
    expect(fake.shipments.get("s1")!.deliveredAt).toEqual(at);
    expect(fake.orders.get("o1")!.status).toBe("DELIVERED");
  });

  it("does NOT transition order when sibling shipments are still in transit", async () => {
    seedShipment("s1");
    seedShipment("s2", { orderId: "o1", trackingNumber: "9999999991" });
    const result = await recordShipmentTracking({
      shipmentId: "s1",
      result: { status: "DELIVERED", lastUpdatedAt: new Date() },
    });
    expect(result.shipmentDelivered).toBe(true);
    expect(result.orderTransitionedToDelivered).toBe(false);
    expect(fake.orders.get("o1")!.status).toBe("SHIPPED");
  });

  it("transitions order DELIVERED when last sibling shipment finally delivers", async () => {
    seedShipment("s1", { deliveredAt: new Date("2026-05-10T00:00:00Z") });
    seedShipment("s2", { orderId: "o1", trackingNumber: "9999999991" });
    const result = await recordShipmentTracking({
      shipmentId: "s2",
      result: { status: "DELIVERED", lastUpdatedAt: new Date("2026-05-11T05:00:00Z") },
    });
    expect(result.orderTransitionedToDelivered).toBe(true);
    expect(fake.orders.get("o1")!.status).toBe("DELIVERED");
  });

  it("is idempotent — re-recording DELIVERED on already-DELIVERED order does not flip transition flag again", async () => {
    seedShipment("s1");
    fake.orders.get("o1")!.status = "DELIVERED";
    const result = await recordShipmentTracking({
      shipmentId: "s1",
      result: { status: "DELIVERED", lastUpdatedAt: new Date() },
    });
    expect(result.orderTransitionedToDelivered).toBe(false);
    expect(fake.orders.get("o1")!.status).toBe("DELIVERED");
  });

  it("throws SHIPMENT_NOT_FOUND when shipment id does not exist", async () => {
    await expect(
      recordShipmentTracking({
        shipmentId: "missing",
        result: { status: "IN_TRANSIT", lastUpdatedAt: new Date() },
      }),
    ).rejects.toMatchObject({ code: "SHIPMENT_NOT_FOUND" });

    await expect(findShipment("missing")).rejects.toBeInstanceOf(OrderError);
  });

  it("findShipment returns the shipment row when present", async () => {
    seedShipment("s1");
    const row = await findShipment("s1");
    expect(row.id).toBe("s1");
    expect(row.orderId).toBe("o1");
  });
});
