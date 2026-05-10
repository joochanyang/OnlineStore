import { createHmac, timingSafeEqual } from "node:crypto";

import type { SignatureVerification, VerifySignatureInput } from "../types";

const DEFAULT_WINDOW_MS = 5 * 60 * 1000;

const seenNonces = new Map<string, number>();
const NONCE_RETENTION_MS = DEFAULT_WINDOW_MS * 2;

function pruneNonces(now: number): void {
  for (const [nonce, expiresAt] of seenNonces) {
    if (expiresAt <= now) seenNonces.delete(nonce);
  }
}

function safeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
  } catch {
    return false;
  }
}

export interface VerifyOptions {
  secret: string;
  windowMs?: number;
  now?: () => number;
}

export function verifyTossWebhookSignature(
  input: VerifySignatureInput,
  opts: VerifyOptions,
): SignatureVerification {
  const { secret } = opts;
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const now = opts.now ? opts.now() : Date.now();

  if (!input.signature) return { ok: false, reason: "missing_signature" };
  if (!input.timestamp) return { ok: false, reason: "missing_timestamp" };

  const ts = Number(input.timestamp);
  if (!Number.isFinite(ts)) return { ok: false, reason: "missing_timestamp" };
  if (Math.abs(now - ts) > windowMs) return { ok: false, reason: "expired" };

  const message = `${input.timestamp}.${input.rawBody}`;
  const expected = createHmac("sha256", secret).update(message).digest("hex");
  if (!safeEqualHex(expected, input.signature)) {
    return { ok: false, reason: "bad_signature" };
  }

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(input.rawBody);
  } catch {
    return { ok: false, reason: "bad_payload" };
  }

  const eventId =
    typeof payload.eventId === "string"
      ? payload.eventId
      : typeof (payload as { id?: unknown }).id === "string"
        ? ((payload as { id: string }).id)
        : null;
  if (!eventId) return { ok: false, reason: "bad_payload" };

  const nonceKey = input.nonce ?? `${input.timestamp}:${eventId}`;
  pruneNonces(now);
  if (seenNonces.has(nonceKey)) {
    return { ok: false, reason: "replay" };
  }
  seenNonces.set(nonceKey, now + NONCE_RETENTION_MS);

  return { ok: true, eventId, payload };
}

export function __resetSeenNoncesForTests(): void {
  seenNonces.clear();
}
