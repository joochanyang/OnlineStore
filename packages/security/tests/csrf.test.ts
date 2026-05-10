import { describe, expect, it } from "vitest";
import { issueCsrfToken, verifyCsrfToken } from "../src/csrf";

const SECRET = "0123456789abcdef0123456789abcdef0123456789abcdef";

describe("csrf double-submit token", () => {
  it("issues a token whose cookie and header values match", () => {
    const issued = issueCsrfToken({ secret: SECRET });
    expect(issued.cookieValue).toBe(issued.headerValue);
    expect(issued.token).toContain(".");
  });

  it("verifies a freshly issued token", () => {
    const issued = issueCsrfToken({ secret: SECRET, sessionId: "session-1" });
    const result = verifyCsrfToken({
      secret: SECRET,
      sessionId: "session-1",
      cookieValue: issued.cookieValue,
      headerValue: issued.headerValue,
    });
    expect(result.ok).toBe(true);
  });

  it("rejects when cookie and header differ", () => {
    const issued = issueCsrfToken({ secret: SECRET });
    const tampered = issueCsrfToken({ secret: SECRET });
    const result = verifyCsrfToken({
      secret: SECRET,
      cookieValue: issued.cookieValue,
      headerValue: tampered.headerValue,
    });
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("mismatch");
  });

  it("rejects when bound session id changes", () => {
    const issued = issueCsrfToken({ secret: SECRET, sessionId: "session-a" });
    const result = verifyCsrfToken({
      secret: SECRET,
      sessionId: "session-b",
      cookieValue: issued.cookieValue,
      headerValue: issued.headerValue,
    });
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("invalid_signature");
  });

  it("rejects when both values are missing", () => {
    const result = verifyCsrfToken({
      secret: SECRET,
      cookieValue: undefined,
      headerValue: undefined,
    });
    expect(result.ok).toBe(false);
    expect(result.ok || result.reason).toBe("missing");
  });

  it("requires a secret >= 32 chars", () => {
    expect(() => issueCsrfToken({ secret: "short" })).toThrow();
  });
});
