import { describe, expect, it } from "vitest";
import { assertProductionEnv, parseAppEnv, parseAppEnvSafe } from "../src/env";

const HEX = "0".repeat(64);

const baseEnv = {
  NODE_ENV: "development",
  AUTH_JWT_SECRET: HEX,
  AUTH_CSRF_SECRET: HEX,
};

describe("parseAppEnv", () => {
  it("accepts a minimal dev env", () => {
    const env = parseAppEnv(baseEnv);
    expect(env.AUTH_ISSUER).toBe("commerce-platform");
    expect(env.PAYMENT_MODE).toBe("mock");
    expect(env.AI_DAILY_USD_CAP).toBe(3);
  });

  it("rejects short JWT secret", () => {
    const result = parseAppEnvSafe({ ...baseEnv, AUTH_JWT_SECRET: "short" });
    expect(result.ok).toBe(false);
  });

  it("coerces numeric AI caps from strings", () => {
    const env = parseAppEnv({
      ...baseEnv,
      AI_DAILY_USD_CAP: "5",
      AI_MONTHLY_USD_CAP: "100",
    });
    expect(env.AI_DAILY_USD_CAP).toBe(5);
    expect(env.AI_MONTHLY_USD_CAP).toBe(100);
  });

  it("assertProductionEnv lists missing critical keys", () => {
    const env = parseAppEnv({ ...baseEnv, NODE_ENV: "production" });
    expect(() => assertProductionEnv(env)).toThrow(/DATABASE_URL/);
  });

  it("assertProductionEnv is a no-op in dev", () => {
    const env = parseAppEnv(baseEnv);
    expect(() => assertProductionEnv(env)).not.toThrow();
  });
});
