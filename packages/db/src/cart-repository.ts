import { getPrismaClient } from "./index";

export type CartIdentity =
  | { type: "customer"; customerId: string }
  | { type: "anonymous"; anonymousToken: string };

export type CartItemView = {
  id: string;
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  color: string;
  size: string;
  unitPrice: number;
  quantity: number;
  lineTotal: number;
  stock: number;
};

export type CartView = {
  id: string;
  customerId: string | null;
  anonymousToken: string | null;
  items: CartItemView[];
  subtotal: number;
  expiresAt: Date;
  lastActivityAt: Date;
};

export type CartErrorCode =
  | "NO_DATABASE"
  | "VARIANT_NOT_FOUND"
  | "VARIANT_INACTIVE"
  | "INSUFFICIENT_STOCK"
  | "ITEM_NOT_FOUND"
  | "CART_NOT_FOUND"
  | "INVALID_QUANTITY";

export class CartError extends Error {
  constructor(
    public readonly code: CartErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "CartError";
  }
}

export const CART_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const MAX_ITEM_QUANTITY = 99;

type PrismaForCart = NonNullable<ReturnType<typeof getPrismaClient>>;

function requirePrisma(): PrismaForCart {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new CartError("NO_DATABASE", "DATABASE_URL is not configured");
  }
  return prisma;
}

function nextExpiresAt(now: Date = new Date()): Date {
  return new Date(now.getTime() + CART_TTL_MS);
}

function projectItem(record: {
  id: string;
  variantId: string;
  quantity: number;
  variant: {
    id: string;
    sku: string;
    color: string;
    size: string;
    price: number;
    stock: number;
    product: { slug: string; name: string };
  };
}): CartItemView {
  return {
    id: record.id,
    variantId: record.variantId,
    sku: record.variant.sku,
    productSlug: record.variant.product.slug,
    productName: record.variant.product.name,
    color: record.variant.color,
    size: record.variant.size,
    unitPrice: record.variant.price,
    quantity: record.quantity,
    lineTotal: record.variant.price * record.quantity,
    stock: record.variant.stock,
  };
}

function projectCart(record: {
  id: string;
  customerId: string | null;
  anonymousToken: string | null;
  expiresAt: Date;
  lastActivityAt: Date;
  items: Array<Parameters<typeof projectItem>[0]>;
}): CartView {
  const items = record.items.map(projectItem);
  return {
    id: record.id,
    customerId: record.customerId,
    anonymousToken: record.anonymousToken,
    items,
    subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0),
    expiresAt: record.expiresAt,
    lastActivityAt: record.lastActivityAt,
  };
}

const cartInclude = {
  items: {
    include: {
      variant: {
        include: { product: { select: { slug: true, name: true } } },
      },
    },
    orderBy: { addedAt: "desc" as const },
  },
};

async function loadCartByIdentity(
  prisma: PrismaForCart,
  identity: CartIdentity,
): Promise<CartView | null> {
  const where =
    identity.type === "customer"
      ? { customerId: identity.customerId }
      : { anonymousToken: identity.anonymousToken };
  const found = await prisma.cart.findFirst({ where, include: cartInclude });
  return found ? projectCart(found) : null;
}

export async function getOrCreateCart(identity: CartIdentity): Promise<CartView> {
  const prisma = requirePrisma();
  const existing = await loadCartByIdentity(prisma, identity);
  if (existing) return existing;

  const created = await prisma.cart.create({
    data: {
      customerId: identity.type === "customer" ? identity.customerId : null,
      anonymousToken: identity.type === "anonymous" ? identity.anonymousToken : null,
      expiresAt: nextExpiresAt(),
    },
    include: cartInclude,
  });
  return projectCart(created);
}

async function findVariantOrFail(prisma: PrismaForCart, variantId: string) {
  const variant = await prisma.productVariant.findUnique({
    where: { id: variantId },
    include: { product: { select: { slug: true, name: true, status: true } } },
  });
  if (!variant) {
    throw new CartError("VARIANT_NOT_FOUND", `Variant ${variantId} not found`);
  }
  if (variant.product.status !== "ACTIVE") {
    throw new CartError("VARIANT_INACTIVE", `Variant ${variantId} is not for sale`);
  }
  return variant;
}

function assertQuantity(quantity: number): void {
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > MAX_ITEM_QUANTITY) {
    throw new CartError(
      "INVALID_QUANTITY",
      `Quantity must be an integer between 1 and ${MAX_ITEM_QUANTITY}`,
    );
  }
}

export async function addCartItem(input: {
  identity: CartIdentity;
  variantId: string;
  quantity: number;
}): Promise<CartView> {
  assertQuantity(input.quantity);
  const prisma = requirePrisma();
  const variant = await findVariantOrFail(prisma, input.variantId);

  const cart = await getOrCreateCart(input.identity);
  const existing = cart.items.find((item) => item.variantId === input.variantId);
  const newQuantity = (existing?.quantity ?? 0) + input.quantity;
  if (newQuantity > variant.stock) {
    throw new CartError(
      "INSUFFICIENT_STOCK",
      `Only ${variant.stock} units of ${variant.sku} are in stock`,
    );
  }
  if (newQuantity > MAX_ITEM_QUANTITY) {
    throw new CartError(
      "INVALID_QUANTITY",
      `Per-line quantity capped at ${MAX_ITEM_QUANTITY}`,
    );
  }

  await prisma.cartItem.upsert({
    where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } },
    create: {
      cartId: cart.id,
      variantId: input.variantId,
      quantity: input.quantity,
    },
    update: { quantity: newQuantity },
  });
  await prisma.cart.update({
    where: { id: cart.id },
    data: { lastActivityAt: new Date(), expiresAt: nextExpiresAt() },
  });

  const refreshed = await loadCartByIdentity(prisma, input.identity);
  if (!refreshed) throw new CartError("CART_NOT_FOUND", "Cart vanished after upsert");
  return refreshed;
}

export async function updateCartItemQuantity(input: {
  identity: CartIdentity;
  itemId: string;
  quantity: number;
}): Promise<CartView> {
  const prisma = requirePrisma();
  const cart = await loadCartByIdentity(prisma, input.identity);
  if (!cart) throw new CartError("CART_NOT_FOUND", "Cart not found");
  const item = cart.items.find((entry) => entry.id === input.itemId);
  if (!item) throw new CartError("ITEM_NOT_FOUND", `Item ${input.itemId} not in cart`);

  if (input.quantity <= 0) {
    return removeCartItem({ identity: input.identity, itemId: input.itemId });
  }
  assertQuantity(input.quantity);
  if (input.quantity > item.stock) {
    throw new CartError(
      "INSUFFICIENT_STOCK",
      `Only ${item.stock} units of ${item.sku} are in stock`,
    );
  }

  await prisma.cartItem.update({
    where: { id: input.itemId },
    data: { quantity: input.quantity },
  });
  await prisma.cart.update({
    where: { id: cart.id },
    data: { lastActivityAt: new Date(), expiresAt: nextExpiresAt() },
  });

  const refreshed = await loadCartByIdentity(prisma, input.identity);
  if (!refreshed) throw new CartError("CART_NOT_FOUND", "Cart vanished after update");
  return refreshed;
}

export async function removeCartItem(input: {
  identity: CartIdentity;
  itemId: string;
}): Promise<CartView> {
  const prisma = requirePrisma();
  const cart = await loadCartByIdentity(prisma, input.identity);
  if (!cart) throw new CartError("CART_NOT_FOUND", "Cart not found");
  const owned = cart.items.some((entry) => entry.id === input.itemId);
  if (!owned) throw new CartError("ITEM_NOT_FOUND", `Item ${input.itemId} not in cart`);

  await prisma.cartItem.delete({ where: { id: input.itemId } });
  await prisma.cart.update({
    where: { id: cart.id },
    data: { lastActivityAt: new Date(), expiresAt: nextExpiresAt() },
  });

  const refreshed = await loadCartByIdentity(prisma, input.identity);
  if (!refreshed) throw new CartError("CART_NOT_FOUND", "Cart vanished after delete");
  return refreshed;
}

export async function mergeCart(input: {
  anonymousToken: string;
  customerId: string;
}): Promise<CartView> {
  const prisma = requirePrisma();
  const guest = await prisma.cart.findUnique({
    where: { anonymousToken: input.anonymousToken },
    include: cartInclude,
  });
  const member = await prisma.cart.findUnique({
    where: { customerId: input.customerId },
    include: cartInclude,
  });

  if (!guest && !member) {
    return getOrCreateCart({ type: "customer", customerId: input.customerId });
  }

  // No guest cart → just attach the member cart (or create one).
  if (!guest) {
    return getOrCreateCart({ type: "customer", customerId: input.customerId });
  }

  // No member cart yet → reassign the guest cart to the customer.
  if (!member) {
    await prisma.cart.update({
      where: { id: guest.id },
      data: {
        customerId: input.customerId,
        anonymousToken: null,
        lastActivityAt: new Date(),
        expiresAt: nextExpiresAt(),
      },
    });
    const refreshed = await loadCartByIdentity(prisma, {
      type: "customer",
      customerId: input.customerId,
    });
    if (!refreshed) throw new CartError("CART_NOT_FOUND", "Cart vanished after merge");
    return refreshed;
  }

  // Both exist → sum quantities item-by-item, then drop the guest cart.
  const memberItemsByVariant = new Map(member.items.map((item) => [item.variantId, item]));
  for (const guestItem of guest.items) {
    const memberItem = memberItemsByVariant.get(guestItem.variantId);
    const summed = (memberItem?.quantity ?? 0) + guestItem.quantity;
    const capped = Math.min(summed, MAX_ITEM_QUANTITY, guestItem.variant.stock);
    if (memberItem) {
      await prisma.cartItem.update({
        where: { id: memberItem.id },
        data: { quantity: capped },
      });
    } else {
      await prisma.cartItem.create({
        data: {
          cartId: member.id,
          variantId: guestItem.variantId,
          quantity: capped,
        },
      });
    }
  }
  await prisma.cart.delete({ where: { id: guest.id } });
  await prisma.cart.update({
    where: { id: member.id },
    data: { lastActivityAt: new Date(), expiresAt: nextExpiresAt() },
  });

  const refreshed = await loadCartByIdentity(prisma, {
    type: "customer",
    customerId: input.customerId,
  });
  if (!refreshed) throw new CartError("CART_NOT_FOUND", "Cart vanished after merge");
  return refreshed;
}

export async function expireOldCarts(now: Date = new Date()): Promise<number> {
  const prisma = getPrismaClient();
  if (!prisma) return 0;
  const result = await prisma.cart.deleteMany({ where: { expiresAt: { lt: now } } });
  return result.count;
}

export const CHECKOUT_RESERVATION_TTL_MS = 10 * 60 * 1000;

export type CheckoutReservationLine = {
  reservationId: string;
  variantId: string;
  sku: string;
  quantity: number;
  unitPrice: number;
};

export type CheckoutReservation = {
  groupId: string;
  expiresAt: Date;
  lines: CheckoutReservationLine[];
};

export async function reserveCheckoutInventory(input: {
  cartId: string;
  items: Array<{ variantId: string; quantity: number }>;
  ttlMs?: number;
  groupId?: string;
}): Promise<CheckoutReservation> {
  if (input.items.length === 0) {
    throw new CartError("INVALID_QUANTITY", "Cannot reserve an empty cart");
  }
  const prisma = requirePrisma();
  const ttlMs = input.ttlMs ?? CHECKOUT_RESERVATION_TTL_MS;
  const groupId = input.groupId ?? input.cartId;
  const expiresAt = new Date(Date.now() + ttlMs);
  const reason = `checkout:${groupId}`;

  return prisma.$transaction(async (tx) => {
    const lines: CheckoutReservationLine[] = [];
    for (const wanted of input.items) {
      const variant = await tx.productVariant.findUnique({
        where: { id: wanted.variantId },
        include: { product: { select: { status: true } } },
      });
      if (!variant) {
        throw new CartError("VARIANT_NOT_FOUND", `Variant ${wanted.variantId} not found`);
      }
      if (variant.product.status !== "ACTIVE") {
        throw new CartError("VARIANT_INACTIVE", `Variant ${wanted.variantId} is not for sale`);
      }

      const reservedAggregate = await tx.inventoryReservation.aggregate({
        where: {
          variantId: variant.id,
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
        },
        _sum: { quantity: true },
      });
      const reservedQty = reservedAggregate._sum.quantity ?? 0;
      const available = variant.stock - reservedQty;
      if (wanted.quantity > available) {
        throw new CartError(
          "INSUFFICIENT_STOCK",
          `Only ${Math.max(available, 0)} units of ${variant.sku} available`,
        );
      }

      const reservation = await tx.inventoryReservation.create({
        data: {
          variantId: variant.id,
          quantity: wanted.quantity,
          reason,
          expiresAt,
        },
      });

      lines.push({
        reservationId: reservation.id,
        variantId: variant.id,
        sku: variant.sku,
        quantity: wanted.quantity,
        unitPrice: variant.price,
      });
    }
    return { groupId, expiresAt, lines };
  });
}

export async function releaseReservationGroup(groupId: string): Promise<number> {
  const prisma = getPrismaClient();
  if (!prisma) return 0;
  const result = await prisma.inventoryReservation.deleteMany({
    where: { reason: `checkout:${groupId}` },
  });
  return result.count;
}

export type CreatedPendingOrder = {
  id: string;
  customerId: string;
  totalPrice: number;
  subtotalPrice: number;
  shippingFee: number;
  discountPrice: number;
  status: "PENDING_PAYMENT";
  expiresAt: Date;
  reservations: Array<{ id: string; variantId: string; quantity: number; unitPrice: number }>;
};

export async function createOrderFromReservation(input: {
  groupId: string;
  customerId: string;
  shippingFee: number;
  discountPrice: number;
}): Promise<CreatedPendingOrder> {
  const prisma = requirePrisma();
  return prisma.$transaction(async (tx) => {
    const reservations = await tx.inventoryReservation.findMany({
      where: {
        reason: `checkout:${input.groupId}`,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      include: { variant: { select: { id: true, sku: true, price: true } } },
    });
    if (reservations.length === 0) {
      throw new CartError(
        "CART_NOT_FOUND",
        `No active reservations for group ${input.groupId}`,
      );
    }

    const subtotalPrice = reservations.reduce(
      (sum, r) => sum + r.variant.price * r.quantity,
      0,
    );
    const totalPrice = Math.max(0, subtotalPrice - input.discountPrice) + input.shippingFee;
    const earliestExpiry = reservations.reduce((earliest, r) => {
      if (!r.expiresAt) return earliest;
      return earliest && earliest < r.expiresAt ? earliest : r.expiresAt;
    }, undefined as Date | undefined);

    const order = await tx.order.create({
      data: {
        customerId: input.customerId,
        status: "PENDING_PAYMENT",
        subtotalPrice,
        shippingFee: input.shippingFee,
        discountPrice: input.discountPrice,
        totalPrice,
        lines: {
          create: reservations.map((r) => ({
            variantId: r.variant.id,
            quantity: r.quantity,
            unitPrice: r.variant.price,
          })),
        },
      },
      include: { lines: true },
    });

    // Re-tag the reservation group so the webhook can release them by order id.
    await tx.inventoryReservation.updateMany({
      where: { reason: `checkout:${input.groupId}` },
      data: { reason: `order:${order.id}` },
    });

    return {
      id: order.id,
      customerId: order.customerId,
      totalPrice,
      subtotalPrice,
      shippingFee: input.shippingFee,
      discountPrice: input.discountPrice,
      status: "PENDING_PAYMENT" as const,
      expiresAt: earliestExpiry ?? new Date(Date.now() + CHECKOUT_RESERVATION_TTL_MS),
      reservations: reservations.map((r) => ({
        id: r.id,
        variantId: r.variant.id,
        quantity: r.quantity,
        unitPrice: r.variant.price,
      })),
    };
  });
}

export type PersistedPayment = {
  id: string;
  orderId: string;
  externalId: string;
  idempotencyKey: string;
  amount: number;
};

export async function recordPaymentIntent(input: {
  orderId: string;
  externalId: string;
  idempotencyKey: string;
  amount: number;
  provider: string;
}): Promise<{ payment: PersistedPayment; deduplicated: boolean }> {
  const prisma = requirePrisma();
  const existingByKey = await prisma.payment.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
  });
  if (existingByKey) {
    if (existingByKey.orderId !== input.orderId) {
      throw new CartError(
        "INVALID_QUANTITY",
        `idempotencyKey reuse across orders is not allowed`,
      );
    }
    return {
      deduplicated: true,
      payment: {
        id: existingByKey.id,
        orderId: existingByKey.orderId,
        externalId: existingByKey.externalId,
        idempotencyKey: existingByKey.idempotencyKey ?? input.idempotencyKey,
        amount: existingByKey.amount,
      },
    };
  }
  const created = await prisma.payment.create({
    data: {
      orderId: input.orderId,
      externalId: input.externalId,
      idempotencyKey: input.idempotencyKey,
      amount: input.amount,
      provider: input.provider,
    },
  });
  return {
    deduplicated: false,
    payment: {
      id: created.id,
      orderId: created.orderId,
      externalId: created.externalId,
      idempotencyKey: created.idempotencyKey ?? input.idempotencyKey,
      amount: created.amount,
    },
  };
}
