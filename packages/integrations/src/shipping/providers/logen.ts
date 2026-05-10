import {
  ShippingError,
  type ShippingMode,
  type ShippingProvider,
  type ShippingTrackingResult,
} from "../types";
import { MockShippingProvider } from "./mock";

export class LogenShippingProvider implements ShippingProvider {
  readonly carrier = "logen" as const;

  constructor(public readonly mode: ShippingMode) {}

  async track(trackingNumber: string): Promise<ShippingTrackingResult> {
    if (this.mode === "mock") {
      return new MockShippingProvider("logen").track(trackingNumber);
    }
    throw new ShippingError(
      "NOT_IMPLEMENTED",
      "Logen live tracking is not implemented yet (Phase 3 Slice 2).",
    );
  }
}
