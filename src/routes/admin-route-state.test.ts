import { describe, expect, it } from "vitest";
import { normalizeAdminSearch, operationsTab, pipelineSection } from "./-admin-route-state";

describe("admin route state", () => {
  it("preserves legacy section aliases and their workspace tabs", () => {
    expect(normalizeAdminSearch({ section: "compliance", q: "case-1" })).toEqual({
      section: "support",
      tab: "compliance",
      q: "case-1",
    });
    expect(normalizeAdminSearch({ section: "audit" })).toEqual({
      section: "health",
      tab: "audit",
    });
  });

  it("keeps the admin pipeline targets and operation tabs stable", () => {
    expect(pipelineSection("received")).toBe("intake");
    expect(pipelineSection("verified")).toBe("assetOperations");
    expect(operationsTab("valued")).toBe("valuation");
    expect(operationsTab("unknown")).toBe("verification");
  });

  it("preserves catalogue filters in URL state", () => {
    expect(
      normalizeAdminSearch({
        section: "collectibles",
        catalogueCategory: "Pokémon",
        physicalState: "CUSTODY_READY",
        verification: "VERIFIED",
        valuation: "VALUED",
        market: "LIVE",
        grading: "GRADED",
        collector: "demo-collector",
      }),
    ).toMatchObject({
      section: "collectibles",
      catalogueCategory: "Pokémon",
      physicalState: "CUSTODY_READY",
      verification: "VERIFIED",
      valuation: "VALUED",
      market: "LIVE",
      grading: "GRADED",
      collector: "demo-collector",
    });
  });
});
