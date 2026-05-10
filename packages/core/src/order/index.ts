export type OrderStatus =
  | "DRAFT"
  | "PENDING_PAYMENT"
  | "PAID"
  | "FULFILLING"
  | "SHIPPED"
  | "DELIVERED"
  | "RETURN_REQUESTED"
  | "RETURNED"
  | "REFUNDED"
  | "CANCELLED";

export type RefundStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "COMPLETED";

export type ShipmentCarrier = "CJ" | "LOTTE" | "HANJIN" | "POST" | "DIRECT";

export type OrderLineInput = {
  sku: string;
  quantity: number;
  unitPrice: number;
};

export type OrderDraftInput = {
  customerId: string;
  lines: OrderLineInput[];
  shippingFee?: number;
  discountPrice?: number;
};

export type OrderDraft = Omit<OrderDraftInput, "shippingFee" | "discountPrice"> & {
  status: "DRAFT";
  shippingFee: number;
  discountPrice: number;
  subtotalPrice: number;
  totalPrice: number;
};

const allowedTransitions: Record<OrderStatus, OrderStatus[]> = {
  DRAFT: ["PENDING_PAYMENT", "CANCELLED"],
  PENDING_PAYMENT: ["PAID", "CANCELLED"],
  PAID: ["FULFILLING", "CANCELLED"],
  FULFILLING: ["SHIPPED", "CANCELLED"],
  SHIPPED: ["DELIVERED", "RETURN_REQUESTED"],
  DELIVERED: ["RETURN_REQUESTED"],
  RETURN_REQUESTED: ["RETURNED"],
  RETURNED: ["REFUNDED"],
  REFUNDED: [],
  CANCELLED: [],
};

const refundTransitions: Record<RefundStatus, RefundStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED"],
  APPROVED: ["COMPLETED"],
  REJECTED: [],
  COMPLETED: [],
};

export function canTransitionOrder(from: OrderStatus, to: OrderStatus) {
  return allowedTransitions[from].includes(to);
}

export function canTransitionRefund(from: RefundStatus, to: RefundStatus): boolean {
  return refundTransitions[from].includes(to);
}

export function createTrackingUrl(carrier: ShipmentCarrier, trackingNumber: string): string {
  const normalizedTrackingNumber = trackingNumber.trim();
  if (!normalizedTrackingNumber) {
    throw new Error("trackingNumber is required");
  }

  const carrierUrls: Record<ShipmentCarrier, string> = {
    CJ: `https://trace.cjlogistics.com/next/tracking.html?wblNo=${normalizedTrackingNumber}`,
    LOTTE: `https://www.lotteglogis.com/home/reservation/tracking/linkView?InvNo=${normalizedTrackingNumber}`,
    HANJIN: `https://www.hanjin.com/kor/CMS/DeliveryMgr/WaybillSch.do?mCode=MN038&wblnum=${normalizedTrackingNumber}`,
    POST: `https://service.epost.go.kr/trace.RetrieveDomRigiTraceList.comm?sid1=${normalizedTrackingNumber}`,
    DIRECT: `direct:${normalizedTrackingNumber}`,
  };

  return carrierUrls[carrier];
}

export function createOrderDraft(input: OrderDraftInput): OrderDraft {
  if (input.lines.length === 0) {
    throw new Error("order requires at least one line");
  }

  const subtotalPrice = input.lines.reduce((sum, line) => {
    assertPositiveInteger(line.quantity, "quantity");
    assertNonNegativeInteger(line.unitPrice, "unitPrice");

    return sum + line.quantity * line.unitPrice;
  }, 0);
  const shippingFee = input.shippingFee ?? 0;
  const discountPrice = input.discountPrice ?? 0;

  assertNonNegativeInteger(shippingFee, "shippingFee");
  assertNonNegativeInteger(discountPrice, "discountPrice");

  return {
    ...input,
    shippingFee,
    discountPrice,
    status: "DRAFT",
    subtotalPrice,
    totalPrice: Math.max(0, subtotalPrice + shippingFee - discountPrice),
  };
}

function assertPositiveInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}

function assertNonNegativeInteger(value: number, field: string) {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}
