export type PaymentMode = "mock" | "sandbox" | "live";

export type PaymentMethodKind =
  | "card"
  | "transfer"
  | "virtual_account"
  | "kakao_pay"
  | "naver_pay"
  | "toss_pay";

export type PaymentStatus =
  | "PENDING"
  | "APPROVED"
  | "CANCELLED"
  | "FAILED"
  | "EXPIRED";

export type RefundStatusValue = "PENDING" | "COMPLETED" | "FAILED" | "CANCELLED";

export interface CreateIntentInput {
  orderId: string;
  amount: number;
  currency: "KRW";
  method?: PaymentMethodKind;
  customer: { id: string; email: string; name: string };
  successUrl: string;
  failUrl: string;
  idempotencyKey: string;
}

export interface CreateIntentResult {
  intentId: string;
  clientSecret?: string;
  redirectUrl?: string;
  expiresAt: Date;
}

export interface ConfirmInput {
  intentId: string;
  paymentKey: string;
  amount: number;
}

export interface ConfirmResult {
  paymentId: string;
  externalId: string;
  status: PaymentStatus;
  approvedAt?: Date;
  raw: Record<string, unknown>;
}

export interface RefundInput {
  paymentExternalId: string;
  amount: number;
  reason: string;
  idempotencyKey: string;
}

export interface RefundResult {
  refundId: string;
  externalRefundId: string;
  status: RefundStatusValue;
  refundedAmount: number;
  remainingAmount: number;
}

export interface CancelInput {
  paymentExternalId: string;
  reason: string;
}

export interface CancelResult {
  status: PaymentStatus;
  cancelledAt: Date;
}

export interface VerifySignatureInput {
  rawBody: string;
  signature: string | undefined;
  timestamp: string | undefined;
  nonce?: string | undefined;
}

export type SignatureVerification =
  | {
      ok: true;
      eventId: string;
      payload: Record<string, unknown>;
    }
  | {
      ok: false;
      reason: "missing_signature" | "missing_timestamp" | "expired" | "bad_signature" | "replay" | "bad_payload";
    };

export interface PaymentProvider {
  readonly name: string;
  readonly mode: PaymentMode;
  createIntent(input: CreateIntentInput): Promise<CreateIntentResult>;
  confirm(input: ConfirmInput): Promise<ConfirmResult>;
  cancel(input: CancelInput): Promise<CancelResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  verifyWebhookSignature(input: VerifySignatureInput): SignatureVerification;
}

export class PaymentError extends Error {
  constructor(
    public readonly code:
      | "PROVIDER_HTTP"
      | "PROVIDER_TIMEOUT"
      | "INVALID_AMOUNT"
      | "INVALID_STATE"
      | "MOCK_FAILURE",
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "PaymentError";
  }
}
