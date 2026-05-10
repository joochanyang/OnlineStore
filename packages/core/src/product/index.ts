export type ProductStatus = "DRAFT" | "ACTIVE" | "ARCHIVED";

export type ProductVariantInput = {
  sku: string;
  color: string;
  size: string;
  price: number;
  compareAtPrice?: number;
  stock: number;
  safetyStock?: number;
};

export type ProductDraftInput = {
  name: string;
  slug: string;
  description?: string;
  categorySlugs?: string[];
  imageUrls?: string[];
  variants: ProductVariantInput[];
};

export type ProductDraft = Omit<ProductDraftInput, "categorySlugs" | "imageUrls"> & {
  categorySlugs: string[];
  imageUrls: string[];
  status: ProductStatus;
};

export type ProductSearchQuery = {
  q?: string;
  categorySlug?: string;
  color?: string;
  size?: string;
  inStock?: boolean;
  minPrice?: number;
  maxPrice?: number;
  sort?: "latest" | "price_asc" | "price_desc" | "name_asc";
};

export function createProductDraft(input: ProductDraftInput): ProductDraft {
  assertPresent(input.name, "name");
  assertSlug(input.slug);
  assertUniqueSkus(input.variants);

  return {
    ...input,
    categorySlugs: input.categorySlugs ?? [],
    imageUrls: input.imageUrls ?? [],
    status: "DRAFT",
    variants: input.variants.map((variant) => ({
      ...variant,
      sku: normalizeSku(variant.sku),
      color: assertPresent(variant.color, "color"),
      size: assertPresent(variant.size, "size"),
      price: assertNonNegativeInteger(variant.price, "price"),
      compareAtPrice:
        variant.compareAtPrice === undefined
          ? undefined
          : assertNonNegativeInteger(variant.compareAtPrice, "compareAtPrice"),
      stock: assertNonNegativeInteger(variant.stock, "stock"),
      safetyStock:
        variant.safetyStock === undefined
          ? 0
          : assertNonNegativeInteger(variant.safetyStock, "safetyStock"),
    })),
  };
}

export function listSellableVariants(product: ProductDraft): ProductVariantInput[] {
  if (product.status !== "ACTIVE") {
    return [];
  }

  return product.variants.filter((variant) => variant.stock > (variant.safetyStock ?? 0));
}

export function searchProducts(products: ProductDraft[], query: ProductSearchQuery): ProductDraft[] {
  const searchTerm = query.q?.trim().toLowerCase() ?? "";

  return products
    .filter((product) => {
      const matchesSearch =
        !searchTerm ||
        product.name.toLowerCase().includes(searchTerm) ||
        product.description?.toLowerCase().includes(searchTerm);
      const matchesCategory = !query.categorySlug || product.categorySlugs.includes(query.categorySlug);
      const matchingVariants = product.variants.filter((variant) => {
        const matchesColor = !query.color || variant.color === query.color;
        const matchesSize = !query.size || variant.size === query.size;
        const matchesStock = !query.inStock || variant.stock > (variant.safetyStock ?? 0);
        const matchesMinPrice = query.minPrice === undefined || variant.price >= query.minPrice;
        const matchesMaxPrice = query.maxPrice === undefined || variant.price <= query.maxPrice;

        return matchesColor && matchesSize && matchesStock && matchesMinPrice && matchesMaxPrice;
      });

      return matchesSearch && matchesCategory && matchingVariants.length > 0;
    })
    .sort((left: ProductDraft, right: ProductDraft) => {
      if (query.sort === "price_asc") {
        return getLowestPrice(left) - getLowestPrice(right);
      }

      if (query.sort === "price_desc") {
        return getLowestPrice(right) - getLowestPrice(left);
      }

      if (query.sort === "name_asc") {
        return left.name.localeCompare(right.name);
      }

      return 0;
    });
}

function getLowestPrice(product: ProductDraft): number {
  return Math.min(...product.variants.map((variant) => variant.price));
}

function assertUniqueSkus(variants: ProductVariantInput[]) {
  const seen = new Set<string>();

  for (const variant of variants) {
    const sku = normalizeSku(variant.sku);
    if (seen.has(sku)) {
      throw new Error(`Duplicate SKU: ${sku}`);
    }

    seen.add(sku);
  }
}

function assertNonNegativeInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }

  return value;
}

function assertPresent(value: string, field: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${field} is required`);
  }

  return trimmed;
}

function assertSlug(value: string) {
  const slug = assertPresent(value, "slug");
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("slug must use lowercase letters, numbers, and hyphens");
  }
}

function normalizeSku(value: string) {
  return assertPresent(value, "sku").toUpperCase();
}
