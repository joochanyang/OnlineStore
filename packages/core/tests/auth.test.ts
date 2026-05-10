import { describe, expect, it } from "vitest";
import {
  assertPermission,
  buildAdminWorkspaceAccess,
  createConsentRecord,
  hasActiveConsent,
  hasPermission,
  listPermissions,
} from "../src/auth";

describe("admin permissions", () => {
  it("combines permissions across roles", () => {
    const session = {
      actorId: "admin-1",
      email: "ops@example.com",
      roles: ["MERCHANDISER", "FULFILLMENT"] as const,
    };

    expect(hasPermission(session, "product:write")).toBe(true);
    expect(hasPermission(session, "order:write")).toBe(true);
    expect(listPermissions(session)).not.toContain("customer:read");
  });

  it("throws when a mutation is outside the role boundary", () => {
    expect(() =>
      assertPermission(
        { actorId: "admin-2", email: "support@example.com", roles: ["SUPPORT"] },
        "product:write",
      ),
    ).toThrow("Missing permission");
  });

  it("maps role permissions to commerce admin workspaces", () => {
    const supportAccess = buildAdminWorkspaceAccess({
      actorId: "admin-3",
      email: "support@example.com",
      roles: ["SUPPORT"],
    });

    expect(supportAccess.find((item) => item.workspace === "cs")?.allowed).toBe(true);
    expect(supportAccess.find((item) => item.workspace === "catalog")?.allowed).toBe(false);
    expect(supportAccess.find((item) => item.workspace === "orders")?.allowed).toBe(false);

    const ownerAccess = buildAdminWorkspaceAccess({
      actorId: "admin-4",
      email: "owner@example.com",
      roles: ["OWNER"],
    });

    expect(ownerAccess.every((item) => item.allowed)).toBe(true);
  });

  it("uses the latest consent record", () => {
    const granted = createConsentRecord({
      customerId: "customer-1",
      type: "MARKETING_SMS",
      granted: true,
      source: "signup",
      recordedAt: new Date("2026-01-01"),
    });
    const revoked = createConsentRecord({
      customerId: "customer-1",
      type: "MARKETING_SMS",
      granted: false,
      source: "account",
      recordedAt: new Date("2026-01-02"),
    });

    expect(hasActiveConsent([granted, revoked], "MARKETING_SMS")).toBe(false);
  });
});
