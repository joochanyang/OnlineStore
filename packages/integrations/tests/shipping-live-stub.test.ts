import { describe, expect, it } from "vitest";

import {
  ShippingError,
  createShippingProvider,
  SHIPPING_CARRIERS,
} from "../src/shipping";

describe("Shipping live providers", () => {
  it("throw NOT_IMPLEMENTED for every carrier in live mode", async () => {
    for (const carrier of SHIPPING_CARRIERS) {
      const provider = createShippingProvider({ carrier, mode: "live" });
      expect(provider.carrier).toBe(carrier);
      expect(provider.mode).toBe("live");
      await expect(provider.track("1234567")).rejects.toMatchObject({
        code: "NOT_IMPLEMENTED",
      });
      await expect(provider.track("1234567")).rejects.toBeInstanceOf(ShippingError);
    }
  });

  it("delegate to the mock provider when mode is mock", async () => {
    for (const carrier of SHIPPING_CARRIERS) {
      const provider = createShippingProvider({ carrier, mode: "mock" });
      const result = await provider.track("DELIVER9");
      expect(result.carrier).toBe(carrier);
      expect(result.status).toBe("DELIVERED");
    }
  });
});
