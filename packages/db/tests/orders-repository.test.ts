import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

type Args = Record<string, unknown>;
const pick = <T = unknown>(o: Args, k: string) => o[k] as T;

type OrderRow = {
  id: string;
  customerId: string;
  status: string;
  subtotalPrice: number;
  shippingFee: number;
  discountPrice: number;
  totalPrice: number;
  createdAt: Date;
  paidAt: Date | null;
};

type OrderLineRow = {
  id: string;
  orderId: string;
  variantId: string;
  quantity: number;
  unitPrice: number;
};

type FulfillmentRow = {
  id: string;
  orderLineId: string;
  shipmentId: string | null;
  quantity: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type RefundRow = {
  id: string;
  orderLineId: string;
  paymentRefundId: string;
  quantity: number;
  status: string;
  createdAt: Date;
  updatedAt: Date;
};

type PaymentRow = {
  id: string;
  orderId: string;
  externalId: string;
  idempotencyKey: string | null;
  amount: number;
  approvedAt: Date | null;
  provider: string;
};

type PaymentRefundRow = {
  id: string;
  paymentId: string;
  externalRefundId: string;
  amount: number;
  reason: string;
  status: string;
  requestedAt: Date;
  completedAt: Date | null;
};

type ShipmentRow = {
  id: string;
  orderId: string;
  carrier: string;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
};

type VariantRow = {
  id: string;
  sku: string;
  color: string;
  size: string;
  price: number;
  stock: number;
  product: { slug: string; name: string; status: "ACTIVE" | "DRAFT" | "ARCHIVED" };
};

type ReservationRow = {
  id: string;
  variantId: string;
  quantity: number;
  reason: string;
  expiresAt: Date | null;
};

class FakeOrdersDb {
  orders = new Map<string, OrderRow>();
  lines = new Map<string, OrderLineRow>();
  fulfillments = new Map<string, FulfillmentRow>();
  refunds = new Map<string, RefundRow>();
  payments = new Map<string, PaymentRow>();
  paymentRefunds = new Map<string, PaymentRefundRow>();
  shipments = new Map<string, ShipmentRow>();
  variants = new Map<string, VariantRow>();
  reservations = new Map<string, ReservationRow>();

  private seq = 1;
  private id(prefix: string) {
    return `${prefix}_${this.seq++}`;
  }

  order = {
    findUnique: async (args: Args) => {
      const where = pick<{ id: string }>(args, "where");
      const order = this.orders.get(where.id);
      if (!order) return null;
      return this.withInclude(order, pick<Args | undefined>(args, "include"));
    },
    findMany: async (args: Args) => {
      const where = pick<{ customerId?: string; status?: string }>(args, "where") ?? {};
      const skip = (pick<number | undefined>(args, "skip") ?? 0) as number;
      const take = (pick<number | undefined>(args, "take") ?? 50) as number;
      let rows = [...this.orders.values()];
      if (where.customerId) rows = rows.filter((r) => r.customerId === where.customerId);
      if (where.status) rows = rows.filter((r) => r.status === where.status);
      rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
      return rows.slice(skip, skip + take).map((r) => this.withInclude(r, pick<Args | undefined>(args, "include"))) as Array<
        OrderRow & { lines: Array<{ quantity: number }> }
      >;
    },
    count: async (args: Args) => {
      const where = pick<{ customerId?: string; status?: string }>(args, "where") ?? {};
      let rows = [...this.orders.values()];
      if (where.customerId) rows = rows.filter((r) => r.customerId === where.customerId);
      if (where.status) rows = rows.filter((r) => r.status === where.status);
      return rows.length;
    },
    update: async (args: Args) => {
      const where = pick<{ id: string }>(args, "where");
      const data = pick<Partial<OrderRow>>(args, "data");
      const order = this.orders.get(where.id);
      if (!order) throw new Error("order not found");
      Object.assign(order, data);
      return order;
    },
    create: async (args: Args) => {
      const data = pick<Record<string, unknown>>(args, "data");
      const id = this.id("order");
      const order: OrderRow = {
        id,
        customerId: data.customerId as string,
        status: (data.status as string) ?? "DRAFT",
        subtotalPrice: (data.subtotalPrice as number) ?? 0,
        shippingFee: (data.shippingFee as number) ?? 0,
        discountPrice: (data.discountPrice as number) ?? 0,
        totalPrice: (data.totalPrice as number) ?? 0,
        createdAt: new Date(),
        paidAt: null,
      };
      this.orders.set(id, order);
      return order;
    },
  };

  orderLine = {
    findMany: async (args: Args) => {
      const where = pick<{ orderId: string }>(args, "where");
      const list = [...this.lines.values()].filter((l) => l.orderId === where.orderId);
      return list.map((l) => ({
        ...l,
        fulfillments: [...this.fulfillments.values()].filter((f) => f.orderLineId === l.id),
        refunds: [...this.refunds.values()].filter((r) => r.orderLineId === l.id),
      }));
    },
  };

  orderLineFulfillment = {
    create: async (args: Args) => {
      const data = pick<Record<string, unknown>>(args, "data");
      const id = this.id("ff");
      const row: FulfillmentRow = {
        id,
        orderLineId: data.orderLineId as string,
        shipmentId: (data.shipmentId as string | null | undefined) ?? null,
        quantity: data.quantity as number,
        status: (data.status as string) ?? "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.fulfillments.set(id, row);
      return row;
    },
  };

  orderLineRefund = {
    create: async (args: Args) => {
      const data = pick<Record<string, unknown>>(args, "data");
      const id = this.id("lr");
      const row: RefundRow = {
        id,
        orderLineId: data.orderLineId as string,
        paymentRefundId: data.paymentRefundId as string,
        quantity: data.quantity as number,
        status: (data.status as string) ?? "PENDING",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      this.refunds.set(id, row);
      return row;
    },
  };

  payment = {
    findUnique: async (args: Args) => {
      const where = pick<{ id?: string; externalId?: string }>(args, "where");
      let payment: PaymentRow | undefined;
      if (where.id) payment = this.payments.get(where.id);
      else if (where.externalId) {
        for (const p of this.payments.values()) if (p.externalId === where.externalId) payment = p;
      }
      if (!payment) return null;
      const include = pick<Args | undefined>(args, "include");
      if (include?.order) {
        const order = this.orders.get(payment.orderId)!;
        const lines = [...this.lines.values()].filter((l) => l.orderId === order.id);
        return { ...payment, order: { ...order, lines } };
      }
      return payment;
    },
    update: async (args: Args) => {
      const where = pick<{ id: string }>(args, "where");
      const data = pick<Partial<PaymentRow>>(args, "data");
      const payment = this.payments.get(where.id);
      if (!payment) throw new Error("payment not found");
      Object.assign(payment, data);
      return payment;
    },
  };

  paymentRefund = {
    findFirst: async (args: Args) => {
      const where = pick<{ paymentId: string; externalRefundId?: { startsWith?: string } }>(args, "where");
      const list = [...this.paymentRefunds.values()].filter((r) => r.paymentId === where.paymentId);
      if (where.externalRefundId?.startsWith) {
        return list.find((r) => r.externalRefundId.startsWith(where.externalRefundId!.startsWith!)) ?? null;
      }
      return list[0] ?? null;
    },
    create: async (args: Args) => {
      const data = pick<Record<string, unknown>>(args, "data");
      const id = this.id("pr");
      const row: PaymentRefundRow = {
        id,
        paymentId: data.paymentId as string,
        externalRefundId: data.externalRefundId as string,
        amount: data.amount as number,
        reason: data.reason as string,
        status: (data.status as string) ?? "PENDING",
        requestedAt: new Date(),
        completedAt: (data.completedAt as Date | undefined) ?? null,
      };
      this.paymentRefunds.set(id, row);
      return row;
    },
  };

  shipment = {
    create: async (args: Args) => {
      const data = pick<Record<string, unknown>>(args, "data");
      const id = this.id("ship");
      const row: ShipmentRow = {
        id,
        orderId: data.orderId as string,
        carrier: data.carrier as string,
        trackingNumber: (data.trackingNumber as string | undefined) ?? null,
        shippedAt: (data.shippedAt as Date | undefined) ?? null,
        deliveredAt: null,
      };
      this.shipments.set(id, row);
      return row;
    },
  };

  productVariant = {
    update: async (args: Args) => {
      const where = pick<{ id: string }>(args, "where");
      const data = pick<{ stock?: { increment?: number; decrement?: number } }>(args, "data");
      const variant = this.variants.get(where.id);
      if (!variant) throw new Error("variant not found");
      if (data.stock?.increment) variant.stock += data.stock.increment;
      if (data.stock?.decrement) variant.stock -= data.stock.decrement;
      return variant;
    },
    updateMany: async (args: Args) => {
      const where = pick<{ id: string; stock?: { gte?: number } }>(args, "where");
      const data = pick<{ stock?: { increment?: number; decrement?: number } }>(args, "data");
      const variant = this.variants.get(where.id);
      if (!variant) return { count: 0 };
      if (where.stock?.gte !== undefined && variant.stock < where.stock.gte) {
        return { count: 0 };
      }
      if (data.stock?.increment) variant.stock += data.stock.increment;
      if (data.stock?.decrement) variant.stock -= data.stock.decrement;
      return { count: 1 };
    },
  };

  inventoryReservation = {
    deleteMany: async (args: Args) => {
      const where = pick<{ reason?: string }>(args, "where");
      let count = 0;
      for (const [id, row] of this.reservations) {
        if (!where.reason || row.reason === where.reason) {
          this.reservations.delete(id);
          count++;
        }
      }
      return { count };
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private withInclude(order: OrderRow, include: Args | undefined) {
    const out: Record<string, unknown> = { ...order };
    if (!include) return out;
    const linesInclude = include.lines as Args | undefined | true;
    if (linesInclude) {
      const lines = [...this.lines.values()].filter((l) => l.orderId === order.id);
      const fullLines = lines.map((l) => {
        const variant = this.variants.get(l.variantId);
        const fls = [...this.fulfillments.values()].filter((f) => f.orderLineId === l.id);
        const refs = [...this.refunds.values()].filter((r) => r.orderLineId === l.id);
        return {
          ...l,
          variant: variant
            ? {
                sku: variant.sku,
                color: variant.color,
                size: variant.size,
                product: { slug: variant.product.slug, name: variant.product.name },
              }
            : undefined,
          fulfillments: fls,
          refunds: refs,
        };
      });
      out.lines = typeof linesInclude === "object" && linesInclude.select
        ? fullLines.map((l) => ({ quantity: l.quantity }))
        : fullLines;
    }
    if (include.payments) {
      const payments = [...this.payments.values()].filter((p) => p.orderId === order.id);
      out.payments = payments.map((p) => ({
        ...p,
        refunds: [...this.paymentRefunds.values()].filter((r) => r.paymentId === p.id),
      }));
    }
    if (include.shipments) {
      out.shipments = [...this.shipments.values()].filter((s) => s.orderId === order.id);
    }
    return out;
  }
}

const fake = new FakeOrdersDb();
const getPrismaClientMock = vi.hoisted(() => vi.fn());

vi.mock("../src/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/index")>();
  return { ...actual, getPrismaClient: getPrismaClientMock };
});

import {
  OrderError,
  cancelCustomerOrder,
  createFulfillment,
  createRefund,
  finalizePaidOrder,
  findCustomerOrder,
  listCustomerOrders,
} from "../src/orders-repository";

beforeEach(() => {
  fake.orders.clear();
  fake.lines.clear();
  fake.fulfillments.clear();
  fake.refunds.clear();
  fake.payments.clear();
  fake.paymentRefunds.clear();
  fake.shipments.clear();
  fake.variants.clear();
  fake.reservations.clear();
  fake.variants.set("v1", {
    id: "v1",
    sku: "SHIRT-WHITE-M",
    color: "white",
    size: "M",
    price: 39000,
    stock: 5,
    product: { slug: "shirt", name: "Shirt", status: "ACTIVE" },
  });
  getPrismaClientMock.mockReturnValue(fake);
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

function seedOrder(opts: {
  customerId?: string;
  status?: string;
  paid?: boolean;
}) {
  const customerId = opts.customerId ?? "cust-1";
  const order: OrderRow = {
    id: "o1",
    customerId,
    status: opts.status ?? "PAID",
    subtotalPrice: 78000,
    shippingFee: 3000,
    discountPrice: 0,
    totalPrice: 81000,
    createdAt: new Date(),
    paidAt: opts.paid === false ? null : new Date(),
  };
  fake.orders.set(order.id, order);
  const line: OrderLineRow = {
    id: "ol1",
    orderId: order.id,
    variantId: "v1",
    quantity: 2,
    unitPrice: 39000,
  };
  fake.lines.set(line.id, line);
  if (opts.paid !== false) {
    const payment: PaymentRow = {
      id: "p1",
      orderId: order.id,
      externalId: "ext_payment_1",
      idempotencyKey: "idem_1234567890123456",
      amount: 81000,
      approvedAt: new Date(),
      provider: "toss",
    };
    fake.payments.set(payment.id, payment);
  }
  return { order, line };
}

describe("orders-repository", () => {
  it("listCustomerOrders only returns orders owned by the customer", async () => {
    seedOrder({ customerId: "cust-1" });
    const otherOrder: OrderRow = {
      id: "o2",
      customerId: "cust-OTHER",
      status: "PAID",
      subtotalPrice: 1,
      shippingFee: 0,
      discountPrice: 0,
      totalPrice: 1,
      createdAt: new Date(),
      paidAt: new Date(),
    };
    fake.orders.set(otherOrder.id, otherOrder);

    const result = await listCustomerOrders({ customerId: "cust-1" });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]!.id).toBe("o1");
    expect(result.total).toBe(1);
  });

  it("findCustomerOrder returns FORBIDDEN when order belongs to someone else", async () => {
    seedOrder({ customerId: "cust-1" });
    await expect(
      findCustomerOrder({ customerId: "cust-OTHER", orderId: "o1" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("cancelCustomerOrder restores stock for PAID orders", async () => {
    seedOrder({ customerId: "cust-1", status: "PAID" });
    const variant = fake.variants.get("v1")!;
    const stockBefore = variant.stock;
    await cancelCustomerOrder({ customerId: "cust-1", orderId: "o1" });
    expect(fake.variants.get("v1")!.stock).toBe(stockBefore + 2);
    expect(fake.orders.get("o1")!.status).toBe("CANCELLED");
  });

  it("cancelCustomerOrder rejects orders that are already shipped", async () => {
    seedOrder({ customerId: "cust-1", status: "SHIPPED" });
    await expect(
      cancelCustomerOrder({ customerId: "cust-1", orderId: "o1" }),
    ).rejects.toMatchObject({ code: "INVALID_STATE" });
  });

  it("finalizePaidOrder is idempotent on already-paid orders", async () => {
    seedOrder({ customerId: "cust-1", status: "PAID" });
    const result = await finalizePaidOrder({ paymentExternalId: "ext_payment_1" });
    expect(result?.alreadyPaid).toBe(true);
  });

  it("finalizePaidOrder decrements stock on first delivery", async () => {
    seedOrder({ customerId: "cust-1", status: "PENDING_PAYMENT" });
    fake.orders.get("o1")!.paidAt = null;
    const stockBefore = fake.variants.get("v1")!.stock;
    const result = await finalizePaidOrder({ paymentExternalId: "ext_payment_1" });
    expect(result?.alreadyPaid).toBe(false);
    expect(fake.variants.get("v1")!.stock).toBe(stockBefore - 2);
    expect(fake.orders.get("o1")!.status).toBe("PAID");
  });

  it("createFulfillment rejects overdraw", async () => {
    seedOrder({ customerId: "cust-1", status: "PAID" });
    await expect(
      createFulfillment({
        orderId: "o1",
        lines: [{ orderLineId: "ol1", quantity: 99 }],
      }),
    ).rejects.toMatchObject({ code: "FULFILLMENT_OVERDRAW" });
  });

  it("createFulfillment marks order SHIPPED when all lines fulfilled with shipment", async () => {
    seedOrder({ customerId: "cust-1", status: "PAID" });
    const result = await createFulfillment({
      orderId: "o1",
      lines: [{ orderLineId: "ol1", quantity: 2 }],
      shipment: { carrier: "CJ", trackingNumber: "1234" },
    });
    expect(result.status).toBe("SHIPPED");
    expect(fake.shipments.size).toBe(1);
  });

  it("createRefund rejects when amount exceeds payment", async () => {
    seedOrder({ customerId: "cust-1", status: "PAID" });
    // Payment.amount = 81000, line unit = 39000, 3 units = 117000 > 81000
    fake.lines.get("ol1")!.quantity = 3;
    fake.orders.get("o1")!.subtotalPrice = 117000;
    fake.orders.get("o1")!.totalPrice = 120000;
    fake.payments.get("p1")!.amount = 81000;

    const provider = {
      refund: async () => {
        throw new OrderError("INVALID_STATE", "should not be reached");
      },
    };

    await expect(
      createRefund({
        orderId: "o1",
        lines: [{ orderLineId: "ol1", quantity: 3 }],
        reason: "test",
        idempotencyKey: "idem_refund_overdraw_1",
        provider,
      }),
    ).rejects.toMatchObject({ code: "REFUND_OVERDRAW" });
  });

  it("createRefund succeeds and writes PaymentRefund + restores stock", async () => {
    seedOrder({ customerId: "cust-1", status: "PAID" });
    const stockBefore = fake.variants.get("v1")!.stock;
    const provider = {
      refund: async () => ({
        externalRefundId: "ext_payment_1:idem_refund_ok_001:0",
        refundedAmount: 39000,
        remainingAmount: 42000,
      }),
    };

    const updated = await createRefund({
      orderId: "o1",
      lines: [{ orderLineId: "ol1", quantity: 1 }],
      reason: "single",
      idempotencyKey: "idem_refund_ok_0010000000",
      provider,
    });

    expect(fake.paymentRefunds.size).toBe(1);
    expect(fake.variants.get("v1")!.stock).toBe(stockBefore + 1);
    void updated;
  });
});
