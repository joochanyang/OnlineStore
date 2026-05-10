import {
  ShippingError,
  type ShippingMode,
  type ShippingProvider,
  type ShippingTrackingResult,
} from "../types";
import { MockShippingProvider } from "./mock";

export class EpostShippingProvider implements ShippingProvider {
  readonly carrier = "epost" as const;

  constructor(public readonly mode: ShippingMode) {}

  async track(trackingNumber: string): Promise<ShippingTrackingResult> {
    if (this.mode === "mock") {
      return new MockShippingProvider("epost").track(trackingNumber);
    }
    throw new ShippingError(
      "NOT_IMPLEMENTED",
      "Korea Post (epost) live tracking is not implemented yet (Phase 3 Slice 2).",
    );
  }
}
