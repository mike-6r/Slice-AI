import { describe, expect, it } from "vitest";
import { ownershipPercentageSchema, signupSchema, walletDepositSchema } from "./schemas";

describe("frontend validation", () => {
  it("rejects an ownership listing above 90%", () =>
    expect(ownershipPercentageSchema.safeParse({ percentage: 91 }).success).toBe(false));
  it("accepts a compliant ownership listing percentage", () =>
    expect(ownershipPercentageSchema.safeParse({ percentage: 25 }).success).toBe(true));
  it("requires matching signup passwords", () =>
    expect(
      signupSchema.safeParse({
        displayName: "Viewer",
        email: "viewer@example.com",
        password: "a-secure-password",
        confirmPassword: "different-password",
      }).success,
    ).toBe(false));
  it("accepts the real minimal signup contract without deferred verification fields", () =>
    expect(
      signupSchema.safeParse({
        displayName: "Viewer",
        email: "viewer@example.com",
        password: "a-secure-password",
        confirmPassword: "a-secure-password",
      }).success,
    ).toBe(true));
  it("requires decimal strings for demo USDC deposits", () =>
    expect(
      walletDepositSchema.safeParse({ asset: "USDC", network: "base", amount: "1250.500000" })
        .success,
    ).toBe(true));
});
