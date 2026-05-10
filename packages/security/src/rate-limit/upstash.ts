import type { RateLimiter, RateLimitDecision, RateLimitWindow } from "./index";

export type UpstashRateLimiterConfig = {
  restUrl: string;
  restToken: string;
  /** Optional namespace prefix (e.g. "rl:prod") to separate envs. */
  prefix?: string;
};

/**
 * Upstash Redis REST-backed fixed-window limiter. Uses INCR + EXPIRE atomically via
 * Upstash's pipeline endpoint. Counts roll over on `windowMs` boundaries.
 *
 * No external SDK dependency — uses fetch only.
 */
export function createUpstashRateLimiter(config: UpstashRateLimiterConfig): RateLimiter {
  const baseUrl = config.restUrl.replace(/\/+$/, "");
  const prefix = config.prefix ?? "rl";

  return {
    async consume(key: string, window: RateLimitWindow): Promise<RateLimitDecision> {
      const namespacedKey = `${prefix}:${key}`;
      const ttlSeconds = Math.max(1, Math.ceil(window.windowMs / 1000));

      const response = await fetch(`${baseUrl}/pipeline`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${config.restToken}`,
          "content-type": "application/json",
        },
        body: JSON.stringify([
          ["INCR", namespacedKey],
          ["EXPIRE", namespacedKey, String(ttlSeconds), "NX"],
          ["PTTL", namespacedKey],
        ]),
      });

      if (!response.ok) {
        throw new Error(`Upstash rate limiter request failed: ${response.status}`);
      }

      const payload = (await response.json()) as Array<{ result?: number; error?: string }>;
      const incrResult = payload[0]?.result;
      const pttlResult = payload[2]?.result;

      if (typeof incrResult !== "number") {
        throw new Error("Upstash INCR did not return a count");
      }

      const now = Date.now();
      const ttlMs = typeof pttlResult === "number" && pttlResult > 0 ? pttlResult : window.windowMs;
      const resetAt = new Date(now + ttlMs);
      const allowed = incrResult <= window.max;
      const remaining = Math.max(0, window.max - incrResult);

      return {
        allowed,
        remaining,
        limit: window.max,
        resetAt,
        retryAfterMs: allowed ? 0 : ttlMs,
      };
    },
  };
}
