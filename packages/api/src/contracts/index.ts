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
