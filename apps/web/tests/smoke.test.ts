import { describe, expect, it } from "vitest";
import { createProductDraft } from "@commerce/core/product";

describe("storefront scaffold", () => {
  it("creates a product draft for the landing page", () => {
    const product = createProductDraft({
      name: "Test Shirt",
      slug: "test-shirt",
      variants: [{ sku: "TEST-M", color: "black", size: "M", price: 1000, stock: 1 }],
    });

    expect(product.status).toBe("DRAFT");
    expect(product.variants).toHaveLength(1);
  });
});
