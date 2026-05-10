import {
  ShippingError,
  type ShippingMode,
  type ShippingProvider,
  type ShippingTrackingResult,
} from "../types";
import { MockShippingProvider } from "./mock";

export class CjShippingProvider implements ShippingProvider {
  readonly carrier = "cj" as const;

  constructor(public readonly mode: ShippingMode) {}

  async track(trackingNumber: string): Promise<ShippingTrackingResult> {
    if (this.mode === "mock") {
      return new MockShippingProvider("cj").track(trackingNumber);
    }
    throw new ShippingError(
      "NOT_IMPLEMENTED",
      "CJ Logistics live tracking is not implemented yet (Phase 3 Slice 2).",
    );
  }
}
