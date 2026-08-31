import { describe, expect, it } from "vitest";
import {
  compactAdminAccountFilters,
  normalizeAdminSearch,
  operationsTab,
  pipelineSection,
} from "./-admin-route-state";

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

  it("preserves catalogue work type, downstream filters, and selected preview across refresh", () => {
    expect(
      normalizeAdminSearch({
        section: "collectibles",
        workType: "DEMO_QA",
        custody: "READY_FOR_CUSTODY",
        ownership: "NOT_CONFIGURED",
        cataloguePreview: "asset-123",
      }),
    ).toMatchObject({
      section: "collectibles",
      workType: "DEMO_QA",
      custody: "READY_FOR_CUSTODY",
      ownership: "NOT_CONFIGURED",
      cataloguePreview: "asset-123",
    });
  });

  it("preserves the Asset Operations selected rail and server-side attention filter", () => {
    expect(
      normalizeAdminSearch({
        section: "assetOperations",
        operationsSelected: "asset-123",
        operationsAttention: "REQUIRES_ATTENTION",
        operationsStage: "VALUATION",
      }),
    ).toMatchObject({
      section: "assetOperations",
      operationsSelected: "asset-123",
      operationsAttention: "REQUIRES_ATTENTION",
      operationsStage: "VALUATION",
    });
  });

  it("preserves the paginated Accounts directory view in URL state", () => {
    expect(
      normalizeAdminSearch({
        section: "users",
        accountQ: "demo",
        accountType: "COLLECTOR",
        accountAttention: "REQUIRED",
        accountPayoutState: "NOT_CONFIGURED",
        accountFixture: "DEMO",
        accountSort: "lastActive",
        accountPage: "2",
      }),
    ).toMatchObject({
      section: "users",
      accountQ: "demo",
      accountType: "COLLECTOR",
      accountAttention: "REQUIRED",
      accountPayoutState: "NOT_CONFIGURED",
      accountFixture: "DEMO",
      accountSort: "lastActive",
      accountPage: "2",
    });
  });

  it("preserves the selected Account Detail tab for direct links and refresh", () => {
    expect(
      normalizeAdminSearch({
        section: "users",
        user: "user-demo-1",
        tab: "History",
        accountQ: "demo",
        accountPage: "2",
      }),
    ).toMatchObject({
      section: "users",
      user: "user-demo-1",
      tab: "History",
      accountQ: "demo",
      accountPage: "2",
    });
  });

  it("preserves a Physical Intake detail route and its active tab across refresh", () => {
    expect(
      normalizeAdminSearch({
        section: "intake",
        intake: "submission-123",
        intakeTab: "verification",
        q: "Pikachu",
        status: "VERIFICATION",
      }),
    ).toMatchObject({
      section: "intake",
      intake: "submission-123",
      intakeTab: "verification",
      q: "Pikachu",
      status: "VERIFICATION",
    });
  });

  it("preserves an Intake Location detail route and its active tab across refresh", () => {
    expect(
      normalizeAdminSearch({
        section: "intakeLocations",
        location: "beta-test-uk-intake",
        locationTab: "history",
      }),
    ).toMatchObject({
      section: "intakeLocations",
      location: "beta-test-uk-intake",
      locationTab: "history",
    });
  });

  it("omits empty optional Accounts filters before the strict API request", () => {
    expect(
      compactAdminAccountFilters({
        fixture: "",
        attention: "",
        status: "RESTRICTED",
      }),
    ).toEqual({ status: "RESTRICTED" });
  });
});
