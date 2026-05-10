import { beforeEach, describe, expect, it } from "vitest";

import { PaymentError, TossPaymentsProvider } from "../src";

const baseInput = {
  orderId: "order_1",
  amount: 19_900,
  currency: "KRW" as const,
  customer: { id: "c1", email: "buyer@example.com", name: "구매자" },
  successUrl: "https://shop.example.com/checkout/success",
  failUrl: "https://shop.example.com/checkout/fail",
};

function createMockProvider(): TossPaymentsProvider {
  return new TossPaymentsProvider({ mode: "mock" });
}

describe("TossPaymentsProvider — mock mode", () => {
  let provider: TossPaymentsProvider;

  beforeEach(() => {
    provider = createMockProvider();
  });

  it("createIntent → confirm → refund full amount", async () => {
    const intent = await provider.createIntent({
      ...baseInput,
      idempotencyKey: "idem_intent_1",
    });
    expect(intent.intentId).toMatch(/^mock_intent_/);
    expect(intent.clientSecret).toMatch(/^mock_payment_/);

    const confirm = await provider.confirm({
      intentId: intent.intentId,
      paymentKey: intent.clientSecret!,
      amount: baseInput.amount,
    });
    expect(confirm.status).toBe("APPROVED");
    expect(confirm.externalId).toBe(intent.clientSecret);

    const refund = await provider.refund({
      paymentExternalId: confirm.externalId,
      amount: baseInput.amount,
      reason: "단순변심",
      idempotencyKey: "idem_refund_1",
    });
    expect(refund.refundedAmount).toBe(baseInput.amount);
    expect(refund.remainingAmount).toBe(0);
  });

  it("supports two partial refunds totalling the full amount", async () => {
    const intent = await provider.createIntent({
      ...baseInput,
      idempotencyKey: "idem_intent_partial",
    });
    await provider.confirm({
      intentId: intent.intentId,
      paymentKey: intent.clientSecret!,
      amount: baseInput.amount,
    });

    const first = await provider.refund({
      paymentExternalId: intent.clientSecret!,
      amount: 5_000,
      reason: "1차",
      idempotencyKey: "idem_refund_partial_1",
    });
    expect(first.remainingAmount).toBe(baseInput.amount - 5_000);

    const second = await provider.refund({
      paymentExternalId: intent.clientSecret!,
      amount: baseInput.amount - 5_000,
      reason: "2차",
      idempotencyKey: "idem_refund_partial_2",
    });
    expect(second.remainingAmount).toBe(0);
  });

  it("rejects refund amount exceeding remaining balance", async () => {
    const intent = await provider.createIntent({
      ...baseInput,
      idempotencyKey: "idem_intent_over",
    });
    await provider.confirm({
      intentId: intent.intentId,
      paymentKey: intent.clientSecret!,
      amount: baseInput.amount,
    });

    await provider.refund({
      paymentExternalId: intent.clientSecret!,
      amount: baseInput.amount,
      reason: "1차 전액",
      idempotencyKey: "idem_refund_over_1",
    });

    await expect(
      provider.refund({
        paymentExternalId: intent.clientSecret!,
        amount: 1,
        reason: "잔액 없음",
        idempotencyKey: "idem_refund_over_2",
      }),
    ).rejects.toBeInstanceOf(PaymentError);
  });

  it("createIntent is idempotent on the same key", async () => {
    const a = await provider.createIntent({
      ...baseInput,
      idempotencyKey: "idem_same",
    });
    const b = await provider.createIntent({
      ...baseInput,
      idempotencyKey: "idem_same",
    });
    expect(a.intentId).toBe(b.intentId);
    expect(a.clientSecret).toBe(b.clientSecret);
  });

  it("refund replay returns the same external refund id", async () => {
    const intent = await provider.createIntent({
      ...baseInput,
      idempotencyKey: "idem_intent_replay",
    });
    await provider.confirm({
      intentId: intent.intentId,
      paymentKey: intent.clientSecret!,
      amount: baseInput.amount,
    });
    const first = await provider.refund({
      paymentExternalId: intent.clientSecret!,
      amount: 1_000,
      reason: "test",
      idempotencyKey: "idem_refund_replay",
    });
    const second = await provider.refund({
      paymentExternalId: intent.clientSecret!,
      amount: 1_000,
      reason: "test",
      idempotencyKey: "idem_refund_replay",
    });
    expect(first.externalRefundId).toBe(second.externalRefundId);
  });

  it("rejects confirm on amount mismatch", async () => {
    const intent = await provider.createIntent({
      ...baseInput,
      idempotencyKey: "idem_intent_mismatch",
    });
    await expect(
      provider.confirm({
        intentId: intent.intentId,
        paymentKey: intent.clientSecret!,
        amount: baseInput.amount + 1,
      }),
    ).rejects.toBeInstanceOf(PaymentError);
  });
});
