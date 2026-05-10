export type RateLimitDecision = {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
  /** Time in ms until the window resets. Useful for `Retry-After` headers. */
  retryAfterMs: number;
};

export type RateLimitWindow = {
  /** Sliding window length. */
  windowMs: number;
  /** Max requests permitted within the window. */
  max: number;
};

export type RateLimiter = {
  /**
   * Increment the counter for `key` and decide whether the request is allowed.
   * Implementations must be safe to call concurrently.
   */
  consume(key: string, window: RateLimitWindow): Promise<RateLimitDecision>;
};

export { createMemoryRateLimiter } from "./memory";
export { createUpstashRateLimiter, type UpstashRateLimiterConfig } from "./upstash";

/**
 * Picks a rate limiter implementation based on env. In production with Upstash REST
 * credentials present, returns the Upstash-backed limiter. Otherwise falls back to the
 * in-memory limiter (suitable for dev/test/single-process deployments only).
 */
export type ResolveRateLimiterEnv = {
  UPSTASH_REDIS_REST_URL?: string;
  UPSTASH_REDIS_REST_TOKEN?: string;
};

export async function resolveRateLimiter(env: ResolveRateLimiterEnv): Promise<RateLimiter> {
  if (env.UPSTASH_REDIS_REST_URL && env.UPSTASH_REDIS_REST_TOKEN) {
    const { createUpstashRateLimiter } = await import("./upstash");

    return createUpstashRateLimiter({
      restUrl: env.UPSTASH_REDIS_REST_URL,
      restToken: env.UPSTASH_REDIS_REST_TOKEN,
    });
  }

  const { createMemoryRateLimiter } = await import("./memory");

  return createMemoryRateLimiter();
}
