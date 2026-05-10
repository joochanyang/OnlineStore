import { describe, expect, it } from "vitest";
import { canTransitionPayment, createMockPaymentProvider, createPaymentIntent, transitionPayment } from "../src/payment";

describe("payment domain", () => {
  it("creates and confirms a payment intent", async () => {
    const provider = createMockPaymentProvider();
    const intent = await provider.createIntent({
      orderId: "order-1",
      amount: 10000,
      provider: "mock",
      idempotencyKey: "order-1:create",
    });

    expect(intent.status).toBe("READY");
    expect((await provider.confirm(intent)).status).toBe("PAID");
  });

  it("guards invalid terminal transitions", () => {
    const intent = createPaymentIntent({
      orderId: "order-1",
      amount: 10000,
      provider: "mock",
      idempotencyKey: "order-1:create",
    });

    expect(canTransitionPayment("PAID", "REFUNDED")).toBe(true);
    expect(() => transitionPayment({ ...intent, status: "FAILED" }, "PAID")).toThrow("Invalid payment transition");
  });
});
