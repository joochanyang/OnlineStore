import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";

import { TossPaymentsProvider } from "@commerce/payments";
import {
  finalizePaidOrder,
  markWebhookProcessed,
  recordWebhookEvent,
} from "@commerce/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RejectionReason =
  | "missing_signature"
  | "missing_timestamp"
  | "expired"
  | "bad_signature"
  | "replay"
  | "bad_payload";

function provider(): TossPaymentsProvider {
  const mode = (process.env.PAYMENT_MODE ?? "mock") as
    | "mock"
    | "sandbox"
    | "live";
  return new TossPaymentsProvider({
    mode,
    secretKey: process.env.TOSS_SECRET_KEY,
    webhookSecret: process.env.TOSS_WEBHOOK_SECRET,
  });
}

function reasonStatus(reason: RejectionReason): number {
  switch (reason) {
    case "missing_signature":
    case "missing_timestamp":
      return 400;
    case "expired":
    case "replay":
      return 409;
    case "bad_signature":
    case "bad_payload":
    default:
      return 401;
  }
}

function isPaidEvent(payload: Record<string, unknown>): { ok: true; paymentKey: string } | null {
  const status =
    typeof payload.status === "string" ? payload.status : undefined;
  const eventType =
    typeof payload.eventType === "string" ? payload.eventType : undefined;
  const paymentKey =
    typeof payload.paymentKey === "string"
      ? payload.paymentKey
      : typeof payload.externalId === "string"
        ? payload.externalId
        : undefined;
  if (!paymentKey) return null;
  const paid =
    status === "DONE" ||
    eventType === "PAYMENT.DONE" ||
    eventType === "PAYMENT_STATUS_CHANGED" && status === "DONE";
  return paid ? { ok: true, paymentKey } : null;
}

export async function POST(request: Request) {
  const requestId = request.headers.get("x-request-id") ?? randomUUID();

  const rawBody = await request.text();
  const verification = provider().verifyWebhookSignature({
    rawBody,
    signature: request.headers.get("x-tosspayments-signature") ?? undefined,
    timestamp: request.headers.get("x-tosspayments-timestamp") ?? undefined,
    nonce: request.headers.get("x-tosspayments-nonce") ?? undefined,
  });

  if (!verification.ok) {
    return NextResponse.json(
      {
        requestId,
        error: { code: "WEBHOOK_REJECTED", message: verification.reason },
      },
      { status: reasonStatus(verification.reason) },
    );
  }

  const { eventId, payload } = verification;

  let recorded: Awaited<ReturnType<typeof recordWebhookEvent>>;
  try {
    recorded = await recordWebhookEvent({
      provider: "toss",
      externalId: eventId,
      payload,
      signatureVerifiedAt: new Date(),
    });
  } catch (err) {
    return NextResponse.json(
      {
        requestId,
        error: {
          code: "WEBHOOK_PERSISTENCE_FAILED",
          message: err instanceof Error ? err.message : "unknown",
        },
      },
      { status: 500 },
    );
  }

  if (!recorded.inserted) {
    return NextResponse.json(
      { requestId, data: { status: "duplicate", eventId } },
      { status: 200 },
    );
  }

  // First-time delivery — perform side-effects.
  let processingError: string | undefined;
  let finalizedOrderId: string | undefined;
  let alreadyPaid = false;

  const paid = isPaidEvent(payload);
  if (paid) {
    try {
      const result = await finalizePaidOrder({ paymentExternalId: paid.paymentKey });
      if (result) {
        finalizedOrderId = result.orderId;
        alreadyPaid = result.alreadyPaid;
      }
    } catch (err) {
      processingError = err instanceof Error ? err.message : "finalize_failed";
    }
  }

  if (recorded.event) {
    if (processingError) {
      await markWebhookProcessed(recorded.event.id, processingError).catch(() => undefined);
    } else {
      await markWebhookProcessed(recorded.event.id).catch(() => undefined);
    }
  }

  return NextResponse.json(
    {
      requestId,
      data: {
        status: processingError ? "error" : "accepted",
        eventId,
        orderId: finalizedOrderId,
        alreadyPaid: paid ? alreadyPaid : undefined,
        error: processingError,
      },
    },
    { status: processingError ? 500 : 200 },
  );
}
