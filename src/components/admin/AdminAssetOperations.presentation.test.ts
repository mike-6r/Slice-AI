import { describe, expect, it } from "vitest";
import {
  assetOperationsBlockerSummary,
  assetOperationsEmptyCopy,
  assetOperationsMarketPresentation,
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
  exceptions: 1,
  physicalPrerequisite: 4,
};

describe("Asset Operations presentation", () => {
  it("uses economic operations tabs and excludes physical workflow stages", () => {
    expect(assetOperationsTabs[0]).toEqual(["all", "All Active"]);
    expect(assetOperationsTabs.map(([key]) => key)).toEqual([
      "all",
      "needs-action",
      "valuation",
      "ownership",
      "offering",
      "ready-for-launch",
      "market-live",
      "exceptions",
    ]);
    expect(assetOperationsTabs.map(([key]) => key)).not.toContain("custody");
    expect(assetOperationsTabs.map(([key]) => key)).not.toContain("verification");
  });

  it("maps backend summary counts without deriving attention in the browser", () => {
    expect(assetOperationsTabCount("needs-action", counts)).toBe(7);
    expect(assetOperationsTabCount("market-live", counts)).toBe(3);
  });

  it("distinguishes no queue data from a server-filtered no-match result", () => {
    expect(assetOperationsEmptyCopy(false).title).toBe(
      "No canonical assets are active in Asset Operations",
    );
    expect(assetOperationsEmptyCopy(true).title).toBe("No assets match this queue view");
  });

  it("separates blocked asset count from repeated blocking conditions", () => {
    expect(assetOperationsBlockerSummary(8, [{ count: 16 }, { count: 8 }, { count: 8 }])).toEqual({
      assets: 8,
      conditions: 32,
    });
  });

  it("presents a historical publication conflict without duplicating restriction badges", () => {
    expect(assetOperationsMarketPresentation("RESTRICTED")).toEqual({
      state: "Historical published",
      detail: "Currently blocked",
      tone: "muted",
    });
    expect(assetOperationsMarketPresentation("MARKET_LIVE")?.tone).toBe("mint");
  });
});
