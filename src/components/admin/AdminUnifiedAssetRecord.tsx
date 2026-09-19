import { useIsMutating, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  BadgeCheck,
  Banknote,
  Box,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileImage,
  Fingerprint,
  History,
  Image as ImageIcon,
  Landmark,
  PackageCheck,
  Rocket,
  ShieldCheck,
  Sparkles,
  Tag,
  TrendingUp,
  UserRound,
  Users,
  WalletCards,
} from "lucide-react";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";

import type {
  AdminCollectibleDetail,
  AdminIntakeDetail,
  AssetOperationDetailProjection,
} from "@/data/repositories";
import type { SubmissionReviewDetail } from "@/domain/submission";
import { appPath } from "@/config/environment";
import { useAppServices } from "@/providers/AppServicesProvider";
import { AdminReviewMedia } from "./AdminReviewMedia";
import { AssetReviewGuidePanel, AssetReviewSteps, GuideNavigation } from "./AssetReviewGuidePanel";
import { shouldLoadAssetIntake } from "./assetRecordQueries";
import { AssetReviewForms, ReviewFindings } from "./AssetReviewForms";
import {
  buildAssetReviewGuide,
  canReviewCommand,
  poundsToMinor,
  type GuideStepId,
} from "./assetReviewGuide";
import "@/styles/admin-unified-asset-record.css";
import "@/styles/asset-review-guide.css";

const VisibleSections = createContext<Set<string> | null>(null);

export type AssetRecordFocus =
  | "summary"
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
  | "money"
  | "history"
  | "actions";

export const assetRecordSections: ReadonlyArray<{ id: AssetRecordFocus; label: string }> = [
  { id: "summary", label: "Summary" },
  { id: "submission", label: "Submission" },
  { id: "identity", label: "Identity" },
  { id: "evidence", label: "Evidence" },
  { id: "checks", label: "Checks" },
  { id: "intake", label: "Intake & custody" },
  { id: "verification", label: "Verification" },
  { id: "valuation", label: "Valuation" },
  { id: "ownership", label: "Ownership" },
  { id: "offering", label: "Offering" },
  { id: "blockers", label: "Blockers" },
  { id: "money", label: "Money" },
  { id: "history", label: "History" },
  { id: "actions", label: "Actions" },
];

type Command =
  | "CLAIM_REVIEW"
  | "RELEASE_REVIEW"
  | "APPROVE_SUBMISSION"
  | "REQUEST_CHANGES"
  | "REJECT_SUBMISSION"
  | "CANONICALIZE"
  | "CONFIRM_DELIVERY"
  | "CONFIRM_RECEIPT"
  | "START_VERIFICATION"
  | "COMPLETE_VERIFICATION"
  | "RECORD_VALUATION"
  | "PUBLISH";

type AssetRecordProps = {
  reference: string;
  kind: "asset" | "submission";
  focus?: string;
  onFocus: (focus: AssetRecordFocus) => void;
};

export function AdminUnifiedAssetRecord(props: AssetRecordProps) {
  return <AssetRecord key={`${props.kind}:${props.reference}`} {...props} />;
}

function AssetRecord({ reference, focus, onFocus }: AssetRecordProps) {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const [decisionReason, setDecisionReason] = useState("ADMIN_REVIEW_DECISION");
  const [decisionNote, setDecisionNote] = useState("");
  const [valuationMinor, setValuationMinor] = useState("");
  const [guided, setGuided] = useState(
    !focus || !["history", "money", "blockers", "actions"].includes(focus),
  );
  const [selectedStep, setSelectedStep] = useState<GuideStepId | null>(null);
  const [receiptCondition, setReceiptCondition] = useState("");
  const [verificationNote, setVerificationNote] = useState("");
  const [flagNote, setFlagNote] = useState("");
  const writes = useIsMutating({ mutationKey: ["admin", "asset-record", "write"] });
  const [verification, setVerification] = useState({
    identityMatch: false,
    certificationMatch: false,
    gradeMatch: false,
    variantMatch: false,
  });

  const resolution = useQuery({
    queryKey: ["admin", "asset-record", "resolve", reference],
    queryFn: () => services.repositories.admin.resolveAssetRecord(reference),
    retry: false,
  });
  const resolvedSubmissionId = resolution.data?.submissionId ?? null;
  const resolvedAssetId = resolution.data?.assetId ?? null;
  const reviewQuery = useQuery({
    queryKey: ["admin", "asset-record", "review", resolvedSubmissionId],
    queryFn: () => services.repositories.reviews.getDetail(resolvedSubmissionId!),
    enabled: Boolean(resolvedSubmissionId),
    retry: false,
  });
  const assetQuery = useQuery({
    queryKey: ["admin", "asset-record", "asset", resolvedAssetId],
    queryFn: () => services.repositories.admin.getCollectibleDetail(resolvedAssetId!, "record"),
    enabled: Boolean(resolvedAssetId),
    retry: false,
  });
  const intake = useQuery({
    queryKey: ["admin", "asset-record", "intake", resolvedSubmissionId],
    queryFn: () => services.repositories.admin.getIntakeDetail(resolvedSubmissionId!),
    enabled: shouldLoadAssetIntake(resolution.data, reviewQuery.data?.status),
    retry: false,
  });
  const operations = useQuery({
    queryKey: ["admin", "asset-record", "operations", resolvedAssetId],
    queryFn: () => services.repositories.lifecycle.getOperationDetail(resolvedAssetId!),
    enabled: Boolean(resolvedAssetId),
    retry: false,
  });

  const review = reviewQuery.data ?? null;
  const asset = assetQuery.data ?? null;
  const intakeDetail = intake.data ?? null;
  const operation = operations.data ?? null;
  const activeFocus = assetRecordSections.some((section) => section.id === focus)
    ? (focus as AssetRecordFocus)
    : "summary";

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin", "asset-record"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "intake"] }),
      queryClient.invalidateQueries({ queryKey: ["admin", "reviews"] }),
      queryClient.invalidateQueries({ queryKey: ["asset-operations"] }),
    ]);
  };

  const command = useMutation({
    mutationKey: ["admin", "asset-record", "write"],
    mutationFn: async (value: Command) => {
      if (value === "CLAIM_REVIEW" && review)
        return services.repositories.reviews.claim(review.id, review.version);
      if (value === "RELEASE_REVIEW" && review)
        return services.repositories.reviews.release(review.id, review.version);
      if (value === "APPROVE_SUBMISSION" && review)
        return services.repositories.reviews.decide(review.id, "APPROVED", {
          version: review.version,
          reasonCode: decisionReason,
          note: decisionNote || undefined,
        });
      if (value === "REQUEST_CHANGES" && review)
        return services.repositories.reviews.decide(review.id, "CHANGES_REQUESTED", {
          version: review.version,
          reasonCode: decisionReason,
          note: decisionNote || undefined,
          customerMessage: decisionNote || "Please address the outstanding review requirements.",
          requestedItems: review.readiness?.requiredBlockers ?? [],
        });
      if (value === "REJECT_SUBMISSION" && review)
        return services.repositories.reviews.decide(review.id, "REJECTED", {
          version: review.version,
          reasonCode: decisionReason,
          note: decisionNote || undefined,
        });
      if (value === "CANONICALIZE" && review)
        return services.repositories.reviews.canonicalize(review.id, review.version);
      if (value === "CONFIRM_DELIVERY" && intakeDetail?.intake?.id)
        return services.repositories.admin.confirmIntakeDelivery(intakeDetail.intake.id);
      if (value === "CONFIRM_RECEIPT" && intakeDetail?.intake?.id)
        return services.repositories.admin.confirmIntakeReceipt(intakeDetail.intake.id, {
          packageCondition: receiptCondition.trim(),
        });
      if (value === "START_VERIFICATION" && intakeDetail?.intake?.id)
        return services.repositories.admin.startIntakeVerification(intakeDetail.intake.id);
      if (value === "COMPLETE_VERIFICATION" && intakeDetail?.intake?.id)
        return services.repositories.admin.completeIntakeVerification(intakeDetail.intake.id, {
          ...verification,
          note: verificationNote.trim(),
        });
      if (value === "RECORD_VALUATION" && resolvedAssetId)
        return services.repositories.lifecycle.recordValuation(resolvedAssetId, {
          valueMinor: poundsToMinor(valuationMinor) ?? "",
          confidence: 80,
          methodologyCode: "ADMIN_ASSET_RECORD",
          sourceType: "STAFF_REVIEW",
        });
      if (value === "PUBLISH" && resolvedAssetId)
        return services.repositories.lifecycle.publish(resolvedAssetId);
      throw new Error("This command is not available for the current asset state.");
    },
    onSuccess: refresh,
  });

  const evidence = useMutation({
    mutationKey: ["admin", "asset-record", "write"],
    mutationFn: ({ mediaId, action }: { mediaId: string; action: "accept" | "flag" }) => {
      if (!review || !canReviewCommand(review, "canReviewEvidence"))
        throw new Error("Evidence review is not permitted for this reviewer.");
      return action === "accept"
        ? services.repositories.reviews.acceptEvidence(review.id, mediaId, {
            version: review.version,
          })
        : services.repositories.reviews.flagEvidence(review.id, mediaId, {
            version: review.version,
            note: flagNote.trim(),
            customerAction: true,
          });
    },
    onSuccess: refresh,
  });

  useEffect(() => {
    if (guided || !focus) return;
    const node = document.getElementById(`asset-record-${activeFocus}`);
    if (!node) return;
    const timer = window.setTimeout(() => node.scrollIntoView({ block: "start" }), 40);
    return () => window.clearTimeout(timer);
  }, [activeFocus, reference, guided, focus]);

  const guide = buildAssetReviewGuide({
    review,
    asset,
    intake: intakeDetail,
    operation,
    submissionExpected: !!resolvedSubmissionId,
  });
  const initialStep =
    focus && !["summary", "submission", "actions"].includes(focus)
      ? guide.steps.find((step) => step.sections.some((section) => section === focus))?.id
      : undefined;
  const stepId = selectedStep ?? initialStep ?? guide.recommended;
  const step = guide.steps.find((item) => item.id === stepId)!;
  const previousStep = useRef(stepId);
  useEffect(() => {
    if (guided && previousStep.current !== stepId) {
      document.getElementById("asset-review-guide")?.scrollIntoView({ block: "start" });
      document.getElementById("asset-guide-task-title")?.focus({ preventScroll: true });
    }
    previousStep.current = stepId;
  }, [stepId, guided]);
  const recordError =
    resolution.error ?? reviewQuery.error ?? assetQuery.error ?? intake.error ?? operations.error;
  const busy =
    writes > 0 ||
    [resolution, reviewQuery, assetQuery, intake, operations].some((query) => query.isFetching);
  const editingBlocked = busy || !!recordError;
  const chooseStep = (id: GuideStepId) => {
    setSelectedStep(id);
    document.getElementById("asset-review-guide")?.scrollIntoView({ block: "start" });
  };
  const openSection = (id: AssetRecordFocus) => {
    setGuided(false);
    onFocus(id);
  };

  const loading =
    resolution.isLoading ||
    (Boolean(resolvedSubmissionId) && reviewQuery.isLoading) ||
    (Boolean(resolvedAssetId) && assetQuery.isLoading);
  const failed = resolution.isError;
  if (loading)
    return <RecordState title="Loading asset record" detail="Joining lifecycle authorities." />;
  if (failed)
    return (
      <RecordState
        title="Asset record unavailable"
        detail="The authoritative record could not be resolved from this reference."
      />
    );

  const title = asset?.title ?? review?.collectible?.title ?? "Untitled collectible";
  const front =
    asset?.media.find((item) => /front|primary|hero/i.test(item.slot)) ??
    asset?.media[0] ??
    review?.media.find((item) => /front|primary|hero/i.test(item.slot)) ??
    review?.media[0];
  const lifecycle = lifecycleRows(asset, review, intakeDetail, operation);
  const blockers = collectBlockers(review, asset, intakeDetail, operation);
  const nextAction = nextAssetAction(review, intakeDetail, operation);
  const historyRows = combinedHistory(review, asset, intakeDetail);

  return (
    <main className={`asset-record${guided ? " asset-record--guided" : ""}`}>
      <header className="asset-record__hero">
        <div className="asset-record__media">
          <AdminReviewMedia
            key={mediaSource(front) ?? review?.collectible?.thumbnailUrl}
            src={mediaSource(front) ?? review?.collectible?.thumbnailUrl}
            alt={title}
            fallback={<span>No preview</span>}
          />
        </div>
        <div className="asset-record__identity">
          <p>Assets / {asset ? "Asset record" : "Submission review"}</p>
          <h1>{title}</h1>
          <span>{identityLine(asset, review)}</span>
          <div className="asset-record__badges">
            <Status value={asset ? "Asset" : "Submission"} tone="mint" />
            <Status value={sentence(review?.status ?? asset?.status ?? "Unknown")} />
            {asset?.dossier.workType ? <Status value={asset.dossier.workType} /> : null}
          </div>
          <dl className="asset-record__hero-facts">
            {!guided && (
              <Fact label="Asset ID" value={asset?.publicId ?? "Created after approval"} />
            )}
            {!guided && <Fact label="Submission" value={resolvedSubmissionId ?? "Not linked"} />}
            <Fact
              label="Collector"
              value={
                review?.collectorSummary?.displayName ??
                asset?.collector?.displayName ??
                "Not linked"
              }
            />
            <Fact label="Updated" value={date(asset?.updatedAt ?? review?.submittedAt)} />
          </dl>
        </div>
        {!guided && (
          <aside className="asset-record__next">
            <small>Next required action</small>
            <strong>
              {guided
                ? guide.steps.find((item) => item.id === guide.recommended)?.title
                : nextAction.label}
            </strong>
            <span>
              {guided
                ? (guide.pause ?? guide.steps.find((item) => item.id === guide.recommended)?.detail)
                : nextAction.detail}
            </span>
            <button
              type="button"
              onClick={() => {
                setGuided(true);
                chooseStep(guide.recommended);
              }}
            >
              Continue guided review <ArrowRight aria-hidden="true" />
            </button>
          </aside>
        )}
      </header>

      <nav className="asset-record__nav" aria-label="Asset record sections">
        <button type="button" className={guided ? "is-active" : ""} onClick={() => setGuided(true)}>
          Step-by-step guide
        </button>
        <button
          type="button"
          className={!guided ? "is-active" : ""}
          onClick={() => setGuided(false)}
        >
          Full asset record
        </button>
        {!guided &&
          assetRecordSections.map((section) => (
            <button
              key={section.id}
              type="button"
              className={!guided && activeFocus === section.id ? "is-active" : ""}
              onClick={() => openSection(section.id)}
            >
              {section.label}
            </button>
          ))}
      </nav>

      <div className={`asset-record__layout${guided ? " is-guided" : ""}`}>
        {guided && <AssetReviewSteps guide={guide} selected={stepId} onSelect={chooseStep} />}
        <div className="asset-record__content">
          {!guided && recordError ? (
            <div className="asset-guide__notice is-error" role="alert">
              Some lifecycle data could not be loaded. Controls are paused.{" "}
              <button type="button" disabled={busy} onClick={() => void refresh()}>
                Refresh record
              </button>
            </div>
          ) : null}
          {guided ? (
            <div id="asset-review-guide">
              <AssetReviewGuidePanel
                guide={guide}
                selected={stepId}
                onSelect={chooseStep}
                onShowRecord={() => setGuided(false)}
                busy={busy}
                issue={
                  recordError
                    ? "Some lifecycle data could not be loaded. Controls are paused until the record refreshes successfully."
                    : null
                }
                onRefresh={() => void refresh()}
              />
            </div>
          ) : null}
          <VisibleSections.Provider value={guided ? new Set(step.sections) : null}>
            <RecordSection
              id="summary"
              eyebrow="Summary / lifecycle"
              title="One asset, one record"
              icon={<Box />}
            >
              <p className="asset-record__section-intro">
                Every stage below is joined by submission and canonical asset identity. Missing
                stages remain visible as not started; they do not become separate records.
              </p>
              <div className="asset-record__lifecycle">
                {lifecycle.map((item, index) => (
                  <div key={item.label} className={`is-${item.tone}`}>
                    <i>{index + 1}</i>
                    <span>{item.label}</span>
                    <strong>{item.value}</strong>
                    <small>{item.detail}</small>
                  </div>
                ))}
              </div>
            </RecordSection>

            <RecordSection
              id="submission"
              eyebrow="Submission + collector"
              title={guided ? "Item & collector" : "Submission details"}
              icon={<Users />}
            >
              <DefinitionGrid
                values={
                  guided
                    ? [
                        [
                          "Collector",
                          review?.collectorSummary?.displayName ?? asset?.collector?.displayName,
                        ],
                        ["Submitted", date(review?.submittedAt)],
                        [
                          "Review owner",
                          review?.reviewAssignment?.reviewer?.displayName ?? "Unassigned",
                        ],
                        ["Submission status", sentence(review?.status)],
                      ]
                    : [
                        [
                          "Submission state",
                          review?.status ?? asset?.dossier.provenance?.submissionStatus,
                        ],
                        [
                          "Submitted",
                          date(review?.submittedAt ?? asset?.dossier.provenance?.submittedAt),
                        ],
                        [
                          "Collector",
                          review?.collectorSummary?.displayName ?? asset?.collector?.displayName,
                        ],
                        [
                          "Username",
                          review?.collectorSummary?.username ?? asset?.collector?.username,
                        ],
                        ["Membership", review?.collectorSummary?.membership],
                        ["Source", review?.submissionDetails?.source ?? "Collector submission"],
                        ["Submission ID", resolvedSubmissionId],
                        ["Canonical asset ID", asset?.publicId],
                      ]
                }
              />
            </RecordSection>

            <RecordSection
              id="identity"
              eyebrow="Canonical identity"
              title="Compare the item details"
              icon={<Fingerprint />}
            >
              <div className="asset-record__compare">
                <RecordCard title="Collector submitted">
                  <DefinitionGrid values={submissionIdentity(review)} compact />
                </RecordCard>
                <RecordCard title="Canonical / reviewed">
                  <DefinitionGrid values={canonicalIdentity(asset, review)} compact />
                </RecordCard>
              </div>
              {review ? (
                <AssetReviewForms
                  key={`identity-${review.id}`}
                  mode="identity"
                  review={review}
                  busy={editingBlocked}
                  onSaved={refresh}
                />
              ) : null}
            </RecordSection>

            <RecordSection
              id="evidence"
              eyebrow="Images & evidence"
              title="Check each image"
              icon={<FileImage />}
            >
              <div className="asset-record__evidence-grid">
                {(review?.evidenceSummary?.items ?? review?.media ?? asset?.evidence ?? []).map(
                  (item, index) => {
                    const mediaId = "id" in item ? String(item.id) : `asset-${index}`;
                    const reviewedMedia = review?.evidenceSummary?.items.find(
                      (media) => media.id === mediaId,
                    );
                    const source = mediaSource(item) ?? mediaSource(reviewedMedia);
                    const state =
                      reviewedMedia?.reviewState ??
                      ("reviewState" in item ? item.reviewState : item.status);
                    return (
                      <article key={mediaId}>
                        <div className="asset-record__evidence-image">
                          <AdminReviewMedia
                            key={source}
                            src={source}
                            alt={String(item.slot ?? "Evidence")}
                            fallback={<span>Preview unavailable</span>}
                          />
                        </div>
                        <div>
                          <strong>{sentence(item.slot ?? "Evidence")}</strong>
                          <Status
                            value={String(state)}
                            tone={String(state) === "ACCEPTED" ? "mint" : "amber"}
                          />
                        </div>
                        {source ? (
                          <a
                            className="asset-guide__image-link"
                            href={source}
                            target="_blank"
                            rel="noreferrer"
                          >
                            Open full-size image <ArrowRight aria-hidden="true" />
                          </a>
                        ) : null}
                        {review && "id" in item ? (
                          <div className="asset-record__evidence-actions">
                            <button
                              type="button"
                              disabled={
                                editingBlocked ||
                                !canReviewCommand(review, "canReviewEvidence") ||
                                item.status !== "SAFE" ||
                                state === "ACCEPTED"
                              }
                              onClick={() => evidence.mutate({ mediaId, action: "accept" })}
                            >
                              Accept
                            </button>
                            <button
                              type="button"
                              disabled={
                                editingBlocked ||
                                !canReviewCommand(review, "canReviewEvidence") ||
                                !flagNote.trim()
                              }
                              onClick={() => evidence.mutate({ mediaId, action: "flag" })}
                            >
                              Flag issue
                            </button>
                          </div>
                        ) : null}
                      </article>
                    );
                  },
                )}
              </div>
              {review ? (
                <div className="asset-guide__form">
                  <label>
                    What is wrong with the image?{" "}
                    <input
                      value={flagNote}
                      onChange={(event) => setFlagNote(event.target.value)}
                      placeholder="Explain the issue before choosing Flag issue"
                    />
                  </label>
                  <p>
                    Accept checks each image individually. Only scanned, safe media can be accepted.
                  </p>
                  {!canReviewCommand(review, "canReviewEvidence") ? (
                    <p role="status">
                      Evidence is read-only for this reviewer. Another authorized reviewer may need
                      to continue.
                    </p>
                  ) : null}
                  {evidence.error ? (
                    <p role="alert">
                      {errorMessage(evidence.error)} Refresh the record before retrying.
                    </p>
                  ) : null}
                </div>
              ) : null}
              {!review?.media.length && !asset?.evidence.length ? (
                <Empty text="No evidence is attached to this asset." />
              ) : null}
            </RecordSection>

            <RecordSection
              id="checks"
              eyebrow="Automated checks"
              title="Qualification and readiness"
              icon={<ClipboardCheck />}
            >
              <div className="asset-record__checks">
                {(review?.readiness?.progress ?? []).map((check) => (
                  <div key={check.key}>
                    {check.status === "COMPLETE" ? <CheckCircle2 /> : <AlertTriangle />}
                    <span>
                      <strong>{check.label}</strong>
                      <small>{check.summary}</small>
                    </span>
                    <Status
                      value={check.status}
                      tone={check.status === "COMPLETE" ? "mint" : "amber"}
                    />
                  </div>
                ))}
                {review?.certificationVerification ? (
                  <div>
                    <BadgeCheck />
                    <span>
                      <strong>Certification</strong>
                      <small>
                        {review.certificationVerification.companyCode} ·{" "}
                        {review.certificationVerification.certificationNumber}
                      </small>
                    </span>
                    <Status value={review.certificationVerification.status} />
                  </div>
                ) : null}
                {!review?.readiness?.progress.length ? (
                  <Empty text="Automated review checks are not available for this lifecycle stage." />
                ) : null}
              </div>
              {review ? (
                <AssetReviewForms
                  key={`certification-${review.id}`}
                  mode="certification"
                  review={review}
                  busy={editingBlocked}
                  onSaved={refresh}
                />
              ) : null}
            </RecordSection>

            <RecordSection
              id="intake"
              eyebrow="Physical intake & chain of custody"
              title="Movement, receipt and custody"
              icon={<PackageCheck />}
            >
              <DefinitionGrid values={intakeFacts(intakeDetail, asset)} />
              <div className="asset-record__timeline">
                {(intakeDetail?.history ?? asset?.custody.history ?? []).map((event, index) => (
                  <div key={("id" in event ? event.id : undefined) ?? `${index}`}>
                    <i />
                    <span>
                      <strong>{sentence("action" in event ? event.action : event.status)}</strong>
                      <small>{date("occurredAt" in event ? event.occurredAt : event.at)}</small>
                    </span>
                  </div>
                ))}
              </div>
              {!intakeDetail?.intake && !asset?.intake ? (
                <Empty
                  title="Physical intake not started"
                  text="Destination, tracking, receipt, verification and custody remain on this record until started."
                />
              ) : null}
            </RecordSection>

            <RecordSection
              id="verification"
              eyebrow="Verification"
              title="Review and physical truth"
              icon={<ShieldCheck />}
            >
              <DefinitionGrid values={verificationFacts(review, intakeDetail, asset)} />
            </RecordSection>

            <RecordSection
              id="valuation"
              eyebrow="Valuation"
              title="Current decision and evidence"
              icon={<TrendingUp />}
            >
              <DefinitionGrid values={valuationFacts(review, asset)} />
              {asset?.valuation.history.length ? (
                <DataTable
                  headers={["Value", "Date", "Method", "Status"]}
                  rows={asset.valuation.history.map((item) => [
                    money(item.minor, item.currency),
                    date(item.asOf),
                    item.method,
                    sentence(item.status),
                  ])}
                />
              ) : null}
            </RecordSection>

            <RecordSection
              id="ownership"
              eyebrow="Ownership / Slice issuance"
              title="Supply and positions"
              icon={<Landmark />}
            >
              <DefinitionGrid values={ownershipFacts(asset)} />
              {asset?.ownership.holders?.length ? (
                <DataTable
                  headers={["Holder", "Units", "Share"]}
                  rows={asset.ownership.holders.map((holder) => [
                    holder.displayName,
                    holder.units,
                    holder.percentage === null ? "—" : `${holder.percentage}%`,
                  ])}
                />
              ) : null}
            </RecordSection>

            <RecordSection
              id="offering"
              eyebrow="Offering / market state"
              title="Launch and market readiness"
              icon={<Rocket />}
            >
              <DefinitionGrid values={offeringFacts(asset, operation)} />
              {operation?.economicWorkflow?.length ? (
                <div className="asset-record__workflow">
                  {operation.economicWorkflow.map((step) => (
                    <div key={step.key}>
                      <Status
                        value={step.state}
                        tone={step.state === "COMPLETE" || step.state === "LIVE" ? "mint" : "amber"}
                      />
                      <span>
                        <strong>{step.label}</strong>
                        <small>{step.detail}</small>
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </RecordSection>

            <RecordSection
              id="blockers"
              eyebrow="Blockers + next action"
              title="What needs attention"
              icon={<AlertTriangle />}
            >
              <div className="asset-record__blockers">
                {blockers.length ? (
                  blockers.map((blocker) => (
                    <div key={blocker}>
                      <AlertTriangle />
                      <span>
                        <strong>{sentence(blocker)}</strong>
                        <small>
                          Resolve this condition before the dependent lifecycle action can continue.
                        </small>
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="is-clear">
                    <CheckCircle2 />
                    <span>
                      <strong>No active blockers</strong>
                      <small>The current stage has no reported blocking condition.</small>
                    </span>
                  </div>
                )}
              </div>
              {review ? (
                <ReviewFindings review={review} busy={editingBlocked} onSaved={refresh} />
              ) : null}
            </RecordSection>

            <RecordSection
              id="money"
              eyebrow="Related Money records"
              title="Economic links without duplicated authority"
              icon={<WalletCards />}
            >
              <DefinitionGrid values={moneyFacts(asset)} />
              <a
                className="asset-record__money-link"
                href={appPath(`/admin?section=money&view=wallets-movements&q=${encodeURIComponent(asset?.publicId ?? resolvedSubmissionId ?? reference)}`)}
              >
                Open matching Money records <ArrowRight />
              </a>
            </RecordSection>

            <RecordSection
              id="history"
              eyebrow="History"
              title="Joined lifecycle audit"
              icon={<History />}
            >
              {historyRows.length ? (
                <DataTable headers={["When", "Event", "Actor", "Source"]} rows={historyRows} />
              ) : (
                <Empty text="No lifecycle history has been recorded." />
              )}
            </RecordSection>

            <RecordSection
              id="actions"
              eyebrow="Valid actions"
              title={guided ? "Review controls" : "What you can do now"}
              icon={<Sparkles />}
            >
              <ActionCenter
                review={review}
                intake={intakeDetail}
                asset={asset}
                operation={operation}
                command={command}
                decisionReason={decisionReason}
                setDecisionReason={setDecisionReason}
                decisionNote={decisionNote}
                setDecisionNote={setDecisionNote}
                valuationMinor={valuationMinor}
                setValuationMinor={setValuationMinor}
                verification={verification}
                setVerification={setVerification}
                step={guided ? stepId : undefined}
                busy={editingBlocked}
                receiptCondition={receiptCondition}
                setReceiptCondition={setReceiptCondition}
                verificationNote={verificationNote}
                setVerificationNote={setVerificationNote}
              />
            </RecordSection>
          </VisibleSections.Provider>
          {guided ? (
            <GuideNavigation
              guide={guide}
              selected={stepId}
              onSelect={chooseStep}
              busy={busy}
              unavailable={!!recordError}
            />
          ) : null}
        </div>

        <aside className="asset-record__rail" hidden={guided}>
          <RecordCard title="Lifecycle snapshot">
            {lifecycle.map((item) => (
              <Fact key={item.label} label={item.label} value={item.value} />
            ))}
          </RecordCard>
          <RecordCard title="Next action">
            <strong className="asset-record__rail-action">{nextAction.label}</strong>
            <p>{nextAction.detail}</p>
            <button type="button" onClick={() => openSection(nextAction.focus)}>
              Open section <ArrowRight />
            </button>
          </RecordCard>
          <RecordCard title="Record authority">
            <p>
              Submission, intake, catalogue, valuation and launch are sections of this asset record.
              Money remains a separate ledger authority and is linked contextually.
            </p>
          </RecordCard>
        </aside>
      </div>
      {(command.error ?? evidence.error) ? (
        <div className="asset-record__error" role="alert">
          {errorMessage(command.error ?? evidence.error)}
        </div>
      ) : null}
    </main>
  );
}

function ActionCenter({
  review,
  intake,
  asset,
  operation,
  command,
  decisionReason,
  setDecisionReason,
  decisionNote,
  setDecisionNote,
  valuationMinor,
  setValuationMinor,
  verification,
  setVerification,
  step,
  busy,
  receiptCondition,
  setReceiptCondition,
  verificationNote,
  setVerificationNote,
}: {
  review: SubmissionReviewDetail | null;
  intake: AdminIntakeDetail | null;
  asset: AdminCollectibleDetail | null;
  operation: AssetOperationDetailProjection | null;
  command: ReturnType<typeof useMutation<unknown, Error, Command>>;
  decisionReason: string;
  setDecisionReason: (value: string) => void;
  decisionNote: string;
  setDecisionNote: (value: string) => void;
  valuationMinor: string;
  setValuationMinor: (value: string) => void;
  verification: {
    identityMatch: boolean;
    certificationMatch: boolean;
    gradeMatch: boolean;
    variantMatch: boolean;
  };
  setVerification: (value: typeof verification) => void;
  step?: GuideStepId;
  busy: boolean;
  receiptCondition: string;
  setReceiptCondition: (value: string) => void;
  verificationNote: string;
  setVerificationNote: (value: string) => void;
}) {
  const [confirmation, setConfirmation] = useState<Command | null>(null);
  const allowed =
    review?.allowedActions?.selfReviewForbidden || review?.reviewWorkspace?.selfReviewBlocked
      ? undefined
      : review?.allowedActions;
  const intakeActions = intake?.row.allowedActions ?? [];
  const pending = command.isPending || busy;
  const confirmationAllowed =
    confirmation === "APPROVE_SUBMISSION"
      ? allowed?.canAccept
      : confirmation === "REQUEST_CHANGES"
        ? allowed?.canRequestChanges && !!decisionNote.trim()
        : confirmation === "REJECT_SUBMISSION"
          ? allowed?.canReject && !!decisionNote.trim()
          : confirmation === "PUBLISH"
            ? operation?.availableCommands.publish
            : false;
  const confirmationLabel =
    confirmation === "APPROVE_SUBMISSION"
      ? "Approve submission"
      : confirmation === "REQUEST_CHANGES"
        ? "Request changes"
        : confirmation === "REJECT_SUBMISSION"
          ? "Reject submission"
          : "Publish asset";
  if (
    step === "reviewer" &&
    (review?.allowedActions?.selfReviewForbidden || review?.reviewWorkspace?.selfReviewBlocked)
  ) {
    return (
      <div className="asset-guide__read-only">
        <ShieldCheck aria-hidden="true" />
        <div>
          <strong>Inspection access</strong>
          <p>
            You submitted this item. Review the details and evidence using the checklist; another
            reviewer will claim it and record the decision.
          </p>
        </div>
      </div>
    );
  }
  return (
    <div className={`asset-record__action-center${step ? " is-guided" : ""}`}>
      {!step || step === "reviewer" || step === "decision" ? (
        <RecordCard title={step === "reviewer" ? "Review ownership" : "Submission decision"}>
          <div className="asset-record__action-row">
            {step !== "decision" ? (
              <>
                <button
                  className="is-primary"
                  type="button"
                  disabled={pending || !allowed?.canClaim}
                  onClick={() => command.mutate("CLAIM_REVIEW")}
                >
                  Claim review
                </button>
                <button
                  type="button"
                  disabled={pending || !allowed?.canRelease}
                  onClick={() => command.mutate("RELEASE_REVIEW")}
                >
                  Release
                </button>
              </>
            ) : null}
            {!step || (step === "decision" && review?.status === "APPROVED") ? (
              <button
                className="is-primary"
                type="button"
                disabled={pending || !review?.reviewWorkspace?.canCanonicalize}
                onClick={() => command.mutate("CANONICALIZE")}
              >
                Create canonical record
              </button>
            ) : null}
          </div>
          {!step ||
          (step === "decision" && !["APPROVED", "REJECTED"].includes(review?.status ?? "")) ? (
            <>
              <details className="asset-guide__audit-options">
                <summary>Audit reason code (advanced)</summary>
                <label>
                  Reason code
                  <input
                    value={decisionReason}
                    onChange={(event) => setDecisionReason(event.target.value)}
                  />
                </label>
              </details>
              <label>
                Decision note
                <textarea
                  value={decisionNote}
                  onChange={(event) => setDecisionNote(event.target.value)}
                  placeholder="Required context for changes or rejection."
                />
              </label>
              <div className="asset-record__action-row">
                <button
                  className="is-primary"
                  type="button"
                  disabled={pending || !allowed?.canAccept || !decisionReason.trim()}
                  onClick={() => setConfirmation("APPROVE_SUBMISSION")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  disabled={
                    pending ||
                    !allowed?.canRequestChanges ||
                    !decisionNote.trim() ||
                    !decisionReason.trim()
                  }
                  onClick={() => setConfirmation("REQUEST_CHANGES")}
                >
                  Request changes
                </button>
                <button
                  className="is-danger"
                  type="button"
                  disabled={
                    pending || !allowed?.canReject || !decisionNote.trim() || !decisionReason.trim()
                  }
                  onClick={() => setConfirmation("REJECT_SUBMISSION")}
                >
                  Reject
                </button>
              </div>
              <p>
                Request changes sends your note to the collector. Approval does not confirm physical
                receipt or publish the asset.
              </p>
            </>
          ) : null}
          <p>
            {review?.reviewWorkspace?.primaryBlocker ??
              review?.reviewPresentation?.nextActionReason ??
              "Actions depend on the saved review state and your permissions."}
          </p>
        </RecordCard>
      ) : null}
      {!step || step === "intake" || step === "verification" ? (
        <RecordCard title="Physical intake">
          {!step || step === "intake" ? (
            <>
              <label>
                Package condition at receipt
                <textarea
                  value={receiptCondition}
                  onChange={(event) => setReceiptCondition(event.target.value)}
                  placeholder="Describe the package you physically received."
                />
              </label>
              <div className="asset-record__action-row">
                <button
                  type="button"
                  disabled={pending || !intakeActions.includes("CONFIRM_DELIVERY")}
                  onClick={() => command.mutate("CONFIRM_DELIVERY")}
                >
                  Confirm delivery
                </button>
                <button
                  type="button"
                  disabled={
                    pending ||
                    !intakeActions.includes("CONFIRM_RECEIPT") ||
                    !receiptCondition.trim()
                  }
                  onClick={() => command.mutate("CONFIRM_RECEIPT")}
                >
                  Record receipt
                </button>
              </div>
              <p>
                {intake?.row.stageReason ?? "Waiting for intake to start."} {intake?.row.nextAction}
              </p>
            </>
          ) : null}
          {!step || step === "verification" ? (
            <>
              <div className="asset-record__action-row">
                <button
                  type="button"
                  disabled={pending || !intakeActions.includes("START_VERIFICATION")}
                  onClick={() => command.mutate("START_VERIFICATION")}
                >
                  Start verification
                </button>
              </div>
              <p>
                Tick only the details that match the physical item. Explain any mismatch in the
                note.
              </p>
              <div className="asset-record__check-inputs">
                {Object.entries(verification).map(([key, checked]) => (
                  <label key={key}>
                    <input
                      type="checkbox"
                      disabled={pending || !intakeActions.includes("COMPLETE_VERIFICATION")}
                      checked={checked}
                      onChange={(event) =>
                        setVerification({ ...verification, [key]: event.target.checked })
                      }
                    />
                    {sentence(key)}
                  </label>
                ))}
              </div>
              <label>
                Verification notes
                <textarea
                  value={verificationNote}
                  onChange={(event) => setVerificationNote(event.target.value)}
                  placeholder="Record what you inspected and any mismatch."
                />
              </label>
              <button
                className="is-primary"
                type="button"
                disabled={
                  pending ||
                  !intakeActions.includes("COMPLETE_VERIFICATION") ||
                  !verification.identityMatch ||
                  (!!review?.collectible?.certificationNumber &&
                    !verification.certificationMatch) ||
                  !verificationNote.trim()
                }
                onClick={() => command.mutate("COMPLETE_VERIFICATION")}
              >
                Complete physical verification
              </button>
            </>
          ) : null}
        </RecordCard>
      ) : null}
      {!step || step === "valuation" || step === "offering" ? (
        <RecordCard title="Valuation and launch">
          {!step || step === "valuation" ? (
            <>
              <label>
                Valuation (£ GBP)
                <input
                  inputMode="decimal"
                  value={valuationMinor}
                  onChange={(event) => setValuationMinor(event.target.value)}
                  placeholder="e.g. 250.00"
                />
              </label>
              <p>
                {valuationMinor && !poundsToMinor(valuationMinor)
                  ? "Enter a positive pound amount with up to two decimal places."
                  : "Enter pounds, not pence. For example, 250.00 means £250."}
              </p>
            </>
          ) : null}
          <div className="asset-record__action-row">
            {!step || step === "valuation" ? (
              <button
                type="button"
                disabled={
                  pending ||
                  !operation?.availableCommands.recordValuation ||
                  !poundsToMinor(valuationMinor)
                }
                onClick={() => command.mutate("RECORD_VALUATION")}
              >
                Record valuation
              </button>
            ) : null}
            {!step || step === "offering" ? (
              <button
                className="is-primary"
                type="button"
                disabled={pending || !operation?.availableCommands.publish}
                onClick={() => setConfirmation("PUBLISH")}
              >
                Publish asset
              </button>
            ) : null}
          </div>
          <div className="asset-record__command-matrix">
            {Object.entries(operation?.availableCommands ?? {}).map(([key, value]) => (
              <span key={key} className={value ? "is-available" : ""}>
                <i />
                {sentence(key)} <b>{value ? "Available" : "Unavailable"}</b>
              </span>
            ))}
          </div>
          {!asset ? (
            <p>Canonical asset controls become available after approval and canonicalisation.</p>
          ) : null}
        </RecordCard>
      ) : null}
      {confirmation ? (
        <div className="asset-guide__confirmation" role="group" aria-label="Confirm record change">
          <h3>{confirmationLabel}?</h3>
          <p>
            Item: <strong>{review?.collectible?.title ?? asset?.title}</strong>
          </p>
          <p>
            {confirmation === "REQUEST_CHANGES"
              ? "The collector will receive these instructions:"
              : confirmation === "REJECT_SUBMISSION"
                ? "This rejects the submission and stops its current review workflow."
                : confirmation === "PUBLISH"
                  ? "This publishes the asset when the server's publication requirements pass."
                  : "This approves the submission for the next stage. It does not launch trading."}
          </p>
          {confirmation !== "PUBLISH" ? <p>{decisionNote || "No additional note."}</p> : null}
          <div className="asset-record__action-row">
            <button type="button" onClick={() => setConfirmation(null)} disabled={pending}>
              Go back
            </button>
            <button
              type="button"
              className="is-primary"
              disabled={
                pending ||
                !confirmationAllowed ||
                (confirmation !== "PUBLISH" && !decisionReason.trim())
              }
              onClick={() =>
                command.mutate(confirmation, { onSuccess: () => setConfirmation(null) })
              }
            >
              Confirm {confirmationLabel.toLowerCase()}
            </button>
          </div>
        </div>
      ) : null}
      {command.error ? (
        <p role="alert">
          {errorMessage(command.error)} Could not confirm the change. Refresh the record before
          retrying.
        </p>
      ) : null}
      {command.isPending ? (
        <p className="asset-record__saving">Applying the audited command…</p>
      ) : null}
    </div>
  );
}

function RecordSection({
  id,
  eyebrow,
  title,
  icon,
  children,
}: {
  id: AssetRecordFocus;
  eyebrow: string;
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  const visible = useContext(VisibleSections);
  if (visible && !visible.has(id)) return null;
  return (
    <section id={`asset-record-${id}`} className="asset-record__section">
      <header>
        <span>{icon}</span>
        <div>
          <p>{eyebrow}</p>
          <h2>{title}</h2>
        </div>
      </header>
      {children}
    </section>
  );
}

function RecordCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="asset-record__card">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function DefinitionGrid({
  values,
  compact = false,
}: {
  values: Array<[string, ReactNode]>;
  compact?: boolean;
}) {
  return (
    <dl className={`asset-record__definitions${compact ? " is-compact" : ""}`}>
      {values.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{present(value)}</dd>
        </div>
      ))}
    </dl>
  );
}

function Fact({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="asset-record__fact">
      <dt>{label}</dt>
      <dd>{present(value)}</dd>
    </div>
  );
}

function Status({
  value,
  tone = "neutral",
}: {
  value: string;
  tone?: "neutral" | "mint" | "amber";
}) {
  return <span className={`asset-record__status is-${tone}`}>{sentence(value)}</span>;
}

function Empty({ title = "Not recorded", text }: { title?: string; text: string }) {
  return (
    <div className="asset-record__empty">
      <Box />
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="asset-record__table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{present(cell)}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RecordState({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="asset-record__state">
      <PackageCheck />
      <h2>{title}</h2>
      <p>{detail}</p>
    </div>
  );
}

function lifecycleRows(
  asset: AdminCollectibleDetail | null,
  review: SubmissionReviewDetail | null,
  intake: AdminIntakeDetail | null,
  operation: AssetOperationDetailProjection | null,
) {
  return [
    {
      label: "Submission",
      value: review?.status ?? asset?.dossier.provenance?.submissionStatus ?? "Not started",
      detail: review?.readiness?.state ? sentence(review.readiness.state) : "Collector source",
      tone: review ? "current" : "future",
    },
    {
      label: "Physical intake",
      value: intake?.row.stageLabel ?? asset?.dossier.snapshot.physical ?? "Not started",
      detail: intake?.row.nextAction ?? "Destination and receipt",
      tone: intake?.intake ? "current" : "future",
    },
    {
      label: "Verification",
      value:
        intake?.intake?.verification?.status ??
        asset?.dossier.snapshot.verification ??
        "Not started",
      detail: "Identity and physical truth",
      tone: asset?.verification.verifiedAt ? "complete" : "future",
    },
    {
      label: "Valuation",
      value:
        asset?.dossier.snapshot.valuation ??
        (review?.staffReview?.valuation ? "Review valuation" : "Not started"),
      detail: asset?.valuation.current
        ? money(asset.valuation.current.minor, asset.valuation.current.currency)
        : "Staff decision",
      tone: asset?.valuation.current ? "complete" : "future",
    },
    {
      label: "Ownership",
      value: asset?.dossier.snapshot.ownership ?? "Not started",
      detail: asset?.ownership.totalUnits
        ? `${asset.ownership.totalUnits} total units`
        : "Slice issuance",
      tone: asset?.ownership.totalUnits ? "complete" : "future",
    },
    {
      label: "Offering / market",
      value: asset?.dossier.snapshot.market ?? operation?.operations.stage ?? "Not started",
      detail: asset?.market.trading?.status ?? "Launch readiness",
      tone: asset?.market.trading?.tradingEnabled ? "complete" : "future",
    },
  ];
}

function collectBlockers(
  review: SubmissionReviewDetail | null,
  asset: AdminCollectibleDetail | null,
  intake: AdminIntakeDetail | null,
  operation: AssetOperationDetailProjection | null,
) {
  return Array.from(
    new Set([
      ...(review?.readiness?.blockers ?? []),
      ...(review?.reviewWorkspace?.blockingIssues ?? []),
      ...(intake?.row.issues.map((issue) => issue.label) ?? []),
      ...(asset?.dossier.restrictions.map((item) => item.reason) ?? []),
      ...(operation?.operations.blockers ?? []),
    ]),
  ).filter(Boolean);
}

function nextAssetAction(
  review: SubmissionReviewDetail | null,
  intake: AdminIntakeDetail | null,
  operation: AssetOperationDetailProjection | null,
): { label: string; detail: string; focus: AssetRecordFocus } {
  if (review && !review.assetId && review.readiness?.nextAction !== "COMPLETE")
    return {
      label: sentence(review.readiness?.nextAction ?? "Review submission"),
      detail:
        review.reviewPresentation?.nextActionReason ??
        review.readiness?.blockers[0] ??
        "Continue the submission review.",
      focus: "actions",
    };
  if (intake && intake.row.nextActor !== "NONE")
    return { label: intake.row.nextAction, detail: intake.row.stageReason, focus: "intake" };
  if (operation && operation.operations.nextActor !== "NONE")
    return {
      label: operation.operations.nextAction.label,
      detail: operation.operations.blockers[0]
        ? sentence(operation.operations.blockers[0])
        : "Continue the asset lifecycle.",
      focus: operation.operations.nextAction.target === "VALUATION" ? "valuation" : "actions",
    };
  return {
    label: "Monitor asset",
    detail: "No active staff action is required.",
    focus: "summary",
  };
}

function submissionIdentity(review: SubmissionReviewDetail | null): Array<[string, ReactNode]> {
  const metadata = review?.declaredMetadata ?? {};
  const value = (key: string) => {
    const field = metadata[key];
    return typeof field === "string" || typeof field === "number" ? field : null;
  };
  return [
    ["Title", value("name")],
    ["Year", value("year")],
    ["Set", value("set")],
    ["Card number", value("cardNumber")],
    ["Variant", value("variant")],
    ["Grader", value("grader")],
    ["Grade", value("grade")],
    ["Certification", value("certificationNumber")],
  ];
}

function canonicalIdentity(
  asset: AdminCollectibleDetail | null,
  review: SubmissionReviewDetail | null,
): Array<[string, ReactNode]> {
  return [
    ["Title", asset?.title ?? review?.collectible?.title],
    ["Category", asset?.identity.category ?? review?.collectible?.category],
    ["Year", asset?.identity.year ?? review?.collectible?.year],
    ["Set", asset?.identity.set ?? review?.collectible?.set],
    ["Card number", asset?.identity.cardNumber ?? review?.collectible?.cardNumber],
    ["Variant", asset?.identity.variant ?? review?.collectible?.variant],
    [
      "Grading",
      asset?.grading
        ? `${asset.grading.company} ${asset.grading.grade}`
        : review?.collectible?.grader,
    ],
    [
      "Certification",
      asset?.grading?.certificationNumber ?? review?.collectible?.certificationNumber,
    ],
  ];
}

function intakeFacts(
  detail: AdminIntakeDetail | null,
  asset: AdminCollectibleDetail | null,
): Array<[string, ReactNode]> {
  return [
    ["Destination", detail?.intake?.destination.displayName ?? asset?.intake?.vault],
    ["Delivery method", detail?.intake?.deliveryMethod ?? asset?.intake?.deliveryMethod],
    ["Carrier", detail?.intake?.shipment?.carrier ?? asset?.intake?.carrier],
    ["Tracking", detail?.intake?.shipment?.trackingNumber ?? asset?.intake?.tracking],
    ["Carrier delivery", date(detail?.intake?.shipment?.deliveredAt ?? asset?.intake?.deliveredAt)],
    [
      "Physical receipt",
      date(detail?.intake?.receipt?.confirmedAt ?? asset?.intake?.receiptConfirmedAt),
    ],
    ["Custody status", detail?.custody?.status ?? asset?.custody.status],
    ["Custody location", asset?.custody.location],
    ["Open exceptions", detail?.intake?.exceptions.filter((item) => !item.resolvedAt).length ?? 0],
  ];
}

function verificationFacts(
  review: SubmissionReviewDetail | null,
  intake: AdminIntakeDetail | null,
  asset: AdminCollectibleDetail | null,
): Array<[string, ReactNode]> {
  const physical = intake?.intake?.verification;
  return [
    [
      "Review identity",
      review?.readiness?.progress.find((item) => item.key === "identity")?.status,
    ],
    ["Evidence", review?.evidenceSummary?.status],
    [
      "Certification",
      review?.certificationVerification?.status ?? asset?.grading?.certificationNumber,
    ],
    ["Physical verification", physical?.status ?? asset?.verification.status],
    ["Identity match", boolean(physical?.identityMatch)],
    ["Certification match", boolean(physical?.certificationMatch)],
    ["Grade match", boolean(physical?.gradeMatch)],
    ["Variant match", boolean(physical?.variantMatch)],
    ["Verified at", date(physical?.completedAt ?? asset?.verification.verifiedAt)],
  ];
}

function valuationFacts(
  review: SubmissionReviewDetail | null,
  asset: AdminCollectibleDetail | null,
): Array<[string, ReactNode]> {
  return [
    [
      "Current valuation",
      asset?.valuation.current
        ? money(asset.valuation.current.minor, asset.valuation.current.currency)
        : review?.staffReview?.valuation
          ? money(review.staffReview.valuation.valueMinor, review.staffReview.valuation.currency)
          : null,
    ],
    [
      "Status",
      asset?.dossier.snapshot.valuation ??
        (review?.staffReview?.valuation ? "Review-stage" : "Not started"),
    ],
    ["Method", asset?.valuation.current?.method ?? review?.staffReview?.valuation?.basis],
    [
      "Confidence",
      review?.staffReview?.valuation?.confidence
        ? `${review.staffReview.valuation.confidence}%`
        : null,
    ],
    ["As of", date(asset?.valuation.current?.asOf ?? review?.staffReview?.valuation?.updatedAt)],
    [
      "Market references",
      asset?.valuation.marketData.references.length ?? review?.researchReferences?.length ?? 0,
    ],
  ];
}

function ownershipFacts(asset: AdminCollectibleDetail | null): Array<[string, ReactNode]> {
  return [
    ["State", asset?.dossier.snapshot.ownership],
    ["Policy", asset?.issuance?.policy.label],
    ["Total units", asset?.ownership.totalUnits],
    ["Issued units", asset?.ownership.issuedUnits],
    ["Available units", asset?.ownership.availableUnits],
    ["Owners", asset?.ownership.ownerCount],
    [
      "Issuance readiness",
      asset?.issuance?.readiness.ready ? "Ready" : asset?.issuance?.readiness.blockers.join(", "),
    ],
  ];
}

function offeringFacts(
  asset: AdminCollectibleDetail | null,
  operation: AssetOperationDetailProjection | null,
): Array<[string, ReactNode]> {
  return [
    ["Lifecycle stage", operation?.operations.stage ?? asset?.lifecycle.current],
    ["Offering", asset?.initialOffering?.status ?? "Not created"],
    ["Offered units", asset?.initialOffering?.offeredUnits],
    [
      "Price per unit",
      asset?.initialOffering
        ? money(asset.initialOffering.pricePerUnitMinor, asset.initialOffering.currency)
        : null,
    ],
    ["Publication", asset?.market.publication],
    ["Market", asset?.market.trading?.status ?? "Not created"],
    ["Launch readiness", operation?.launchReadiness.state ?? asset?.market.readiness.status],
    ["Trading enabled", boolean(asset?.market.trading?.tradingEnabled)],
  ];
}

function moneyFacts(asset: AdminCollectibleDetail | null): Array<[string, ReactNode]> {
  return [
    [
      "Collector proceeds posted",
      asset?.initialOffering
        ? money(asset.initialOffering.proceeds.postedMinor, asset.initialOffering.proceeds.currency)
        : null,
    ],
    [
      "Collector proceeds reserved",
      asset?.initialOffering
        ? money(
            asset.initialOffering.proceeds.reservedMinor,
            asset.initialOffering.proceeds.currency,
          )
        : null,
    ],
    [
      "Collector proceeds available",
      asset?.initialOffering
        ? money(
            asset.initialOffering.proceeds.availableMinor,
            asset.initialOffering.proceeds.currency,
          )
        : null,
    ],
    ["Treasury settled units", asset?.treasuryLiquidity?.settledUnits],
    ["Treasury reserved units", asset?.treasuryLiquidity?.reservedUnits],
    ["Open treasury orders", asset?.treasuryLiquidity?.openSellOrders],
    ["Market status", asset?.treasuryLiquidity?.marketStatus],
  ];
}

function combinedHistory(
  review: SubmissionReviewDetail | null,
  asset: AdminCollectibleDetail | null,
  intake: AdminIntakeDetail | null,
): ReactNode[][] {
  const rows = [
    ...(review?.activity ?? []).map((item) => ({
      at: item.occurredAt,
      event: sentence(item.action),
      actor: item.actor,
      source: "Submission",
    })),
    ...(intake?.history ?? []).map((item) => ({
      at: item.occurredAt,
      event: sentence(item.action),
      actor: item.actor ?? "System",
      source: sentence(item.source),
    })),
    ...(asset?.activity ?? []).map((item) => ({
      at: item.occurredAt,
      event: sentence(item.action),
      actor: item.actor,
      source: "Canonical asset",
    })),
  ];
  return rows
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .map((item) => [dateTime(item.at), item.event, item.actor, item.source]);
}

function identityLine(asset: AdminCollectibleDetail | null, review: SubmissionReviewDetail | null) {
  return (
    [
      asset?.identity.year ?? review?.collectible?.year,
      asset?.identity.set ?? review?.collectible?.set,
      asset?.identity.cardNumber ?? review?.collectible?.cardNumber,
    ]
      .filter(Boolean)
      .join(" · ") || "Identity pending review"
  );
}

function present(value: ReactNode) {
  return value === null || value === undefined || value === "" ? "Not recorded" : value;
}

function mediaSource(value: unknown) {
  if (!value || typeof value !== "object") return null;
  const item = value as { url?: unknown; previewUrl?: unknown; thumbnailUrl?: unknown };
  for (const source of [item.url, item.previewUrl, item.thumbnailUrl]) {
    if (typeof source === "string" && source.length > 0) return source;
  }
  return null;
}

function boolean(value: boolean | null | undefined) {
  return value === null || value === undefined ? "Not recorded" : value ? "Yes" : "No";
}

function sentence(value: unknown) {
  return String(value ?? "Not recorded")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function money(minor: string, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
    Number(minor) / 100,
  );
}

function date(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(
        parsed,
      );
}

function dateTime(value: string) {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? value
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsed);
}

function errorMessage(value: unknown) {
  return value instanceof Error
    ? value.message
    : "The command could not be completed. No state was changed.";
}
