import { describe, expect, it } from "vitest";

import { safeReturnIntent } from "@/auth/return-intent";
import { signupSchema } from "@/validation/schemas";
import { deriveOnboardingStage } from "@/auth/onboarding-state";

describe("signup and onboarding rules", () => {
  it("mirrors the actual twelve-character password contract without invented requirements", () => {
    expect(
      signupSchema.safeParse({
        displayName: "Collector",
        email: "collector@example.test",
        password: "twelvechars!",
        confirmPassword: "twelvechars!",
      }).success,
    ).toBe(true);
    expect(
      signupSchema.safeParse({
        displayName: "Collector",
        email: "collector@example.test",
        password: "too-short",
        confirmPassword: "too-short",
      }).success,
    ).toBe(false);
  });

  it("derives resumable onboarding from server-verification states only", () => {
    expect(deriveOnboardingStage(false, false, false)).toBe("email");
    expect(deriveOnboardingStage(true, false, false)).toBe("phone");
    expect(deriveOnboardingStage(true, true, false)).toBe("security");
    expect(deriveOnboardingStage(true, true, true)).toBe("finish");
  });

  it("allows only safe internal return paths", () => {
    expect(safeReturnIntent("/wallet")).toBe("/wallet");
    expect(safeReturnIntent("https://attacker.test")).toBe("/dashboard");
    expect(safeReturnIntent("//attacker.test")).toBe("/dashboard");
  });
});
