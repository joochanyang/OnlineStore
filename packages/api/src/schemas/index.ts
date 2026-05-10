export type ProductListQuery = {
  category?: string;
  inStock?: boolean;
  q?: string;
  page?: number;
  pageSize?: number;
};

export type AdminMutationHeaders = {
  actorId: string;
  requestId: string;
};

export function normalizeProductListQuery(query: ProductListQuery): Required<ProductListQuery> {
  return {
    category: query.category ?? "",
    inStock: query.inStock ?? false,
    q: query.q ?? "",
    page: Math.max(1, query.page ?? 1),
    pageSize: Math.min(100, Math.max(1, query.pageSize ?? 24)),
  };
}
