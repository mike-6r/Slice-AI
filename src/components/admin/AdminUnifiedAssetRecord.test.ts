import { describe, expect, it } from "vitest";

import { assetRecordSections } from "./AdminUnifiedAssetRecord";

describe("authoritative asset record", () => {
  it("keeps every lifecycle concern inside one asset record", () => {
    expect(assetRecordSections).toEqual([
      { id: "summary", label: "Summary" },
      { id: "submission", label: "Submission" },
      { id: "identity", label: "Identity" },
      { id: "evidence", label: "Evidence" },
      { id: "checks", label: "Checks" },
      { id: "intake", label: "Intake & custody" },
      { id: "verification", label: "Verification" },
      { id: "valuation", label: "Valuation" },
      { id: "ownership", label: "Ownership" },
      { id: "offering", label: "Offering" },
      { id: "blockers", label: "Blockers" },
      { id: "money", label: "Money" },
      { id: "history", label: "History" },
      { id: "actions", label: "Actions" },
    ]);
  });

  it("does not model specialist workspaces as asset-record destinations", () => {
    expect(assetRecordSections.map((section) => section.label)).not.toEqual(
      expect.arrayContaining([
        "Review queue",
        "Canonical collectible",
        "Physical intake workspace",
        "Asset operations",
      ]),
    );
  });
});
