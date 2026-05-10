import { CjShippingProvider } from "./providers/cj";
import { EpostShippingProvider } from "./providers/epost";
import { HanjinShippingProvider } from "./providers/hanjin";
import { LogenShippingProvider } from "./providers/logen";
import { LotteShippingProvider } from "./providers/lotte";
import { MockShippingProvider } from "./providers/mock";
import { type ShippingCarrier, type ShippingMode, type ShippingProvider } from "./types";

export type CreateShippingProviderInput = {
  carrier: ShippingCarrier;
  mode: ShippingMode;
};

export function createShippingProvider(input: CreateShippingProviderInput): ShippingProvider {
  switch (input.carrier) {
    case "cj":
      return new CjShippingProvider(input.mode);
    case "hanjin":
      return new HanjinShippingProvider(input.mode);
    case "epost":
      return new EpostShippingProvider(input.mode);
    case "lotte":
      return new LotteShippingProvider(input.mode);
    case "logen":
      return new LogenShippingProvider(input.mode);
    default: {
      const exhaustive: never = input.carrier;
      throw new Error(`unsupported carrier: ${String(exhaustive)}`);
    }
  }
}

export { MockShippingProvider };
