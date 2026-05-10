export type SalesMetric = {
  label: string;
  value: number;
};

export type ReportOrder = {
  id: string;
  status: "PAID" | "FULFILLING" | "SHIPPED" | "DELIVERED" | "REFUNDED" | "CANCELLED";
  totalPrice: number;
  refundedPrice?: number;
};

export type OperationsReport = {
  metrics: SalesMetric[];
  refundRate: number;
};

export function createOperationsReport(orders: ReportOrder[]): OperationsReport {
  const paidOrders = orders.filter((order) => order.status !== "CANCELLED");
  const grossSales = paidOrders.reduce((sum, order) => sum + order.totalPrice, 0);
  const refundTotal = paidOrders.reduce((sum, order) => sum + (order.refundedPrice ?? 0), 0);
  const refundedOrders = paidOrders.filter((order) => order.status === "REFUNDED").length;

  return {
    metrics: [
      { label: "orders", value: paidOrders.length },
      { label: "grossSales", value: grossSales },
      { label: "refundTotal", value: refundTotal },
    ],
    refundRate: paidOrders.length === 0 ? 0 : refundedOrders / paidOrders.length,
  };
}
