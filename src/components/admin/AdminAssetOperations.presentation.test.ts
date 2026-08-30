import { describe, expect, it } from "vitest";
import {
  assetOperationsEmptyCopy,
  assetOperationsTabCount,
  assetOperationsTabs,
} from "./AdminAssetOperations.presentation";

const counts = {
  all: 12,
  needsAction: 7,
  valuationPending: 2,
  ownershipPending: 2,
  offeringSetup: 1,
  launchReadiness: 1,
  readyForLaunch: 1,
  marketLive: 3,
  restrictions: 1,
  physicalPrerequisite: 4,
};

describe("Asset Operations presentation", () => {
  it("uses economic operations tabs and excludes physical workflow stages", () => {
    expect(assetOperationsTabs.map(([key]) => key)).toEqual([
      "all",
      "needs-action",
      "valuation",
      "ownership",
      "offering",
      "launch-readiness",
      "ready-for-launch",
      "market-live",
      "restrictions",
    ]);
    expect(assetOperationsTabs.map(([key]) => key)).not.toContain("custody");
    expect(assetOperationsTabs.map(([key]) => key)).not.toContain("verification");
  });

  it("maps backend summary counts without deriving attention in the browser", () => {
    expect(assetOperationsTabCount("needs-action", counts)).toBe(7);
    expect(assetOperationsTabCount("market-live", counts)).toBe(3);
  });

  it("distinguishes no queue data from a server-filtered no-match result", () => {
    expect(assetOperationsEmptyCopy(false).title).toBe("No assets are ready for Asset Operations");
    expect(assetOperationsEmptyCopy(true).title).toBe("No assets match this queue view");
  });
});
