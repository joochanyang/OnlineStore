import { describe, expect, it } from "vitest";
import { summarizeInventory } from "@commerce/core/inventory";

describe("admin scaffold", () => {
  it("summarizes stock for operational metrics", () => {
    const summary = summarizeInventory([
      { sku: "A", stock: 2 },
      { sku: "B", stock: 0 },
    ]);

    expect(summary).toEqual({ skuCount: 2, totalStock: 2, outOfStockCount: 1 });
  });
});
