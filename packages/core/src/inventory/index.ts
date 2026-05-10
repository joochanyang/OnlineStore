export type InventoryItem = {
  sku: string;
  stock: number;
  safetyStock?: number;
};

export type ReservationLine = {
  sku: string;
  quantity: number;
};

export type InventorySummary = {
  skuCount: number;
  totalStock: number;
  outOfStockCount: number;
};

export function summarizeInventory(items: InventoryItem[]): InventorySummary {
  return items.reduce<InventorySummary>(
    (summary, item) => ({
      skuCount: summary.skuCount + 1,
      totalStock: summary.totalStock + item.stock,
      outOfStockCount: summary.outOfStockCount + (item.stock === 0 ? 1 : 0),
    }),
    { skuCount: 0, totalStock: 0, outOfStockCount: 0 },
  );
}

export function reserveStock(item: InventoryItem, quantity: number): InventoryItem {
  if (!Number.isInteger(quantity) || quantity <= 0) {
    throw new Error("quantity must be a positive integer");
  }

  const availableStock = item.stock - (item.safetyStock ?? 0);
  if (availableStock < quantity) {
    throw new Error(`Insufficient stock for SKU: ${item.sku}`);
  }

  return {
    ...item,
    stock: item.stock - quantity,
  };
}

export function reserveStockBatch(items: InventoryItem[], lines: ReservationLine[]): InventoryItem[] {
  const nextItems = new Map(items.map((item) => [item.sku, item]));

  for (const line of lines) {
    const item = nextItems.get(line.sku);
    if (!item) {
      throw new Error(`Unknown SKU: ${line.sku}`);
    }

    nextItems.set(line.sku, reserveStock(item, line.quantity));
  }

  return items.map((item) => nextItems.get(item.sku) ?? item);
}

export function listReorderCandidates(items: InventoryItem[]): InventoryItem[] {
  return items.filter((item) => item.stock <= (item.safetyStock ?? 0));
}
