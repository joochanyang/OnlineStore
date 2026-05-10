import { describe, expect, it } from "vitest";

import {
  MockShippingProvider,
  ShippingError,
  SHIPPING_CARRIERS,
  normalizeCarrier,
  normalizeTrackingNumber,
  type ShippingCarrier,
  type ShippingStatusValue,
} from "../src/shipping";

const STATUS_BY_LAST_DIGIT: Record<string, ShippingStatusValue> = {
  "0": "INFORMATION_RECEIVED",
  "1": "INFORMATION_RECEIVED",
  "2": "AT_PICKUP",
  "3": "IN_TRANSIT",
  "4": "IN_TRANSIT",
  "5": "OUT_FOR_DELIVERY",
  "6": "OUT_FOR_DELIVERY",
  "7": "DELIVERED",
  "8": "DELIVERED",
  "9": "DELIVERED",
};

describe("MockShippingProvider", () => {
  it("returns deterministic status by last digit for every carrier", async () => {
    for (const carrier of SHIPPING_CARRIERS) {
      const provider = new MockShippingProvider(carrier);
      for (const [digit, expected] of Object.entries(STATUS_BY_LAST_DIGIT)) {
        const result = await provider.track(`SAMPLE${digit}`);
        expect(result.carrier).toBe(carrier);
        expect(result.status).toBe(expected);
      }
    }
  });

  it("yields identical results across two calls (determinism)", async () => {
    const a = await new MockShippingProvider("cj").track("ABC1234567");
    const b = await new MockShippingProvider("cj").track("ABC1234567");
    expect(a).toEqual(b);
  });

  it("normalizes tracking numbers (strips spaces/dashes, uppercases)", async () => {
    const tracking = await new MockShippingProvider("hanjin").track(" 12-34 56 7 ");
    expect(tracking.trackingNumber).toBe("1234567");
  });

  it("populates deliveredAt only when status is DELIVERED", async () => {
    const delivered = await new MockShippingProvider("epost").track("PASS9");
    expect(delivered.status).toBe("DELIVERED");
    expect(delivered.deliveredAt).toBeInstanceOf(Date);

    const inTransit = await new MockShippingProvider("epost").track("PASS3");
    expect(inTransit.status).toBe("IN_TRANSIT");
    expect(inTransit.deliveredAt).toBeUndefined();
  });

  it("rejects empty / illegal tracking numbers", async () => {
    const provider = new MockShippingProvider("logen");
    await expect(provider.track("   ")).rejects.toBeInstanceOf(ShippingError);
    await expect(provider.track("ABC*123")).rejects.toMatchObject({ code: "INVALID_TRACKING_NUMBER" });
  });

  it("event sequence matches the final status progression", async () => {
    const result = await new MockShippingProvider("lotte").track("SEQ7");
    const sequence: ShippingStatusValue[] = [
      "INFORMATION_RECEIVED",
      "AT_PICKUP",
      "IN_TRANSIT",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ];
    expect(result.events.map((e) => e.status)).toEqual(sequence);
  });
});

describe("carrier normalization", () => {
  it("accepts known aliases and rejects unknown carriers", () => {
    const cases: Array<[string, ShippingCarrier]> = [
      ["CJ", "cj"],
      ["cj대한통운", "cj"],
      ["한진", "hanjin"],
      ["우체국", "epost"],
      ["롯데택배", "lotte"],
      ["로젠", "logen"],
    ];
    for (const [input, expected] of cases) {
      expect(normalizeCarrier(input)).toBe(expected);
    }
    expect(() => normalizeCarrier("dhl")).toThrow(ShippingError);
  });

  it("normalizeTrackingNumber rejects whitespace-only input", () => {
    expect(() => normalizeTrackingNumber("")).toThrow(ShippingError);
  });
});
