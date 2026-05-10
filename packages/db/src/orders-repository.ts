import { getPrismaClient } from "./index";

export type OrderErrorCode =
  | "NO_DATABASE"
  | "ORDER_NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_STATE"
  | "INVALID_QUANTITY"
  | "REFUND_OVERDRAW"
  | "FULFILLMENT_OVERDRAW"
  | "PAYMENT_NOT_APPROVED"
  | "SHIPMENT_NOT_FOUND";

export class OrderError extends Error {
  constructor(
    public readonly code: OrderErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "OrderError";
  }
}

type PrismaForOrders = NonNullable<ReturnType<typeof getPrismaClient>>;

function requirePrisma(): PrismaForOrders {
  const prisma = getPrismaClient();
  if (!prisma) throw new OrderError("NO_DATABASE", "DATABASE_URL is not configured");
  return prisma;
}

const orderInclude = {
  lines: {
    include: {
      variant: { select: { sku: true, color: true, size: true, product: { select: { slug: true, name: true } } } },
      fulfillments: true,
      refunds: true,
    },
  },
  payments: { include: { refunds: true } },
  shipments: true,
};

const ORDER_PAGE_SIZE = 20;

export type OrderListItem = {
  id: string;
  status: string;
  totalPrice: number;
  subtotalPrice: number;
  createdAt: Date;
  paidAt: Date | null;
  itemCount: number;
};

export type OrderListResult = {
  items: OrderListItem[];
  total: number;
  page: number;
  pageSize: number;
};

export async function listCustomerOrders(input: {
  customerId: string;
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<OrderListResult> {
  const prisma = requirePrisma();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(50, Math.max(1, input.pageSize ?? ORDER_PAGE_SIZE));

  const where = {
    customerId: input.customerId,
    ...(input.status ? { status: input.status as never } : {}),
  };

  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lines: { select: { quantity: true } } },
    }),
  ]);

  const items: OrderListItem[] = rows.map((o) => ({
    id: o.id,
    status: o.status as string,
    totalPrice: o.totalPrice,
    subtotalPrice: o.subtotalPrice,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    itemCount: o.lines.reduce((sum, line) => sum + line.quantity, 0),
  }));
  return { items, total, page, pageSize };
}

export type OrderDetail = Awaited<ReturnType<typeof loadOrderDetail>>;

async function loadOrderDetail(prisma: PrismaForOrders, orderId: string) {
  return prisma.order.findUnique({ where: { id: orderId }, include: orderInclude });
}

export async function findCustomerOrder(input: {
  customerId: string;
  orderId: string;
}): Promise<NonNullable<OrderDetail>> {
  const prisma = requirePrisma();
  const order = await loadOrderDetail(prisma, input.orderId);
  if (!order) throw new OrderError("ORDER_NOT_FOUND", "order not found");
  if (order.customerId !== input.customerId) {
    throw new OrderError("FORBIDDEN", "order does not belong to customer");
  }
  return order;
}

export async function findAdminOrder(orderId: string): Promise<NonNullable<OrderDetail>> {
  const prisma = requirePrisma();
  const order = await loadOrderDetail(prisma, orderId);
  if (!order) throw new OrderError("ORDER_NOT_FOUND", "order not found");
  return order;
}

export async function listAdminOrders(input: {
  status?: string;
  page?: number;
  pageSize?: number;
}): Promise<OrderListResult & { items: Array<OrderListItem & { customerId: string }> }> {
  const prisma = requirePrisma();
  const page = Math.max(1, input.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, input.pageSize ?? ORDER_PAGE_SIZE));
  const where = input.status ? { status: input.status as never } : {};
  const [total, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: { lines: { select: { quantity: true } } },
    }),
  ]);
  const items = rows.map((o) => ({
    id: o.id,
    customerId: o.customerId,
    status: o.status as string,
    totalPrice: o.totalPrice,
    subtotalPrice: o.subtotalPrice,
    createdAt: o.createdAt,
    paidAt: o.paidAt,
    itemCount: o.lines.reduce((sum, line) => sum + line.quantity, 0),
  }));
  return { items, total, page, pageSize };
}

const CANCELLABLE_STATUSES = new Set(["DRAFT", "PENDING_PAYMENT", "PAID", "FULFILLING"]);

export async function cancelCustomerOrder(input: {
  customerId: string;
  orderId: string;
}): Promise<NonNullable<OrderDetail>> {
  const prisma = requirePrisma();
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: { lines: true, payments: true, shipments: true },
    });
    if (!order) throw new OrderError("ORDER_NOT_FOUND", "order not found");
    if (order.customerId !== input.customerId) {
      throw new OrderError("FORBIDDEN", "order does not belong to customer");
    }
    if (!CANCELLABLE_STATUSES.has(order.status)) {
      throw new OrderError(
        "INVALID_STATE",
        `order status ${order.status} is not cancellable`,
      );
    }
    const hasShipped = order.shipments.some((s) => s.shippedAt !== null);
    if (hasShipped) {
      throw new OrderError("INVALID_STATE", "order already shipped");
    }

    if (order.status === "PENDING_PAYMENT" || order.status === "DRAFT") {
      // Release reservations only — stock was never decremented.
      await tx.inventoryReservation.deleteMany({
        where: { reason: `order:${order.id}` },
      });
    } else if (order.status === "PAID" || order.status === "FULFILLING") {
      // Stock was already decremented when payment was confirmed; restore it.
      for (const line of order.lines) {
        await tx.productVariant.update({
          where: { id: line.variantId },
          data: { stock: { increment: line.quantity } },
        });
      }
    }

    await tx.order.update({
      where: { id: order.id },
      data: { status: "CANCELLED" },
    });

    const reloaded = await tx.order.findUnique({ where: { id: order.id }, include: orderInclude });
    if (!reloaded) throw new OrderError("ORDER_NOT_FOUND", "order vanished after cancel");
    return reloaded;
  });
}

export async function finalizePaidOrder(input: {
  paymentExternalId: string;
}): Promise<{ orderId: string; alreadyPaid: boolean } | null> {
  const prisma = requirePrisma();
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({
      where: { externalId: input.paymentExternalId },
      include: { order: { include: { lines: true } } },
    });
    if (!payment) return null;
    if (payment.order.status === "PAID" || payment.order.status === "FULFILLING") {
      return { orderId: payment.order.id, alreadyPaid: true };
    }
    if (payment.order.status === "CANCELLED" || payment.order.status === "REFUNDED") {
      return { orderId: payment.order.id, alreadyPaid: true };
    }

    for (const line of payment.order.lines) {
      const updated = await tx.productVariant.updateMany({
        where: {
          id: line.variantId,
          stock: { gte: line.quantity },
        },
        data: { stock: { decrement: line.quantity } },
      });
      if (updated.count !== 1) {
        throw new OrderError(
          "INVALID_STATE",
          `insufficient stock for variant ${line.variantId} during finalize`,
        );
      }
    }

    await tx.inventoryReservation.deleteMany({
      where: { reason: `order:${payment.order.id}` },
    });

    await tx.payment.update({
      where: { id: payment.id },
      data: { approvedAt: new Date() },
    });
    await tx.order.update({
      where: { id: payment.order.id },
      data: { status: "PAID", paidAt: new Date() },
    });
    return { orderId: payment.order.id, alreadyPaid: false };
  });
}

export type CreateFulfillmentInput = {
  orderId: string;
  lines: Array<{ orderLineId: string; quantity: number }>;
  shipment?: {
    carrier: string;
    trackingNumber?: string;
  };
};

export async function createFulfillment(
  input: CreateFulfillmentInput,
): Promise<NonNullable<OrderDetail>> {
  const prisma = requirePrisma();
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUnique({
      where: { id: input.orderId },
      include: {
        lines: { include: { fulfillments: true } },
        shipments: true,
      },
    });
    if (!order) throw new OrderError("ORDER_NOT_FOUND", "order not found");
    if (!["PAID", "FULFILLING"].includes(order.status)) {
      throw new OrderError("INVALID_STATE", `cannot fulfill order in status ${order.status}`);
    }
    if (input.lines.length === 0) {
      throw new OrderError("INVALID_QUANTITY", "no fulfillment lines provided");
    }

    const linesById = new Map(order.lines.map((line) => [line.id, line]));
    for (const fl of input.lines) {
      const orderLine = linesById.get(fl.orderLineId);
      if (!orderLine) {
        throw new OrderError("ORDER_NOT_FOUND", `order line ${fl.orderLineId} not in order`);
      }
      if (fl.quantity <= 0) {
        throw new OrderError("INVALID_QUANTITY", "fulfillment quantity must be > 0");
      }
      const alreadyFulfilled = orderLine.fulfillments
        .filter((f) => f.status !== "CANCELLED")
        .reduce((sum, f) => sum + f.quantity, 0);
      const remaining = orderLine.quantity - alreadyFulfilled;
      if (fl.quantity > remaining) {
        throw new OrderError(
          "FULFILLMENT_OVERDRAW",
          `line ${fl.orderLineId} only has ${remaining} units left to fulfill`,
        );
      }
    }

    const shipment = input.shipment
      ? await tx.shipment.create({
          data: {
            orderId: order.id,
            carrier: input.shipment.carrier,
            trackingNumber: input.shipment.trackingNumber,
            shippedAt: new Date(),
          },
        })
      : null;

    for (const fl of input.lines) {
      await tx.orderLineFulfillment.create({
        data: {
          orderLineId: fl.orderLineId,
          quantity: fl.quantity,
          shipmentId: shipment?.id,
          status: shipment ? "SHIPPED" : "PENDING",
        },
      });
    }

    // Recompute status: any partial → FULFILLING; all complete → SHIPPED
    const refreshedLines = await tx.orderLine.findMany({
      where: { orderId: order.id },
      include: { fulfillments: true },
    });
    const allComplete = refreshedLines.every((line) => {
      const fulfilled = line.fulfillments
        .filter((f) => f.status !== "CANCELLED")
        .reduce((sum, f) => sum + f.quantity, 0);
      return fulfilled >= line.quantity;
    });
    const newStatus = allComplete ? "SHIPPED" : "FULFILLING";

    await tx.order.update({
      where: { id: order.id },
      data: { status: newStatus as never },
    });

    const reloaded = await tx.order.findUnique({ where: { id: order.id }, include: orderInclude });
    if (!reloaded) throw new OrderError("ORDER_NOT_FOUND", "order vanished after fulfillment");
    return reloaded;
  });
}

export type RefundProvider = {
  refund: (input: {
    paymentExternalId: string;
    amount: number;
    reason: string;
    idempotencyKey: string;
  }) => Promise<{
    externalRefundId: string;
    refundedAmount: number;
    remainingAmount: number;
  }>;
};

export type CreateRefundInput = {
  orderId: string;
  lines: Array<{ orderLineId: string; quantity: number }>;
  reason: string;
  idempotencyKey: string;
  provider: RefundProvider;
};

export async function createRefund(
  input: CreateRefundInput,
): Promise<NonNullable<OrderDetail>> {
  const prisma = requirePrisma();

  // Compute the requested refund first, outside the tx, to avoid holding a tx open
  // across the (slow) external Toss call.
  const order = await prisma.order.findUnique({
    where: { id: input.orderId },
    include: {
      lines: { include: { refunds: true } },
      payments: { include: { refunds: true } },
    },
  });
  if (!order) throw new OrderError("ORDER_NOT_FOUND", "order not found");

  const payment = order.payments.find((p) => p.approvedAt !== null);
  if (!payment) {
    throw new OrderError("PAYMENT_NOT_APPROVED", "no approved payment to refund");
  }

  // Idempotency: if a PaymentRefund already exists with this externalRefundId, replay.
  const existingRefund = await prisma.paymentRefund.findFirst({
    where: { paymentId: payment.id, externalRefundId: { startsWith: `${payment.externalId}:${input.idempotencyKey}` } },
  });
  if (existingRefund) {
    const reloaded = await prisma.order.findUnique({ where: { id: order.id }, include: orderInclude });
    if (!reloaded) throw new OrderError("ORDER_NOT_FOUND", "order vanished after refund replay");
    return reloaded;
  }

  if (input.lines.length === 0) {
    throw new OrderError("INVALID_QUANTITY", "no refund lines provided");
  }

  const linesById = new Map(order.lines.map((line) => [line.id, line]));
  let refundAmount = 0;
  for (const rl of input.lines) {
    const orderLine = linesById.get(rl.orderLineId);
    if (!orderLine) {
      throw new OrderError("ORDER_NOT_FOUND", `order line ${rl.orderLineId} not in order`);
    }
    if (rl.quantity <= 0) {
      throw new OrderError("INVALID_QUANTITY", "refund quantity must be > 0");
    }
    const alreadyRefunded = orderLine.refunds
      .filter((r) => r.status !== "CANCELLED" && r.status !== "FAILED")
      .reduce((sum, r) => sum + r.quantity, 0);
    const remaining = orderLine.quantity - alreadyRefunded;
    if (rl.quantity > remaining) {
      throw new OrderError(
        "REFUND_OVERDRAW",
        `line ${rl.orderLineId} only has ${remaining} units left to refund`,
      );
    }
    refundAmount += orderLine.unitPrice * rl.quantity;
  }

  const totalRefunded = payment.refunds
    .filter((r) => r.status !== "CANCELLED" && r.status !== "FAILED")
    .reduce((sum, r) => sum + r.amount, 0);
  if (totalRefunded + refundAmount > payment.amount) {
    throw new OrderError(
      "REFUND_OVERDRAW",
      `cumulative refund ${totalRefunded + refundAmount} would exceed payment ${payment.amount}`,
    );
  }

  const providerResult = await input.provider.refund({
    paymentExternalId: payment.externalId,
    amount: refundAmount,
    reason: input.reason,
    idempotencyKey: input.idempotencyKey,
  });

  return prisma.$transaction(async (tx) => {
    const paymentRefund = await tx.paymentRefund.create({
      data: {
        paymentId: payment.id,
        externalRefundId: providerResult.externalRefundId,
        amount: refundAmount,
        reason: input.reason,
        status: "COMPLETED",
        completedAt: new Date(),
      },
    });

    for (const rl of input.lines) {
      await tx.orderLineRefund.create({
        data: {
          orderLineId: rl.orderLineId,
          paymentRefundId: paymentRefund.id,
          quantity: rl.quantity,
          status: "COMPLETED",
        },
      });
      // Restore stock for refunded units.
      const orderLine = linesById.get(rl.orderLineId)!;
      await tx.productVariant.update({
        where: { id: orderLine.variantId },
        data: { stock: { increment: rl.quantity } },
      });
    }

    // Recompute order status.
    const refreshedLines = await tx.orderLine.findMany({
      where: { orderId: order.id },
      include: { refunds: true },
    });
    const allFullyRefunded = refreshedLines.every((line) => {
      const refunded = line.refunds
        .filter((r) => r.status !== "CANCELLED" && r.status !== "FAILED")
        .reduce((sum, r) => sum + r.quantity, 0);
      return refunded >= line.quantity;
    });
    if (allFullyRefunded) {
      await tx.order.update({
        where: { id: order.id },
        data: { status: "REFUNDED" },
      });
    }

    const reloaded = await tx.order.findUnique({ where: { id: order.id }, include: orderInclude });
    if (!reloaded) throw new OrderError("ORDER_NOT_FOUND", "order vanished after refund");
    return reloaded;
  });
}

export type ShipmentTrackingStatus =
  | "INFORMATION_RECEIVED"
  | "AT_PICKUP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "EXCEPTION"
  | "RETURNED";

export type RecordShipmentTrackingInput = {
  shipmentId: string;
  result: {
    status: ShipmentTrackingStatus;
    statusDetail?: string;
    lastUpdatedAt: Date;
    deliveredAt?: Date;
  };
};

export type RecordShipmentTrackingOutput = {
  shipmentId: string;
  orderId: string;
  shipmentDelivered: boolean;
  orderTransitionedToDelivered: boolean;
};

export async function recordShipmentTracking(
  input: RecordShipmentTrackingInput,
): Promise<RecordShipmentTrackingOutput> {
  const prisma = requirePrisma();
  return prisma.$transaction(async (tx) => {
    const shipment = await tx.shipment.findUnique({ where: { id: input.shipmentId } });
    if (!shipment) {
      throw new OrderError("SHIPMENT_NOT_FOUND", `shipment ${input.shipmentId} not found`);
    }

    const isDelivered = input.result.status === "DELIVERED";
    const deliveredAt = isDelivered
      ? input.result.deliveredAt ?? input.result.lastUpdatedAt
      : null;

    await tx.shipment.update({
      where: { id: shipment.id },
      data: {
        lastTrackedAt: input.result.lastUpdatedAt,
        statusDetail: input.result.statusDetail ?? input.result.status,
        ...(deliveredAt ? { deliveredAt } : {}),
      },
    });

    let orderTransitioned = false;
    if (isDelivered) {
      const allShipments = await tx.shipment.findMany({ where: { orderId: shipment.orderId } });
      // Treat the just-updated shipment as delivered even if reload race appears.
      const allDelivered = allShipments.every(
        (s) => s.id === shipment.id || s.deliveredAt !== null,
      );
      if (allDelivered) {
        const order = await tx.order.findUnique({ where: { id: shipment.orderId } });
        if (order && order.status !== "DELIVERED") {
          await tx.order.update({
            where: { id: order.id },
            data: { status: "DELIVERED" },
          });
          orderTransitioned = true;
        }
      }
    }

    return {
      shipmentId: shipment.id,
      orderId: shipment.orderId,
      shipmentDelivered: isDelivered,
      orderTransitionedToDelivered: orderTransitioned,
    };
  });
}

export async function findShipment(shipmentId: string): Promise<{
  id: string;
  orderId: string;
  carrier: string;
  trackingNumber: string | null;
  shippedAt: Date | null;
  deliveredAt: Date | null;
  lastTrackedAt: Date | null;
  statusDetail: string | null;
}> {
  const prisma = requirePrisma();
  const shipment = await prisma.shipment.findUnique({ where: { id: shipmentId } });
  if (!shipment) {
    throw new OrderError("SHIPMENT_NOT_FOUND", `shipment ${shipmentId} not found`);
  }
  return shipment;
}
