import { describe, expect, it } from "vitest";
import {
  isPreSaleConfigureButtonEnabled,
  isPreSaleConfigureFormValid,
} from "./AdminAssetOperationsDetail";
import {
  isEconomicActivity,
  operationWorkspaceTabLabel,
  operationWorkspaceTabs,
} from "./AdminAssetOperationsDetail.presentation";

describe("Admin Asset Operations economic workspace", () => {
  it("uses the economic workflow tabs and omits physical mutation tabs", () => {
    expect(operationWorkspaceTabs).toEqual([
      "overview",
      "valuation",
      "ownership",
      "initial-offering",
      "launch",
      "market",
      "controls",
      "history",
    ]);
    expect(operationWorkspaceTabs).not.toContain("custody");
    expect(operationWorkspaceTabs).not.toContain("verification");
  });

  it("keeps the operations labels product-facing", () => {
    expect(operationWorkspaceTabLabel("initial-offering")).toBe("Initial Offering");
    expect(operationWorkspaceTabLabel("controls")).toBe("Controls & Restrictions");
  });

  it("accepts the populated Pre-Sale setup form as valid", () => {
    const input = {
        estimate: "18500",
        percent: "75",
        units: "1000",
        price: "18.50",
        reason: "Confirming provisional Pre-Sale terms from Collector submission.",
      };
    expect(isPreSaleConfigureFormValid(input)).toBe(true);
    expect(isPreSaleConfigureButtonEnabled({ ...input, canConfigure: true, pending: false })).toBe(true);
    expect(isPreSaleConfigureButtonEnabled({ ...input, canConfigure: false, pending: false })).toBe(false);
    expect(isPreSaleConfigureButtonEnabled({ ...input, canConfigure: true, pending: true })).toBe(false);
  });

  it("filters non-economic telemetry out of the operational history", () => {
    expect(isEconomicActivity({ action: "VALUATION_DECISION_RECORDED" })).toBe(true);
    expect(isEconomicActivity({ action: "INITIAL_OFFERING_OPENED" })).toBe(true);
    expect(isEconomicActivity({ action: "AUTH_SESSION_ROTATED" })).toBe(false);
    expect(isEconomicActivity({ action: "READINESS_REFRESHED" })).toBe(false);
  });
});
