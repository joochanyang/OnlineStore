import { describe, expect, it } from "vitest";
import {
  hashPassword,
  passwordNeedsRehash,
  validatePasswordPolicy,
  verifyPassword,
} from "../src/password";

describe("password policy", () => {
  it("accepts a reasonable password", () => {
    expect(validatePasswordPolicy("CorrectHorse9").ok).toBe(true);
  });

  it("rejects passwords shorter than 10 chars", () => {
    const result = validatePasswordPolicy("short1");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.violations).toContain("too_short");
    }
  });

  it("rejects letters-only or numbers-only", () => {
    expect(validatePasswordPolicy("abcdefghij").ok).toBe(false);
    expect(validatePasswordPolicy("1234567890").ok).toBe(false);
  });

  it("rejects common passwords", () => {
    const result = validatePasswordPolicy("Password123");
    // Even though it has letters+numbers and is long enough, it's blacklisted via lower-case match.
    // (validatePasswordPolicy uses toLowerCase comparison.)
    expect(result.ok).toBe(false);
  });
});

describe("password hash + verify", () => {
  it("hashes and verifies a password", async () => {
    const hash = await hashPassword("StrongPass123");
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword("StrongPass123", hash)).toBe(true);
    expect(await verifyPassword("StrongPas123", hash)).toBe(false);
  });

  it("returns false for an empty hash", async () => {
    expect(await verifyPassword("anything", "")).toBe(false);
  });

  it("flags weak hashes for rehash", () => {
    expect(passwordNeedsRehash("$2b$10$plainBcrypt")).toBe(true);
    expect(passwordNeedsRehash("$argon2id$v=19$m=4096,t=1,p=1$abc$def")).toBe(true);
  });
});
