import type { RateLimiter, RateLimitDecision, RateLimitWindow } from "./index";

type Bucket = {
  count: number;
  resetAt: number;
};

/**
 * In-memory fixed-window rate limiter. Single-process only — do NOT use behind multiple
 * Node instances or serverless cold starts. Intended for dev/test and local CI.
 */
export function createMemoryRateLimiter(): RateLimiter {
  const buckets = new Map<string, Bucket>();

  return {
    async consume(key: string, window: RateLimitWindow): Promise<RateLimitDecision> {
      const now = Date.now();
      const existing = buckets.get(key);

      if (!existing || existing.resetAt <= now) {
        const fresh: Bucket = {
          count: 1,
          resetAt: now + window.windowMs,
        };
        buckets.set(key, fresh);

        return decide(fresh, window, now);
      }

      existing.count += 1;
      return decide(existing, window, now);
    },
  };
}

function decide(bucket: Bucket, window: RateLimitWindow, now: number): RateLimitDecision {
  const remaining = Math.max(0, window.max - bucket.count);
  const allowed = bucket.count <= window.max;
  const retryAfterMs = allowed ? 0 : Math.max(0, bucket.resetAt - now);

  return {
    allowed,
    remaining,
    limit: window.max,
    resetAt: new Date(bucket.resetAt),
    retryAfterMs,
  };
}
