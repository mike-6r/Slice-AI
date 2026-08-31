import { describe, expect, it } from "vitest";
import {
  assetOperationsBlockerSummary,
  assetOperationsEmptyCopy,
  assetOperationsHealthSegments,
  assetOperationsMarketPresentation,
  assetOperationsTabCount,
  assetOperationsTabs,
  resolveAssetOperationsSelection,
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

  it("omits zero-value operational health legend entries and preserves percentages", () => {
    expect(
      assetOperationsHealthSegments({ onTrack: 0, atRisk: 0, blocked: 0, exceptions: 8 }),
    ).toEqual([{ key: "exception", label: "Exceptions", value: 8, percent: 100 }]);
    expect(
      assetOperationsHealthSegments({ onTrack: 6, atRisk: 2, blocked: 0, exceptions: 2 }),
    ).toEqual([
      { key: "on-track", label: "On track", value: 6, percent: 60 },
      { key: "at-risk", label: "At risk", value: 2, percent: 20 },
      { key: "exception", label: "Exceptions", value: 2, percent: 20 },
    ]);
  });

  it("keeps the first-load preview while treating a removed URL selection as closed", () => {
    expect(resolveAssetOperationsSelection(null, undefined)).toBeNull();
    expect(resolveAssetOperationsSelection("asset-123", undefined)).toBe("closed");
    expect(resolveAssetOperationsSelection("closed", "asset-456")).toBe("asset-456");
  });
});
