export type PointLedgerEntry = {
  customerId: string;
  amount: number;
  reason: string;
  orderId?: string;
  createdAt?: Date;
};

export function calculatePointBalance(entries: PointLedgerEntry[]): number {
  return entries.reduce((sum, entry) => {
    assertInteger(entry.amount, "amount");

    return sum + entry.amount;
  }, 0);
}

export function createPointEarnEntry(
  customerId: string,
  orderId: string,
  paidPrice: number,
  earnRate: number,
): PointLedgerEntry {
  assertRequired(customerId, "customerId");
  assertRequired(orderId, "orderId");
  assertNonNegativeInteger(paidPrice, "paidPrice");

  if (earnRate < 0 || earnRate > 1) {
    throw new Error("earnRate must be between 0 and 1");
  }

  return {
    customerId,
    orderId,
    amount: Math.floor(paidPrice * earnRate),
    reason: "ORDER_EARN",
    createdAt: new Date(),
  };
}

export function spendPoints(entries: PointLedgerEntry[], amount: number, reason: string): PointLedgerEntry {
  assertNonNegativeInteger(amount, "amount");
  assertRequired(reason, "reason");

  const balance = calculatePointBalance(entries);
  if (amount > balance) {
    throw new Error("Insufficient point balance");
  }

  const customerId = entries[0]?.customerId;
  if (!customerId) {
    throw new Error("customer point ledger is empty");
  }

  return {
    customerId,
    amount: -amount,
    reason,
    createdAt: new Date(),
  };
}

function assertRequired(value: string, field: string): void {
  if (!value.trim()) {
    throw new Error(`${field} is required`);
  }
}

function assertInteger(value: number, field: string): void {
  if (!Number.isInteger(value)) {
    throw new Error(`${field} must be an integer`);
  }
}

function assertNonNegativeInteger(value: number, field: string): void {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} must be a non-negative integer`);
  }
}
