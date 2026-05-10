export type ApiEnvelope<T> = {
  data: T;
  requestId: string;
};

export type ApiErrorEnvelope = {
  error: {
    code: string;
    message: string;
  };
  requestId: string;
};

export type Money = {
  amount: number;
  currency: "KRW";
};

export type ProductSummary = {
  id: string;
  slug: string;
  name: string;
  status: "DRAFT" | "ACTIVE" | "ARCHIVED";
  price: Money;
  stock: number;
  imageUrl?: string;
  variants?: Array<{
    sku: string;
    color: string;
    size: string;
    stock: number;
    price: Money;
  }>;
};

export type CartLineRequest = {
  sku: string;
  quantity: number;
};

export type CheckoutRequest = {
  customerId: string;
  lines: CartLineRequest[];
  couponCode?: string;
};

export type CheckoutPreview = {
  subtotal: Money;
  shippingFee: Money;
  discount: Money;
  total: Money;
};

export type CheckoutOrderRequest = CheckoutRequest & {
  paymentProvider?: "mock" | "toss" | "stripe";
  idempotencyKey?: string;
};

export type CheckoutOrderResult = CheckoutPreview & {
  orderId: string;
  status: "PENDING_PAYMENT" | "PAID";
  payment: {
    provider: "mock" | "toss" | "stripe";
    status: "READY" | "AUTHORIZED" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";
    idempotencyKey: string;
  };
};

export type CartItemDto = {
  id: string;
  variantId: string;
  sku: string;
  productSlug: string;
  productName: string;
  color: string;
  size: string;
  unitPrice: Money;
  quantity: number;
  lineTotal: Money;
  stock: number;
};

export type CartDto = {
  id: string;
  customerId: string | null;
  items: CartItemDto[];
  subtotal: Money;
  expiresAt: string;
  lastActivityAt: string;
};

export type CartAddItemRequest = {
  variantId: string;
  quantity: number;
};

export type CartUpdateItemRequest = {
  quantity: number;
};

export type CartMergeResult = {
  cart: CartDto;
  merged: boolean;
};

export type CheckoutPreviewLine = {
  reservationId: string;
  sku: string;
  quantity: number;
  unitPrice: Money;
  lineTotal: Money;
};

export type CheckoutPreviewResult = {
  groupId: string;
  expiresAt: string;
  lines: CheckoutPreviewLine[];
  subtotal: Money;
  shippingFee: Money;
  discount: Money;
  total: Money;
};

export type CheckoutPreviewBody = {
  couponCode?: string;
};

export type CheckoutOrderBody = {
  groupId: string;
  shippingAddressId?: string;
  paymentMethod?: "card" | "transfer" | "virtual_account" | "kakao_pay" | "naver_pay" | "toss_pay";
  successUrl: string;
  failUrl: string;
  idempotencyKey: string;
};

export type CheckoutOrderCreated = {
  orderId: string;
  status: "PENDING_PAYMENT";
  paymentIntentId: string;
  clientSecret?: string;
  redirectUrl?: string;
  total: Money;
  expiresAt: string;
};
