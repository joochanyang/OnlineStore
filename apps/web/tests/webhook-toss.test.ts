import { createHmac } from "node:crypto";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "test-webhook-secret-not-real-0000000000000000";
const recordWebhookEvent = vi.hoisted(() => vi.fn());
const markWebhookProcessed = vi.hoisted(() => vi.fn());
const finalizePaidOrder = vi.hoisted(() => vi.fn());

vi.mock("@commerce/db", () => ({
  recordWebhookEvent,
  markWebhookProcessed,
  finalizePaidOrder,
}));

import { POST } from "../app/api/v1/webhooks/payments/toss/route";
import { __resetSeenNoncesForTests } from "@commerce/payments/toss/signature";

function sign(timestamp: string, body: string): string {
  return createHmac("sha256", SECRET).update(`${timestamp}.${body}`).digest("hex");
}

function makeRequest(eventId: string, opts: { ts?: string; signature?: string } = {}): Request {
  const body = JSON.stringify({ eventId, status: "DONE" });
  const ts = opts.ts ?? String(Date.now());
  const sig = opts.signature ?? sign(ts, body);
  return new Request("https://shop.example.com/api/v1/webhooks/payments/toss", {
    method: "POST",
    headers: {
      "x-tosspayments-signature": sig,
      "x-tosspayments-timestamp": ts,
      "content-type": "application/json",
    },
    body,
  });
}

describe("POST /api/v1/webhooks/payments/toss", () => {
  beforeEach(() => {
    process.env.PAYMENT_MODE = "sandbox";
    process.env.TOSS_WEBHOOK_SECRET = SECRET;
    __resetSeenNoncesForTests();
    recordWebhookEvent.mockReset();
    markWebhookProcessed.mockReset();
    finalizePaidOrder.mockReset();
  });

  afterEach(() => {
    delete process.env.PAYMENT_MODE;
    delete process.env.TOSS_WEBHOOK_SECRET;
  });

  it("rejects a bad signature with 401", async () => {
    const res = await POST(
      makeRequest("evt_bad", { signature: "0".repeat(64) }),
    );
    expect(res.status).toBe(401);
    expect(recordWebhookEvent).not.toHaveBeenCalled();
  });

  it("rejects an expired timestamp with 409", async () => {
    const oldTs = String(Date.now() - 10 * 60 * 1000);
    const res = await POST(makeRequest("evt_old", { ts: oldTs }));
    expect(res.status).toBe(409);
    expect(recordWebhookEvent).not.toHaveBeenCalled();
  });

  it("inserts on first delivery and returns accepted", async () => {
    recordWebhookEvent.mockResolvedValueOnce({
      inserted: true,
      event: { id: "row_1" },
    });
    markWebhookProcessed.mockResolvedValueOnce(undefined);

    const res = await POST(makeRequest("evt_first"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("accepted");
    expect(recordWebhookEvent).toHaveBeenCalledTimes(1);
    expect(markWebhookProcessed).toHaveBeenCalledWith("row_1");
  });

  it("returns duplicate without re-processing on replay", async () => {
    recordWebhookEvent.mockResolvedValueOnce({
      inserted: false,
      event: { id: "row_1" },
    });

    // Same eventId but different timestamp + nonce so signature pass twice in this run.
    const res = await POST(makeRequest("evt_dup"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("duplicate");
    expect(markWebhookProcessed).not.toHaveBeenCalled();
  });

  it("finalizes the paid order on a status=DONE event with paymentKey", async () => {
    recordWebhookEvent.mockResolvedValueOnce({
      inserted: true,
      event: { id: "row_paid" },
    });
    finalizePaidOrder.mockResolvedValueOnce({ orderId: "o1", alreadyPaid: false });
    markWebhookProcessed.mockResolvedValueOnce(undefined);

    const body = JSON.stringify({
      eventId: "evt_paid",
      status: "DONE",
      paymentKey: "ext_payment_1",
    });
    const ts = String(Date.now());
    const res = await POST(
      new Request("https://shop.example.com/api/v1/webhooks/payments/toss", {
        method: "POST",
        headers: {
          "x-tosspayments-signature": sign(ts, body),
          "x-tosspayments-timestamp": ts,
          "content-type": "application/json",
        },
        body,
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.data.status).toBe("accepted");
    expect(json.data.orderId).toBe("o1");
    expect(json.data.alreadyPaid).toBe(false);
    expect(finalizePaidOrder).toHaveBeenCalledWith({ paymentExternalId: "ext_payment_1" });
  });

  it("returns 500 when finalize throws but still records webhook", async () => {
    recordWebhookEvent.mockResolvedValueOnce({
      inserted: true,
      event: { id: "row_err" },
    });
    finalizePaidOrder.mockRejectedValueOnce(new Error("stock missing"));
    markWebhookProcessed.mockResolvedValueOnce(undefined);

    const body = JSON.stringify({
      eventId: "evt_err",
      status: "DONE",
      paymentKey: "ext_payment_err",
    });
    const ts = String(Date.now());
    const res = await POST(
      new Request("https://shop.example.com/api/v1/webhooks/payments/toss", {
        method: "POST",
        headers: {
          "x-tosspayments-signature": sign(ts, body),
          "x-tosspayments-timestamp": ts,
          "content-type": "application/json",
        },
        body,
      }),
    );
    expect(res.status).toBe(500);
    expect(markWebhookProcessed).toHaveBeenCalledWith("row_err", "stock missing");
  });

  it("rejects when body lacks eventId with 401", async () => {
    const body = JSON.stringify({ status: "DONE" });
    const ts = String(Date.now());
    const req = new Request(
      "https://shop.example.com/api/v1/webhooks/payments/toss",
      {
        method: "POST",
        headers: {
          "x-tosspayments-signature": sign(ts, body),
          "x-tosspayments-timestamp": ts,
          "content-type": "application/json",
        },
        body,
      },
    );
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(recordWebhookEvent).not.toHaveBeenCalled();
  });
});
