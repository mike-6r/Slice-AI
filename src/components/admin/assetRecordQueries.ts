import type { AdminAssetRecordResolution } from "@/data/repositories";

/** A missing future stage is normal; failures of an available stage remain errors. */
export function shouldLoadAssetIntake(
  resolution: AdminAssetRecordResolution | undefined,
  reviewStatus?: string,
) {
  if (!resolution?.submissionId) return false;
  // The fallback supports a cached resolver response during a rolling deployment.
  return resolution.intakeAvailable ?? reviewStatus === "APPROVED";
}
