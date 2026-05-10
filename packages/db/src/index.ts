import { PrismaPg } from "@prisma/adapter-pg";
import {
  PrismaClient,
  type ActorType,
  type AdminRole,
  type AuthProvider,
  type ConsentSource,
  type ConsentType,
  type ProductStatus,
} from "../generated/client/client";

export type {
  ActorType,
  AdminRole,
  AuthProvider,
  ConsentSource,
  ConsentType,
  ProductStatus,
} from "../generated/client/client";

export {
  withAuditContext,
  getAuditActor,
  requireAuditActor,
  type AuditActorContext,
} from "./audit-context";

import { getAuditActor } from "./audit-context";

export type CatalogProduct = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  status: ProductStatus;
  price: number;
  stock: number;
  imageUrl?: string;
  variants: Array<{
    sku: string;
    color: string;
    size: string;
    price: number;
    stock: number;
    safetyStock: number;
  }>;
};

export type InventoryDashboardItem = {
  sku: string;
  stock: number;
  safetyStock: number;
};

export type CheckoutVariant = InventoryDashboardItem & {
  price: number;
};

export type PersistProductInput = {
  slug: string;
  name: string;
  description?: string;
  status?: ProductStatus;
  categorySlugs?: string[];
  imageUrls?: string[];
  variants: Array<{
    sku: string;
    color: string;
    size: string;
    price: number;
    compareAtPrice?: number;
    stock: number;
    safetyStock?: number;
  }>;
};

type NormalizedProductInput = Omit<Required<PersistProductInput>, "description"> & {
  description?: string;
};

export type AdminDashboard = {
  actor: {
    actorId: string;
    email: string;
    roles: readonly AdminRole[];
  };
  inventory: InventoryDashboardItem[];
  orderDraft: {
    customerId: string;
    lines: Array<{
      sku: string;
      quantity: number;
      unitPrice: number;
    }>;
    shippingFee: number;
    discountPrice: number;
  };
};

type DbGlobal = typeof globalThis & {
  commercePrisma?: PrismaClient;
};

const seedCatalogProducts: CatalogProduct[] = [
  {
    id: "seed-essential-shirt",
    slug: "essential-cotton-shirt",
    name: "Essential Cotton Shirt",
    description: "A durable cotton shirt with sellable SKU and safety stock rules.",
    status: "ACTIVE",
    price: 39000,
    stock: 20,
    imageUrl: "/products/essential-cotton-shirt.jpg",
    variants: [
      { sku: "SHIRT-WHITE-M", color: "white", size: "M", price: 39000, stock: 12, safetyStock: 3 },
      { sku: "SHIRT-BLACK-L", color: "black", size: "L", price: 39000, stock: 8, safetyStock: 2 },
    ],
  },
  {
    id: "seed-denim-pants",
    slug: "daily-denim-pants",
    name: "Daily Denim Pants",
    description: "A baseline product used for reorder and fulfillment checks.",
    status: "ACTIVE",
    price: 59000,
    stock: 1,
    imageUrl: "/products/daily-denim-pants.jpg",
    variants: [{ sku: "PANTS-DENIM-M", color: "denim", size: "M", price: 59000, stock: 1, safetyStock: 1 }],
  },
];

const seedAdminDashboard: AdminDashboard = {
  actor: {
    actorId: "admin-seed",
    email: "ops@example.com",
    roles: ["OWNER"],
  },
  inventory: [
    { sku: "SHIRT-WHITE-M", stock: 12, safetyStock: 3 },
    { sku: "SHIRT-BLACK-L", stock: 8, safetyStock: 2 },
    { sku: "PANTS-DENIM-M", stock: 1, safetyStock: 1 },
  ],
  orderDraft: {
    customerId: "customer-seed",
    lines: [
      { sku: "SHIRT-WHITE-M", quantity: 2, unitPrice: 39000 },
      { sku: "PANTS-DENIM-M", quantity: 1, unitPrice: 59000 },
    ],
    shippingFee: 3000,
    discountPrice: 5000,
  },
};

const seedCheckoutVariants: CheckoutVariant[] = [
  { sku: "SHIRT-WHITE-M", stock: 12, safetyStock: 3, price: 39000 },
  { sku: "SHIRT-BLACK-L", stock: 8, safetyStock: 2, price: 39000 },
  { sku: "PANTS-DENIM-M", stock: 1, safetyStock: 1, price: 59000 },
];

export function getPrismaClient(): PrismaClient | undefined {
  if (!process.env.DATABASE_URL) {
    return undefined;
  }

  const globalForDb = globalThis as DbGlobal;
  globalForDb.commercePrisma ??= new PrismaClient({
    adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }),
  });

  return globalForDb.commercePrisma;
}

export async function listCatalogProducts(): Promise<CatalogProduct[]> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return seedCatalogProducts;
  }

  const products = await prisma.product.findMany({
    where: { status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: {
      images: {
        orderBy: { sortOrder: "asc" },
        take: 1,
      },
      variants: {
        orderBy: { price: "asc" },
      },
    },
  });

  return products.map((product) => {
    const firstVariant = product.variants[0];

    return {
      id: product.id,
      slug: product.slug,
      name: product.name,
      description: product.description ?? undefined,
      status: product.status,
      price: firstVariant?.price ?? 0,
      stock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
      imageUrl: product.images[0]?.url,
      variants: product.variants.map((variant) => ({
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        price: variant.price,
        stock: variant.stock,
        safetyStock: variant.safetyStock,
      })),
    };
  });
}

export async function listAdminCatalogProducts(): Promise<CatalogProduct[]> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return seedCatalogProducts;
  }

  const products = await prisma.product.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      images: {
        orderBy: { sortOrder: "asc" },
      },
      variants: {
        orderBy: { sku: "asc" },
      },
    },
  });

  return products.map(mapProductRecord);
}

export async function createAdminProduct(input: PersistProductInput): Promise<CatalogProduct> {
  const prisma = getPrismaClient();
  const normalizedInput = normalizeProductInput(input);

  if (!prisma) {
    return {
      id: `preview-${normalizedInput.slug}`,
      slug: normalizedInput.slug,
      name: normalizedInput.name,
      description: normalizedInput.description,
      status: normalizedInput.status,
      price: normalizedInput.variants[0]?.price ?? 0,
      stock: normalizedInput.variants.reduce((sum, variant) => sum + variant.stock, 0),
      imageUrl: normalizedInput.imageUrls[0],
      variants: normalizedInput.variants.map((variant) => ({
        sku: variant.sku,
        color: variant.color,
        size: variant.size,
        price: variant.price,
        stock: variant.stock,
        safetyStock: variant.safetyStock ?? 0,
      })),
    };
  }

  const product = await prisma.product.create({
    data: {
      slug: normalizedInput.slug,
      name: normalizedInput.name,
      description: normalizedInput.description,
      status: normalizedInput.status,
      categories: {
        create: normalizedInput.categorySlugs.map((slug) => ({
          category: {
            connectOrCreate: {
              where: { slug },
              create: {
                slug,
                name: titleFromSlug(slug),
              },
            },
          },
        })),
      },
      images: {
        create: normalizedInput.imageUrls.map((url, index) => ({
          url,
          alt: normalizedInput.name,
          sortOrder: index,
        })),
      },
      variants: {
        create: normalizedInput.variants.map((variant) => ({
          sku: variant.sku,
          color: variant.color,
          size: variant.size,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice,
          stock: variant.stock,
          safetyStock: variant.safetyStock ?? 0,
        })),
      },
    },
    include: {
      images: {
        orderBy: { sortOrder: "asc" },
      },
      variants: {
        orderBy: { sku: "asc" },
      },
    },
  });

  return mapProductRecord(product);
}

export type PersistCheckoutOrderInput = {
  customerId: string;
  lines: Array<{
    sku: string;
    quantity: number;
    unitPrice: number;
  }>;
  subtotalPrice: number;
  shippingFee: number;
  discountPrice: number;
  totalPrice: number;
};

export async function createCheckoutOrder(input: PersistCheckoutOrderInput) {
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      id: `seed-order-${input.customerId || "guest"}`,
      customerId: input.customerId,
      status: "PENDING_PAYMENT" as const,
      subtotalPrice: input.subtotalPrice,
      shippingFee: input.shippingFee,
      discountPrice: input.discountPrice,
      totalPrice: input.totalPrice,
    };
  }

  const skus = input.lines.map((line) => line.sku.trim().toUpperCase());
  const variants = await prisma.productVariant.findMany({
    where: {
      sku: { in: skus },
      product: { status: "ACTIVE" },
    },
    select: {
      id: true,
      sku: true,
      stock: true,
    },
  });
  const variantsBySku = new Map(variants.map((variant) => [variant.sku, variant]));

  return prisma.$transaction(async (tx) => {
    for (const line of input.lines) {
      const sku = line.sku.trim().toUpperCase();
      const variant = variantsBySku.get(sku);

      if (!variant) {
        throw new Error(`Unknown SKU: ${sku}`);
      }

      const updateResult = await tx.productVariant.updateMany({
        where: {
          id: variant.id,
          stock: {
            gte: line.quantity,
          },
        },
        data: {
          stock: {
            decrement: line.quantity,
          },
        },
      });

      if (updateResult.count !== 1) {
        throw new Error(`Insufficient stock for SKU: ${sku}`);
      }
    }

    return tx.order.create({
      data: {
        customerId: input.customerId,
        status: "PENDING_PAYMENT",
        subtotalPrice: input.subtotalPrice,
        shippingFee: input.shippingFee,
        discountPrice: input.discountPrice,
        totalPrice: input.totalPrice,
        lines: {
          create: input.lines.map((line) => {
            const variant = variantsBySku.get(line.sku.trim().toUpperCase());

            if (!variant) {
              throw new Error(`Unknown SKU: ${line.sku}`);
            }

            return {
              variantId: variant.id,
              quantity: line.quantity,
              unitPrice: line.unitPrice,
            };
          }),
        },
      },
      select: {
        id: true,
        customerId: true,
        status: true,
        subtotalPrice: true,
        shippingFee: true,
        discountPrice: true,
        totalPrice: true,
      },
    });
  });
}

export async function getAdminDashboard(actor?: AdminDashboard["actor"]): Promise<AdminDashboard> {
  const prisma = getPrismaClient();

  if (!prisma) {
    return {
      ...seedAdminDashboard,
      actor: actor ?? seedAdminDashboard.actor,
    };
  }

  const [adminUser, variants] = await Promise.all([
    prisma.adminUser.findFirst({
      orderBy: { createdAt: "asc" },
    }),
    prisma.productVariant.findMany({
      orderBy: { sku: "asc" },
      select: {
        sku: true,
        stock: true,
        safetyStock: true,
        price: true,
      },
    }),
  ]);

  const dashboardInventory =
    variants.length > 0
      ? variants.map((variant) => ({
          sku: variant.sku,
          stock: variant.stock,
          safetyStock: variant.safetyStock,
        }))
      : seedAdminDashboard.inventory;

  return {
    actor:
      actor ??
      (adminUser
        ? {
            actorId: adminUser.id,
            email: adminUser.email,
            roles: adminUser.roles,
          }
        : seedAdminDashboard.actor),
    inventory: dashboardInventory,
    orderDraft: {
      ...seedAdminDashboard.orderDraft,
      lines:
        variants.length > 0
          ? variants.slice(0, 2).map((variant) => ({
              sku: variant.sku,
              quantity: 1,
              unitPrice: variant.price,
            }))
          : seedAdminDashboard.orderDraft.lines,
    },
  };
}

export async function findCheckoutVariants(skus: string[]): Promise<CheckoutVariant[]> {
  const normalizedSkus = skus.map((sku) => sku.trim().toUpperCase());
  const prisma = getPrismaClient();

  if (!prisma) {
    return seedCheckoutVariants.filter((variant) => normalizedSkus.includes(variant.sku));
  }

  return prisma.productVariant.findMany({
    where: {
      sku: {
        in: normalizedSkus,
      },
      product: {
        status: "ACTIVE",
      },
    },
    select: {
      sku: true,
      stock: true,
      safetyStock: true,
      price: true,
    },
  });
}

export async function getAdminSession(actorId: string): Promise<AdminDashboard["actor"] | undefined> {
  const normalizedActorId = actorId.trim();
  const prisma = getPrismaClient();

  if (!normalizedActorId) {
    return undefined;
  }

  if (!prisma) {
    return normalizedActorId === seedAdminDashboard.actor.actorId
      ? seedAdminDashboard.actor
      : undefined;
  }

  const adminUser = await prisma.adminUser.findUnique({
    where: { id: normalizedActorId },
  });

  return adminUser
    ? {
        actorId: adminUser.id,
        email: adminUser.email,
        roles: adminUser.roles,
      }
    : undefined;
}

export async function updateProductStatus(productId: string, status: ProductStatus) {
  const prisma = getPrismaClient();

  if (!prisma) {
    const product = seedCatalogProducts.find((seedProduct) => seedProduct.id === productId);

    if (!product) {
      return undefined;
    }

    return {
      ...product,
      status,
    };
  }

  return prisma.product.update({
    where: { id: productId },
    data: { status },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
    },
  });
}

function mapProductRecord(product: {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  status: ProductStatus;
  images: Array<{
    url: string;
  }>;
  variants: Array<{
    sku: string;
    color: string;
    size: string;
    price: number;
    stock: number;
    safetyStock: number;
  }>;
}): CatalogProduct {
  const firstVariant = product.variants[0];

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description ?? undefined,
    status: product.status,
    price: firstVariant?.price ?? 0,
    stock: product.variants.reduce((sum, variant) => sum + variant.stock, 0),
    imageUrl: product.images[0]?.url,
    variants: product.variants.map((variant) => ({
      sku: variant.sku,
      color: variant.color,
      size: variant.size,
      price: variant.price,
      stock: variant.stock,
      safetyStock: variant.safetyStock,
    })),
  };
}

function normalizeProductInput(input: PersistProductInput): NormalizedProductInput {
  return {
    slug: input.slug.trim(),
    name: input.name.trim(),
    description: input.description?.trim() || undefined,
    status: input.status ?? "DRAFT",
    categorySlugs: uniqueValues(input.categorySlugs ?? []),
    imageUrls: uniqueValues(input.imageUrls ?? []),
    variants: input.variants.map((variant) => ({
      sku: variant.sku.trim().toUpperCase(),
      color: variant.color.trim(),
      size: variant.size.trim(),
      price: variant.price,
      compareAtPrice: variant.compareAtPrice,
      stock: variant.stock,
      safetyStock: variant.safetyStock ?? 0,
    })),
  };
}

function uniqueValues(values: string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function titleFromSlug(slug: string) {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

// =====================================================================
// Auth / Audit helpers (Phase 1)
// =====================================================================

export type AdminAccount = {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  roles: readonly AdminRole[];
  mfaSecret: string | null;
  mfaEnabledAt: Date | null;
  disabledAt: Date | null;
};

export async function findAdminByEmail(email: string): Promise<AdminAccount | undefined> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return undefined;
  }

  const record = await prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!record) {
    return undefined;
  }
  return mapAdmin(record);
}

export async function findAdminById(id: string): Promise<AdminAccount | undefined> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return undefined;
  }
  const record = await prisma.adminUser.findUnique({ where: { id } });
  return record ? mapAdmin(record) : undefined;
}

export async function updateAdminLastLogin(id: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }
  await prisma.adminUser.update({
    where: { id },
    data: { lastLoginAt: new Date() },
  });
}

export async function setAdminMfaSecret(id: string, secret: string | null, enabled: boolean): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("DATABASE_URL required to manage MFA secret");
  }
  await prisma.adminUser.update({
    where: { id },
    data: {
      mfaSecret: secret,
      mfaEnabledAt: enabled ? new Date() : null,
    },
  });
}

export type CustomerAccount = {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string | null;
  authProvider: AuthProvider;
  providerUserId: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  mfaSecret: string | null;
  mfaEnabledAt: Date | null;
  dormantAt: Date | null;
  disabledAt: Date | null;
};

export async function findCustomerByEmail(email: string): Promise<CustomerAccount | undefined> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return undefined;
  }
  const record = await prisma.customer.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  return record ? mapCustomer(record) : undefined;
}

export async function findCustomerById(id: string): Promise<CustomerAccount | undefined> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return undefined;
  }
  const record = await prisma.customer.findUnique({ where: { id } });
  return record ? mapCustomer(record) : undefined;
}

export type CreateCustomerInput = {
  email: string;
  name: string;
  phone?: string;
  passwordHash: string;
  authProvider?: AuthProvider;
  providerUserId?: string;
  consents: Array<{
    type: ConsentType;
    granted: boolean;
    source: ConsentSource;
    ip?: string;
    userAgent?: string;
  }>;
};

export async function createCustomerWithConsents(input: CreateCustomerInput): Promise<CustomerAccount> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("DATABASE_URL required to create customer");
  }
  const record = await prisma.customer.create({
    data: {
      email: input.email.trim().toLowerCase(),
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      passwordHash: input.passwordHash,
      authProvider: input.authProvider ?? "PASSWORD",
      providerUserId: input.providerUserId ?? null,
      consents: {
        create: input.consents.map((consent) => ({
          type: consent.type,
          granted: consent.granted,
          source: consent.source,
          ip: consent.ip ?? null,
          userAgent: consent.userAgent ?? null,
        })),
      },
    },
  });
  return mapCustomer(record);
}

export async function updateCustomerLastLogin(id: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }
  await prisma.customer.update({
    where: { id },
    data: { lastLoginAt: new Date(), dormantAt: null },
  });
}

// ----- Refresh Tokens -----

export type StoredRefreshTokenRecord = {
  id: string;
  family: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
  replacedById: string | null;
  actorType: ActorType;
  customerId: string | null;
  adminUserId: string | null;
};

export type StoreRefreshTokenInput = {
  id: string;
  family: string;
  tokenHash: string;
  expiresAt: Date;
  actorType: ActorType;
  customerId?: string;
  adminUserId?: string;
  ip?: string;
  userAgent?: string;
};

export async function storeRefreshToken(input: StoreRefreshTokenInput): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    throw new Error("DATABASE_URL required to store refresh token");
  }
  await prisma.refreshToken.create({
    data: {
      id: input.id,
      family: input.family,
      tokenHash: input.tokenHash,
      expiresAt: input.expiresAt,
      actorType: input.actorType,
      customerId: input.customerId ?? null,
      adminUserId: input.adminUserId ?? null,
      ip: input.ip ?? null,
      userAgent: input.userAgent ?? null,
    },
  });
}

export async function findRefreshTokenByHash(tokenHash: string): Promise<StoredRefreshTokenRecord | undefined> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return undefined;
  }
  const record = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  return record
    ? {
        id: record.id,
        family: record.family,
        tokenHash: record.tokenHash,
        expiresAt: record.expiresAt,
        revokedAt: record.revokedAt,
        replacedById: record.replacedById,
        actorType: record.actorType,
        customerId: record.customerId,
        adminUserId: record.adminUserId,
      }
    : undefined;
}

export async function markRefreshTokenReplaced(previousId: string, replacedById: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }
  await prisma.refreshToken.update({
    where: { id: previousId },
    data: { replacedById, revokedAt: new Date() },
  });
}

export async function revokeRefreshTokenById(id: string): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }
  await prisma.refreshToken.update({
    where: { id },
    data: { revokedAt: new Date() },
  });
}

export async function revokeRefreshTokenFamily(family: string): Promise<number> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return 0;
  }
  const result = await prisma.refreshToken.updateMany({
    where: { family, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return result.count;
}

// ----- Audit Log -----

export type InsertAuditLogInput = {
  /** Falls back to the AsyncLocalStorage `withAuditContext` actor when omitted. */
  actorType?: ActorType;
  actorId?: string;
  action: string;
  targetType?: string;
  targetId?: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
  requestId?: string;
};

export async function insertAuditLog(input: InsertAuditLogInput): Promise<void> {
  const prisma = getPrismaClient();
  if (!prisma) {
    return;
  }
  // Fall back to the AsyncLocalStorage actor context for fields the caller didn't pass.
  // Lets routes call `insertAuditLog({ action: "x.y" })` once `withAuditContext` is on.
  const ambient = getAuditActor();
  await prisma.auditLog.create({
    data: {
      actorType: input.actorType ?? ambient?.actorType ?? "SYSTEM",
      actorId: input.actorId ?? ambient?.actorId ?? null,
      action: input.action,
      targetType: input.targetType ?? null,
      targetId: input.targetId ?? null,
      before: input.before === undefined ? undefined : (input.before as object),
      after: input.after === undefined ? undefined : (input.after as object),
      ip: input.ip ?? ambient?.ip ?? null,
      userAgent: input.userAgent ?? ambient?.userAgent ?? null,
      requestId: input.requestId ?? ambient?.requestId ?? null,
    },
  });
}

// ----- Mappers -----

function mapAdmin(record: {
  id: string;
  email: string;
  name: string;
  passwordHash: string | null;
  roles: AdminRole[];
  mfaSecret: string | null;
  mfaEnabledAt: Date | null;
  disabledAt: Date | null;
}): AdminAccount {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    passwordHash: record.passwordHash,
    roles: record.roles,
    mfaSecret: record.mfaSecret,
    mfaEnabledAt: record.mfaEnabledAt,
    disabledAt: record.disabledAt,
  };
}

function mapCustomer(record: {
  id: string;
  email: string;
  name: string;
  phone: string | null;
  passwordHash: string | null;
  authProvider: AuthProvider;
  providerUserId: string | null;
  emailVerifiedAt: Date | null;
  phoneVerifiedAt: Date | null;
  mfaSecret: string | null;
  mfaEnabledAt: Date | null;
  dormantAt: Date | null;
  disabledAt: Date | null;
}): CustomerAccount {
  return {
    id: record.id,
    email: record.email,
    name: record.name,
    phone: record.phone,
    passwordHash: record.passwordHash,
    authProvider: record.authProvider,
    providerUserId: record.providerUserId,
    emailVerifiedAt: record.emailVerifiedAt,
    phoneVerifiedAt: record.phoneVerifiedAt,
    mfaSecret: record.mfaSecret,
    mfaEnabledAt: record.mfaEnabledAt,
    dormantAt: record.dormantAt,
    disabledAt: record.disabledAt,
  };
}
