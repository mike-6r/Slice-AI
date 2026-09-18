import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type {
  AdminCollectibleDetail,
  AdminIntakeDetail,
  AssetOperationDetailProjection,
} from "@/data/repositories";
import type { SubmissionReviewDetail } from "@/domain/submission";
import { buildAssetReviewGuide, canReviewCommand, poundsToMinor } from "./assetReviewGuide";
import { AssetReviewGuidePanel, GuideNavigation } from "./AssetReviewGuidePanel";

function review(overrides: Partial<SubmissionReviewDetail> = {}) {
  return {
    id: "submission-1",
    status: "SUBMITTED",
    version: 4,
    assetId: null,
    reviewAssignment: {
      state: "UNCLAIMED",
      reviewer: null,
      contributors: [],
      claimedAt: null,
      lastActivity: "2026-09-17T00:00:00Z",
    },
    allowedActions: {
      canClaim: true,
      canEdit: true,
      canRelease: false,
      canAccept: false,
      canReject: true,
      canRequestChanges: true,
      selfReviewForbidden: false,
    },
    readiness: {
      state: "CLAIM_REVIEW",
      nextAction: "CLAIM_REVIEW",
      blockers: [],
      requiredBlockers: [],
      advisoryItems: [],
      decisionEligible: false,
      checklist: [],
      currentValuation: null,
      progress: [
        {
          key: "identity",
          label: "Identity",
          status: "COMPLETE",
          required: true,
          summary: "Identity saved",
        },
        {
          key: "evidence",
          label: "Evidence",
          status: "NEEDS_REVIEW",
          required: true,
          summary: "Photos need review",
        },
        {
          key: "certification",
          label: "Certification",
          status: "NOT_APPLICABLE",
          required: false,
          summary: "Raw item",
        },
      ],
    },
    ...overrides,
  } as SubmissionReviewDetail;
}
const base = { review: null, asset: null, intake: null, operation: null };
const step = (model: ReturnType<typeof buildAssetReviewGuide>, id: string) =>
  model.steps.find((item) => item.id === id)!;

describe("saved-state asset review guidance", () => {
  it("starts with an owner, then resumes at the first required unsaved check", () => {
    const current = review();
    expect(buildAssetReviewGuide({ ...base, review: current }).recommended).toBe("reviewer");
    current.reviewAssignment!.state = "CLAIMED_BY_ME";
    const guide = buildAssetReviewGuide({ ...base, review: current });
    expect(guide.recommended).toBe("evidence");
    expect(step(guide, "certification").notApplicable).toBe(true);
    current.readiness!.progress[1].status = "COMPLETE";
    expect(buildAssetReviewGuide({ ...base, review: current }).recommended).toBe("decision");
  });
  it("does not treat uploaded photos as accepted evidence", () => {
    const current = review();
    current.evidenceSummary = {
      required: 2,
      presentRequired: 2,
      acceptedRequired: 0,
      flaggedRequired: 0,
      optional: 0,
      presentOptional: 0,
      missingRequired: 0,
      percent: 100,
      status: "COMPLETE",
      items: [],
    };
    expect(step(buildAssetReviewGuide({ ...base, review: current }), "evidence").complete).toBe(
      false,
    );
  });
  it("stops self-review even when another permission accidentally looks available", () => {
    const current = review();
    current.allowedActions!.selfReviewForbidden = true;
    current.availableCommands = [{ id: "canReviewEvidence", allowed: true, reason: null }];
    const guide = buildAssetReviewGuide({ ...base, review: current });
    expect(guide.pause).toMatch(/another authorized reviewer/i);
    expect(guide.recommended).toBe("reviewer");
    expect(canReviewCommand(current, "canReviewEvidence")).toBe(false);
  });
  it.each(["CHANGES_REQUESTED", "REJECTED"])(
    "does not carry a %s submission into intake",
    (status) => {
      const guide = buildAssetReviewGuide({ ...base, review: review({ status }) });
      expect(guide.pause).toBeTruthy();
      expect(guide.recommended).toBe("decision");
      expect(step(guide, "decision").complete).toBe(false);
      expect(guide.finished).toBe(false);
    },
  );
  it("keeps approval separate from canonicalisation and resumes on the same record", () => {
    const current = review({ status: "APPROVED" });
    expect(buildAssetReviewGuide({ ...base, review: current }).recommended).toBe("decision");
    current.assetId = "asset-1";
    expect(buildAssetReviewGuide({ ...base, review: current }).recommended).toBe("intake");
  });
  it("distinguishes carrier delivery from staff receipt and verification", () => {
    const intake = {
      intake: { deliveredAt: "2026-09-17", receipt: null },
      row: { nextAction: "Record receipt" },
    } as AdminIntakeDetail;
    let guide = buildAssetReviewGuide({ ...base, intake });
    expect(step(guide, "intake").complete).toBe(false);
    intake.intake!.receipt = { confirmedAt: "2026-09-17" } as NonNullable<
      NonNullable<AdminIntakeDetail["intake"]>["receipt"]
    >;
    guide = buildAssetReviewGuide({ ...base, intake });
    expect(step(guide, "intake").complete).toBe(true);
    expect(step(guide, "verification").complete).toBe(false);
  });
  it("does not infer missing review data means no submission", () => {
    const asset = { valuation: { current: null } } as AdminCollectibleDetail;
    expect(
      step(buildAssetReviewGuide({ ...base, asset, submissionExpected: true }), "identity")
        .notApplicable,
    ).toBe(false);
    expect(step(buildAssetReviewGuide({ ...base, asset }), "identity").notApplicable).toBe(true);
  });
  it("does not confuse supply configuration, readiness or a live pre-sale with completed issuance and launch", () => {
    const operation = {
      economicWorkflow: [
        { key: "OWNERSHIP", state: "READY", detail: "Ready to issue" },
        { key: "PRE_SALE_LIVE", state: "LIVE" },
        { key: "LAUNCH", state: "READY" },
      ],
      reconciliation: { ownership: { state: "NOT_ISSUED" } },
      physicalPrerequisites: { complete: false, verification: "PENDING", custody: "PENDING" },
      operations: { nextAction: { label: "Issue ownership" } },
    } as AssetOperationDetailProjection;
    let guide = buildAssetReviewGuide({ ...base, operation });
    expect(step(guide, "ownership").complete).toBe(false);
    expect(step(guide, "offering").complete).toBe(false);
    operation.economicWorkflow[0].state = "COMPLETE";
    expect(step(buildAssetReviewGuide({ ...base, operation }), "ownership").complete).toBe(false);
    operation.reconciliation.ownership.state = "RECONCILED";
    operation.economicWorkflow.push({
      key: "MARKET_LIVE",
      label: "Market",
      state: "LIVE",
      detail: "Final market live",
    });
    guide = buildAssetReviewGuide({ ...base, operation });
    expect(step(guide, "ownership").complete).toBe(true);
    expect(step(guide, "offering").complete).toBe(true);
  });
  it("honors explicit command denials instead of a broader edit permission", () => {
    const current = review({
      availableCommands: [{ id: "canEditReviewIdentity", allowed: false, reason: "Read only" }],
    });
    expect(canReviewCommand(current, "canEditReviewIdentity")).toBe(false);
    expect(canReviewCommand(null, "canEditReviewIdentity")).toBe(false);
  });
});

describe("guide presentation and exact currency entry", () => {
  it("makes Continue unavailable for unsaved work and while refreshing", () => {
    const guide = buildAssetReviewGuide({ ...base, review: review() });
    const html = renderToStaticMarkup(
      <GuideNavigation guide={guide} selected="reviewer" busy={false} onSelect={() => undefined} />,
    );
    expect(html).toMatch(/disabled=""[^>]*>Continue/);
    const pending = renderToStaticMarkup(
      <GuideNavigation guide={guide} selected="identity" busy onSelect={() => undefined} />,
    );
    expect(pending).toContain("Checking the latest saved state");
    expect(pending).toMatch(/disabled=""[^>]*>Go to next required step/);
  });
  it("exposes progress, the selected step, plain instructions and failure recovery", () => {
    const guide = buildAssetReviewGuide(base);
    const html = renderToStaticMarkup(
      <AssetReviewGuidePanel
        guide={guide}
        selected="evidence"
        busy={false}
        issue="Review could not load"
        onSelect={() => undefined}
        onShowRecord={() => undefined}
        onRefresh={() => undefined}
      />,
    );
    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Open each required image at full size");
    expect(html).toContain('role="alert"');
    expect(html).toContain("Refresh record");
    expect(html).toContain("Preview");
  });
  it.each([
    ["250", "25000"],
    ["250.01", "25001"],
    ["0.01", "1"],
    [" 12.5 ", "1250"],
    ["999999999999.99", "99999999999999"],
  ])("converts %s pounds without floating-point settlement", (input, expected) =>
    expect(poundsToMinor(input)).toBe(expected),
  );
  it.each(["", "0", "0.00", "-1", "NaN", "1e3", "1.234", "25,00", "£250", "1000000000000"])(
    "rejects ambiguous or invalid value %s",
    (input) => expect(poundsToMinor(input)).toBeNull(),
  );
});
