import type {
  AdminCollectibleDetail,
  AdminIntakeDetail,
  AssetOperationDetailProjection,
} from "@/data/repositories";
import type { SubmissionReviewDetail } from "@/domain/submission";

export type GuideStepId =
  | "reviewer"
  | "identity"
  | "evidence"
  | "certification"
  | "decision"
  | "intake"
  | "verification"
  | "valuation"
  | "ownership"
  | "offering";
export type GuideSection =
  | "submission"
  | "identity"
  | "evidence"
  | "checks"
  | "intake"
  | "verification"
  | "valuation"
  | "ownership"
  | "offering"
  | "blockers"
  | "actions";
export type GuideStep = {
  id: GuideStepId;
  title: string;
  why: string;
  instructions: string[];
  sections: GuideSection[];
  complete: boolean;
  notApplicable: boolean;
  detail: string;
};
export type AssetReviewGuide = {
  steps: GuideStep[];
  recommended: GuideStepId;
  completed: number;
  finished: boolean;
  pause: string | null;
};

/** Navigation guidance only. Completion and permissions always come from saved projections. */
export function buildAssetReviewGuide({
  review,
  asset,
  intake,
  operation,
  submissionExpected = false,
}: {
  review: SubmissionReviewDetail | null;
  asset: AdminCollectibleDetail | null;
  intake: AdminIntakeDetail | null;
  operation: AssetOperationDetailProjection | null;
  submissionExpected?: boolean;
}): AssetReviewGuide {
  const approved = review?.status === "APPROVED";
  const noSubmission = !!asset && !review && !submissionExpected;
  const selfReview = !!(
    review?.allowedActions?.selfReviewForbidden || review?.reviewWorkspace?.selfReviewBlocked
  );
  const checks = review?.readiness?.progress ?? [];
  const check = (key: string) => checks.find((item) => item.key === key);
  const checkDone = (key: string) => check(key)?.status === "COMPLETE";
  const checkNA = (key: string) => check(key)?.status === "NOT_APPLICABLE" || noSubmission;
  const reviewStep = (key: string) => ({
    complete: !!approved || checkDone(key),
    notApplicable: checkNA(key),
    detail:
      check(key)?.summary ??
      (noSubmission
        ? "No submission review is linked to this asset."
        : "Waiting for the saved review check."),
  });
  const economic = (keys: string[]) =>
    operation?.economicWorkflow.filter((item) => keys.includes(item.key)) ?? [];
  const ownership = economic(["OWNERSHIP"]);
  const market = economic(["MARKET", "MARKET_LIVE"]);
  const hasReceipt = !!(intake?.intake?.receipt?.confirmedAt || asset?.intake?.receiptConfirmedAt);
  const physicalComplete = operation?.physicalPrerequisites.complete === true;
  const steps: GuideStep[] = [
    {
      id: "reviewer",
      title: "Start the review",
      sections: ["submission", "actions"],
      why: "Give this review a clear owner before a decision is made.",
      instructions: [
        "Check the collector and the item below.",
        selfReview
          ? "Ask another authorized reviewer to claim this submission."
          : "Claim the review if it is unassigned. If another reviewer owns it, coordinate with them.",
        "Use the checklist to inspect each check before making a decision.",
      ],
      complete:
        !!review &&
        (approved ||
          (!selfReview &&
            ["CLAIMED_BY_ME", "CLAIMED_BY_OTHER", "COMPLETED"].includes(
              review.reviewAssignment?.state ?? review.reviewWorkspace?.claimState ?? "",
            ))),
      notApplicable: noSubmission,
      detail: selfReview
        ? "You submitted this item. Ask another reviewer to continue."
        : review?.reviewAssignment?.reviewer
          ? `Review owner: ${review.reviewAssignment.reviewer.displayName}.`
          : approved
            ? "Submission already approved."
            : "Claim this review using the button below.",
    },
    {
      id: "identity",
      title: "Check what the item is",
      sections: ["identity"],
      why: "The name, set, year and card number must describe the item in the photos.",
      instructions: [
        "Compare the submitted details with the reviewed identity.",
        "Check the name, set, year, card number and variant against the evidence.",
        "Correct any differences, explain what you checked, then save the reviewed identity.",
      ],
      ...reviewStep("identity"),
    },
    {
      id: "evidence",
      title: "Review the photos",
      sections: ["evidence"],
      why: "Clear front and back images let staff verify the actual item, not just its description.",
      instructions: [
        "Open each required image at full size and check that it is clear and shows the correct item.",
        "Choose Accept only after checking that image. Flag issue if it is unclear, wrong or incomplete.",
        "Missing or flagged evidence needs attention. Request changes at the decision step if the collector must supply it.",
      ],
      ...reviewStep("evidence"),
      detail: review?.evidenceSummary
        ? `${review.evidenceSummary.acceptedRequired} of ${review.evidenceSummary.required} required images accepted. ${review.evidenceSummary.missingRequired} missing; ${review.evidenceSummary.flaggedRequired} flagged.`
        : reviewStep("evidence").detail,
    },
    {
      id: "certification",
      title: "Check grading & certification",
      sections: ["checks"],
      why: "A graded item needs a matching certification record. Raw items can be marked not applicable by the system.",
      instructions: [
        "Read the saved certification check and any warnings below.",
        "For a graded item, compare the grading company, certificate and grade with the official record.",
        "Do not treat an automated suggestion as verification. Resolve any mismatch before approval.",
      ],
      ...reviewStep("certification"),
    },
    {
      id: "decision",
      title: "Make the review decision",
      sections: ["blockers", "actions"],
      why: "Approval accepts the submission for the next stage. It does not confirm physical receipt or launch a market.",
      instructions: [
        "Read any remaining blockers. All required checks must be saved before approval.",
        "Approve if everything is ready, request changes with clear collector instructions, or reject with a reason.",
        "After approval, create the canonical asset if prompted. It stays in this same record.",
      ],
      complete: !!approved && !!(review?.assetId || asset),
      notApplicable: noSubmission,
      detail: approved
        ? review?.assetId || asset
          ? "Approved and linked to the asset record."
          : "Approved. Create the canonical asset to continue."
        : review?.readiness?.decisionEligible
          ? "Required checks are complete. Review the decision before confirming."
          : (review?.readiness?.blockers[0] ?? "Complete the required review checks first."),
    },
    {
      id: "intake",
      title: "Receive the physical item",
      sections: ["intake", "actions"],
      why: "Carrier delivery is not the same as a staff-confirmed receipt.",
      instructions: [
        "Check the assigned destination and shipping or in-person delivery details.",
        "Follow the next actor shown below while waiting for the collector or carrier.",
        "When staff physically receive the package, record its actual condition and confirm receipt.",
      ],
      complete: hasReceipt,
      notApplicable: false,
      detail: hasReceipt
        ? "Physical receipt is recorded."
        : (intake?.row.nextAction ??
          "Intake starts after the submission is approved and linked to an asset."),
    },
    {
      id: "verification",
      title: "Verify the item & custody",
      sections: ["verification", "intake", "actions"],
      why: "The item received must match the reviewed evidence and have a recorded custody state.",
      instructions: [
        "Start verification only after staff have received the item.",
        "Compare identity, certification, grade and variant with the item in hand. Record the actual result for each check.",
        "Resolve physical exceptions and confirm that custody is recorded before continuing.",
      ],
      complete: physicalComplete,
      notApplicable: false,
      detail: operation
        ? `Verification: ${humanize(operation.physicalPrerequisites.verification)}. Custody: ${humanize(operation.physicalPrerequisites.custody)}.`
        : "Waiting for the physical verification and custody checks.",
    },
    {
      id: "valuation",
      title: "Record the supported value",
      sections: ["valuation", "actions"],
      why: "A staff valuation is separate from a collector estimate or an external asking price.",
      instructions: [
        "Review available references and the item's verified condition.",
        "Enter the supported value in pounds and pence.",
        "Save the valuation and check the saved amount before moving on.",
      ],
      complete: !!asset?.valuation.current,
      notApplicable: false,
      detail: asset?.valuation.current
        ? "A canonical valuation is saved. Review the amount and method below."
        : "No canonical valuation is saved yet.",
    },
    {
      id: "ownership",
      title: "Check Slice ownership",
      sections: ["ownership"],
      why: "Configured supply and issued ownership are different. Both must reconcile before launch.",
      instructions: [
        "Review the proposed supply and the saved issuance status.",
        "Check the issued units and holder allocations. A proposal is not issued ownership.",
        "Follow the server's ownership requirements; do not change economic records to skip a blocker.",
      ],
      complete:
        (ownership.some((item) => item.state === "COMPLETE") ||
          asset?.issuance?.supply?.status === "ISSUED") &&
        operation?.reconciliation.ownership.state === "RECONCILED",
      notApplicable: false,
      detail:
        ownership[0]?.detail ??
        "Ownership issuance has not been confirmed by the lifecycle service.",
    },
    {
      id: "offering",
      title: "Check offering & launch",
      sections: ["offering", "blockers", "actions"],
      why: "Publication, offering and market activation have separate checks. Publishing alone does not finish the lifecycle.",
      instructions: [
        "Read the saved launch requirements and resolve the listed blockers.",
        "Review the offering and publication state before using an available launch action.",
        "Confirm the saved market state afterwards. A live pre-sale does not mean the final market is live.",
      ],
      complete: market.some((item) => item.state === "LIVE" || item.state === "COMPLETE"),
      notApplicable: false,
      detail:
        operation?.operations.nextAction.label ??
        "Offering and market checks become available later in the lifecycle.",
    },
  ];
  const finished = steps.every((step) => step.complete || step.notApplicable);
  let recommended = steps.find((step) => !step.complete && !step.notApplicable)?.id ?? "offering";
  let pause: string | null = null;
  if (review?.status === "REJECTED") {
    recommended = "decision";
    pause =
      "This submission was rejected. The workflow stops here; rejection does not approve or launch the asset.";
  } else if (
    review?.status === "CHANGES_REQUESTED" ||
    review?.readiness?.state === "WAITING_FOR_COLLECTOR"
  ) {
    recommended = "decision";
    pause =
      "Waiting for the collector to respond to the change request. Refresh after their update, then recheck the required items.";
  } else if (selfReview && !approved) {
    recommended = "reviewer";
    pause =
      "Another authorized reviewer must continue. You can inspect the record, but cannot approve your own submission.";
  }
  return {
    steps,
    recommended,
    completed: steps.filter((step) => step.complete || step.notApplicable).length,
    finished,
    pause,
  };
}

export function canReviewCommand(review: SubmissionReviewDetail | null, id: string) {
  if (
    !review ||
    review.allowedActions?.selfReviewForbidden ||
    review.reviewWorkspace?.selfReviewBlocked
  )
    return false;
  const command = review.availableCommands?.find((item) => item.id === id);
  return command ? command.allowed : review.allowedActions?.canEdit === true;
}

export function poundsToMinor(value: string): string | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(value.trim())) return null;
  const [whole, fraction = ""] = value.trim().split(".");
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
  return minor > 0n ? minor.toString() : null;
}

function humanize(value: string) {
  return value.replaceAll("_", " ").toLowerCase();
}
