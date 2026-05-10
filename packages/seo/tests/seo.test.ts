import { describe, expect, it } from "vitest";
import { createBreadcrumbJsonLd, createProductJsonLd } from "../src/json-ld";
import { createSeoMetadata } from "../src/metadata";
import { createRobotsTxt, createSitemapEntry } from "../src/sitemap";

describe("seo helpers", () => {
  it("creates canonical metadata, sitemap entries, robots, and json-ld", () => {
    const metadata = createSeoMetadata({
      title: "Essential Cotton Shirt",
      description: "Durable cotton shirt",
      baseUrl: "https://shop.example.com",
      path: "/products/essential-cotton-shirt",
      imageUrl: "https://shop.example.com/product.jpg",
    });
    const sitemapEntry = createSitemapEntry("https://shop.example.com", "/products/essential-cotton-shirt", {
      priority: 0.8,
      changeFrequency: "daily",
    });
    const productJsonLd = createProductJsonLd({
      name: "Essential Cotton Shirt",
      slug: "essential-cotton-shirt",
      price: 39000,
      currency: "KRW",
      baseUrl: "https://shop.example.com",
    });
    const breadcrumbs = createBreadcrumbJsonLd([
      { name: "Home", url: "https://shop.example.com" },
      { name: "Shirts", url: "https://shop.example.com/categories/shirts" },
    ]);

    expect(metadata.alternates.canonical).toBe("https://shop.example.com/products/essential-cotton-shirt");
    expect(sitemapEntry.url).toBe("https://shop.example.com/products/essential-cotton-shirt");
    expect(createRobotsTxt("https://shop.example.com")).toContain("Sitemap: https://shop.example.com/sitemap.xml");
    expect(productJsonLd.offers.availability).toBe("https://schema.org/InStock");
    expect(breadcrumbs.itemListElement[1]?.position).toBe(2);
  });
});
