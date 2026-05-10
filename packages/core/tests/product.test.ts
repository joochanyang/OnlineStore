import { describe, expect, it } from "vitest";
import { createProductDraft, listSellableVariants, searchProducts } from "../src/product";

describe("createProductDraft", () => {
  it("rejects duplicate SKUs", () => {
    expect(() =>
      createProductDraft({
        name: "Shirt",
        slug: "shirt",
        variants: [
          { sku: "DUP", color: "white", size: "M", price: 1000, stock: 1 },
          { sku: "DUP", color: "black", size: "L", price: 1000, stock: 1 },
        ],
      }),
    ).toThrow("Duplicate SKU");
  });

  it("normalizes SKU and validates slug format", () => {
    const product = createProductDraft({
      name: "Test Shirt",
      slug: "test-shirt",
      variants: [{ sku: "test-m", color: "black", size: "M", price: 1000, stock: 2 }],
    });

    expect(product.variants[0]?.sku).toBe("TEST-M");
    expect(() => createProductDraft({ name: "Bad", slug: "Bad Slug", variants: [] })).toThrow(
      "slug must use lowercase",
    );
  });

  it("keeps safety stock out of sellable variants", () => {
    const draft = createProductDraft({
      name: "Shirt",
      slug: "shirt",
      variants: [
        { sku: "READY", color: "white", size: "M", price: 1000, stock: 3, safetyStock: 1 },
        { sku: "HELD", color: "black", size: "L", price: 1000, stock: 1, safetyStock: 1 },
      ],
    });

    expect(listSellableVariants({ ...draft, status: "ACTIVE" }).map((variant) => variant.sku)).toEqual([
      "READY",
    ]);
  });

  it("filters by category, option, stock, and price sort", () => {
    const shirt = createProductDraft({
      name: "Cotton Shirt",
      slug: "cotton-shirt",
      categorySlugs: ["shirts"],
      variants: [{ sku: "SHIRT-WHITE-M", color: "white", size: "M", price: 39000, stock: 5 }],
    });
    const pants = createProductDraft({
      name: "Denim Pants",
      slug: "denim-pants",
      categorySlugs: ["denim"],
      variants: [{ sku: "PANTS-DENIM-M", color: "denim", size: "M", price: 59000, stock: 1, safetyStock: 1 }],
    });

    expect(
      searchProducts([pants, shirt], {
        categorySlug: "shirts",
        color: "white",
        inStock: true,
        sort: "price_asc",
      }).map((product) => product.slug),
    ).toEqual(["cotton-shirt"]);
  });
});
