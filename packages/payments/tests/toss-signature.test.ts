import { createHmac } from "node:crypto";

import { beforeEach, describe, expect, it } from "vitest";

import { TossPaymentsProvider } from "../src";
import { __resetSeenNoncesForTests } from "../src/toss/signature";

const SECRET = "test-webhook-secret-not-real-0000000000000000";
const NOW = 1_700_000_000_000;

function makeProvider(now = NOW): TossPaymentsProvider {
  return new TossPaymentsProvider({
    mode: "sandbox",
    secretKey: "test-secret-key",
    webhookSecret: SECRET,
    now: () => now,
  });
}

function sign(timestamp: string, body: string): string {
  return createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
}

describe("Toss webhook signature verification", () => {
  beforeEach(() => {
    __resetSeenNoncesForTests();
  });

  it("accepts a fresh, well-signed event", () => {
    const provider = makeProvider();
    const body = JSON.stringify({ eventId: "evt_1", status: "DONE" });
    const ts = String(NOW);
    const result = provider.verifyWebhookSignature({
      rawBody: body,
      signature: sign(ts, body),
      timestamp: ts,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.eventId).toBe("evt_1");
    }
  });

  it("rejects a missing signature", () => {
    const provider = makeProvider();
    const body = JSON.stringify({ eventId: "evt_2" });
    const result = provider.verifyWebhookSignature({
      rawBody: body,
      signature: undefined,
      timestamp: String(NOW),
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_signature");
  });

  it("rejects a bad signature", () => {
    const provider = makeProvider();
    const body = JSON.stringify({ eventId: "evt_3" });
    const ts = String(NOW);
    const result = provider.verifyWebhookSignature({
      rawBody: body,
      signature: "0".repeat(64),
      timestamp: ts,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_signature");
  });

  it("rejects an event outside the time window", () => {
    const provider = makeProvider();
    const body = JSON.stringify({ eventId: "evt_4" });
    const oldTs = String(NOW - 10 * 60 * 1000);
    const result = provider.verifyWebhookSignature({
      rawBody: body,
      signature: sign(oldTs, body),
      timestamp: oldTs,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("expired");
  });

  it("rejects a replayed nonce", () => {
    const provider = makeProvider();
    const body = JSON.stringify({ eventId: "evt_5" });
    const ts = String(NOW);
    const sig = sign(ts, body);
    const first = provider.verifyWebhookSignature({
      rawBody: body,
      signature: sig,
      timestamp: ts,
    });
    expect(first.ok).toBe(true);
    const second = provider.verifyWebhookSignature({
      rawBody: body,
      signature: sig,
      timestamp: ts,
    });
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("replay");
  });

  it("rejects payload missing eventId", () => {
    const provider = makeProvider();
    const body = JSON.stringify({ status: "DONE" });
    const ts = String(NOW);
    const result = provider.verifyWebhookSignature({
      rawBody: body,
      signature: sign(ts, body),
      timestamp: ts,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("bad_payload");
  });

  it("rejects when webhook secret is not configured", () => {
    const provider = new TossPaymentsProvider({ mode: "sandbox", now: () => NOW });
    const body = JSON.stringify({ eventId: "evt_6" });
    const ts = String(NOW);
    const result = provider.verifyWebhookSignature({
      rawBody: body,
      signature: sign(ts, body),
      timestamp: ts,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("missing_signature");
  });
});
