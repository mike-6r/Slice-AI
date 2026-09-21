import { describe, expect, it } from "vitest";
import {
  compactAdminAccountFilters,
  isAdminNavItemActive,
  normalizeAdminSearch,
  operationsTab,
  pipelineSection,
  resolveCustomerComplianceAction,
} from "./-admin-route-state";
import type { AdminCustomerActionTarget } from "@/data/repositories";

describe("admin route state", () => {
  it("migrates legacy deep links into the five permanent destinations", () => {
    expect(normalizeAdminSearch({ section: "compliance", q: "case-1" })).toMatchObject({
      section: "customers",
      view: "verification-compliance",
      tab: "compliance",
      q: "case-1",
    });
    expect(normalizeAdminSearch({ section: "audit" })).toMatchObject({
      section: "platform",
      view: "audit-settings",
      tab: "audit",
    });
  });

  it("routes lifecycle stages through the unified Assets destination", () => {
    expect(pipelineSection("received")).toBe("assets");
    expect(pipelineSection("verified")).toBe("assets");
    expect(operationsTab("valued")).toBe("valuation");
    expect(operationsTab("unknown")).toBe("verification");
  });

  it("selects exactly one permanent Admin navigation destination", () => {
    const items = ["home", "customers", "assets", "money", "platform"] as const;
    expect(items.filter((item) => isAdminNavItemActive("assets", item))).toEqual(["assets"]);
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
      section: "assets",
      view: "catalogue",
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
      section: "assets",
      view: "catalogue",
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
      section: "assets",
      view: "valuation-launch",
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
      section: "customers",
      view: "directory",
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
      section: "customers",
      view: "directory",
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
      section: "assets",
      view: "intake-custody",
      intake: "submission-123",
      intakeTab: "verification",
      q: "Pikachu",
      status: "VERIFICATION",
    });
  });

  it("preserves the shared authoritative asset record from every Assets view", () => {
    expect(
      normalizeAdminSearch({
        section: "assets",
        view: "intake-custody",
        assetRecord: "submission-123",
        assetRecordKind: "submission",
        assetFocus: "intake",
      }),
    ).toMatchObject({
      section: "assets",
      view: "intake-custody",
      assetRecord: "submission-123",
      assetRecordKind: "submission",
      assetFocus: "intake",
    });
  });

  it("migrates receiving-location configuration into Platform settings", () => {
    expect(
      normalizeAdminSearch({
        section: "intakeLocations",
        location: "beta-test-uk-intake",
        locationTab: "history",
      }),
    ).toMatchObject({
      section: "platform",
      view: "audit-settings",
      location: "beta-test-uk-intake",
      locationTab: "history",
    });
  });

  it("preserves global-search record selection and Home work filters in the URL", () => {
    expect(
      normalizeAdminSearch({
        section: "money",
        view: "wallets-movements",
        tab: "movements",
        record: "movement-123",
        recordType: "money",
        queueSeverity: "HIGH",
        queueOverdue: "overdue",
      }),
    ).toMatchObject({
      section: "money",
      view: "wallets-movements",
      tab: "movements",
      record: "movement-123",
      recordType: "money",
      queueSeverity: "HIGH",
      queueOverdue: "overdue",
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

  const target = (input: Partial<AdminCustomerActionTarget>): AdminCustomerActionTarget => ({
    authority: "CUSTOMER_COMPLIANCE",
    kind: "CUSTOMER_CONTROL",
    userId: "user-1",
    recordId: "user-1",
    actionable: true,
    unavailableReason: null,
    nextActor: "ADMIN",
    nextAction: "Review the customer compliance record.",
    ...input,
  });

  it("opens the authoritative customer compliance control", () => {
    expect(resolveCustomerComplianceAction("user-1", target({}))).toMatchObject({
      disabledReason: null,
      search: {
        section: "customers",
        view: "verification-compliance",
        user: "user-1",
        record: "user-1",
        recordType: "customer-compliance",
      },
    });
  });

  it("opens the exact active KYC case", () => {
    expect(
      resolveCustomerComplianceAction(
        "user-1",
        target({ kind: "COMPLIANCE_CASE", recordId: "case-kyc-1" }),
      ),
    ).toMatchObject({
      disabledReason: null,
      search: {
        section: "customers",
        view: "verification-compliance",
        user: "user-1",
        record: "case-kyc-1",
        recordType: "compliance-case",
      },
    });
  });

  it("opens the exact phone-verification account blocker", () => {
    expect(
      resolveCustomerComplianceAction(
        "user-1",
        target({
          kind: "PHONE_VERIFICATION",
          recordId: "phone-verification",
          nextActor: "CUSTOMER",
        }),
      ),
    ).toMatchObject({
      disabledReason: null,
      search: {
        section: "customers",
        view: "verification-compliance",
        user: "user-1",
        record: "phone-verification",
        recordType: "phone-verification",
      },
    });
  });

  it("does not produce a dead button when a compliance case is missing", () => {
    expect(
      resolveCustomerComplianceAction(
        "user-1",
        target({
          kind: "COMPLIANCE_CASE",
          recordId: null,
          unavailableReason: "No active compliance case is available for review.",
        }),
      ),
    ).toEqual({
      search: null,
      disabledReason: "No active compliance case is available for review.",
      nextAction: "Review the customer compliance record.",
    });
  });

  it("explains unavailable and invalid action targets", () => {
    expect(
      resolveCustomerComplianceAction(
        "user-1",
        target({
          actionable: false,
          unavailableReason: "Provider evidence is still pending.",
          nextAction: "Wait for the provider result.",
        }),
      ),
    ).toEqual({
      search: null,
      disabledReason: "Provider evidence is still pending.",
      nextAction: "Wait for the provider result.",
    });
    expect(
      resolveCustomerComplianceAction("user-1", target({ userId: "user-2" })).disabledReason,
    ).toBe("The compliance target does not belong to the selected customer.");
  });

  it("preserves the selected customer, internal view, and compliance record across refresh", () => {
    expect(
      normalizeAdminSearch({
        section: "customers",
        view: "verification-compliance",
        user: "user-1",
        record: "case-kyc-1",
        recordType: "compliance-case",
      }),
    ).toMatchObject({
      section: "customers",
      view: "verification-compliance",
      user: "user-1",
      record: "case-kyc-1",
      recordType: "compliance-case",
    });
  });

  it("keeps every compliance action inside the one Customers authority", () => {
    const resolutions = [
      target({}),
      target({ kind: "COMPLIANCE_CASE", recordId: "case-1" }),
      target({ kind: "PHONE_VERIFICATION", recordId: "phone-verification" }),
    ].map((item) => resolveCustomerComplianceAction("user-1", item));
    expect(resolutions.map((item) => [item.search?.section, item.search?.view])).toEqual([
      ["customers", "verification-compliance"],
      ["customers", "verification-compliance"],
      ["customers", "verification-compliance"],
    ]);
  });
});
