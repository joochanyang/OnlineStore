export type ProductJsonLdInput = {
  name: string;
  slug: string;
  price: number;
  currency: string;
  baseUrl?: string;
  imageUrl?: string;
  inStock?: boolean;
};

export function createProductJsonLd(input: ProductJsonLdInput) {
  const url = input.baseUrl ? new URL(`/products/${input.slug}`, input.baseUrl).toString() : `/products/${input.slug}`;

  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: input.name,
    url,
    ...(input.imageUrl ? { image: [input.imageUrl] } : {}),
    offers: {
      "@type": "Offer",
      price: input.price,
      priceCurrency: input.currency,
      availability: input.inStock === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
    },
  };
}

export type BreadcrumbItem = {
  name: string;
  url: string;
};

export function createBreadcrumbJsonLd(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: item.url,
    })),
  };
}
