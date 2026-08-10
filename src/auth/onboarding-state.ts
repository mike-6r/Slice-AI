export type OnboardingStage = "email" | "phone" | "security" | "finish";

/** Backend verification states are authoritative for onboarding progress. */
export function deriveOnboardingStage(
  emailVerified: boolean,
  phoneVerified: boolean,
  twoFactorEnabled: boolean,
): OnboardingStage {
  if (!emailVerified) return "email";
  if (!phoneVerified) return "phone";
  if (!twoFactorEnabled) return "security";
  return "finish";
}
