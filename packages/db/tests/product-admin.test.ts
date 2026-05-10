import { describe, expect, it } from "vitest";
import { createAdminProduct, listAdminCatalogProducts } from "../src/index";

describe("admin product persistence boundary", () => {
  it("returns admin catalog products from the fallback dataset without DATABASE_URL", async () => {
    const products = await listAdminCatalogProducts();

    expect(products.some((product) => product.id === "seed-essential-shirt")).toBe(true);
  });

  it("validates and maps a created product preview without DATABASE_URL", async () => {
    const product = await createAdminProduct({
      name: "Smoke Product",
      slug: "smoke-product",
      status: "DRAFT",
      categorySlugs: ["shirts", "shirts", "new-arrivals"],
      imageUrls: ["/products/smoke-product.jpg"],
      variants: [
        {
          sku: "smoke-white-m",
          color: "white",
          size: "M",
          price: 1000,
          stock: 3,
          safetyStock: 1,
        },
      ],
    });

    expect(product).toMatchObject({
      id: "preview-smoke-product",
      slug: "smoke-product",
      status: "DRAFT",
      stock: 3,
      price: 1000,
    });
    expect(product.variants[0]?.sku).toBe("SMOKE-WHITE-M");
  });
});
