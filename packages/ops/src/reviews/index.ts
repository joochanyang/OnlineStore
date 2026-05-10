export type ReviewModerationStatus = "VISIBLE" | "HIDDEN" | "REPORTED";

export type ReviewInput = {
  customerId: string;
  productId: string;
  orderId: string;
  rating: number;
  body: string;
};

export type PurchaseRecord = {
  customerId: string;
  productId: string;
  orderId: string;
  status: "PAID" | "SHIPPED" | "DELIVERED" | "CANCELLED" | "REFUNDED";
};

export type ProductReview = ReviewInput & {
  status: ReviewModerationStatus;
  createdAt: Date;
};

export type WishlistEntry = {
  customerId: string;
  productId: string;
  createdAt: Date;
};

export type RecentProductView = {
  customerId: string;
  productId: string;
  viewedAt: Date;
};

export function createReview(input: ReviewInput, purchases: PurchaseRecord[]): ProductReview {
  assertCanReview(input, purchases);

  return {
    ...input,
    body: input.body.trim(),
    status: "VISIBLE",
    createdAt: new Date(),
  };
}

export function moderateReview(review: ProductReview, status: ReviewModerationStatus): ProductReview {
  return {
    ...review,
    status,
  };
}

export function assertCanReview(input: ReviewInput, purchases: PurchaseRecord[]): void {
  if (!Number.isInteger(input.rating) || input.rating < 1 || input.rating > 5) {
    throw new Error("rating must be an integer between 1 and 5");
  }

  if (!input.body.trim()) {
    throw new Error("review body is required");
  }

  const matchingPurchase = purchases.find(
    (purchase) =>
      purchase.customerId === input.customerId &&
      purchase.productId === input.productId &&
      purchase.orderId === input.orderId,
  );

  if (!matchingPurchase || matchingPurchase.status !== "DELIVERED") {
    throw new Error("review requires a delivered purchase");
  }
}

export function toggleWishlist(entries: WishlistEntry[], customerId: string, productId: string): WishlistEntry[] {
  const existing = entries.find((entry) => entry.customerId === customerId && entry.productId === productId);

  if (existing) {
    return entries.filter((entry) => entry !== existing);
  }

  return [...entries, { customerId, productId, createdAt: new Date() }];
}

export function recordRecentProductView(
  views: RecentProductView[],
  customerId: string,
  productId: string,
  limit = 20,
): RecentProductView[] {
  const nextView = { customerId, productId, viewedAt: new Date() };
  const withoutDuplicate = views.filter((view) => !(view.customerId === customerId && view.productId === productId));

  return [nextView, ...withoutDuplicate].slice(0, limit);
}
