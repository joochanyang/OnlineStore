import { describe, expect, it } from "vitest";
import { createNormalizationDecision, normalizeCandidate } from "../src/ai-normalizer";
import { createImportBatch, mapSupplierItemsToCandidates } from "../src/importers";
import { assertSupplierConnector } from "../src/suppliers";

describe("supplier integrations", () => {
  it("validates connector requirements and import completeness", () => {
    expect(assertSupplierConnector({ id: "supplier-1", name: "CSV Supplier", mode: "csv" }).active).toBe(true);
    expect(() => assertSupplierConnector({ id: "supplier-2", name: "API Supplier", mode: "api" })).toThrow(
      "requires endpoint",
    );

    const items = [
      { externalId: "sku-1", name: "Imported Shirt", price: 12000, imageUrl: "https://example.com/a.jpg", rawPayload: {} },
      { externalId: "sku-2", name: "Needs Image", price: 12000, rawPayload: {} },
    ];

    expect(createImportBatch("supplier-1", items).itemCount).toBe(2);
    expect(mapSupplierItemsToCandidates("supplier-1", items).map((item) => item.status)).toEqual([
      "IMPORTED",
      "NEEDS_REVIEW",
    ]);
  });

  it("normalizes supplier candidates behind a review threshold", () => {
    const product = normalizeCandidate({
      externalId: "ext-1",
      name: "Linen Shirt",
      price: 22000,
      category: "Summer Tops",
      color: "white",
      size: "M",
      stock: 4,
    });

    expect(product.slug).toBe("linen-shirt");
    expect(product.variants[0]?.sku).toBe("LINEN-SHIRT-WHITE-M");
    expect(createNormalizationDecision(0.8).requiresReview).toBe(true);
  });
});
