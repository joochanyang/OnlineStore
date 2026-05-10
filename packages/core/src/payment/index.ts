export type PaymentStatus = "READY" | "AUTHORIZED" | "PAID" | "FAILED" | "CANCELLED" | "REFUNDED";

export type PaymentProvider = "mock" | "toss" | "stripe";

export type PaymentIntentInput = {
  orderId: string;
  amount: number;
  provider: PaymentProvider;
  idempotencyKey: string;
};

export type PaymentIntent = PaymentIntentInput & {
  status: PaymentStatus;
};

const allowedTransitions: Record<PaymentStatus, PaymentStatus[]> = {
  READY: ["AUTHORIZED", "PAID", "FAILED", "CANCELLED"],
  AUTHORIZED: ["PAID", "FAILED", "CANCELLED"],
  PAID: ["REFUNDED"],
  FAILED: [],
  CANCELLED: [],
  REFUNDED: [],
};

export function createPaymentIntent(input: PaymentIntentInput): PaymentIntent {
  assertRequired(input.orderId, "orderId");
  assertRequired(input.idempotencyKey, "idempotencyKey");
  assertPositiveInteger(input.amount, "amount");

  return {
    ...input,
    status: "READY",
  };
}

export function canTransitionPayment(from: PaymentStatus, to: PaymentStatus): boolean {
  return allowedTransitions[from].includes(to);
}

export function transitionPayment(intent: PaymentIntent, nextStatus: PaymentStatus): PaymentIntent {
  if (!canTransitionPayment(intent.status, nextStatus)) {
    throw new Error(`Invalid payment transition: ${intent.status} -> ${nextStatus}`);
  }

  return {
    ...intent,
    status: nextStatus,
  };
}

export function createMockPaymentProvider() {
  return {
    name: "mock" as const,
    async createIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
      return createPaymentIntent(input);
    },
    async confirm(intent: PaymentIntent): Promise<PaymentIntent> {
      return transitionPayment(intent, "PAID");
    },
  };
}

function assertRequired(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
}

function assertPositiveInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${field} must be a positive integer`);
  }
}
