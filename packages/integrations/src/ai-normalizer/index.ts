export type NormalizationDecision = {
  confidence: number;
  requiresReview: boolean;
};

export type NormalizedProduct = {
  name: string;
  slug: string;
  description: string;
  categorySlugs: string[];
  variants: Array<{
    sku: string;
    color: string;
    size: string;
    price: number;
    stock: number;
  }>;
};

export function createNormalizationDecision(confidence: number): NormalizationDecision {
  if (confidence < 0 || confidence > 1) {
    throw new Error("confidence must be between 0 and 1");
  }

  return {
    confidence,
    requiresReview: confidence < 0.85,
  };
}

export function normalizeCandidate(input: {
  externalId: string;
  name: string;
  price: number;
  category?: string;
  color?: string;
  size?: string;
  stock?: number;
}): NormalizedProduct {
  if (!input.name.trim()) {
    throw new Error("name is required");
  }

  if (!Number.isInteger(input.price) || input.price <= 0) {
    throw new Error("price must be a positive integer");
  }

  const slug = slugify(input.name);
  const color = input.color?.trim() || "default";
  const size = input.size?.trim() || "OS";

  return {
    name: input.name.trim(),
    slug,
    description: `${input.name.trim()} imported from supplier item ${input.externalId}.`,
    categorySlugs: input.category ? [slugify(input.category)] : [],
    variants: [
      {
        sku: `${slug}-${color}-${size}`.toUpperCase(),
        color,
        size,
        price: input.price,
        stock: input.stock ?? 0,
      },
    ],
  };
}

function slugify(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
