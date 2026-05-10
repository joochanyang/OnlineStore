import { describe, expect, it } from "vitest";
import { buildContentSecurityPolicy, buildSecurityHeaders } from "../src/headers";

describe("buildSecurityHeaders", () => {
  it("includes core hardening headers", () => {
    const headers = buildSecurityHeaders({ isProduction: true });
    expect(headers["X-Frame-Options"]).toBe("DENY");
    expect(headers["X-Content-Type-Options"]).toBe("nosniff");
    expect(headers["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
    expect(headers["Strict-Transport-Security"]).toContain("max-age=63072000");
    expect(headers["Content-Security-Policy"]).toContain("default-src 'self'");
  });

  it("omits HSTS in non-production", () => {
    const headers = buildSecurityHeaders({ isProduction: false });
    expect(headers["Strict-Transport-Security"]).toBeUndefined();
  });

  it("merges extra connect/img sources into the CSP", () => {
    const csp = buildContentSecurityPolicy({
      isProduction: true,
      connectExtra: ["https://example.com"],
      imgExtra: ["https://cdn.example.com"],
    });
    expect(csp).toContain("https://example.com");
    expect(csp).toContain("https://cdn.example.com");
  });
});
