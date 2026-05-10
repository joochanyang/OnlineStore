import { describe, expect, it } from "vitest";
import { createAuditLogEntry, filterAuditTrail } from "../src/audit";
import { applyCoupon, assertNoDuplicateCouponUse, canStackCoupons } from "../src/coupons";
import { createInquiry, transitionInquiry } from "../src/cs";
import { calculatePointBalance, createPointEarnEntry, spendPoints } from "../src/points";
import { createOperationsReport } from "../src/reports";
import { createReview, moderateReview, recordRecentProductView, toggleWishlist } from "../src/reviews";

describe("ops coupons", () => {
  it("applies minimum order, caps discount, and blocks duplicate customer use", () => {
    const application = applyCoupon({ code: " welcome ", minimumOrderPrice: 10000, discountPrice: 3000 }, 12000);

    expect(application).toEqual({ code: "WELCOME", discountPrice: 3000, payablePrice: 9000 });
    expect(() =>
      assertNoDuplicateCouponUse(
        [{ code: "WELCOME", customerId: "customer-1", orderId: "order-1" }],
        { code: "welcome", customerId: "customer-1", orderId: "order-2" },
      ),
    ).toThrow("Coupon already used");
    expect(canStackCoupons([{ code: "A", minimumOrderPrice: 0, discountPrice: 1, stackable: true }])).toBe(true);
  });
});

describe("ops points", () => {
  it("earns, spends, and guards balances", () => {
    const earned = createPointEarnEntry("customer-1", "order-1", 10000, 0.01);
    const spent = spendPoints([earned], 50, "ORDER_SPEND");

    expect(calculatePointBalance([earned, spent])).toBe(50);
    expect(() => spendPoints([spent], 60, "ORDER_SPEND")).toThrow("Insufficient point balance");
  });
});

describe("ops reviews and cs", () => {
  it("limits reviews to delivered purchases and supports moderation", () => {
    const review = createReview(
      { customerId: "customer-1", productId: "product-1", orderId: "order-1", rating: 5, body: "Great" },
      [{ customerId: "customer-1", productId: "product-1", orderId: "order-1", status: "DELIVERED" }],
    );

    expect(moderateReview(review, "HIDDEN").status).toBe("HIDDEN");
  });

  it("toggles wishlist entries and keeps recent views unique", () => {
    const wished = toggleWishlist([], "customer-1", "product-1");
    const removed = toggleWishlist(wished, "customer-1", "product-1");
    const recent = recordRecentProductView(
      recordRecentProductView([], "customer-1", "product-1"),
      "customer-1",
      "product-1",
    );

    expect(wished).toHaveLength(1);
    expect(removed).toHaveLength(0);
    expect(recent).toHaveLength(1);
  });

  it("requires answering inquiries before closing", () => {
    const inquiry = createInquiry({
      id: "inquiry-1",
      customerId: "customer-1",
      subject: "Shipping",
      body: "Where is it?",
    });

    expect(() => transitionInquiry(inquiry, "CLOSED")).toThrow("must be answered");
    expect(transitionInquiry(transitionInquiry(inquiry, "ANSWERED"), "CLOSED").status).toBe("CLOSED");
  });
});

describe("ops audit and reports", () => {
  it("sorts audit trail and aggregates operational metrics", () => {
    const later = createAuditLogEntry({
      actorId: "admin-1",
      action: "product.update",
      targetId: "product-1",
      createdAt: new Date("2026-01-02"),
    });
    const earlier = createAuditLogEntry({
      actorId: "admin-1",
      action: "product.create",
      targetId: "product-1",
      createdAt: new Date("2026-01-01"),
    });
    const report = createOperationsReport([
      { id: "order-1", status: "DELIVERED", totalPrice: 10000 },
      { id: "order-2", status: "REFUNDED", totalPrice: 5000, refundedPrice: 5000 },
      { id: "order-3", status: "CANCELLED", totalPrice: 9000 },
    ]);

    expect(filterAuditTrail([later, earlier], "product-1").map((entry) => entry.action)).toEqual([
      "product.create",
      "product.update",
    ]);
    expect(report.metrics.find((metric) => metric.label === "grossSales")?.value).toBe(15000);
    expect(report.refundRate).toBe(0.5);
  });
});
