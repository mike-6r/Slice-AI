import { describe, expect, it } from "vitest";
import type { AdminAssetRecordResolution } from "@/data/repositories";
import { shouldLoadAssetIntake } from "./assetRecordQueries";

describe("asset intake query lifecycle", () => {
  const record = {
    submissionId: "pending-submission",
    intakeAvailable: false,
  } as AdminAssetRecordResolution;
  it("does not call the intake-only endpoint for pre-approval submissions", () => {
    expect(shouldLoadAssetIntake(undefined)).toBe(false);
    expect(shouldLoadAssetIntake(record, "SUBMITTED")).toBe(false);
  });
  it("starts reading intake when the refreshed authority makes it available", () => {
    expect(shouldLoadAssetIntake({ ...record, intakeAvailable: true }, "APPROVED")).toBe(true);
    expect(shouldLoadAssetIntake({ ...record, intakeAvailable: true }, "CHANGES_REQUESTED")).toBe(
      true,
    );
  });
  it("honors an explicit denial even for approved but retired records", () => {
    expect(shouldLoadAssetIntake(record, "APPROVED")).toBe(false);
  });
  it("supports cached older resolver responses during rollout", () => {
    const cached = { submissionId: "older-response" } as AdminAssetRecordResolution;
    expect(shouldLoadAssetIntake(cached, "SUBMITTED")).toBe(false);
    expect(shouldLoadAssetIntake(cached, "APPROVED")).toBe(true);
  });
});
