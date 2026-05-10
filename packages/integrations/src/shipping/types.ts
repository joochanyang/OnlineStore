export type ShippingCarrier = "cj" | "hanjin" | "epost" | "lotte" | "logen";

export type ShippingMode = "mock" | "live";

export type ShippingStatusValue =
  | "INFORMATION_RECEIVED"
  | "AT_PICKUP"
  | "IN_TRANSIT"
  | "OUT_FOR_DELIVERY"
  | "DELIVERED"
  | "EXCEPTION"
  | "RETURNED";

export type ShippingTrackingEvent = {
  occurredAt: Date;
  status: ShippingStatusValue;
  location?: string;
  description?: string;
};

export type ShippingTrackingResult = {
  carrier: ShippingCarrier;
  trackingNumber: string;
  status: ShippingStatusValue;
  events: ShippingTrackingEvent[];
  lastUpdatedAt: Date;
  deliveredAt?: Date;
};

export interface ShippingProvider {
  readonly carrier: ShippingCarrier;
  readonly mode: ShippingMode;
  track(trackingNumber: string): Promise<ShippingTrackingResult>;
}

export type ShippingErrorCode =
  | "NOT_IMPLEMENTED"
  | "PROVIDER_HTTP"
  | "TRACKING_NOT_FOUND"
  | "INVALID_TRACKING_NUMBER";

export class ShippingError extends Error {
  constructor(
    public readonly code: ShippingErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ShippingError";
  }
}

export const SHIPPING_CARRIERS: readonly ShippingCarrier[] = [
  "cj",
  "hanjin",
  "epost",
  "lotte",
  "logen",
] as const;

export function normalizeTrackingNumber(input: string): string {
  const trimmed = input.trim().replace(/[\s-]/g, "");
  if (!trimmed) {
    throw new ShippingError("INVALID_TRACKING_NUMBER", "tracking number is empty");
  }
  if (!/^[A-Za-z0-9]+$/.test(trimmed)) {
    throw new ShippingError(
      "INVALID_TRACKING_NUMBER",
      `tracking number contains illegal characters: ${input}`,
    );
  }
  return trimmed.toUpperCase();
}

export function normalizeCarrier(input: string): ShippingCarrier {
  const lc = input.trim().toLowerCase();
  // Common aliases admin UI / external systems may pass.
  const aliases: Record<string, ShippingCarrier> = {
    cj: "cj",
    "cj대한통운": "cj",
    cjlogistics: "cj",
    hanjin: "hanjin",
    한진: "hanjin",
    epost: "epost",
    우체국: "epost",
    koreapost: "epost",
    lotte: "lotte",
    롯데: "lotte",
    롯데택배: "lotte",
    logen: "logen",
    로젠: "logen",
    로젠택배: "logen",
  };
  const found = aliases[lc];
  if (!found) {
    throw new ShippingError("NOT_IMPLEMENTED", `unknown carrier: ${input}`);
  }
  return found;
}
