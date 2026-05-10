import { describe, expect, it } from "vitest";
import { createMemoryRateLimiter } from "../src/rate-limit/memory";

describe("memory rate limiter", () => {
  it("permits up to max requests within the window", async () => {
    const limiter = createMemoryRateLimiter();
    const window = { windowMs: 1_000, max: 3 };

    const first = await limiter.consume("user-1", window);
    const second = await limiter.consume("user-1", window);
    const third = await limiter.consume("user-1", window);

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(true);
    expect(third.allowed).toBe(true);
    expect(third.remaining).toBe(0);
  });

  it("rejects requests beyond the max within the window", async () => {
    const limiter = createMemoryRateLimiter();
    const window = { windowMs: 1_000, max: 2 };

    await limiter.consume("user-2", window);
    await limiter.consume("user-2", window);
    const blocked = await limiter.consume("user-2", window);

    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("isolates buckets per key", async () => {
    const limiter = createMemoryRateLimiter();
    const window = { windowMs: 1_000, max: 1 };

    const userA = await limiter.consume("user-a", window);
    const userB = await limiter.consume("user-b", window);

    expect(userA.allowed).toBe(true);
    expect(userB.allowed).toBe(true);
  });
});
