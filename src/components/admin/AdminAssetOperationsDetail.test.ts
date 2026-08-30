import { describe, expect, it } from "vitest";
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

  it("filters non-economic telemetry out of the operational history", () => {
    expect(isEconomicActivity({ action: "VALUATION_DECISION_RECORDED" })).toBe(true);
    expect(isEconomicActivity({ action: "INITIAL_OFFERING_OPENED" })).toBe(true);
    expect(isEconomicActivity({ action: "AUTH_SESSION_ROTATED" })).toBe(false);
    expect(isEconomicActivity({ action: "READINESS_REFRESHED" })).toBe(false);
  });
});
