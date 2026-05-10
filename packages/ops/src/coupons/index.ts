export type CouponRule = {
  code: string;
  minimumOrderPrice: number;
  discountPrice: number;
  stackable?: boolean;
  startsAt?: Date;
  endsAt?: Date;
  maxRedemptions?: number;
};

export type CouponApplication = {
  code: string;
  discountPrice: number;
  payablePrice: number;
};

export type CouponUsage = {
  code: string;
  customerId: string;
  orderId: string;
};

export function applyCoupon(
  rule: CouponRule,
  orderPrice: number,
  context: { now?: Date; redeemedCount?: number } = {},
): CouponApplication {
  assertNonNegativeInteger(orderPrice, "orderPrice");
  assertCouponRule(rule);

  const now = context.now ?? new Date();
  if (rule.startsAt && now < rule.startsAt) {
    throw new Error(`Coupon is not active yet: ${rule.code}`);
  }

  if (rule.endsAt && now > rule.endsAt) {
    throw new Error(`Coupon is expired: ${rule.code}`);
  }

  if (rule.maxRedemptions !== undefined && (context.redeemedCount ?? 0) >= rule.maxRedemptions) {
    throw new Error(`Coupon redemption limit reached: ${rule.code}`);
  }

  if (orderPrice < rule.minimumOrderPrice) {
    throw new Error(`Coupon minimum order price not met: ${rule.code}`);
  }

  const discountPrice = Math.min(rule.discountPrice, orderPrice);

  return {
    code: normalizeCouponCode(rule.code),
    discountPrice,
    payablePrice: orderPrice - discountPrice,
  };
}

export function assertNoDuplicateCouponUse(usages: CouponUsage[], nextUsage: CouponUsage): void {
  const alreadyUsed = usages.some(
    (usage) =>
      normalizeCouponCode(usage.code) === normalizeCouponCode(nextUsage.code) &&
      usage.customerId === nextUsage.customerId,
  );

  if (alreadyUsed) {
    throw new Error(`Coupon already used by customer: ${nextUsage.code}`);
  }
}

export function canStackCoupons(rules: CouponRule[]): boolean {
  return rules.every((rule) => rule.stackable === true);
}

function assertCouponRule(rule: CouponRule): void {
  const code = normalizeCouponCode(rule.code);
  if (!code) {
    throw new Error("coupon code is required");
  }

  assertNonNegativeInteger(rule.minimumOrderPrice, "minimumOrderPrice");
  assertNonNegativeInteger(rule.discountPrice, "discountPrice");

  if (rule.maxRedemptions !== undefined) {
    assertNonNegativeInteger(rule.maxRedemptions, "maxRedemptions");
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}

function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase();
}
