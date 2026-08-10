import { describe, expect, it } from "vitest";

import { LISTING_STEPS, submissionName, SUBMISSION_EMPTY } from "./-list-presentation";

describe("submission listing presentation", () => {
  it("uses the actual D10 stages and safe draft title projection", () => {
    expect(LISTING_STEPS.map(([title]) => title)).toEqual([
      "Asset details",
      "Details & terms",
      "Media & documents",
      "Review & submit",
    ]);
    expect(submissionName({ name: "Safe submission" })).toBe("Safe submission");
    expect(submissionName(null)).toBe("Untitled submission");
  });

  it("keeps empty catalogue and draft states explicit", () => {
    expect(SUBMISSION_EMPTY.categories).toContain("No categories");
    expect(SUBMISSION_EMPTY.drafts).toContain("no saved submissions");
  });
});
