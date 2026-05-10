export type ImportBatch = {
  source: string;
  receivedAt: Date;
  itemCount: number;
};

export type SupplierRawItem = {
  externalId: string;
  name: string;
  price: number;
  imageUrl?: string;
  options?: Record<string, string>;
  rawPayload: Record<string, unknown>;
};

export type SupplierProductCandidate = SupplierRawItem & {
  supplierId: string;
  status: "IMPORTED" | "NEEDS_REVIEW";
};

export function createImportBatch(source: string, items: SupplierRawItem[], receivedAt = new Date()): ImportBatch {
  if (!source.trim()) {
    throw new Error("source is required");
  }

  return {
    source: source.trim(),
    receivedAt,
    itemCount: items.length,
  };
}

export function mapSupplierItemsToCandidates(
  supplierId: string,
  items: SupplierRawItem[],
): SupplierProductCandidate[] {
  if (!supplierId.trim()) {
    throw new Error("supplierId is required");
  }

  const seen = new Set<string>();

  return items.map((item) => {
    if (!item.externalId.trim()) {
      throw new Error("externalId is required");
    }

    if (seen.has(item.externalId)) {
      throw new Error(`Duplicate external item: ${item.externalId}`);
    }

    seen.add(item.externalId);

    return {
      ...item,
      supplierId,
      status: isCompleteRawItem(item) ? "IMPORTED" : "NEEDS_REVIEW",
    };
  });
}

export function isCompleteRawItem(item: SupplierRawItem): boolean {
  return Boolean(item.name.trim() && item.price > 0 && item.imageUrl?.trim());
}
