// @vitest-environment happy-dom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";

import type {
  AdminComplianceCase,
  AdminComplianceDetail,
  AdminCustomerActionTarget,
  AdminOverview,
  AdminUserDetail,
} from "@/data/repositories";
import { resolveCustomerComplianceAction, type AdminSearch } from "./-admin-route-state";
import { AdminCustomerActionCenter, ComplianceWorkspace } from "./admin";

const userId = "customer-47";
const caseId = "kyc-case-92";
const now = "2026-09-21T12:00:00.000Z";

const target = (
  kind: AdminCustomerActionTarget["kind"],
  recordId: string,
  nextActor: AdminCustomerActionTarget["nextActor"],
): AdminCustomerActionTarget => ({
  authority: "CUSTOMER_COMPLIANCE",
  kind,
  userId,
  recordId,
  actionable: true,
  unavailableReason: null,
  nextActor,
  nextAction:
    kind === "PHONE_VERIFICATION"
      ? "The customer must complete provider-backed phone verification."
      : "Review normalized provider evidence.",
});

const kycTarget = target("COMPLIANCE_CASE", caseId, "ADMIN");
const phoneTarget = target("PHONE_VERIFICATION", "phone-verification", "CUSTOMER");
const controlTarget = target("CUSTOMER_CONTROL", userId, "ADMIN");

const complianceCase: AdminComplianceCase = {
  id: caseId,
  provider: "Stripe Identity",
  type: "IDENTITY_KYC",
  status: "MANUAL_REVIEW",
  createdAt: now,
  updatedAt: now,
  user: { id: userId, displayName: "Casey Collector", username: "casey" },
};

const complianceDetail: AdminComplianceDetail = {
  ...complianceCase,
  providerStatus: "requires_input",
  identity: {
    state: "MANUAL_REVIEW",
    provider: "Stripe Identity",
    verifiedAt: null,
    safeFailureCode: "DOCUMENT_REVIEW",
  },
  riskReview: { status: "CLEAR", activeHoldCount: 0 },
  connectPayoutReadiness: [],
  decisions: [],
  restrictions: [],
  audit: [],
};

const customer = {
  id: userId,
  displayName: "Casey Collector",
  complianceState: "MANUAL_REVIEW",
  complianceSummary: {
    kycStatus: "MANUAL_REVIEW",
    kytStatus: "CLEAR",
    provider: "Stripe Identity",
    lastReviewAt: now,
    caseCount: 1,
    activeCase: {
      id: caseId,
      type: "IDENTITY_KYC",
      status: "MANUAL_REVIEW",
      provider: "Stripe Identity",
    },
  },
  identity: {
    phone: "+44 •••• 0199",
    country: "GB",
    discord: { connected: false, username: null, displayName: null, linkedAt: null },
    twoFactorEnabled: false,
    emailVerified: true,
    phoneVerified: false,
    activeSessionCount: 1,
  },
  capabilitySummary: [
    {
      capability: "WITHDRAW_FUNDS",
      allowed: false,
      status: "BLOCKED",
      reason: "PHONE_VERIFICATION_REQUIRED",
      nextAction: "The customer must complete provider-backed phone verification.",
    },
  ],
} as AdminUserDetail;

const overview: AdminOverview = {
  users: { active: 1 },
  reviews: { pending: 0, changesRequested: 0 },
  assets: { valuationPending: 0, custodyActions: 0, vaultReady: 0 },
  complianceCases: 1,
  paymentExceptions: 0,
  providerAlerts: 0,
  generatedAt: now,
};

function urlFor(search: AdminSearch) {
  const params = new URLSearchParams();
  Object.entries(search).forEach(([key, value]) => {
    if (value !== undefined) params.set(key, value);
  });
  return `/admin?${params.toString()}`;
}

function ComplianceClickFlow() {
  const [search, setSearch] = useState<AdminSearch>({
    section: "customers",
    view: "directory",
    user: userId,
  });
  const [legacyTab, setLegacyTab] = useState<string | null>(null);
  const openComplianceAction = (
    selectedUserId: string,
    selectedTarget: AdminCustomerActionTarget,
  ) => {
    const next = resolveCustomerComplianceAction(selectedUserId, selectedTarget).search;
    if (!next) return;
    window.history.replaceState({}, "", urlFor(next));
    setSearch(next);
  };

  if (search.view === "verification-compliance") {
    return (
      <ComplianceWorkspace
        cases={[complianceCase]}
        loading={false}
        failed={false}
        retry={() => undefined}
        overview={overview}
        filter="All"
        setFilter={() => undefined}
        detail={search.recordType === "compliance-case" ? complianceDetail : undefined}
        detailLoading={false}
        detailFailed={false}
        customer={customer}
        customerLoading={false}
        customerFailed={false}
        selectedRecord={search.record}
        selectedRecordType={search.recordType}
        openDetail={(record, selectedUserId) =>
          setSearch((current) => ({
            ...current,
            user: selectedUserId ?? current.user,
            record,
            recordType: "compliance-case",
          }))
        }
        closeDetail={() => undefined}
      />
    );
  }

  return (
    <>
      <AdminCustomerActionCenter
        userId={userId}
        recommendedAction={{
          id: "compliance-review",
          title: "Review compliance state",
          explanation: "KYC",
          tab: "Operations",
          target: controlTarget,
        }}
        actions={[
          {
            id: "compliance-review",
            severity: "ATTENTION",
            title: "Compliance review is open",
            explanation: "Identity KYC",
            recommendedAction: "Review compliance state",
            tab: "Operations",
            target: kycTarget,
          },
          {
            id: "capability-phone_verification_required",
            severity: "ATTENTION",
            title: "Phone verification required blocks account capability",
            explanation: "Withdraw funds is unavailable.",
            recommendedAction: "Review account access",
            tab: "Operations",
            target: phoneTarget,
          },
        ]}
        openComplianceAction={openComplianceAction}
        openLegacyAction={setLegacyTab}
        reviewAccess={() => setLegacyTab("General")}
      />
      <output data-testid="legacy-tab">{legacyTab ?? "none"}</output>
    </>
  );
}

afterEach(() => {
  cleanup();
  window.history.replaceState({}, "", "/");
});

describe("Admin customer compliance click flow", () => {
  it("opens the visible authoritative customer compliance control", async () => {
    render(<ComplianceClickFlow />);

    await userEvent.click(screen.getByRole("button", { name: "Open control" }));

    expect(screen.getByRole("heading", { name: "Verification & Compliance" })).toBeTruthy();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Customer compliance control")).toBeTruthy();
    expect(window.location.search).toContain("view=verification-compliance");
    expect(window.location.search).toContain("recordType=customer-compliance");
    expect(screen.queryByText("General")).toBeNull();
  });

  it("opens the exact active KYC case in the visible compliance drawer", async () => {
    render(<ComplianceClickFlow />);

    await userEvent.click(
      screen.getByRole("button", { name: "Compliance review is open: Review" }),
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(`Selected case ${caseId}.`, { exact: false })).toBeTruthy();
    expect(within(dialog).getByText("Normalized provider state: Requires Input")).toBeTruthy();
    expect(window.location.search).toContain(`record=${caseId}`);
    expect(window.location.search).toContain("recordType=compliance-case");
  });

  it("opens the exact phone-verification blocker without falling back to General", async () => {
    render(<ComplianceClickFlow />);

    await userEvent.click(
      screen.getByRole("button", {
        name: "Phone verification required blocks account capability: Review",
      }),
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Phone verification blocker")).toBeTruthy();
    expect(within(dialog).getByText("Withdraw Funds is blocked")).toBeTruthy();
    expect(window.location.search).toContain("record=phone-verification");
    expect(window.location.search).toContain("recordType=phone-verification");
    expect(screen.queryByTestId("legacy-tab")).toBeNull();
  });

  it("disables a scoped compliance review when the API omits its authoritative target", () => {
    render(
      <AdminCustomerActionCenter
        userId={userId}
        recommendedAction={null}
        actions={[
          {
            id: "compliance-review",
            severity: "ATTENTION",
            title: "Compliance review is open",
            explanation: "Identity KYC",
            recommendedAction: "Review compliance state",
            tab: "Operations",
          },
        ]}
        openComplianceAction={() => undefined}
        openLegacyAction={() => undefined}
        reviewAccess={() => undefined}
      />,
    );

    const review = screen.getByRole("button", { name: "Compliance review is open: Review" });
    expect(review.hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/No authoritative compliance control is linked/)).toBeTruthy();
  });
});
