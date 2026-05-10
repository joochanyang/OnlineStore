import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const originalDatabaseUrl = process.env.DATABASE_URL;

type CartRow = {
  id: string;
  customerId: string | null;
  anonymousToken: string | null;
  expiresAt: Date;
  lastActivityAt: Date;
};
type CartItemRow = {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  addedAt: Date;
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
  createdAt: Date;
};

type Args = Record<string, unknown>;

function pick<K extends string>(obj: Args, key: K): unknown {
  return obj[key];
}

class FakePrisma {
  carts = new Map<string, CartRow>();
  items = new Map<string, CartItemRow>();
  variants = new Map<string, VariantRow>();
  reservations = new Map<string, ReservationRow>();
  private nextCartId = 1;
  private nextItemId = 1;
  private nextResId = 1;

  cart = {
    findFirst: async (args: Args) => {
      const where = pick(args, "where") as Partial<CartRow>;
      for (const cart of this.carts.values()) {
        if (where.customerId !== undefined && cart.customerId !== where.customerId) continue;
        if (where.anonymousToken !== undefined && cart.anonymousToken !== where.anonymousToken) continue;
        return this.includeItems(cart);
      }
      return null;
    },
    findUnique: async (args: Args) => {
      const where = pick(args, "where") as Partial<CartRow>;
      if (where.id) return this.includeItems(this.carts.get(where.id) ?? null);
      if (where.customerId) {
        for (const c of this.carts.values()) if (c.customerId === where.customerId) return this.includeItems(c);
      }
      if (where.anonymousToken) {
        for (const c of this.carts.values()) if (c.anonymousToken === where.anonymousToken) return this.includeItems(c);
      }
      return null;
    },
    create: async (args: Args) => {
      const data = pick(args, "data") as Partial<CartRow>;
      const id = `cart_${this.nextCartId++}`;
      const row: CartRow = {
        id,
        customerId: data.customerId ?? null,
        anonymousToken: data.anonymousToken ?? null,
        expiresAt: data.expiresAt ?? new Date(Date.now() + 86_400_000),
        lastActivityAt: data.lastActivityAt ?? new Date(),
      };
      this.carts.set(id, row);
      return this.includeItems(row);
    },
    update: async (args: Args) => {
      const where = pick(args, "where") as { id: string };
      const data = pick(args, "data") as Partial<CartRow>;
      const cart = this.carts.get(where.id);
      if (!cart) throw new Error("cart not found");
      Object.assign(cart, data);
      return cart;
    },
    delete: async (args: Args) => {
      const where = pick(args, "where") as { id: string };
      const cart = this.carts.get(where.id);
      if (cart) {
        this.carts.delete(where.id);
        for (const [iid, row] of this.items)
          if (row.cartId === where.id) this.items.delete(iid);
      }
      return cart;
    },
    deleteMany: async (args: Args) => {
      const where = pick(args, "where") as { expiresAt: { lt: Date } };
      let count = 0;
      for (const [id, cart] of this.carts) {
        if (cart.expiresAt < where.expiresAt.lt) {
          this.carts.delete(id);
          count++;
        }
      }
      return { count };
    },
  };

  cartItem = {
    upsert: async (args: Args) => {
      const where = pick(args, "where") as {
        cartId_variantId: { cartId: string; variantId: string };
      };
      const create = pick(args, "create") as { cartId: string; variantId: string; quantity: number };
      const update = pick(args, "update") as { quantity: number };
      const existing = [...this.items.values()].find(
        (i) => i.cartId === where.cartId_variantId.cartId && i.variantId === where.cartId_variantId.variantId,
      );
      if (existing) {
        Object.assign(existing, update);
        return existing;
      }
      const id = `item_${this.nextItemId++}`;
      const row: CartItemRow = {
        id,
        cartId: create.cartId,
        variantId: create.variantId,
        quantity: create.quantity,
        addedAt: new Date(),
      };
      this.items.set(id, row);
      return row;
    },
    update: async (args: Args) => {
      const where = pick(args, "where") as { id: string };
      const data = pick(args, "data") as Partial<CartItemRow>;
      const row = this.items.get(where.id);
      if (!row) throw new Error("item not found");
      Object.assign(row, data);
      return row;
    },
    delete: async (args: Args) => {
      const where = pick(args, "where") as { id: string };
      const row = this.items.get(where.id);
      if (row) this.items.delete(where.id);
      return row;
    },
    create: async (args: Args) => {
      const data = pick(args, "data") as { cartId: string; variantId: string; quantity: number };
      const id = `item_${this.nextItemId++}`;
      const row: CartItemRow = {
        id,
        cartId: data.cartId,
        variantId: data.variantId,
        quantity: data.quantity,
        addedAt: new Date(),
      };
      this.items.set(id, row);
      return row;
    },
  };

  productVariant = {
    findUnique: async (args: Args) => {
      const where = pick(args, "where") as { id: string };
      return this.variants.get(where.id) ?? null;
    },
    findMany: async () => [...this.variants.values()],
  };

  inventoryReservation = {
    aggregate: async (args: Args) => {
      const where = pick(args, "where") as { variantId: string };
      const list = [...this.reservations.values()].filter((r) => r.variantId === where.variantId);
      const active = list.filter((r) => !r.expiresAt || r.expiresAt > new Date());
      const total = active.reduce((s, r) => s + r.quantity, 0);
      return { _sum: { quantity: total || null } };
    },
    create: async (args: Args) => {
      const data = pick(args, "data") as Omit<ReservationRow, "id" | "createdAt"> & {
        expiresAt?: Date | null;
      };
      const id = `res_${this.nextResId++}`;
      const row: ReservationRow = {
        id,
        variantId: data.variantId,
        quantity: data.quantity,
        reason: data.reason,
        expiresAt: data.expiresAt ?? null,
        createdAt: new Date(),
      };
      this.reservations.set(id, row);
      return row;
    },
    findMany: async (args: Args) => {
      const where = pick(args, "where") as { reason: string };
      const out = [...this.reservations.values()].filter((r) => r.reason === where.reason);
      const active = out.filter((r) => !r.expiresAt || r.expiresAt > new Date());
      return active.map((r) => ({
        ...r,
        variant: this.variants.get(r.variantId)!,
      }));
    },
    deleteMany: async (args: Args) => {
      const where = pick(args, "where") as { reason: string };
      let count = 0;
      for (const [id, row] of this.reservations) {
        if (row.reason === where.reason) {
          this.reservations.delete(id);
          count++;
        }
      }
      return { count };
    },
  };

  order = {
    create: async (args: Args) => {
      const data = pick(args, "data") as Record<string, unknown> & {
        lines: { create: Array<Record<string, unknown>> };
      };
      return {
        id: `order_${Math.random().toString(36).slice(2, 10)}`,
        ...data,
        lines: data.lines.create,
      };
    },
  };

  payment = {
    findUnique: async () => null,
    create: async (args: Args) => {
      const data = pick(args, "data") as Record<string, unknown>;
      return {
        id: `pay_${Math.random().toString(36).slice(2, 10)}`,
        ...data,
      };
    },
  };

  async $transaction<T>(fn: (tx: this) => Promise<T>): Promise<T> {
    return fn(this);
  }

  private includeItems(cart: CartRow | null) {
    if (!cart) return null;
    const items = [...this.items.values()]
      .filter((i) => i.cartId === cart.id)
      .map((i) => {
        const variant = this.variants.get(i.variantId)!;
        return { ...i, variant };
      });
    return { ...cart, items };
  }
}

const fake = new FakePrisma();
const getPrismaClientMock = vi.hoisted(() => vi.fn());

vi.mock("../src/index", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/index")>();
  return { ...actual, getPrismaClient: getPrismaClientMock };
});

import {
  CartError,
  addCartItem,
  getOrCreateCart,
  mergeCart,
  removeCartItem,
  reserveCheckoutInventory,
  updateCartItemQuantity,
} from "../src/cart-repository";

beforeEach(() => {
  fake.carts.clear();
  fake.items.clear();
  fake.variants.clear();
  fake.reservations.clear();
  fake.variants.set("v1", {
    id: "v1",
    sku: "SHIRT-WHITE-M",
    color: "white",
    size: "M",
    price: 39000,
    stock: 10,
    product: { slug: "shirt", name: "Shirt", status: "ACTIVE" },
  });
  fake.variants.set("v2", {
    id: "v2",
    sku: "PANTS-DENIM-M",
    color: "denim",
    size: "M",
    price: 59000,
    stock: 2,
    product: { slug: "pants", name: "Pants", status: "ACTIVE" },
  });
  fake.variants.set("v_inactive", {
    id: "v_inactive",
    sku: "OLD-SKU",
    color: "red",
    size: "M",
    price: 1000,
    stock: 5,
    product: { slug: "old", name: "Old", status: "DRAFT" },
  });
  getPrismaClientMock.mockReturnValue(fake);
});

afterEach(() => {
  if (originalDatabaseUrl === undefined) delete process.env.DATABASE_URL;
  else process.env.DATABASE_URL = originalDatabaseUrl;
});

describe("cart-repository", () => {
  it("throws NO_DATABASE when prisma is unavailable", async () => {
    getPrismaClientMock.mockReturnValueOnce(undefined);
    await expect(
      getOrCreateCart({ type: "anonymous", anonymousToken: "tok-1" }),
    ).rejects.toThrow(CartError);
  });

  it("getOrCreateCart returns the same cart on repeat calls (anonymous)", async () => {
    const a = await getOrCreateCart({ type: "anonymous", anonymousToken: "tok-1" });
    const b = await getOrCreateCart({ type: "anonymous", anonymousToken: "tok-1" });
    expect(a.id).toBe(b.id);
  });

  it("addCartItem sums quantity for same variant on repeated add", async () => {
    await addCartItem({
      identity: { type: "anonymous", anonymousToken: "tok-2" },
      variantId: "v1",
      quantity: 2,
    });
    const cart = await addCartItem({
      identity: { type: "anonymous", anonymousToken: "tok-2" },
      variantId: "v1",
      quantity: 3,
    });
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBe(5);
    expect(cart.subtotal).toBe(39000 * 5);
  });

  it("addCartItem rejects when stock is insufficient", async () => {
    await expect(
      addCartItem({
        identity: { type: "anonymous", anonymousToken: "tok-3" },
        variantId: "v2",
        quantity: 5,
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });

  it("addCartItem rejects inactive products", async () => {
    await expect(
      addCartItem({
        identity: { type: "anonymous", anonymousToken: "tok-4" },
        variantId: "v_inactive",
        quantity: 1,
      }),
    ).rejects.toMatchObject({ code: "VARIANT_INACTIVE" });
  });

  it("updateCartItemQuantity to 0 removes the item", async () => {
    const created = await addCartItem({
      identity: { type: "anonymous", anonymousToken: "tok-5" },
      variantId: "v1",
      quantity: 1,
    });
    const itemId = created.items[0]!.id;
    const after = await updateCartItemQuantity({
      identity: { type: "anonymous", anonymousToken: "tok-5" },
      itemId,
      quantity: 0,
    });
    expect(after.items).toHaveLength(0);
  });

  it("removeCartItem fails for unknown items", async () => {
    await getOrCreateCart({ type: "anonymous", anonymousToken: "tok-6" });
    await expect(
      removeCartItem({
        identity: { type: "anonymous", anonymousToken: "tok-6" },
        itemId: "ghost",
      }),
    ).rejects.toMatchObject({ code: "ITEM_NOT_FOUND" });
  });

  it("mergeCart sums quantities when both carts share a variant", async () => {
    await addCartItem({
      identity: { type: "anonymous", anonymousToken: "guest" },
      variantId: "v1",
      quantity: 3,
    });
    await addCartItem({
      identity: { type: "customer", customerId: "cust-1" },
      variantId: "v1",
      quantity: 4,
    });

    const merged = await mergeCart({ anonymousToken: "guest", customerId: "cust-1" });
    expect(merged.items).toHaveLength(1);
    expect(merged.items[0]!.quantity).toBe(7);
    const guestStill = await getOrCreateCart({
      type: "anonymous",
      anonymousToken: "guest",
    });
    expect(guestStill.items).toHaveLength(0);
  });

  it("reserveCheckoutInventory blocks a second reservation that would overdraw stock", async () => {
    const cart = await addCartItem({
      identity: { type: "anonymous", anonymousToken: "tok-res" },
      variantId: "v2",
      quantity: 2,
    });
    const first = await reserveCheckoutInventory({
      cartId: cart.id,
      items: [{ variantId: "v2", quantity: 2 }],
    });
    expect(first.lines).toHaveLength(1);

    await expect(
      reserveCheckoutInventory({
        cartId: cart.id + "-x",
        items: [{ variantId: "v2", quantity: 1 }],
      }),
    ).rejects.toMatchObject({ code: "INSUFFICIENT_STOCK" });
  });
});
