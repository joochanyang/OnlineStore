import {
  type ShippingCarrier,
  type ShippingMode,
  type ShippingProvider,
  type ShippingStatusValue,
  type ShippingTrackingEvent,
  type ShippingTrackingResult,
  normalizeTrackingNumber,
} from "../types";

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

// Lower-case alphabetics also map (so determinism survives non-numeric tracking numbers).
const LETTER_FALLBACK: ShippingStatusValue[] = [
  "INFORMATION_RECEIVED",
  "AT_PICKUP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

function statusFor(trackingNumber: string): ShippingStatusValue {
  const last = trackingNumber.slice(-1);
  if (STATUS_BY_LAST_DIGIT[last]) return STATUS_BY_LAST_DIGIT[last]!;
  const code = last.charCodeAt(0);
  return LETTER_FALLBACK[code % LETTER_FALLBACK.length]!;
}

const STATUS_PROGRESSION: ShippingStatusValue[] = [
  "INFORMATION_RECEIVED",
  "AT_PICKUP",
  "IN_TRANSIT",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

function buildEvents(
  carrier: ShippingCarrier,
  trackingNumber: string,
  finalStatus: ShippingStatusValue,
  baseTime: Date,
): ShippingTrackingEvent[] {
  const cutoff = STATUS_PROGRESSION.indexOf(finalStatus);
  if (cutoff === -1) {
    return [{ occurredAt: baseTime, status: finalStatus, description: `${carrier} mock event` }];
  }
  return STATUS_PROGRESSION.slice(0, cutoff + 1).map((status, idx) => ({
    occurredAt: new Date(baseTime.getTime() + idx * 60_000),
    status,
    location: `${carrier.toUpperCase()} HUB ${(trackingNumber.charCodeAt(0) % 5) + 1}`,
    description: `[mock] ${status.toLowerCase().replace(/_/g, " ")}`,
  }));
}

export class MockShippingProvider implements ShippingProvider {
  readonly mode: ShippingMode = "mock";

  constructor(public readonly carrier: ShippingCarrier) {}

  async track(trackingNumber: string): Promise<ShippingTrackingResult> {
    const normalized = normalizeTrackingNumber(trackingNumber);
    const status = statusFor(normalized);
    // Deterministic timestamp: derive a base time from the tracking number so the same
    // (carrier, trackingNumber) pair always yields the same events.
    let seed = 0;
    for (const ch of normalized) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
    const base = new Date(Date.UTC(2026, 0, 1, 0, 0, 0) + (seed % (30 * 24 * 60 * 60 * 1000)));
    const events = buildEvents(this.carrier, normalized, status, base);
    const lastEvent = events[events.length - 1]!;
    return {
      carrier: this.carrier,
      trackingNumber: normalized,
      status,
      events,
      lastUpdatedAt: lastEvent.occurredAt,
      deliveredAt: status === "DELIVERED" ? lastEvent.occurredAt : undefined,
    };
  }
}
