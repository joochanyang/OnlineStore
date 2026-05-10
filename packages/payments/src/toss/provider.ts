import { randomUUID } from "node:crypto";

import {
  PaymentError,
  type CancelInput,
  type CancelResult,
  type ConfirmInput,
  type ConfirmResult,
  type CreateIntentInput,
  type CreateIntentResult,
  type PaymentMode,
  type PaymentProvider,
  type RefundInput,
  type RefundResult,
  type SignatureVerification,
  type VerifySignatureInput,
} from "../types";

import { verifyTossWebhookSignature } from "./signature";

interface MockPayment {
  paymentKey: string;
  orderId: string;
  intentId: string;
  amount: number;
  refunded: number;
  status: "PENDING" | "APPROVED" | "CANCELLED";
  approvedAt?: Date;
  idempotencyKey: string;
}

interface MockRefund {
  refundId: string;
  paymentKey: string;
  amount: number;
  reason: string;
}

class MockLedger {
  private readonly intentToPayment = new Map<string, MockPayment>();
  private readonly paymentByExternalId = new Map<string, MockPayment>();
  private readonly idempotencyIndex = new Map<string, MockPayment>();
  private readonly refundIdempotency = new Map<string, MockRefund>();
  private readonly refundsByPayment = new Map<string, MockRefund[]>();

  createIntent(input: CreateIntentInput): MockPayment {
    const existing = this.idempotencyIndex.get(input.idempotencyKey);
    if (existing) return existing;

    const intentId = `mock_intent_${randomUUID()}`;
    const paymentKey = `mock_payment_${randomUUID()}`;
    const payment: MockPayment = {
      paymentKey,
      orderId: input.orderId,
      intentId,
      amount: input.amount,
      refunded: 0,
      status: "PENDING",
      idempotencyKey: input.idempotencyKey,
    };
    this.intentToPayment.set(intentId, payment);
    this.paymentByExternalId.set(paymentKey, payment);
    this.idempotencyIndex.set(input.idempotencyKey, payment);
    return payment;
  }

  confirm(intentId: string, paymentKey: string, amount: number): MockPayment {
    const payment = this.intentToPayment.get(intentId);
    if (!payment) throw new PaymentError("INVALID_STATE", "intent not found");
    if (payment.paymentKey !== paymentKey) {
      throw new PaymentError("INVALID_STATE", "paymentKey mismatch");
    }
    if (payment.amount !== amount) {
      throw new PaymentError("INVALID_AMOUNT", "amount mismatch");
    }
    payment.status = "APPROVED";
    payment.approvedAt = new Date();
    return payment;
  }

  cancel(paymentKey: string): MockPayment {
    const payment = this.paymentByExternalId.get(paymentKey);
    if (!payment) throw new PaymentError("INVALID_STATE", "payment not found");
    payment.status = "CANCELLED";
    return payment;
  }

  refund(input: RefundInput): MockRefund & { remaining: number } {
    const existing = this.refundIdempotency.get(input.idempotencyKey);
    if (existing) {
      const payment = this.paymentByExternalId.get(existing.paymentKey)!;
      return { ...existing, remaining: payment.amount - payment.refunded };
    }
    const payment = this.paymentByExternalId.get(input.paymentExternalId);
    if (!payment) throw new PaymentError("INVALID_STATE", "payment not found");
    if (payment.status !== "APPROVED") {
      throw new PaymentError("INVALID_STATE", "payment not approved");
    }
    const remainingBefore = payment.amount - payment.refunded;
    if (input.amount <= 0 || input.amount > remainingBefore) {
      throw new PaymentError(
        "INVALID_AMOUNT",
        `refund amount ${input.amount} exceeds remaining ${remainingBefore}`,
      );
    }
    payment.refunded += input.amount;
    const refund: MockRefund = {
      refundId: `mock_refund_${randomUUID()}`,
      paymentKey: payment.paymentKey,
      amount: input.amount,
      reason: input.reason,
    };
    this.refundIdempotency.set(input.idempotencyKey, refund);
    const list = this.refundsByPayment.get(payment.paymentKey) ?? [];
    list.push(refund);
    this.refundsByPayment.set(payment.paymentKey, list);
    return { ...refund, remaining: payment.amount - payment.refunded };
  }

  getByExternalId(paymentKey: string): MockPayment | undefined {
    return this.paymentByExternalId.get(paymentKey);
  }
}

export interface TossProviderOptions {
  mode: PaymentMode;
  secretKey?: string;
  webhookSecret?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

const DEFAULT_BASE_URL = "https://api.tosspayments.com";

export class TossPaymentsProvider implements PaymentProvider {
  readonly name = "toss";
  readonly mode: PaymentMode;
  private readonly secretKey?: string;
  private readonly webhookSecret?: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly mockLedger = new MockLedger();

  constructor(opts: TossProviderOptions) {
    this.mode = opts.mode;
    this.secretKey = opts.secretKey;
    this.webhookSecret = opts.webhookSecret;
    this.baseUrl = opts.baseUrl ?? DEFAULT_BASE_URL;
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.now = opts.now ?? Date.now;
  }

  private requireSecret(): string {
    if (!this.secretKey) {
      throw new PaymentError(
        "PROVIDER_HTTP",
        `Toss secret key required in ${this.mode} mode`,
      );
    }
    return this.secretKey;
  }

  private authHeader(): string {
    const secret = this.requireSecret();
    return `Basic ${Buffer.from(`${secret}:`).toString("base64")}`;
  }

  async createIntent(input: CreateIntentInput): Promise<CreateIntentResult> {
    if (this.mode === "mock") {
      const payment = this.mockLedger.createIntent(input);
      return {
        intentId: payment.intentId,
        clientSecret: payment.paymentKey,
        expiresAt: new Date(this.now() + 30 * 60 * 1000),
      };
    }
    const res = await this.fetchImpl(`${this.baseUrl}/v1/payments`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        orderId: input.orderId,
        amount: input.amount,
        currency: input.currency,
        successUrl: input.successUrl,
        failUrl: input.failUrl,
        customerEmail: input.customer.email,
        customerName: input.customer.name,
      }),
    });
    if (!res.ok) {
      throw new PaymentError("PROVIDER_HTTP", `Toss createIntent ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const intentId = String(json.paymentKey ?? json.id ?? "");
    return {
      intentId,
      clientSecret: typeof json.clientSecret === "string" ? json.clientSecret : undefined,
      redirectUrl: typeof json.checkout === "object" && json.checkout && "url" in json.checkout
        ? String((json.checkout as { url: unknown }).url)
        : undefined,
      expiresAt: new Date(this.now() + 30 * 60 * 1000),
    };
  }

  async confirm(input: ConfirmInput): Promise<ConfirmResult> {
    if (this.mode === "mock") {
      const payment = this.mockLedger.confirm(input.intentId, input.paymentKey, input.amount);
      return {
        paymentId: payment.paymentKey,
        externalId: payment.paymentKey,
        status: "APPROVED",
        approvedAt: payment.approvedAt,
        raw: { mock: true },
      };
    }
    const res = await this.fetchImpl(`${this.baseUrl}/v1/payments/confirm`, {
      method: "POST",
      headers: {
        Authorization: this.authHeader(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        paymentKey: input.paymentKey,
        orderId: input.intentId,
        amount: input.amount,
      }),
    });
    if (!res.ok) {
      throw new PaymentError("PROVIDER_HTTP", `Toss confirm ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const externalId = String(json.paymentKey ?? "");
    const approvedAtRaw = json.approvedAt;
    return {
      paymentId: externalId,
      externalId,
      status: this.mapStatus(String(json.status ?? "PENDING")),
      approvedAt: typeof approvedAtRaw === "string" ? new Date(approvedAtRaw) : undefined,
      raw: json,
    };
  }

  async cancel(input: CancelInput): Promise<CancelResult> {
    if (this.mode === "mock") {
      this.mockLedger.cancel(input.paymentExternalId);
      return { status: "CANCELLED", cancelledAt: new Date(this.now()) };
    }
    const res = await this.fetchImpl(
      `${this.baseUrl}/v1/payments/${encodeURIComponent(input.paymentExternalId)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ cancelReason: input.reason }),
      },
    );
    if (!res.ok) {
      throw new PaymentError("PROVIDER_HTTP", `Toss cancel ${res.status}`);
    }
    return { status: "CANCELLED", cancelledAt: new Date(this.now()) };
  }

  async refund(input: RefundInput): Promise<RefundResult> {
    if (this.mode === "mock") {
      const result = this.mockLedger.refund(input);
      return {
        refundId: result.refundId,
        externalRefundId: result.refundId,
        status: "COMPLETED",
        refundedAmount: result.amount,
        remainingAmount: result.remaining,
      };
    }
    const res = await this.fetchImpl(
      `${this.baseUrl}/v1/payments/${encodeURIComponent(input.paymentExternalId)}/cancel`,
      {
        method: "POST",
        headers: {
          Authorization: this.authHeader(),
          "Content-Type": "application/json",
          "Idempotency-Key": input.idempotencyKey,
        },
        body: JSON.stringify({
          cancelReason: input.reason,
          cancelAmount: input.amount,
        }),
      },
    );
    if (!res.ok) {
      throw new PaymentError("PROVIDER_HTTP", `Toss refund ${res.status}`);
    }
    const json = (await res.json()) as Record<string, unknown>;
    const cancels = Array.isArray(json.cancels) ? json.cancels : [];
    const last = cancels.length ? cancels[cancels.length - 1] : undefined;
    const externalRefundId =
      last && typeof last === "object" && "transactionKey" in last
        ? String((last as { transactionKey: unknown }).transactionKey)
        : `${input.paymentExternalId}:${input.idempotencyKey}`;
    const balance =
      typeof json.balanceAmount === "number"
        ? (json.balanceAmount as number)
        : undefined;
    const total =
      typeof json.totalAmount === "number" ? (json.totalAmount as number) : undefined;
    const remaining = balance ?? (total !== undefined ? total - input.amount : 0);
    return {
      refundId: externalRefundId,
      externalRefundId,
      status: "COMPLETED",
      refundedAmount: input.amount,
      remainingAmount: remaining,
    };
  }

  verifyWebhookSignature(input: VerifySignatureInput): SignatureVerification {
    if (!this.webhookSecret) {
      return { ok: false, reason: "missing_signature" };
    }
    return verifyTossWebhookSignature(input, {
      secret: this.webhookSecret,
      now: this.now,
    });
  }

  private mapStatus(value: string): ConfirmResult["status"] {
    switch (value) {
      case "DONE":
      case "APPROVED":
        return "APPROVED";
      case "CANCELED":
      case "CANCELLED":
        return "CANCELLED";
      case "EXPIRED":
        return "EXPIRED";
      case "ABORTED":
      case "FAILED":
        return "FAILED";
      default:
        return "PENDING";
    }
  }
}
