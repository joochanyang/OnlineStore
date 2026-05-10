import { describe, expect, it } from "vitest";
import { canTransitionOrder, canTransitionRefund, createOrderDraft, createTrackingUrl } from "../src/order";

describe("order domain", () => {
  it("calculates totals with shipping and discounts", () => {
    const order = createOrderDraft({
      customerId: "customer-1",
      lines: [
        { sku: "A", quantity: 2, unitPrice: 1000 },
        { sku: "B", quantity: 1, unitPrice: 500 },
      ],
      shippingFee: 3000,
      discountPrice: 500,
    });

    expect(order.subtotalPrice).toBe(2500);
    expect(order.totalPrice).toBe(5000);
  });

  it("allows delivery and return transitions after shipment", () => {
    expect(canTransitionOrder("SHIPPED", "DELIVERED")).toBe(true);
    expect(canTransitionOrder("DELIVERED", "RETURN_REQUESTED")).toBe(true);
    expect(canTransitionOrder("REFUNDED", "PAID")).toBe(false);
  });

  it("creates tracking URLs and guards refund transitions", () => {
    expect(createTrackingUrl("DIRECT", "TRACK-1")).toBe("direct:TRACK-1");
    expect(canTransitionRefund("REQUESTED", "APPROVED")).toBe(true);
    expect(canTransitionRefund("COMPLETED", "APPROVED")).toBe(false);
  });
});
