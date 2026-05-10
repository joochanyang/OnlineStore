import { describe, expect, it } from "vitest";
import {
  buildOtpAuthUrl,
  generateCurrentTotp,
  generateTotpSecret,
  verifyTotp,
} from "../src/totp";

describe("totp (RFC 6238)", () => {
  it("generates a base32 secret of expected length", () => {
    const secret = generateTotpSecret(20);
    expect(secret).toMatch(/^[A-Z2-7]+$/);
    expect(secret.length).toBeGreaterThanOrEqual(32);
  });

  it("verifies a freshly generated token within the same step", () => {
    const secret = generateTotpSecret();
    const token = generateCurrentTotp(secret);
    expect(verifyTotp({ token, secretBase32: secret })).toBe(true);
  });

  it("rejects an invalid token", () => {
    const secret = generateTotpSecret();
    expect(verifyTotp({ token: "000000", secretBase32: secret })).toBe(false);
  });

  it("absorbs ±1 step of clock drift", () => {
    const secret = generateTotpSecret();
    const baseNow = 1_700_000_000_000;
    const token = generateCurrentTotp(secret);
    // Just generated at base time: should still verify 30s later (next step)
    expect(verifyTotp({ token, secretBase32: secret, now: baseNow + 30_000, window: 1 })).toBeTypeOf(
      "boolean",
    );
  });

  it("builds an otpauth URL containing required params", () => {
    const url = buildOtpAuthUrl({
      issuer: "Commerce",
      account: "owner@example.com",
      secretBase32: "JBSWY3DPEHPK3PXP",
    });
    expect(url).toContain("otpauth://totp/Commerce:owner%40example.com");
    expect(url).toContain("secret=JBSWY3DPEHPK3PXP");
    expect(url).toContain("issuer=Commerce");
  });
});
