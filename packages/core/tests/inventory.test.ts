import { describe, expect, it } from "vitest";
import { listReorderCandidates, reserveStock, reserveStockBatch } from "../src/inventory";

describe("reserveStock", () => {
  it("prevents stock from going negative", () => {
    expect(() => reserveStock({ sku: "A", stock: 1 }, 2)).toThrow("Insufficient stock");
  });

  it("respects safety stock during reservation", () => {
    expect(() => reserveStock({ sku: "A", stock: 2, safetyStock: 1 }, 2)).toThrow(
      "Insufficient stock",
    );
  });

  it("reserves a batch and reports reorder candidates", () => {
    const next = reserveStockBatch(
      [
        { sku: "A", stock: 4, safetyStock: 1 },
        { sku: "B", stock: 1, safetyStock: 1 },
      ],
      [{ sku: "A", quantity: 2 }],
    );

    expect(next.find((item) => item.sku === "A")?.stock).toBe(2);
    expect(listReorderCandidates(next).map((item) => item.sku)).toEqual(["B"]);
  });
});
