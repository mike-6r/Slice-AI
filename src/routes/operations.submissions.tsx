import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardCheck,
  FileClock,
  HeartPulse,
  HelpCircle,
  Inbox,
  LayoutDashboard,
  LogOut,
  MessageSquarePlus,
  Plus,
  Pencil,
  RefreshCw,
  RotateCcw,
  Tag,
  Users,
  WalletCards,
  X,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ApiError } from "@/api/http-client";
import { logout } from "@/auth/actions";
import { useSession } from "@/auth/use-session";
import type { SubmissionReviewDetail } from "@/domain";
import { AdminReviewMedia } from "@/components/admin/AdminReviewMedia";
import { Wordmark } from "@/components/layout/MainNavigation";
import { useAppServices } from "@/providers/AppServicesProvider";
import type { AdminSection } from "./-admin-route-state";

export const Route = createFileRoute("/operations/submissions")({
  validateSearch: (search: Record<string, unknown>) => ({
    submission: typeof search.submission === "string" ? search.submission : undefined,
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
  }),
  component: SubmissionOperationsPage,
});

type Decision = "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";

const DECISION_REASON_OPTIONS: Record<Decision, Array<{ value: string; label: string }>> = {
  APPROVED: [
    { value: "REVIEW_COMPLETE", label: "All required checks complete" },
    { value: "IDENTITY_CONFIRMED", label: "Identity confirmed" },
    { value: "EVIDENCE_CONFIRMED", label: "Evidence confirmed" },
    { value: "READY_FOR_NEXT_STEP", label: "Ready for the next workflow step" },
    { value: "OTHER", label: "Other approval basis" },
  ],
  CHANGES_REQUESTED: [
    { value: "INCOMPLETE_EVIDENCE", label: "Incomplete evidence" },
    { value: "IDENTITY_UNCLEAR", label: "Identity needs attention" },
    { value: "UNSUPPORTED_COLLECTIBLE", label: "Unsupported collectible" },
    { value: "DUPLICATE_SUBMISSION", label: "Possible duplicate" },
    { value: "OTHER", label: "Other" },
  ],
  REJECTED: [
    { value: "INCOMPLETE_EVIDENCE", label: "Incomplete evidence" },
    { value: "IDENTITY_UNCLEAR", label: "Identity needs attention" },
    { value: "UNSUPPORTED_COLLECTIBLE", label: "Unsupported collectible" },
    { value: "DUPLICATE_SUBMISSION", label: "Possible duplicate" },
    { value: "OTHER", label: "Other" },
  ],
};

function openDecisionDialog(
  value: Decision,
  setReason: (reason: string) => void,
  setDecision: (decision: Decision) => void,
) {
  setReason(DECISION_REASON_OPTIONS[value][0].value);
  setDecision(value);
}

export function SubmissionOperationsPage() {
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const navigate = Route.useNavigate();
  const { submission: initial } = Route.useSearch();
  const currentUser = useQuery({
    queryKey: ["user", "current"],
    queryFn: () => services.repositories.users.getCurrentUser(),
    enabled: session.isAuthenticated,
    staleTime: 60_000,
  });
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const [guidedStep, setGuidedStep] = useState<string | null>(null);
  const [condition, setCondition] = useState("");
  const [conditionNote, setConditionNote] = useState("");
  const [valuation, setValuation] = useState("");
  const [basis, setBasis] = useState("External reference and staff assessment");
  const [confidence, setConfidence] = useState("80");
  const [note, setNote] = useState("");
  const [identityNote, setIdentityNote] = useState("");
  const [reviewIdentity, setReviewIdentity] = useState({
    name: "",
    year: "",
    set: "",
    cardNumber: "",
    variant: "",
  });
  const [findingTitle, setFindingTitle] = useState("");
  const [findingDetail, setFindingDetail] = useState("");
  const [findingSection, setFindingSection] = useState<
    "identity" | "evidence" | "certification" | "research" | "assessment" | "decision"
  >("assessment");
  const [findingSeverity, setFindingSeverity] = useState<"ADVISORY" | "BLOCKING">("ADVISORY");
  const [findingCustomerAction, setFindingCustomerAction] = useState(false);
  const [findingResolutionNote, setFindingResolutionNote] = useState("");
  const [certVerifiedGrade, setCertVerifiedGrade] = useState("");
  const [certVerifiedName, setCertVerifiedName] = useState("");
  const [certVerifiedYear, setCertVerifiedYear] = useState("");
  const [certVerifiedSet, setCertVerifiedSet] = useState("");
  const [certVerifiedCardNumber, setCertVerifiedCardNumber] = useState("");
  const [certDesignation, setCertDesignation] = useState("");
  const [certProviderReference, setCertProviderReference] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("REVIEW_COMPLETE");
  const [requestedItems, setRequestedItems] = useState<string[]>(["Front image"]);
  const [message, setMessage] = useState("");
  const [internalDecisionNote, setInternalDecisionNote] = useState("");
  const [focusedMedia, setFocusedMedia] = useState<string | null>(null);
  const [flaggedMedia, setFlaggedMedia] = useState<string | null>(null);
  const [flagNote, setFlagNote] = useState("");
  const [identityOpen, setIdentityOpen] = useState(false);
  const [certOpen, setCertOpen] = useState(false);
  const [findingOpen, setFindingOpen] = useState(false);
  const [researchOpen, setResearchOpen] = useState(false);
  const [researchNoteOpen, setResearchNoteOpen] = useState(false);
  const [conditionOpen, setConditionOpen] = useState(false);
  const [valuationOpen, setValuationOpen] = useState(false);
  const [notesOpen, setNotesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [staleReview, setStaleReview] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryReason, setRecoveryReason] = useState("");
  const [assignmentOpen, setAssignmentOpen] = useState(false);
  const [assignmentReviewerId, setAssignmentReviewerId] = useState("");
  const [assignmentReason, setAssignmentReason] = useState("");
  const [requestedFindingIds, setRequestedFindingIds] = useState<string[]>([]);
  const [researchProvider, setResearchProvider] = useState("");
  const [researchUrl, setResearchUrl] = useState("");
  const [researchReferenceId, setResearchReferenceId] = useState("");
  const [researchCurrency, setResearchCurrency] = useState("");
  const [researchValueMinor, setResearchValueMinor] = useState("");
  const [researchNote, setResearchNote] = useState("");
  const refresh = () => void client.invalidateQueries({ queryKey: ["review"] });
  const queue = useQuery({
    queryKey: ["review", "queue", "detail-navigation"],
    queryFn: () => services.repositories.reviews.listQueue({ limit: 10 }),
    enabled: session.isAuthenticated,
  });
  const detail = useQuery({
    queryKey: ["review", selected],
    queryFn: () => services.repositories.reviews.getDetail(selected!),
    enabled: Boolean(selected) && session.isAuthenticated,
  });
  const eligibleReviewers = useQuery({
    queryKey: ["review", selected, "eligible-reviewers"],
    queryFn: () => services.repositories.reviews.listEligibleReviewers(selected!),
    enabled: Boolean(selected) && session.isAuthenticated && assignmentOpen,
  });
  useEffect(() => {
    const collectible = detail.data?.collectible;
    if (!collectible) return;
    setReviewIdentity({
      name: collectible.title ?? "",
      year: collectible.year ?? "",
      set: collectible.set ?? "",
      cardNumber: collectible.cardNumber ?? "",
      variant: collectible.variant ?? "",
    });
    setCertVerifiedGrade(collectible.grade ?? "");
    setCertVerifiedName(collectible.title ?? "");
    setCertVerifiedYear(collectible.year ?? "");
    setCertVerifiedSet(collectible.set ?? "");
    setCertVerifiedCardNumber(collectible.cardNumber ?? "");
  }, [detail.data?.version, selected]);
  const claim = useMutation({
    mutationFn: (id: string) => services.repositories.reviews.claim(id, detail.data?.version ?? 0),
    onSuccess: () => {
      refresh();
      focusReviewStep("evidence");
    },
  });
  const release = useMutation({
    mutationFn: (id: string) =>
      services.repositories.reviews.release(id, detail.data?.version ?? 0),
    onSuccess: refresh,
  });
  const assignReviewer = useMutation({
    mutationFn: () =>
      services.repositories.reviews.assignReviewer(selected!, {
        version: detail.data?.version ?? 0,
        reviewerId: assignmentReviewerId || null,
        ...(assignmentReason.trim() ? { reason: assignmentReason.trim() } : {}),
      }),
    onSuccess: () => {
      setAssignmentOpen(false);
      setAssignmentReason("");
      refresh();
    },
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const acceptEvidence = useMutation({
    mutationFn: (mediaId: string) =>
      services.repositories.reviews.acceptEvidence(selected!, mediaId, {
        version: detail.data?.version ?? 0,
      }),
    onSuccess: refresh,
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const flagEvidence = useMutation({
    mutationFn: ({ mediaId, note }: { mediaId: string; note?: string }) =>
      services.repositories.reviews.flagEvidence(selected!, mediaId, {
        version: detail.data?.version ?? 0,
        ...(note ? { note, customerAction: true } : { customerAction: true }),
      }),
    onSuccess: refresh,
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const saveCondition = useMutation({
    mutationFn: () =>
      services.repositories.reviews.saveCondition(selected!, {
        version: detail.data?.version ?? 0,
        condition: condition.trim(),
        ...(conditionNote.trim() ? { note: conditionNote.trim() } : {}),
      }),
    onSuccess: refresh,
  });
  const saveValuation = useMutation({
    mutationFn: () =>
      services.repositories.reviews.saveValuation(selected!, {
        version: detail.data?.version ?? 0,
        valueMinor: String(Math.round(Number(valuation) * 100)),
        currency: "GBP",
        basis: basis.trim(),
        confidence: Number(confidence),
      }),
    onSuccess: refresh,
  });
  const saveNote = useMutation({
    mutationFn: () =>
      services.repositories.reviews.saveNote(selected!, {
        version: detail.data?.version ?? 0,
        note,
      }),
    onSuccess: () => {
      setNotesOpen(false);
      refresh();
    },
  });
  const saveIdentity = useMutation({
    mutationFn: () =>
      services.repositories.reviews.saveIdentity(selected!, {
        version: detail.data?.version ?? 0,
        name: reviewIdentity.name.trim(),
        ...(reviewIdentity.year.trim() ? { year: reviewIdentity.year.trim() } : {}),
        ...(reviewIdentity.set.trim() ? { set: reviewIdentity.set.trim() } : {}),
        ...(reviewIdentity.cardNumber.trim()
          ? { cardNumber: reviewIdentity.cardNumber.trim() }
          : {}),
        ...(reviewIdentity.variant.trim() ? { variant: reviewIdentity.variant.trim() } : {}),
        note: identityNote.trim(),
      }),
    onSuccess: () => {
      setIdentityNote("");
      refresh();
    },
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const createFinding = useMutation({
    mutationFn: (input: {
      section: "identity" | "evidence" | "certification" | "research" | "assessment" | "decision";
      title: string;
      detail?: string;
      severity: "ADVISORY" | "BLOCKING";
      customerAction?: boolean;
    }) =>
      services.repositories.reviews.createFinding(selected!, {
        version: detail.data?.version ?? 0,
        ...input,
      }),
    onSuccess: () => {
      setFindingTitle("");
      setFindingDetail("");
      setFindingCustomerAction(false);
      refresh();
    },
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const updateFinding = useMutation({
    mutationFn: ({
      findingId,
      status,
    }: {
      findingId: string;
      status: "OPEN" | "RESOLVED" | "DISMISSED";
    }) =>
      services.repositories.reviews.updateFinding(selected!, findingId, {
        version: detail.data?.version ?? 0,
        status,
        ...(findingResolutionNote.trim() ? { resolutionNote: findingResolutionNote.trim() } : {}),
      }),
    onSuccess: () => {
      setFindingResolutionNote("");
      refresh();
    },
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const verifyCertification = useMutation({
    mutationFn: () =>
      services.repositories.reviews.manualVerifyCertification(selected!, {
        verifiedIdentity: {
          name: certVerifiedName.trim(),
          year: certVerifiedYear.trim(),
          set: certVerifiedSet.trim(),
          cardNumber: certVerifiedCardNumber.trim(),
          companyCode: detail.data?.collectible?.grader ?? "",
        },
        verifiedGrade: certVerifiedGrade.trim(),
        ...(certDesignation.trim() ? { designation: certDesignation.trim() } : {}),
        ...(certProviderReference.trim()
          ? { providerReference: certProviderReference.trim() }
          : {}),
      }),
    onSuccess: refresh,
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const recalculateReadiness = useMutation({
    mutationFn: () =>
      services.repositories.reviews.recalculateReadiness(selected!, {
        version: detail.data?.version ?? 0,
        reason: recoveryReason.trim(),
      }),
    onSuccess: () => {
      setRecoveryOpen(false);
      setRecoveryReason("");
      refresh();
    },
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const decide = useMutation({
    mutationFn: (value: Decision) =>
      services.repositories.reviews.decide(selected!, value, {
        version: detail.data?.version ?? 0,
        reasonCode: reason,
        ...(internalDecisionNote.trim() ? { note: internalDecisionNote.trim() } : {}),
        ...(value === "CHANGES_REQUESTED"
          ? { requestedItems, requestedFindingIds, customerMessage: message.trim() }
          : {}),
      }),
    onSuccess: () => {
      setDecision(null);
      setMessage("");
      setInternalDecisionNote("");
      refresh();
    },
    onError: (error) => {
      if (isStaleReviewError(error)) setStaleReview(true);
    },
  });
  const canonicalize = useMutation({
    mutationFn: () =>
      services.repositories.reviews.canonicalize(selected!, detail.data?.version ?? 0),
    onSuccess: refresh,
  });
  const addResearchReference = useMutation({
    mutationFn: () =>
      services.repositories.reviews.addResearchReference(selected!, {
        version: detail.data?.version ?? 0,
        provider: researchProvider.trim(),
        ...(researchUrl.trim() ? { url: researchUrl.trim() } : {}),
        ...(researchReferenceId.trim() ? { referenceId: researchReferenceId.trim() } : {}),
        ...(researchCurrency.trim() ? { currency: researchCurrency.trim().toUpperCase() } : {}),
        ...(researchValueMinor.trim() && /^\d+(\.\d{1,2})?$/.test(researchValueMinor.trim())
          ? { valueMinor: String(Math.round(Number(researchValueMinor) * 100)) }
          : {}),
        ...(researchNote.trim() ? { note: researchNote.trim() } : {}),
      }),
    onSuccess: () => {
      setResearchProvider("");
      setResearchUrl("");
      setResearchReferenceId("");
      setResearchCurrency("");
      setResearchValueMinor("");
      setResearchNote("");
      refresh();
    },
  });
  const removeResearchReference = useMutation({
    mutationFn: (referenceId: string) =>
      services.repositories.reviews.removeResearchReference(selected!, referenceId, {
        version: detail.data?.version ?? 0,
        note: "Removed by reviewer as incorrect reference.",
      }),
    onSuccess: refresh,
  });
  const addResearchNote = useMutation({
    mutationFn: () =>
      services.repositories.reviews.addResearchNote(selected!, {
        version: detail.data?.version ?? 0,
        note: researchNote.trim(),
      }),
    onSuccess: () => {
      setResearchNote("");
      refresh();
    },
  });
  const navigation = useMemo(() => {
    const items = queue.data?.items ?? [];
    return {
      items,
      index: items.findIndex((item) => item.id === selected),
      total: queue.data?.pagination.total ?? 0,
    };
  }, [queue.data, selected]);
  const choose = (id: string) => {
    setSelected(id);
    setGuidedStep(null);
    setStaleReview(false);
    void navigate({ search: { submission: id } });
  };
  const focusReviewStep = (step: string) => {
    setGuidedStep(step);
    window.setTimeout(() => {
      const section = document.querySelector<HTMLDetailsElement>(
        `#review-workflow details[data-review-step="${step}"]`,
      );
      if (!section) return;
      section.open = true;
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 0);
  };

  if (!session.isAuthenticated)
    return (
      <PageState
        title="Reviewer access required"
        detail="Sign in with an authorized staff account to review submissions."
      />
    );
  if (!selected)
    return (
      <ReviewShell user={currentUser.data}>
        <PageState
          title="Select a submission"
          detail="Open a submission from Review Queue to begin guided review."
        />
      </ReviewShell>
    );
  if (detail.isLoading)
    return (
      <ReviewShell user={currentUser.data}>
        <ReviewLoadingSkeleton />
      </ReviewShell>
    );
  if (detail.isError || !detail.data)
    return (
      <ReviewShell user={currentUser.data}>
        <PageState
          title="Submission review unavailable"
          detail={friendlyError(detail.error)}
          retry={() => void detail.refetch()}
        />
      </ReviewShell>
    );

  const review = detail.data;
  const canEdit = commandAllowed(review, "canRecordAssessment") && !staleReview;
  const position =
    navigation.index >= 0
      ? String(navigation.index + 1) + " of " + String(navigation.total)
      : "Review queue";
  const next = navigation.index >= 0 ? navigation.items[navigation.index + 1] : undefined;
  const previous = navigation.index > 0 ? navigation.items[navigation.index - 1] : undefined;
  return (
    <ReviewShell user={currentUser.data}>
      <section className="admin-review-workspace">
        <ReviewWorkspaceToolbar
          position={position}
          previous={previous?.id}
          next={next?.id}
          choose={choose}
        />
        <div className="admin-review-workspace-grid">
          <main className="admin-review-workspace-main">
            <ReviewHeader detail={review} />
            <ReviewNextAction
              detail={review}
              starting={claim.isPending}
              onStartReview={() => claim.mutate(selected)}
              onReviewEvidence={() => focusReviewStep("evidence")}
              onDecision={(value) => openDecisionDialog(value, setReason, setDecision)}
              error={claim.error}
            />
            {review.status === "APPROVED" ? (
              <PostApproval
                detail={review}
                onCanonicalize={() => canonicalize.mutate()}
                canonicalizing={canonicalize.isPending}
                error={canonicalize.error}
              />
            ) : null}
            <Progress detail={review} />
            <ReviewOverview
              detail={review}
              canAssign={
                (commandAllowed(review, "canAssignReviewer") ||
                  Boolean(review.reviewWorkspace?.canRelease)) &&
                !staleReview
              }
              onAssign={() => {
                setAssignmentReviewerId(review.reviewAssignment?.reviewer?.id ?? "");
                setAssignmentOpen(true);
              }}
              assigning={assignReviewer.isPending}
              canAddFinding={commandAllowed(review, "canAddFinding") && !staleReview}
              onAddFinding={() => setFindingOpen(true)}
            />
            <section
              id="review-workflow"
              className="admin-panel-card admin-review-workflow"
              aria-labelledby="review-workflow-title"
            >
              <header className="admin-review-workflow-heading">
                <div>
                  <h2 id="review-workflow-title">Review workflow</h2>
                </div>
                <div className="admin-review-workflow-controls">
                  <button
                    type="button"
                    className="admin-review-expand-all"
                    onClick={() =>
                      document
                        .querySelectorAll<HTMLDetailsElement>("#review-workflow details")
                        .forEach((section) => {
                          section.open = true;
                        })
                    }
                  >
                    Expand all
                  </button>
                </div>
              </header>
              <ReviewSection title="Identity" detail={review} step="identity" number={1}>
                <Identity
                  detail={review}
                  canEdit={canEdit}
                  reviewIdentity={reviewIdentity}
                  onEdit={() => setIdentityOpen(true)}
                />
              </ReviewSection>
              <ReviewSection
                title="Evidence"
                detail={review}
                step="evidence"
                number={2}
                open={guidedStep === "evidence" ? true : undefined}
              >
                <Evidence
                  detail={review}
                  canEdit={canEdit}
                  onFocus={setFocusedMedia}
                  onAccept={(item) => acceptEvidence.mutate(item.id)}
                  onFlag={(item) => setFlaggedMedia(item.id)}
                  actingOnEvidence={acceptEvidence.isPending || flagEvidence.isPending}
                />
              </ReviewSection>
              <ReviewSection
                title="Grade & Certification"
                detail={review}
                step="certification"
                number={3}
              >
                <Certification
                  detail={review}
                  canEdit={canEdit}
                  verifiedGrade={certVerifiedGrade}
                  setVerifiedGrade={setCertVerifiedGrade}
                  verifiedName={certVerifiedName}
                  setVerifiedName={setCertVerifiedName}
                  verifiedYear={certVerifiedYear}
                  setVerifiedYear={setCertVerifiedYear}
                  verifiedSet={certVerifiedSet}
                  setVerifiedSet={setCertVerifiedSet}
                  verifiedCardNumber={certVerifiedCardNumber}
                  setVerifiedCardNumber={setCertVerifiedCardNumber}
                  designation={certDesignation}
                  setDesignation={setCertDesignation}
                  providerReference={certProviderReference}
                  setProviderReference={setCertProviderReference}
                  onVerify={() => verifyCertification.mutate()}
                  onEdit={() => setCertOpen(true)}
                  verifying={verifyCertification.isPending}
                />
              </ReviewSection>
              <ReviewSection title="Research" detail={review} step="research" number={4}>
                <Research
                  detail={review}
                  canEdit={canEdit}
                  provider={researchProvider}
                  setProvider={setResearchProvider}
                  url={researchUrl}
                  setUrl={setResearchUrl}
                  referenceId={researchReferenceId}
                  setReferenceId={setResearchReferenceId}
                  currency={researchCurrency}
                  setCurrency={setResearchCurrency}
                  valueMinor={researchValueMinor}
                  setValueMinor={setResearchValueMinor}
                  note={researchNote}
                  setNote={setResearchNote}
                  onAddReference={() => addResearchReference.mutate()}
                  onAddNote={() => setResearchNoteOpen(true)}
                  onRemoveReference={(id) => removeResearchReference.mutate(id)}
                  onOpenReference={() => setResearchOpen(true)}
                  saving={addResearchReference.isPending || addResearchNote.isPending}
                />
              </ReviewSection>
              <ReviewSection title="Staff Assessment" detail={review} step="assessment" number={5}>
                <CompactAssessment
                  detail={review}
                  canEdit={canEdit}
                  onRecordCondition={() => setConditionOpen(true)}
                  onRecordValuation={() => setValuationOpen(true)}
                />
              </ReviewSection>
              <ReviewSection title="Decision" detail={review} step="decision" number={6}>
                <DecisionWorkspace
                  detail={review}
                  onDecision={(value) => openDecisionDialog(value, setReason, setDecision)}
                  canApprove={commandAllowed(review, "canApprove") && !staleReview}
                  canRequestChanges={commandAllowed(review, "canRequestChanges") && !staleReview}
                  canReject={commandAllowed(review, "canReject") && !staleReview}
                />
              </ReviewSection>
            </section>
            <ReviewNotes
              detail={review}
              open={notesOpen}
              onOpen={() => setNotesOpen(true)}
              onClose={() => setNotesOpen(false)}
              note={note}
              setNote={setNote}
              onSave={() => saveNote.mutate()}
              canEdit={canEdit}
              saving={saveNote.isPending}
            />
            <ReviewHistory detail={review} />
          </main>
          <DecisionRail
            detail={review}
            staleReview={staleReview}
            onRefresh={() => {
              setStaleReview(false);
              void detail.refetch();
            }}
            onClaim={() => claim.mutate(selected)}
            claiming={claim.isPending}
            onRelease={() => release.mutate(selected)}
            releasing={release.isPending}
            onRecovery={() => setRecoveryOpen(true)}
            onNotes={() => setNotesOpen(true)}
            onFinding={() => setFindingOpen(true)}
            onHelp={() => setHelpOpen(true)}
            onManage={() => setManageOpen(true)}
            onAssignment={() => {
              setAssignmentReviewerId(review.reviewAssignment?.reviewer?.id ?? "");
              setAssignmentOpen(true);
            }}
            onCanonicalize={() => canonicalize.mutate()}
            canonicalizing={canonicalize.isPending}
            onDecision={(value) => openDecisionDialog(value, setReason, setDecision)}
          />
        </div>
        {decision ? (
          <DecisionDialog
            decision={decision}
            findings={review.reviewFindings ?? []}
            reason={reason}
            setReason={setReason}
            requestedItems={requestedItems}
            setRequestedItems={setRequestedItems}
            message={message}
            setMessage={setMessage}
            internalNote={internalDecisionNote}
            setInternalNote={setInternalDecisionNote}
            requestedFindingIds={requestedFindingIds}
            setRequestedFindingIds={setRequestedFindingIds}
            onCancel={() => setDecision(null)}
            onConfirm={() => decide.mutate(decision)}
            pending={decide.isPending}
            error={decide.error}
          />
        ) : null}
        {recoveryOpen ? (
          <RecoveryDialog
            reason={recoveryReason}
            setReason={setRecoveryReason}
            onCancel={() => setRecoveryOpen(false)}
            onConfirm={() => recalculateReadiness.mutate()}
            pending={recalculateReadiness.isPending}
            error={recalculateReadiness.error}
          />
        ) : null}
        {assignmentOpen ? (
          <AssignmentDialog
            reviewers={eligibleReviewers.data ?? []}
            reviewerId={assignmentReviewerId}
            setReviewerId={setAssignmentReviewerId}
            reason={assignmentReason}
            setReason={setAssignmentReason}
            currentReviewerId={review.reviewAssignment?.reviewer?.id ?? null}
            onCancel={() => setAssignmentOpen(false)}
            onConfirm={() => assignReviewer.mutate()}
            pending={assignReviewer.isPending}
            error={assignReviewer.error ?? eligibleReviewers.error}
          />
        ) : null}
        <MediaDialog
          items={review.evidenceSummary?.items ?? []}
          selectedId={focusedMedia}
          onClose={() => setFocusedMedia(null)}
          onSelect={setFocusedMedia}
        />
        {flaggedMedia ? (
          <FlagEvidenceDialog
            item={review.evidenceSummary?.items.find((item) => item.id === flaggedMedia) ?? null}
            note={flagNote}
            setNote={setFlagNote}
            onCancel={() => {
              setFlaggedMedia(null);
              setFlagNote("");
            }}
            onConfirm={() => {
              flagEvidence.mutate({ mediaId: flaggedMedia, note: flagNote.trim() || undefined });
              setFlaggedMedia(null);
              setFlagNote("");
            }}
            pending={flagEvidence.isPending}
            error={flagEvidence.error}
          />
        ) : null}
        {identityOpen ? (
          <IdentityDialog
            identity={reviewIdentity}
            setIdentity={setReviewIdentity}
            note={identityNote}
            setNote={setIdentityNote}
            onCancel={() => setIdentityOpen(false)}
            onConfirm={() => {
              saveIdentity.mutate();
              setIdentityOpen(false);
            }}
            pending={saveIdentity.isPending}
            error={saveIdentity.error}
          />
        ) : null}
        {certOpen ? (
          <CertificationDialog
            verifiedGrade={certVerifiedGrade}
            setVerifiedGrade={setCertVerifiedGrade}
            verifiedName={certVerifiedName}
            setVerifiedName={setCertVerifiedName}
            verifiedYear={certVerifiedYear}
            setVerifiedYear={setCertVerifiedYear}
            verifiedSet={certVerifiedSet}
            setVerifiedSet={setCertVerifiedSet}
            verifiedCardNumber={certVerifiedCardNumber}
            setVerifiedCardNumber={setCertVerifiedCardNumber}
            designation={certDesignation}
            setDesignation={setCertDesignation}
            providerReference={certProviderReference}
            setProviderReference={setCertProviderReference}
            onCancel={() => setCertOpen(false)}
            onConfirm={() => {
              verifyCertification.mutate();
              setCertOpen(false);
            }}
            pending={verifyCertification.isPending}
            error={verifyCertification.error}
          />
        ) : null}
        {findingOpen ? (
          <FindingDialog
            section={findingSection}
            setSection={setFindingSection}
            title={findingTitle}
            setTitle={setFindingTitle}
            detail={findingDetail}
            setDetail={setFindingDetail}
            severity={findingSeverity}
            setSeverity={setFindingSeverity}
            customerAction={findingCustomerAction}
            setCustomerAction={setFindingCustomerAction}
            onCancel={() => setFindingOpen(false)}
            onConfirm={() => {
              createFinding.mutate({
                section: findingSection,
                title: findingTitle.trim(),
                detail: findingDetail.trim(),
                severity: findingSeverity,
                customerAction: findingCustomerAction,
              });
              setFindingOpen(false);
            }}
            pending={createFinding.isPending}
            error={createFinding.error}
          />
        ) : null}
        {researchOpen ? (
          <ResearchDialog
            provider={researchProvider}
            setProvider={setResearchProvider}
            url={researchUrl}
            setUrl={setResearchUrl}
            referenceId={researchReferenceId}
            setReferenceId={setResearchReferenceId}
            currency={researchCurrency}
            setCurrency={setResearchCurrency}
            value={researchValueMinor}
            setValue={setResearchValueMinor}
            note={researchNote}
            setNote={setResearchNote}
            onCancel={() => setResearchOpen(false)}
            onConfirm={() => {
              addResearchReference.mutate();
              setResearchOpen(false);
            }}
            pending={addResearchReference.isPending}
            error={addResearchReference.error}
          />
        ) : null}
        {researchNoteOpen ? (
          <ReviewDialog title="Add research note" onClose={() => setResearchNoteOpen(false)}>
            <p className="text-sm text-subtle">
              This note is staff-only context attached to the review research record.
            </p>
            <textarea
              rows={5}
              value={researchNote}
              onChange={(event) => setResearchNote(event.target.value)}
              placeholder="Record what was checked."
              autoFocus
            />
            <div className="admin-review-dialog-actions">
              <button
                type="button"
                className="button-primary"
                onClick={() => {
                  addResearchNote.mutate();
                  setResearchNoteOpen(false);
                }}
                disabled={addResearchNote.isPending || !researchNote.trim()}
              >
                {addResearchNote.isPending ? "Saving…" : "Save research note"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setResearchNoteOpen(false)}
              >
                Cancel
              </button>
            </div>
          </ReviewDialog>
        ) : null}
        {conditionOpen ? (
          <ConditionDialog
            condition={condition}
            setCondition={setCondition}
            note={conditionNote}
            setNote={setConditionNote}
            onCancel={() => setConditionOpen(false)}
            onConfirm={() => {
              saveCondition.mutate();
              setConditionOpen(false);
            }}
            pending={saveCondition.isPending}
            error={saveCondition.error}
          />
        ) : null}
        {valuationOpen ? (
          <ValuationDialog
            value={valuation}
            setValue={setValuation}
            basis={basis}
            setBasis={setBasis}
            confidence={confidence}
            setConfidence={setConfidence}
            onCancel={() => setValuationOpen(false)}
            onConfirm={() => {
              saveValuation.mutate();
              setValuationOpen(false);
            }}
            pending={saveValuation.isPending}
            error={saveValuation.error}
          />
        ) : null}
        {helpOpen ? <ReviewHelpDialog onClose={() => setHelpOpen(false)} /> : null}
        {manageOpen ? (
          <ManageSubmissionDialog detail={review} onClose={() => setManageOpen(false)} />
        ) : null}
      </section>
    </ReviewShell>
  );
}

type ReviewShellUser = {
  profile: { displayName: string; username: string | null };
};

function ReviewShell({ children, user }: { children: ReactNode; user?: ReviewShellUser }) {
  const navGroups: Array<{
    label: string;
    items: Array<{ label: string; section: AdminSection; icon: LucideIcon }>;
  }> = [
    {
      label: "Workspace",
      items: [{ label: "Overview", section: "control", icon: LayoutDashboard }],
    },
    {
      label: "Operations",
      items: [
        { label: "Accounts", section: "users", icon: Users },
        { label: "Review Queue", section: "moderation", icon: ClipboardCheck },
        { label: "Physical Intake", section: "intake", icon: Inbox },
        { label: "Collectibles", section: "collectibles", icon: Tag },
        { label: "Asset Operations", section: "assetOperations", icon: Activity },
      ],
    },
    {
      label: "Business",
      items: [
        { label: "Memberships", section: "memberships", icon: Users },
        { label: "Finance & Trading", section: "payments", icon: WalletCards },
        { label: "Trust & Support", section: "support", icon: MessageSquarePlus },
      ],
    },
    {
      label: "Platform",
      items: [{ label: "Platform Operations", section: "health", icon: HeartPulse }],
    },
  ];
  const name = user?.profile.displayName ?? "Admin account";
  return (
    <div className="admin-console-shell admin-review-console-shell">
      <aside className="admin-console-sidebar">
        <div className="admin-console-brand">
          <span className="admin-review-sidebar-mark">ADMIN CONSOLE</span>
        </div>
        <nav className="admin-console-nav" aria-label="Admin Console">
          {navGroups.map((group) => (
            <div className="admin-console-nav-group" key={group.label}>
              <span className="admin-console-nav-label">{group.label}</span>
              {group.items.map(({ label: itemLabel, section, icon: Icon }) => (
                <Link
                  key={section}
                  to="/admin"
                  search={{ section }}
                  className={section === "moderation" ? "is-active" : undefined}
                  activeOptions={{ exact: true }}
                >
                  <Icon aria-hidden="true" />
                  <span>{itemLabel}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-console-account">
          <div className="admin-console-avatar">{initialsForName(name)}</div>
          <div className="min-w-0">
            <strong>{name}</strong>
            <span>{user?.profile.username ? `@${user.profile.username}` : "Administrator"}</span>
          </div>
          <small>Administrator</small>
          <Link to="/portfolio">
            <ArrowRight aria-hidden="true" /> Switch to Investor
          </Link>
          <button type="button" onClick={() => void logout()}>
            <LogOut aria-hidden="true" /> Log out
          </button>
        </div>
      </aside>
      <div className="admin-console-main">
        <main className="page-shell admin-review-detail admin-review-detail-page">{children}</main>
      </div>
    </div>
  );
}

function ReviewWorkspaceToolbar({
  position,
  previous,
  next,
  choose,
}: {
  position: string;
  previous: string | undefined;
  next: string | undefined;
  choose: (id: string) => void;
}) {
  return (
    <header className="admin-review-workspace-toolbar">
      <div>
        <p className="admin-review-breadcrumb">
          Review Queue <span>›</span> Submission Review
        </p>
        <h1 className="sr-only">Submission Review</h1>
      </div>
      <div className="admin-review-toolbar-actions">
        <Link className="admin-review-back-link" to="/admin" search={{ section: "moderation" }}>
          <ArrowLeft aria-hidden="true" /> Back to queue
        </Link>
        <div className="admin-review-nav-actions" aria-label="Review queue navigation">
          <button type="button" onClick={() => previous && choose(previous)} disabled={!previous}>
            <ArrowLeft aria-hidden="true" /> Previous
          </button>
          <strong>{position}</strong>
          <button type="button" onClick={() => next && choose(next)} disabled={!next}>
            Next <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  );
}

function ReviewHeader({ detail }: { detail: SubmissionReviewDetail }) {
  const item = detail.collectible;
  return (
    <header className="admin-review-workspace-header">
      <div className="admin-review-workspace-hero">
        <div className="admin-review-hero-image">
          <AdminReviewMedia
            src={item?.thumbnailUrl ?? null}
            alt={(item?.title ?? "Submission") + " preview"}
            fallback={<span>No preview</span>}
          />
        </div>
        <div className="min-w-0">
          <div className="admin-review-eyebrow-row">
            <span>Submission</span>
            <StatusPill value={currentStateLabel(detail)} />
          </div>
          <h2>{item?.title ?? "Untitled submission"}</h2>
          <p>
            {[item?.year, item?.set, item?.cardNumber ? `#${item.cardNumber}` : null]
              .filter(Boolean)
              .join(" · ") || "Collector-supplied identity"}
          </p>
          <div className="admin-review-chip-row">
            <span>{item?.grader ? item.grader + " " + (item.grade ?? "") : "Raw / Ungraded"}</span>
            <span>Submission ID: {shortId(detail.id)}</span>
          </div>
        </div>
      </div>
      <div className="admin-review-workspace-header-meta">
        <span>
          Collector<strong>{detail.collectorSummary?.displayName ?? "Collector"}</strong>
        </span>
        <span>
          Submitted<strong>{formatDate(detail.submittedAt)}</strong>
        </span>
        <span>
          Primary reviewer
          <strong>{detail.reviewAssignment?.reviewer?.displayName ?? "Unassigned"}</strong>
        </span>
        <span>
          Contributors<strong>{detail.reviewAssignment?.contributors?.length ?? 0}</strong>
        </span>
      </div>
    </header>
  );
}

function ReviewNextAction({
  detail,
  starting,
  onStartReview,
  onReviewEvidence,
  onDecision,
  error,
}: {
  detail: SubmissionReviewDetail;
  starting: boolean;
  onStartReview: () => void;
  onReviewEvidence: () => void;
  onDecision: (value: Decision) => void;
  error: Error | null;
}) {
  const workspace = detail.reviewWorkspace;
  if (!workspace) return null;

  const presentation = detail.reviewPresentation;
  const nextAction = presentation?.nextAction ?? detail.readiness?.nextAction;
  const required = presentation?.required ?? {
    complete: workspace.requiredComplete,
    total: workspace.requiredTotal,
    blockers: workspace.blockingIssues.length,
  };
  const evidence = detail.evidenceSummary;
  const selfReviewBlocked = workspace.selfReviewBlocked;
  const waitingForCollector = detail.status === "CHANGES_REQUESTED";
  const ready = Boolean(detail.readiness?.decisionEligible || presentation?.readyForDecision);
  const canStart = commandAllowed(detail, "canStartReview");
  const canReview = commandAllowed(detail, "canReviewEvidence");
  const canApprove = commandAllowed(detail, "canApprove");
  const isStarting = detail.status === "SUBMITTED" && !workspace.reviewer;
  const continueReview =
    detail.status === "IN_REVIEW" && workspace.claimState === "CLAIMED_BY_OTHER";
  const primaryCheck = presentation?.primaryIncompleteRequiredCheck;
  const evidenceRemaining = evidence
    ? Math.max(0, evidence.required - evidence.acceptedRequired)
    : 0;

  let eyebrow = "NEXT ACTION";
  let title = "Review required checks";
  let copy = presentation?.nextActionReason ?? "Complete the required checks before deciding.";
  let action: ReactNode = null;
  let tone = "is-attention";

  if (selfReviewBlocked) {
    eyebrow = "REVIEWER REQUIRED";
    title = "Another authorized reviewer must continue";
    copy =
      "You submitted this collectible, so protected review and decision actions stay with another reviewer.";
    tone = "is-restricted";
  } else if (waitingForCollector) {
    eyebrow = "WAITING FOR COLLECTOR";
    title = "Changes are required before review can continue";
    copy = detail.changeRequest?.message ?? "The collector must update the requested items.";
    tone = "is-waiting";
  } else if (ready) {
    eyebrow = "READY FOR DECISION";
    title = "All required checks are complete";
    copy = "Optional research and staff assessment can be skipped.";
    tone = "is-ready";
    action = (
      <button
        type="button"
        className="button-primary admin-review-next-action-button"
        onClick={() => onDecision("APPROVED")}
        disabled={!canApprove}
      >
        Approve submission <ArrowRight aria-hidden="true" />
      </button>
    );
  } else if (isStarting || nextAction === "CLAIM_REVIEW") {
    eyebrow = "START REVIEW";
    title = "Begin the required review";
    copy =
      "Start the review to unlock evidence and other protected checks. Assignment is optional for contributing reviewers.";
    action = (
      <button
        type="button"
        className="button-primary admin-review-next-action-button"
        onClick={onStartReview}
        disabled={!canStart || starting}
      >
        {starting ? "Starting review…" : "Start review"} <ArrowRight aria-hidden="true" />
      </button>
    );
  } else if (continueReview) {
    eyebrow = "REVIEW IN PROGRESS";
    title = "Continue the collaborative review";
    copy = `${workspace.reviewer?.displayName ?? "Another reviewer"} started this review. Any authorized reviewer can contribute.`;
    action = (
      <button
        type="button"
        className="button-primary admin-review-next-action-button"
        onClick={onReviewEvidence}
        disabled={!canReview}
      >
        Continue review <ArrowRight aria-hidden="true" />
      </button>
    );
  } else if (primaryCheck === "EVIDENCE" || evidenceRemaining > 0) {
    eyebrow = "ACTION REQUIRED";
    title = "Review required evidence";
    copy = `${evidenceRemaining || 1} required image${evidenceRemaining === 1 ? "" : "s"} need your review before this submission can be approved.`;
    action = (
      <button
        type="button"
        className="button-primary admin-review-next-action-button"
        onClick={onReviewEvidence}
        disabled={!canReview}
      >
        Review evidence <ArrowRight aria-hidden="true" />
      </button>
    );
  } else if (primaryCheck === "IDENTITY") {
    eyebrow = "ACTION REQUIRED";
    title = "Confirm collectible identity";
    copy = "Review the submitted identity and confirm the Slice identity before deciding.";
    tone = "is-attention";
  } else if (primaryCheck === "CERTIFICATION") {
    eyebrow = "ACTION REQUIRED";
    title = "Resolve certification review";
    copy = "Compare the grading reference with the submitted identity before deciding.";
  }

  return (
    <section className={`admin-review-next-action ${tone}`} aria-label="Next review action">
      <div className="admin-review-next-action-copy">
        <span className="admin-review-next-action-eyebrow">{eyebrow}</span>
        <h2>{title}</h2>
        <p>{copy}</p>
        {!selfReviewBlocked && !waitingForCollector ? (
          <small>
            Required checks: {required.complete} / {required.total} complete
            {required.blockers
              ? ` · ${required.blockers} finding${required.blockers === 1 ? "" : "s"}`
              : ""}
          </small>
        ) : null}
      </div>
      {action ? <div className="admin-review-next-action-cta">{action}</div> : null}
      {error ? (
        <p className="admin-review-next-action-error" role="alert">
          {friendlyError(error)}
        </p>
      ) : null}
    </section>
  );
}

function ReviewerBanner({ detail }: { detail: SubmissionReviewDetail }) {
  const assignment = detail.reviewAssignment;
  const self = detail.reviewWorkspace?.selfReviewBlocked;
  const evidenceBlocked =
    (detail.evidenceSummary?.missingRequired ?? 0) > 0 ||
    (detail.evidenceSummary?.flaggedRequired ?? 0) > 0;
  const certificationBlocked = detail.certificationVerification?.status === "MISMATCH";
  const changesRequested = detail.status === "CHANGES_REQUESTED";
  const ready = detail.readiness?.decisionEligible;
  const title = self
    ? "Another reviewer required"
    : changesRequested
      ? "Collector changes required"
      : certificationBlocked
        ? "Certification conflict"
        : evidenceBlocked
          ? "Evidence requires attention"
          : ready
            ? "Ready for decision"
            : detail.status === "APPROVED"
              ? "Submission approved"
              : detail.status === "REJECTED"
                ? "Submission rejected"
                : "Review in progress";
  const copy = self
    ? "You submitted this collectible. You can inspect the review, but another authorized reviewer must perform protected review actions and make the decision."
    : changesRequested
      ? "The collector must update the requested items before review can continue. Original evidence and review history remain preserved."
      : certificationBlocked
        ? "The certification reference does not match the submitted identity. Resolve the conflict before deciding."
        : evidenceBlocked
          ? (detail.reviewWorkspace?.primaryBlocker ??
            "Required evidence needs review before a decision can be recorded.")
          : ready
            ? "All required review items are complete and an eligible reviewer may record the decision."
            : assignment?.reviewer
              ? `${assignment.reviewer.displayName} coordinates this review; any authorized reviewer may contribute.`
              : "No primary reviewer is assigned. Assign a coordinator or contribute directly.";
  return (
    <section className={"admin-review-reviewer-banner " + (self ? "is-restricted" : "")}>
      <div className="admin-review-reviewer-banner-icon" aria-hidden="true">
        <AlertTriangle aria-hidden="true" />
      </div>
      <div>
        <p className="page-kicker">{title}</p>
        <p>{copy}</p>
      </div>
    </section>
  );
}

function ChangeRequestNotice({ detail }: { detail: SubmissionReviewDetail }) {
  const request = detail.changeRequest;
  return (
    <section className="admin-review-change-request" aria-label="Current change request">
      <p className="page-kicker">Changes requested</p>
      <h3>Waiting for collector update</h3>
      <p>
        {request?.message ??
          "The collector has been asked to update this submission before review can resume."}
      </p>
      <div>
        <span>
          Requested {request?.requestedAt ? formatDate(request.requestedAt) : "previously"}
        </span>
        {request?.requestedItems.length ? (
          <span>Outstanding: {request.requestedItems.join(", ")}</span>
        ) : null}
      </div>
    </section>
  );
}

function Progress({ detail }: { detail: SubmissionReviewDetail }) {
  return (
    <section className="admin-panel-card admin-review-progress" aria-label="Review progress">
      <ol>
        {detail.readiness?.progress.map((item, index) => (
          <li key={item.key} className={"is-" + item.status.toLowerCase()}>
            <span className="admin-review-progress-step-icon">
              {item.status === "COMPLETE" || item.status === "NOT_APPLICABLE" ? "✓" : index + 1}
            </span>
            <div>
              <strong>{progressLabel(item)}</strong>
              <small>{progressSummary(item)}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ReviewOverview({
  detail,
  canAssign,
  onAssign,
  assigning,
  canAddFinding,
  onAddFinding,
}: {
  detail: SubmissionReviewDetail;
  canAssign: boolean;
  onAssign: () => void;
  assigning: boolean;
  canAddFinding: boolean;
  onAddFinding: () => void;
}) {
  const workspace = detail.reviewWorkspace;
  if (!workspace) return null;
  const findings = detail.reviewFindings ?? [];
  const openFindings = findings.filter((finding) => finding.status === "OPEN");
  const blocking = openFindings.filter((finding) => finding.severity === "BLOCKING");
  const contributors = workspace.contributors ?? [];
  return (
    <section className="admin-review-overview-grid" aria-label="Review overview">
      <article className="admin-panel-card admin-review-overview-card">
        <div className="admin-review-card-heading">
          <h2>Review readiness</h2>
          <a href="#review-workflow">View details</a>
        </div>
        <dl className="admin-review-overview-facts">
          {detail.readiness?.progress
            .filter((item) => item.key !== "decision")
            .map((item) => (
              <div key={item.key}>
                <dt>{item.label}</dt>
                <dd
                  className={
                    item.status === "COMPLETE" ||
                    item.status === "NOT_APPLICABLE" ||
                    item.status === "OPTIONAL"
                      ? "is-ready"
                      : "is-warning"
                  }
                >
                  {item.key === "evidence" && detail.evidenceSummary
                    ? `${detail.evidenceSummary.acceptedRequired} / ${detail.evidenceSummary.required} accepted`
                    : item.status === "OPTIONAL"
                      ? item.summary.includes("recorded")
                        ? "Recorded"
                        : "Optional"
                      : workflowStatusLabel(item.status)}
                </dd>
              </div>
            ))}
          <div>
            <dt>Blocking issues</dt>
            <dd className={workspace.blockingIssues.length ? "is-warning" : "is-ready"}>
              {workspace.blockingIssues.length}
            </dd>
          </div>
          <div>
            <dt>Reviewer eligible</dt>
            <dd className={workspace.selfReviewBlocked ? "is-warning" : "is-ready"}>
              {workspace.selfReviewBlocked ? "No (self-review blocked)" : "Yes"}
            </dd>
          </div>
        </dl>
        <div
          className={`admin-review-readiness-answer ${detail.readiness?.decisionEligible ? "is-ready" : ""}`}
        >
          <div className="admin-review-readiness-answer-heading">
            <span>Ready for decision</span>
            <strong>{detail.readiness?.decisionEligible ? "YES" : "NO"}</strong>
          </div>
          <small>Primary reasons</small>
          {workspace.primaryBlocker || workspace.selfReviewBlocked ? (
            <ul>
              {workspace.primaryBlocker ? <li>{workspace.primaryBlocker}</li> : null}
              {workspace.selfReviewBlocked ? <li>You cannot decide your own submission.</li> : null}
            </ul>
          ) : (
            <p>An eligible reviewer can record a decision.</p>
          )}
        </div>
      </article>
      <article className="admin-panel-card admin-review-overview-card">
        <div className="admin-review-card-heading">
          <h2>Reviewer team</h2>
          <a href="#review-workflow">Manage</a>
        </div>
        <div className="admin-review-team-primary">
          <span>Primary reviewer</span>
          <strong>{workspace.reviewer?.displayName ?? "Unassigned"}</strong>
          <button
            type="button"
            className="button-secondary"
            onClick={onAssign}
            disabled={!canAssign || assigning}
          >
            {assigning ? "Assigning…" : "Assign reviewer"}
          </button>
        </div>
        <div className="admin-review-contributor-summary">
          <span>Contributors</span>
          {contributors.length ? (
            <ul className="admin-review-contributors">
              {contributors.slice(0, 3).map((contributor) => (
                <li key={contributor.id}>
                  <strong>{contributor.displayName}</strong>
                  <span>{contributor.contributionLabel ?? "Review contribution"}</span>
                </li>
              ))}
            </ul>
          ) : (
            <strong>None yet</strong>
          )}
          <p>Any authorized reviewer can contribute.</p>
          <p>The Primary Reviewer coordinates completion.</p>
        </div>
      </article>
      <article className="admin-panel-card admin-review-overview-card">
        <div className="admin-review-card-heading">
          <h2>Review findings</h2>
          <button
            type="button"
            className="admin-review-card-link"
            onClick={onAddFinding}
            disabled={!canAddFinding}
          >
            + Add finding
          </button>
        </div>
        {openFindings.length ? (
          <div className="admin-review-finding-summary is-blocking">
            <strong>
              {blocking.length
                ? `${blocking.length} blocking finding${blocking.length === 1 ? "" : "s"}`
                : `${openFindings.length} open finding${openFindings.length === 1 ? "" : "s"}`}
            </strong>
            <span>{openFindings[0]?.title}</span>
          </div>
        ) : (
          <div className="admin-review-finding-summary is-clear">
            <CheckCircle2 aria-hidden="true" />
            <strong>No findings</strong>
            <span>There are no blocking or advisory findings for this review.</span>
          </div>
        )}
      </article>
    </section>
  );
}

function DecisionWorkspace({
  detail,
  onDecision,
  canApprove,
  canRequestChanges,
  canReject,
}: {
  detail: SubmissionReviewDetail;
  onDecision: (value: Decision) => void;
  canApprove: boolean;
  canRequestChanges: boolean;
  canReject: boolean;
}) {
  const workspace = detail.reviewWorkspace;
  if (!workspace) return null;
  const steps = detail.readiness?.progress ?? [];
  return (
    <div className="admin-review-decision-workspace">
      <div>
        <p className="page-kicker">Decision gate</p>
        <h4>Confirm the review record before deciding</h4>
        <p>
          Decision actions remain in the command rail so this checklist stays read-only and
          authoritative.
        </p>
      </div>
      <dl>
        {steps
          .filter((step) => ["identity", "evidence", "certification"].includes(step.key))
          .map((step) => (
            <div key={step.key}>
              <dt>{step.label}</dt>
              <dd
                className={
                  step.status === "COMPLETE" || step.status === "NOT_APPLICABLE"
                    ? "is-ready"
                    : "is-warning"
                }
              >
                {label(step.status)}
              </dd>
            </div>
          ))}
        <div>
          <dt>Blocking findings</dt>
          <dd className={workspace.blockingIssues.length ? "is-negative" : "is-ready"}>
            {workspace.blockingIssues.length}
          </dd>
        </div>
        <div>
          <dt>Eligible reviewer</dt>
          <dd className={workspace.selfReviewBlocked ? "is-negative" : "is-ready"}>
            {workspace.selfReviewBlocked ? "No" : "Yes"}
          </dd>
        </div>
        <div>
          <dt>Current revision</dt>
          <dd className="is-ready">Valid · v{detail.version}</dd>
        </div>
      </dl>
      <div className="admin-review-decision-workspace-actions">
        <button
          type="button"
          className="button-primary"
          onClick={() => onDecision("APPROVED")}
          disabled={!canApprove}
        >
          Approve submission
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => onDecision("CHANGES_REQUESTED")}
          disabled={!canRequestChanges}
        >
          Request changes
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={() => onDecision("REJECTED")}
          disabled={!canReject}
        >
          Reject submission
        </button>
      </div>
    </div>
  );
}

function ReviewSection({
  title,
  detail,
  step,
  number,
  children,
  open,
}: {
  title: string;
  detail: SubmissionReviewDetail;
  step: string;
  number: number;
  children: ReactNode;
  open?: boolean;
}) {
  const item = detail.readiness?.progress.find((progress) => progress.key === step);
  const purpose = reviewPurpose(step);
  const primaryIncomplete =
    detail.reviewPresentation?.primaryIncompleteRequiredCheck?.toLowerCase();
  const defaultOpen =
    open ??
    (detail.readiness?.decisionEligible
      ? step === "decision"
      : detail.status === "IN_REVIEW" && primaryIncomplete === step);
  return (
    <details
      id={step === "decision" ? "review-decision" : undefined}
      data-review-step={step}
      className="admin-panel-card admin-review-workspace-section"
      open={defaultOpen}
    >
      <summary>
        <span
          className={`admin-review-section-number is-${(item?.status ?? "NEEDS_REVIEW").toLowerCase()}`}
        >
          {number}
        </span>
        <div>
          <h3>{title}</h3>
          <p>{purpose}</p>
        </div>
        <div className="admin-review-workflow-meta">
          <strong>{workflowSummary(detail, step, item?.status)}</strong>
          <small>{workflowDetail(detail, step)}</small>
        </div>
        <StatusPill value={workflowStatusLabel(item?.status ?? "NEEDS_REVIEW")} />
        <span className="admin-review-workflow-chevron" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="admin-review-workspace-section-body">{children}</div>
    </details>
  );
}
function Identity({
  detail,
  canEdit,
  reviewIdentity,
  onEdit,
}: {
  detail: SubmissionReviewDetail;
  canEdit: boolean;
  reviewIdentity: { name: string; year: string; set: string; cardNumber: string; variant: string };
  onEdit: () => void;
}) {
  const item = detail.collectible;
  const identityConfirmed =
    detail.readiness?.progress.find((progress) => progress.key === "identity")?.status ===
    "COMPLETE";
  const confirmedBy = workflowActor(detail, "identity");
  return (
    <div className="admin-review-identity-panels">
      <Info title="Collector submitted">
        <dl className="admin-review-facts">
          {fact("Category", item?.category)}
          {fact("Title", metadataValue(detail, "name"))}
          {fact("Set", metadataValue(detail, "set"))}
          {fact("Card number", metadataValue(detail, "cardNumber"))}
          {fact("Year", metadataValue(detail, "year"))}
        </dl>
      </Info>
      <Info title="Slice reviewed identity">
        <dl className="admin-review-facts">
          {fact("Title", reviewIdentity.name)}
          {fact("Set", reviewIdentity.set)}
          {fact("Card number", reviewIdentity.cardNumber)}
          {fact("Variant", reviewIdentity.variant)}
          {fact("Year", reviewIdentity.year)}
        </dl>
        <button type="button" className="button-secondary" onClick={onEdit} disabled={!canEdit}>
          <Pencil aria-hidden="true" /> Edit review identity
        </button>
      </Info>
      <Info title="Result">
        <div className={`admin-review-result ${identityConfirmed ? "is-confirmed" : "is-pending"}`}>
          <strong>
            <CheckCircle2 aria-hidden="true" />
            {identityConfirmed ? "Identity confirmed" : "Identity needs review"}
          </strong>
          <span>
            {identityConfirmed
              ? "No known conflicts"
              : "Confirm the reviewed identity before continuing."}
          </span>
        </div>
        {confirmedBy ? (
          <small className="admin-review-confirmed-by">
            Confirmed by <strong>{confirmedBy}</strong> · {workflowDate(detail, "identity")}
          </small>
        ) : null}
      </Info>
      <p className="admin-review-section-footnote">
        The submitted identity remains preserved alongside the reviewed identity for auditability.
      </p>
    </div>
  );
}
function Evidence({
  detail,
  canEdit,
  onFocus,
  onAccept,
  onFlag,
  actingOnEvidence,
}: {
  detail: SubmissionReviewDetail;
  canEdit: boolean;
  onFocus: (id: string) => void;
  onAccept: (item: NonNullable<SubmissionReviewDetail["evidenceSummary"]>["items"][number]) => void;
  onFlag: (item: NonNullable<SubmissionReviewDetail["evidenceSummary"]>["items"][number]) => void;
  actingOnEvidence: boolean;
}) {
  const summary = detail.evidenceSummary;
  return (
    <div className="admin-review-evidence-layout">
      <div className="admin-review-evidence-heading">
        <strong>Required evidence</strong>
        <span>
          {summary ? `${summary.acceptedRequired} / ${summary.required} accepted` : "Unavailable"}
        </span>
        <a href="#review-help">
          Guidelines <span aria-hidden="true">⌃</span>
        </a>
      </div>
      <div className="admin-review-workspace-gallery">
        {summary?.items.map((item) => (
          <article key={item.id} className="admin-review-workspace-media">
            <div className="admin-review-evidence-thumbnail">
              <AdminReviewMedia
                src={item.thumbnailUrl}
                alt={label(item.slot) + " evidence"}
                fallback={<span>{label(item.slot)}</span>}
              />
            </div>
            <div className="admin-review-evidence-details">
              <div className="admin-review-evidence-title-row">
                <strong>
                  {label(item.slot)} {item.required ? "· Required" : "· Optional"}
                </strong>
                <span className={item.reviewState === "ACCEPTED" ? "is-accepted" : "is-pending"}>
                  {item.reviewState === "ACCEPTED"
                    ? "Accepted"
                    : item.reviewState === "FLAGGED"
                      ? "Flagged"
                      : "Pending review"}
                </span>
              </div>
              <dl>
                <div>
                  <dt>Status</dt>
                  <dd>{item.status === "SAFE" ? "Pending review" : label(item.status)}</dd>
                </div>
                <div>
                  <dt>Size</dt>
                  <dd>{formatBytes(item.sizeBytes)}</dd>
                </div>
                <div>
                  <dt>Submitted</dt>
                  <dd>{shortDate(item.uploadedAt)}</dd>
                </div>
              </dl>
              <div className="admin-review-evidence-actions">
                <button type="button" className="button-secondary" onClick={() => onFocus(item.id)}>
                  Open image
                </button>
                <button
                  type="button"
                  className="button-primary"
                  disabled={
                    !canEdit ||
                    actingOnEvidence ||
                    item.status !== "SAFE" ||
                    item.reviewState === "ACCEPTED"
                  }
                  onClick={(event) => {
                    event.stopPropagation();
                    onAccept(item);
                  }}
                >
                  {item.reviewState === "ACCEPTED" ? "Accepted" : "Accept evidence"}
                </button>
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!canEdit || actingOnEvidence || item.reviewState === "FLAGGED"}
                  onClick={(event) => {
                    event.stopPropagation();
                    onFlag(item);
                  }}
                >
                  {item.reviewState === "FLAGGED" ? "Flagged" : "Flag issue"}
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
function Certification({
  detail,
  canEdit,
  verifiedGrade,
  setVerifiedGrade,
  verifiedName,
  setVerifiedName,
  verifiedYear,
  setVerifiedYear,
  verifiedSet,
  setVerifiedSet,
  verifiedCardNumber,
  setVerifiedCardNumber,
  designation,
  setDesignation,
  providerReference,
  setProviderReference,
  onVerify,
  onEdit,
  verifying,
}: {
  detail: SubmissionReviewDetail;
  canEdit: boolean;
  verifiedGrade: string;
  setVerifiedGrade: (value: string) => void;
  verifiedName: string;
  setVerifiedName: (value: string) => void;
  verifiedYear: string;
  setVerifiedYear: (value: string) => void;
  verifiedSet: string;
  setVerifiedSet: (value: string) => void;
  verifiedCardNumber: string;
  setVerifiedCardNumber: (value: string) => void;
  designation: string;
  setDesignation: (value: string) => void;
  providerReference: string;
  setProviderReference: (value: string) => void;
  onVerify: () => void;
  onEdit: () => void;
  verifying: boolean;
}) {
  const item = detail.collectible;
  const certification = detail.certificationVerification;
  if (!item?.grader)
    return (
      <div className="admin-review-compact-result">
        <strong>Raw / Ungraded</strong>
        <span>Certification not required · Resolved</span>
      </div>
    );
  return (
    <div className="admin-review-certification-workspace">
      <div className="admin-review-two-panel">
        <Info title="Grade">
          <strong>
            {item.grader} {item.grade}
          </strong>
          <span>Certification {item.certificationNumber ?? "not supplied"}</span>
        </Info>
        <Info title="Verification">
          <strong>{certification ? label(certification.status) : "Not checked"}</strong>
          <span>
            {certification?.verifiedLabel ??
              "Provider/reference verification is not an authenticity determination."}
          </span>
          {certification?.officialVerificationUrl ? (
            <a href={certification.officialVerificationUrl} target="_blank" rel="noreferrer">
              Open reference ↗
            </a>
          ) : null}
        </Info>
      </div>
      <div className="admin-review-compact-result">
        <strong>{certification ? label(certification.status) : "Not verified yet"}</strong>
        <span>
          Compare the official provider reference with the submitted identity. This records review
          evidence and is not an authenticity guarantee.
        </span>
        <button type="button" className="button-secondary" onClick={onEdit} disabled={!canEdit}>
          <Pencil aria-hidden="true" /> Manual verification
        </button>
      </div>
    </div>
  );
}
function Research({
  detail,
  canEdit,
  provider,
  setProvider,
  url,
  setUrl,
  referenceId,
  setReferenceId,
  currency,
  setCurrency,
  valueMinor,
  setValueMinor,
  note,
  setNote,
  onAddReference,
  onAddNote,
  onRemoveReference,
  onOpenReference,
  saving,
}: {
  detail: SubmissionReviewDetail;
  canEdit: boolean;
  provider: string;
  setProvider: (value: string) => void;
  url: string;
  setUrl: (value: string) => void;
  referenceId: string;
  setReferenceId: (value: string) => void;
  currency: string;
  setCurrency: (value: string) => void;
  valueMinor: string;
  setValueMinor: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  onAddReference: () => void;
  onAddNote: () => void;
  onRemoveReference: (id: string) => void;
  onOpenReference: () => void;
  saving: boolean;
}) {
  const research = detail.marketResearch;
  return (
    <div className="admin-review-research-workspace">
      {research ? (
        <div className="admin-review-two-panel">
          <Info title="Provider research">
            <strong>
              {research.observations[0]?.providerCode?.replaceAll("_", " ") ?? "External reference"}
            </strong>
            <span>
              {label(research.state)} · checked {formatDate(research.collectedAt)}
            </span>
          </Info>
          <Info title="Current reference">
            <strong>
              {research.snapshot.sales ? marketRange(research.snapshot.sales) : "Unavailable"}
            </strong>
            <span>External reference only · source currency retained</span>
          </Info>
        </div>
      ) : (
        <div className="admin-review-compact-result">
          <strong>No provider research attached</strong>
          <span>Manual references are advisory and never set Slice valuation.</span>
        </div>
      )}
      <div className="admin-review-section-actions">
        <button
          type="button"
          className="button-secondary"
          onClick={onOpenReference}
          disabled={!canEdit}
        >
          <Plus aria-hidden="true" /> Add reference
        </button>
        <button
          type="button"
          className="button-secondary"
          onClick={onAddNote}
          disabled={!canEdit || saving}
        >
          <MessageSquarePlus aria-hidden="true" /> Add research note
        </button>
      </div>
      {detail.researchReferences?.length ? (
        <div className="admin-review-finding-list">
          {detail.researchReferences.map((reference) => (
            <article
              key={reference.id}
              className={`admin-review-finding is-${reference.status.toLowerCase()}`}
            >
              <div>
                <strong>{reference.provider}</strong>
                <small>
                  {reference.status} · {reference.currency ?? "Currency not supplied"} · added by{" "}
                  {reference.addedBy.displayName} · {formatDate(reference.addedAt)}
                </small>
                {reference.valueMinor ? (
                  <p>
                    Reference value: {formatMoneyMinor(reference.valueMinor, reference.currency)}
                  </p>
                ) : null}
                {reference.url ? (
                  <a href={reference.url} target="_blank" rel="noreferrer">
                    Open source ↗
                  </a>
                ) : null}
              </div>
              {reference.status === "ACTIVE" ? (
                <button
                  type="button"
                  className="button-secondary"
                  disabled={!canEdit || saving}
                  onClick={() => onRemoveReference(reference.id)}
                >
                  Remove incorrect reference
                </button>
              ) : null}
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

type AssessmentProps = {
  detail: SubmissionReviewDetail;
  canEdit: boolean;
  condition: string;
  setCondition: (value: string) => void;
  conditionNote: string;
  setConditionNote: (value: string) => void;
  valuation: string;
  setValuation: (value: string) => void;
  basis: string;
  setBasis: (value: string) => void;
  confidence: string;
  setConfidence: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  onSaveCondition: () => void;
  savingCondition: boolean;
  onSaveValuation: () => void;
  savingValuation: boolean;
  onSaveNote: () => void;
  savingNote: boolean;
  findingTitle: string;
  setFindingTitle: (value: string) => void;
  findingDetail: string;
  setFindingDetail: (value: string) => void;
  findingSection:
    "identity" | "evidence" | "certification" | "research" | "assessment" | "decision";
  setFindingSection: (
    value: "identity" | "evidence" | "certification" | "research" | "assessment" | "decision",
  ) => void;
  findingSeverity: "ADVISORY" | "BLOCKING";
  setFindingSeverity: (value: "ADVISORY" | "BLOCKING") => void;
  findingCustomerAction: boolean;
  setFindingCustomerAction: (value: boolean) => void;
  findingResolutionNote: string;
  setFindingResolutionNote: (value: string) => void;
  onCreateFinding: () => void;
  creatingFinding: boolean;
  onUpdateFinding: (findingId: string, status: "OPEN" | "RESOLVED" | "DISMISSED") => void;
  updatingFinding: boolean;
};
function Assessment(props: AssessmentProps) {
  const stored = props.detail.staffReview?.valuation?.valueMinor;
  const storedValue = stored ? (Number(stored) / 100).toFixed(2) : null;
  return (
    <div className="admin-review-assessment">
      <div className="admin-review-two-panel">
        <div className="admin-review-edit-card">
          <label>
            Staff condition
            <select
              value={props.condition}
              onChange={(event) => props.setCondition(event.target.value)}
              disabled={!props.canEdit}
            >
              <option value="">{props.detail.staffReview?.condition ?? "Not recorded"}</option>
              <option>Mint</option>
              <option>Near Mint</option>
              <option>Excellent</option>
              <option>Very Good</option>
              <option>Good</option>
            </select>
          </label>
          <label>
            Assessment note
            <textarea
              rows={3}
              value={props.conditionNote}
              onChange={(event) => props.setConditionNote(event.target.value)}
              disabled={!props.canEdit}
              placeholder="Staff-only assessment note"
            />
          </label>
          <button
            type="button"
            className="button-secondary"
            onClick={props.onSaveCondition}
            disabled={!props.canEdit || !props.condition.trim() || props.savingCondition}
          >
            {props.savingCondition ? "Saving…" : "Save condition"}
          </button>
        </div>
        <Info title="AI advisory">
          <strong>{props.detail.preGrade?.conditionLabel ?? "No AI advisory"}</strong>
          <span>
            {props.detail.preGrade?.overallEstimate != null
              ? "Suggested score " + props.detail.preGrade.overallEstimate.toFixed(1)
              : "No score returned"}
          </span>
          <small>Advisory only — never an official grade, condition, or valuation.</small>
        </Info>
      </div>
      <div className="admin-review-two-panel">
        <div className="admin-review-edit-card">
          <label>
            Staff valuation (GBP)
            <input
              inputMode="decimal"
              value={props.valuation}
              onChange={(event) => props.setValuation(event.target.value)}
              disabled={!props.canEdit}
              placeholder={storedValue ?? "Not recorded"}
            />
          </label>
          <label>
            Valuation basis
            <input
              value={props.basis}
              onChange={(event) => props.setBasis(event.target.value)}
              disabled={!props.canEdit}
            />
          </label>
          <label>
            Confidence
            <input
              type="number"
              min="0"
              max="100"
              value={props.confidence}
              onChange={(event) => props.setConfidence(event.target.value)}
              disabled={!props.canEdit}
            />
          </label>
          <button
            type="button"
            className="button-secondary"
            onClick={props.onSaveValuation}
            disabled={
              !props.canEdit || !/^\d+(\.\d{1,2})?$/.test(props.valuation) || props.savingValuation
            }
          >
            {props.savingValuation ? "Saving…" : "Save valuation"}
          </button>
        </div>
        <Info title="Reference inputs">
          <strong>
            {props.detail.marketResearch ? "External reference attached" : "No external match"}
          </strong>
          <span>Stored staff valuation: {storedValue ? "£" + storedValue : "Not recorded"}</span>
        </Info>
      </div>
      <details id="review-notes" className="admin-review-notes">
        <summary>Internal notes</summary>
        <p>Staff-only notes are never sent to the collector.</p>
        <textarea
          rows={3}
          value={props.note}
          onChange={(event) => props.setNote(event.target.value)}
          placeholder={props.detail.notes?.current ?? "Add a private note"}
          disabled={!props.canEdit}
        />
        <button
          type="button"
          className="button-secondary"
          onClick={props.onSaveNote}
          disabled={!props.canEdit || !props.note.trim() || props.savingNote}
        >
          {props.savingNote ? "Saving…" : "Save note"}
        </button>
      </details>
      <section id="review-findings" className="admin-review-findings" aria-label="Review findings">
        <div className="admin-review-findings-heading">
          <div>
            <p className="page-kicker">Findings</p>
            <h4>Open review findings</h4>
          </div>
          <span>
            {props.detail.reviewFindings?.filter((finding) => finding.status === "OPEN").length ??
              0}{" "}
            open
          </span>
        </div>
        <div className="admin-review-finding-list">
          {props.detail.reviewFindings?.length ? (
            props.detail.reviewFindings.map((finding) => (
              <article
                key={finding.id}
                className={`admin-review-finding is-${finding.severity.toLowerCase()} is-${finding.status.toLowerCase()}`}
              >
                <div>
                  <strong>{finding.title}</strong>
                  <small>
                    {label(finding.section)} · {label(finding.severity)} · {label(finding.status)}
                  </small>
                  {finding.detail ? <p>{finding.detail}</p> : null}
                </div>
                {finding.status === "OPEN" ? (
                  <div className="admin-review-finding-actions">
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={!props.canEdit || props.updatingFinding}
                      onClick={() => props.onUpdateFinding(finding.id, "RESOLVED")}
                    >
                      Resolve
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      disabled={!props.canEdit || props.updatingFinding}
                      onClick={() => props.onUpdateFinding(finding.id, "DISMISSED")}
                    >
                      Dismiss
                    </button>
                  </div>
                ) : null}
              </article>
            ))
          ) : (
            <p className="text-sm text-subtle">No findings have been recorded.</p>
          )}
        </div>
        <div className="admin-review-finding-create">
          <label>
            Section
            <select
              value={props.findingSection}
              onChange={(event) =>
                props.setFindingSection(event.target.value as AssessmentProps["findingSection"])
              }
              disabled={!props.canEdit}
            >
              <option value="identity">Identity</option>
              <option value="evidence">Evidence</option>
              <option value="certification">Grade & Certification</option>
              <option value="research">Research</option>
              <option value="assessment">Staff Assessment</option>
              <option value="decision">Decision</option>
            </select>
          </label>
          <label>
            Finding
            <input
              value={props.findingTitle}
              onChange={(event) => props.setFindingTitle(event.target.value)}
              disabled={!props.canEdit}
              placeholder="Describe the issue or advisory"
            />
          </label>
          <label>
            Severity
            <select
              value={props.findingSeverity}
              onChange={(event) =>
                props.setFindingSeverity(event.target.value as "ADVISORY" | "BLOCKING")
              }
              disabled={!props.canEdit}
            >
              <option value="ADVISORY">Advisory</option>
              <option value="BLOCKING">Blocking</option>
            </select>
          </label>
          <label>
            Detail (optional)
            <input
              value={props.findingDetail}
              onChange={(event) => props.setFindingDetail(event.target.value)}
              disabled={!props.canEdit}
              placeholder="Context for other reviewers"
            />
          </label>
          <label className="admin-review-checkbox-label">
            <input
              type="checkbox"
              checked={props.findingCustomerAction}
              onChange={(event) => props.setFindingCustomerAction(event.target.checked)}
              disabled={!props.canEdit}
            />
            Collector action required
          </label>
          <button
            type="button"
            className="button-secondary"
            onClick={props.onCreateFinding}
            disabled={!props.canEdit || !props.findingTitle.trim() || props.creatingFinding}
          >
            {props.creatingFinding ? "Recording…" : "Add finding"}
          </button>
        </div>
        <label className="admin-review-resolution-note">
          Resolution note (used when resolving or dismissing)
          <input
            value={props.findingResolutionNote}
            onChange={(event) => props.setFindingResolutionNote(event.target.value)}
            disabled={!props.canEdit}
            placeholder="Explain how the finding was handled"
          />
        </label>
      </section>
    </div>
  );
}
function CompactAssessment({
  detail,
  canEdit,
  onRecordCondition,
  onRecordValuation,
}: {
  detail: SubmissionReviewDetail;
  canEdit: boolean;
  onRecordCondition: () => void;
  onRecordValuation: () => void;
}) {
  const valuation = detail.staffReview?.valuation;
  return (
    <div className="admin-review-assessment admin-review-assessment-compact">
      <div className="admin-review-two-panel">
        <Info title="Condition">
          <strong>{detail.staffReview?.condition ?? "Not recorded"}</strong>
          <span>{detail.staffReview?.conditionNote ?? "Optional staff context"}</span>
          <button
            type="button"
            className="button-secondary"
            onClick={onRecordCondition}
            disabled={!canEdit}
          >
            <Pencil aria-hidden="true" /> Record condition
          </button>
        </Info>
        <Info title="AI advisory · read only">
          <strong>{detail.preGrade?.conditionLabel ?? "No advisory returned"}</strong>
          <span>
            {detail.preGrade?.overallEstimate != null
              ? `Suggested score ${detail.preGrade.overallEstimate.toFixed(1)}`
              : "No score returned"}
          </span>
          <small>Advisory only — never applies condition, grade, or valuation.</small>
        </Info>
      </div>
      <div className="admin-review-two-panel">
        <Info title="Review valuation">
          <strong>
            {valuation
              ? formatMoneyMinor(valuation.valueMinor, valuation.currency)
              : "Not recorded"}
          </strong>
          <span>{valuation?.basis ?? "Review-stage staff context only"}</span>
          <button
            type="button"
            className="button-secondary"
            onClick={onRecordValuation}
            disabled={!canEdit}
          >
            <Pencil aria-hidden="true" /> Add review valuation
          </button>
        </Info>
        <Info title="Reference inputs">
          <strong>
            {detail.researchReferences?.filter((reference) => reference.status === "ACTIVE")
              .length ?? 0}{" "}
            external references
          </strong>
          <span>Final canonical valuation is managed in Asset Operations.</span>
        </Info>
      </div>
    </div>
  );
}

function DecisionRail({
  detail,
  staleReview,
  onRefresh,
  onClaim,
  claiming,
  onAssignment,
  onRelease,
  releasing,
  onRecovery,
  onNotes,
  onFinding,
  onHelp,
  onManage,
  onCanonicalize,
  canonicalizing,
  onDecision,
}: {
  detail: SubmissionReviewDetail;
  staleReview: boolean;
  onRefresh: () => void;
  onClaim: () => void;
  claiming: boolean;
  onAssignment: () => void;
  onRelease: () => void;
  releasing: boolean;
  onRecovery: () => void;
  onNotes: () => void;
  onFinding: () => void;
  onHelp: () => void;
  onManage: () => void;
  onCanonicalize: () => void;
  canonicalizing: boolean;
  onDecision: (value: Decision) => void;
}) {
  const workspace = detail.reviewWorkspace;
  if (!workspace) return null;
  const contributors = workspace.contributors ?? [];
  return (
    <aside className="admin-review-decision-rail">
      <section className="admin-panel-card admin-review-status-card">
        <div className="admin-review-status-card-heading">
          <h2>Current state</h2>
          <StatusPill
            value={workspace.selfReviewBlocked ? "Awaiting reviewer" : currentStateLabel(detail)}
          />
        </div>
        <div className="admin-review-status-line">
          <span>State</span>
          <strong>{currentStateLabel(detail)}</strong>
        </div>
        <div className="admin-review-status-line">
          <span>Why</span>
          <strong>{currentStateReason(detail)}</strong>
        </div>
        <div className="admin-review-next-action">
          <span>Next action</span>
          <strong>{nextActionTitle(detail)}</strong>
          {nextActionCopy(workspace.nextAction) ? (
            <p>{nextActionCopy(workspace.nextAction)}</p>
          ) : null}
        </div>
        <div className="admin-review-status-line">
          <span>After approval</span>
          <strong>
            {detail.assetId
              ? "Open Physical Intake"
              : "Create canonical collectible → Physical Intake"}
          </strong>
        </div>
      </section>
      <section className="admin-panel-card admin-review-eligibility-card">
        <h2>Decision eligibility</h2>
        {detail.reviewWorkspace?.selfReviewBlocked ? (
          <div className="admin-review-eligibility-state is-blocked">
            <span aria-hidden="true">×</span>
            <div>
              <strong>Self-review blocked</strong>
              <p>You cannot make the final decision on your own submission.</p>
            </div>
          </div>
        ) : detail.readiness?.decisionEligible ? (
          <div className="admin-review-eligibility-state is-ready">
            <CheckCircle2 aria-hidden="true" />
            <div>
              <strong>Eligible to decide</strong>
              <p>All required review gates are complete.</p>
            </div>
          </div>
        ) : (
          <div className="admin-review-eligibility-state is-blocked">
            <AlertTriangle aria-hidden="true" />
            <div>
              <strong>Not ready</strong>
              <p>Complete the required review items before deciding.</p>
            </div>
          </div>
        )}
      </section>
      <section className="admin-panel-card admin-review-actions-card">
        <h2>Quick actions</h2>
        {staleReview ? (
          <div className="admin-review-decision-actions">
            <p className="text-negative">This review changed while you were working.</p>
            <button type="button" className="button-secondary" onClick={onRefresh}>
              Refresh review
            </button>
          </div>
        ) : (
          <div className="admin-review-decision-actions">
            {detail.status === "SUBMITTED" &&
            !workspace.reviewer &&
            commandAllowed(detail, "canStartReview") ? (
              <button
                type="button"
                className="admin-review-action is-claim"
                onClick={onClaim}
                disabled={claiming}
              >
                <ClipboardCheck aria-hidden="true" />
                {claiming ? "Starting review…" : "Start review"}
                <small>Open the required checks for contribution.</small>
              </button>
            ) : null}
            <button
              type="button"
              className="admin-review-action is-note"
              onClick={onNotes}
              disabled={!commandAllowed(detail, "canRecordAssessment")}
            >
              <MessageSquarePlus aria-hidden="true" /> Add internal note
            </button>
            <button
              type="button"
              className="admin-review-action is-note"
              onClick={onFinding}
              disabled={!commandAllowed(detail, "canAddFinding")}
            >
              <Plus aria-hidden="true" /> Add finding
            </button>
            <button
              type="button"
              className="admin-review-action is-changes"
              onClick={() => onDecision("CHANGES_REQUESTED")}
              disabled={!commandAllowed(detail, "canRequestChanges")}
            >
              <RefreshCw aria-hidden="true" /> Request changes
            </button>
            <button
              type="button"
              className="admin-review-action is-recovery"
              onClick={onRecovery}
              disabled={!commandAllowed(detail, "canRecover")}
            >
              <RotateCcw aria-hidden="true" /> Re-evaluate review state
            </button>
            <button type="button" className="admin-review-action is-manage" onClick={onManage}>
              <ClipboardCheck aria-hidden="true" /> Manage submission{" "}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        )}
      </section>
      <section className="admin-panel-card admin-review-links-card">
        <h2>Quick links</h2>
        <Link to="/admin" search={{ section: "users" }}>
          <Users aria-hidden="true" /> Collector account <span>↗</span>
        </Link>
        <Link to="/admin" search={{ section: "collectibles", asset: detail.assetId ?? undefined }}>
          <Tag aria-hidden="true" /> Canonical collectible (if created) <span>↗</span>
        </Link>
        <Link to="/admin" search={{ section: "intake" }}>
          <Inbox aria-hidden="true" /> Physical intake (if created) <span>↗</span>
        </Link>
        <Link to="/admin" search={{ section: "moderation" }}>
          <ClipboardCheck aria-hidden="true" /> Review queue <span>↗</span>
        </Link>
        <Link to="/admin" search={{ section: "health", tab: "audit" }}>
          <FileClock aria-hidden="true" /> Audit log <span>↗</span>
        </Link>
      </section>
      <section className="admin-panel-card admin-review-summary-card">
        <h2>Submission summary</h2>
        <dl>
          {fact("Category", detail.collectible?.category)}
          {fact("Card number", detail.collectible?.cardNumber)}
          {fact("Year", detail.collectible?.year)}
          {fact("Set", detail.collectible?.set)}
          {fact("Variant", detail.collectible?.variant)}
          {fact(
            "Grade",
            detail.collectible?.grader
              ? `${detail.collectible.grader} ${detail.collectible.grade ?? ""}`
              : "Raw / Ungraded",
          )}
        </dl>
      </section>
    </aside>
  );
}

function ReadinessLine({
  label: lineLabel,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "ready" | "warning" | "negative";
}) {
  return (
    <div className={`admin-review-readiness-line is-${tone}`}>
      <span>{lineLabel}</span>
      <strong>{value}</strong>
    </div>
  );
}

function primaryReviewerLabel(
  state: NonNullable<SubmissionReviewDetail["reviewAssignment"]>["state"] | undefined,
) {
  return (
    (
      {
        CLAIMED_BY_ME: "You",
        CLAIMED_BY_OTHER: "Assigned",
        UNCLAIMED: "Unassigned",
        COMPLETED: "Completed",
      } as Record<string, string>
    )[state ?? "UNCLAIMED"] ?? "Unclaimed"
  );
}

function claimDetail(detail: SubmissionReviewDetail) {
  if (detail.reviewWorkspace?.selfReviewBlocked) return "You cannot review your own submission.";
  if (detail.reviewWorkspace?.claimState === "CLAIMED_BY_OTHER")
    return `${detail.reviewWorkspace.reviewer?.displayName ?? "An authorized reviewer"} coordinates this review; you may still contribute.`;
  if (detail.reviewWorkspace?.claimState === "CLAIMED_BY_ME")
    return "You coordinate this review; other authorized staff can contribute.";
  return "No primary reviewer is assigned yet. Authorized staff can assign themselves to coordinate.";
}
function AssignmentDialog({
  reviewers,
  reviewerId,
  setReviewerId,
  reason,
  setReason,
  currentReviewerId,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  reviewers: Array<{ id: string; displayName: string; username: string | null; roles: string[] }>;
  reviewerId: string;
  setReviewerId: (value: string) => void;
  reason: string;
  setReason: (value: string) => void;
  currentReviewerId: string | null;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  const changed = reviewerId !== (currentReviewerId ?? "");
  return (
    <div
      className="admin-review-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Assign primary reviewer"
    >
      <div className="admin-panel-card admin-review-lightbox-card" tabIndex={-1}>
        <p className="page-kicker">Review team</p>
        <h3>{currentReviewerId ? "Reassign primary reviewer" : "Assign primary reviewer"}</h3>
        <p className="text-sm text-subtle">
          Primary assignment coordinates the review; it does not lock other authorized staff out.
        </p>
        <label>
          Primary reviewer
          <select value={reviewerId} onChange={(event) => setReviewerId(event.target.value)}>
            <option value="">Clear assignment</option>
            {reviewers.map((reviewer) => (
              <option key={reviewer.id} value={reviewer.id}>
                {reviewer.displayName}
                {reviewer.username ? ` · @${reviewer.username}` : ""}
              </option>
            ))}
          </select>
        </label>
        <label>
          Reason {changed ? "(required)" : "(optional)"}
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why is this assignment changing?"
          />
        </label>
        {error ? (
          <p role="alert" className="text-negative">
            {friendlyError(error)}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="button-primary"
            disabled={pending || (changed && !reason.trim())}
            onClick={onConfirm}
          >
            {pending ? "Saving…" : "Save assignment"}
          </button>
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
function DecisionDialog({
  decision,
  findings,
  reason,
  setReason,
  requestedItems,
  setRequestedItems,
  message,
  setMessage,
  internalNote,
  setInternalNote,
  requestedFindingIds,
  setRequestedFindingIds,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  decision: Decision;
  findings: NonNullable<SubmissionReviewDetail["reviewFindings"]>;
  reason: string;
  setReason: (value: string) => void;
  requestedItems: string[];
  setRequestedItems: (value: string[]) => void;
  message: string;
  setMessage: (value: string) => void;
  internalNote: string;
  setInternalNote: (value: string) => void;
  requestedFindingIds: string[];
  setRequestedFindingIds: (value: string[]) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  const changes = decision === "CHANGES_REQUESTED";
  const rejected = decision === "REJECTED";
  const [confirmed, setConfirmed] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);
  const title =
    decision === "APPROVED"
      ? "Approve submission"
      : decision === "REJECTED"
        ? "Reject submission"
        : "Request changes";
  return (
    <div className="admin-review-lightbox" role="dialog" aria-modal="true" aria-label={title}>
      <div className="admin-panel-card admin-review-lightbox-card" ref={dialogRef} tabIndex={-1}>
        <h3>{title}</h3>
        <p className="text-sm text-subtle">
          {decision === "APPROVED"
            ? "Approval completes review only. It does not confirm physical receipt, custody, ownership, offering, or publication."
            : decision === "REJECTED"
              ? "This rejects this submission. It does not alter unrelated collector records."
              : "The collector will receive this request and may update the submission."}
        </p>
        <label>
          {decision === "APPROVED" ? "Approval basis" : "Reason"}
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {DECISION_REASON_OPTIONS[decision].map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        {changes ? (
          <>
            <fieldset>
              <legend>Requested updates</legend>
              {[
                "Identity correction",
                "Missing evidence",
                "Replacement image",
                "Certification issue",
                "Incomplete information",
                "Other",
              ].map((item) => (
                <label key={item}>
                  <input
                    type="checkbox"
                    checked={requestedItems.includes(item)}
                    onChange={(event) =>
                      setRequestedItems(
                        event.target.checked
                          ? [...requestedItems, item]
                          : requestedItems.filter((value) => value !== item),
                      )
                    }
                  />{" "}
                  {item}
                </label>
              ))}
            </fieldset>
            {findings.some((finding) => finding.status === "OPEN" && finding.customerAction) ? (
              <fieldset>
                <legend>Findings to include in collector request</legend>
                {findings
                  .filter((finding) => finding.status === "OPEN" && finding.customerAction)
                  .map((finding) => (
                    <label key={finding.id}>
                      <input
                        type="checkbox"
                        checked={requestedFindingIds.includes(finding.id)}
                        onChange={(event) =>
                          setRequestedFindingIds(
                            event.target.checked
                              ? [...requestedFindingIds, finding.id]
                              : requestedFindingIds.filter((id) => id !== finding.id),
                          )
                        }
                      />{" "}
                      {finding.title}
                    </label>
                  ))}
              </fieldset>
            ) : null}
            <label>
              Message to collector
              <textarea
                rows={4}
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                placeholder="Explain what is needed to continue review."
              />
            </label>
            <label>
              Internal note (optional)
              <textarea
                rows={2}
                value={internalNote}
                onChange={(event) => setInternalNote(event.target.value)}
                placeholder="Audited staff-only decision note"
              />
            </label>
          </>
        ) : rejected ? (
          <label>
            Internal reason
            <textarea
              rows={3}
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="Record the staff reason for this rejection."
            />
          </label>
        ) : (
          <label>
            Internal note (optional)
            <textarea
              rows={2}
              value={internalNote}
              onChange={(event) => setInternalNote(event.target.value)}
              placeholder="Add context for the approval record, if needed."
            />
          </label>
        )}
        {rejected ? (
          <label className="admin-review-confirm-check">
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(event) => setConfirmed(event.target.checked)}
            />
            I understand this permanently rejects this submission.
          </label>
        ) : null}
        {error ? (
          <p role="alert" className="text-negative">
            {friendlyError(error)}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="button-primary"
            onClick={onConfirm}
            disabled={
              pending ||
              (changes && (!message.trim() || !requestedItems.length)) ||
              (rejected && !internalNote.trim()) ||
              (rejected && !confirmed)
            }
          >
            {pending ? "Saving…" : "Confirm"}
          </button>
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
function RecoveryDialog({
  reason,
  setReason,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  reason: string;
  setReason: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    dialogRef.current?.focus();
  }, []);
  return (
    <div
      className="admin-review-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label="Submission recovery"
    >
      <div className="admin-panel-card admin-review-lightbox-card" ref={dialogRef} tabIndex={-1}>
        <p className="page-kicker">Submission recovery</p>
        <h3>Recalculate review readiness</h3>
        <p className="text-sm text-subtle">
          Re-reads the authoritative submission state and records an audit event. It does not force
          approval, canonicalization, or any workflow transition.
        </p>
        <label>
          Reason
          <textarea
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why the review projection needs to be recalculated"
          />
        </label>
        {error ? (
          <p role="alert" className="text-negative">
            {friendlyError(error)}
          </p>
        ) : null}
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="button-primary"
            onClick={onConfirm}
            disabled={pending || !reason.trim()}
          >
            {pending ? "Recalculating…" : "Confirm recovery"}
          </button>
          <button type="button" className="button-secondary" onClick={onCancel}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
function PostApproval({
  detail,
  onCanonicalize,
  canonicalizing,
  error,
}: {
  detail: SubmissionReviewDetail;
  onCanonicalize: () => void;
  canonicalizing: boolean;
  error: Error | null;
}) {
  return (
    <section className="admin-panel-card mt-4 border border-accent/40 bg-accent/5 p-5">
      <p className="page-kicker">Submission approved ✓</p>
      <h3>
        {detail.assetId ? "Canonical collectible created" : "Next: create canonical collectible"}
      </h3>
      <p className="mt-2 text-sm text-subtle">
        {detail.assetId
          ? "The official collectible is linked. Physical Intake is the next separate workflow."
          : "Create and link the authoritative collectible from this reviewed submission. It does not infer custody, valuation, ownership, offering, or publication."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        {detail.assetId ? (
          <>
            <Link
              className="button-secondary"
              to="/admin"
              search={{ section: "collectibles", asset: detail.assetId }}
            >
              Open Collectible
            </Link>
            <Link className="button-primary" to="/admin" search={{ section: "intake" }}>
              Open Physical Intake
            </Link>
          </>
        ) : (
          <button
            type="button"
            className="button-primary"
            onClick={onCanonicalize}
            disabled={canonicalizing}
          >
            {canonicalizing ? "Creating collectible…" : "Create & Link Canonical Collectible"}
          </button>
        )}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-negative">
          {friendlyError(error)}
        </p>
      ) : null}
    </section>
  );
}
function ReviewFindings({
  detail,
  canAdd,
  canResolve,
  onAdd,
  onUpdate,
  updating,
}: {
  detail: SubmissionReviewDetail;
  canAdd: boolean;
  canResolve: boolean;
  onAdd: () => void;
  onUpdate: (findingId: string, status: "RESOLVED" | "DISMISSED") => void;
  updating: boolean;
}) {
  const findings = detail.reviewFindings ?? [];
  const open = findings.filter((finding) => finding.status === "OPEN");
  const blocking = open.filter((finding) => finding.severity === "BLOCKING").length;
  const advisory = open.filter((finding) => finding.severity === "ADVISORY").length;
  return (
    <section
      id="review-findings"
      className="admin-panel-card admin-review-findings"
      aria-label="Review findings"
    >
      <div className="admin-review-findings-heading">
        <div>
          <p className="page-kicker">Overall review</p>
          <h2>Review findings</h2>
          <p className="text-sm text-subtle">
            Findings are independent of Staff Assessment and remain in the review record until
            resolved or dismissed.
          </p>
        </div>
        <button type="button" className="button-secondary" onClick={onAdd} disabled={!canAdd}>
          <Plus aria-hidden="true" /> Add finding
        </button>
      </div>
      <div className="admin-review-finding-counts">
        <span className={blocking ? "is-blocking" : "is-clear"}>{blocking} blocking</span>
        <span>{advisory} advisory</span>
        <span>{open.length} open</span>
      </div>
      <div className="admin-review-finding-list">
        {findings.length ? (
          findings.map((finding) => (
            <article
              key={finding.id}
              className={`admin-review-finding is-${finding.severity.toLowerCase()} is-${finding.status.toLowerCase()}`}
            >
              <div>
                <strong>{finding.title}</strong>
                <small>
                  {label(finding.section)} · {label(finding.severity)} · {label(finding.status)}
                </small>
                {finding.detail ? <p>{finding.detail}</p> : null}
                {finding.customerAction ? (
                  <span className="admin-review-finding-customer-action">
                    Collector action required
                  </span>
                ) : null}
                <small>Created {formatDate(finding.createdAt)}</small>
              </div>
              {finding.status === "OPEN" ? (
                <div className="admin-review-finding-actions">
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={!canResolve || updating}
                    onClick={() => onUpdate(finding.id, "RESOLVED")}
                  >
                    Resolve
                  </button>
                  <button
                    type="button"
                    className="button-secondary"
                    disabled={!canResolve || updating}
                    onClick={() => onUpdate(finding.id, "DISMISSED")}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <p className="text-sm text-subtle">No findings have been recorded.</p>
        )}
      </div>
    </section>
  );
}

function ReviewNotes({
  detail,
  open,
  onOpen,
  onClose,
  note,
  setNote,
  onSave,
  canEdit,
  saving,
}: {
  detail: SubmissionReviewDetail;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  note: string;
  setNote: (value: string) => void;
  onSave: () => void;
  canEdit: boolean;
  saving: boolean;
}) {
  const history = detail.notes?.history ?? [];
  return (
    <>
      <span id="review-notes" className="admin-review-notes-anchor" aria-hidden="true" />
      {open ? (
        <div
          className="admin-review-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Add internal note"
        >
          <div className="admin-review-drawer-card">
            <button
              type="button"
              className="admin-review-close"
              onClick={onClose}
              aria-label="Close"
            >
              <X />
            </button>
            <p className="page-kicker">Review-wide context</p>
            <h3>Add internal note</h3>
            {history.length ? (
              <p className="text-sm text-subtle">
                {history.length} previous staff note{history.length === 1 ? "" : "s"} remain in the
                audit history.
              </p>
            ) : null}
            <textarea
              rows={5}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Record context for the next reviewer."
              autoFocus
            />
            <div className="admin-review-dialog-actions">
              <button
                type="button"
                className="button-primary"
                onClick={onSave}
                disabled={!note.trim() || saving}
              >
                {saving ? "Saving…" : "Save note"}
              </button>
              <button type="button" className="button-secondary" onClick={onClose}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}

function ReviewHistory({ detail }: { detail: SubmissionReviewDetail }) {
  const [filter, setFilter] = useState("All");
  const events = [
    ...detail.reviews.map((item) => ({
      id: item.id ?? item.createdAt,
      action: humanReviewEvent(item.decision ?? item.status),
      actor: item.actor?.displayName ?? null,
      detail: item.note ?? null,
      occurredAt: item.createdAt,
    })),
    ...(detail.activity ?? []).map((item) => ({
      id: item.id,
      action: humanReviewEvent(item.action),
      actor: item.actor,
      detail: item.detail,
      occurredAt: item.occurredAt,
    })),
  ]
    .filter((item) => !item.action.toLowerCase().includes("draft updated"))
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  const filtered =
    filter === "All"
      ? events
      : events.filter((item) => item.action.toLowerCase().includes(filter.toLowerCase()));
  return (
    <section id="review-history" className="admin-panel-card">
      <div className="admin-review-findings-heading">
        <div>
          <p className="page-kicker">Operational projection</p>
          <h2>Review history</h2>
        </div>
        <div className="admin-review-history-filters">
          {["All", "Review", "Evidence", "Assessment", "Decision", "Notes", "Recovery"].map(
            (value) => (
              <button
                key={value}
                type="button"
                className={filter === value ? "is-active" : undefined}
                onClick={() => setFilter(value)}
              >
                {value}
              </button>
            ),
          )}
        </div>
      </div>
      <ul className="admin-review-history mt-4">
        {filtered.length ? (
          filtered.map((item) => (
            <li key={item.id}>
              <strong>{item.action}</strong>
              <span>{formatDate(item.occurredAt)}</span>
              {item.actor ? <small>By {item.actor}</small> : null}
              {item.detail ? <p>{item.detail}</p> : null}
            </li>
          ))
        ) : (
          <li className="text-sm text-subtle">No review history yet.</li>
        )}
      </ul>
    </section>
  );
}
function ReviewDialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="admin-review-drawer" role="dialog" aria-modal="true" aria-label={title}>
      <div className="admin-review-drawer-card admin-review-form-dialog">
        <button type="button" className="admin-review-close" onClick={onClose} aria-label="Close">
          <X />
        </button>
        <h3>{title}</h3>
        {children}
      </div>
    </div>
  );
}

function FlagEvidenceDialog({
  item,
  note,
  setNote,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  item: NonNullable<SubmissionReviewDetail["evidenceSummary"]>["items"][number] | null;
  note: string;
  setNote: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  if (!item) return null;
  return (
    <ReviewDialog title={`Flag ${label(item.slot)} evidence`} onClose={onCancel}>
      <p className="text-sm text-subtle">
        This creates a blocking review finding and preserves the original evidence for audit.
      </p>
      <label>
        Issue detail
        <textarea
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="What needs attention?"
          autoFocus
        />
      </label>
      {error ? (
        <p role="alert" className="text-negative">
          {friendlyError(error)}
        </p>
      ) : null}
      <div className="admin-review-dialog-actions">
        <button type="button" className="button-primary" onClick={onConfirm} disabled={pending}>
          {pending ? "Flagging…" : "Flag evidence"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </ReviewDialog>
  );
}

function IdentityDialog({
  identity,
  setIdentity,
  note,
  setNote,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  identity: { name: string; year: string; set: string; cardNumber: string; variant: string };
  setIdentity: (value: {
    name: string;
    year: string;
    set: string;
    cardNumber: string;
    variant: string;
  }) => void;
  note: string;
  setNote: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  return (
    <ReviewDialog title="Edit review identity" onClose={onCancel}>
      <p className="text-sm text-subtle">
        Submitted identity remains preserved. This records the staff-reviewed identity separately.
      </p>
      <div className="admin-review-form-grid">
        {(
          [
            ["name", "Title"],
            ["year", "Year"],
            ["set", "Set"],
            ["cardNumber", "Card number"],
            ["variant", "Variant"],
          ] as const
        ).map(([field, title]) => (
          <label key={field}>
            {title}
            <input
              value={identity[field]}
              onChange={(event) => setIdentity({ ...identity, [field]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <label>
        Review note
        <textarea
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Authority used to confirm identity."
        />
      </label>
      {error ? (
        <p role="alert" className="text-negative">
          {friendlyError(error)}
        </p>
      ) : null}
      <div className="admin-review-dialog-actions">
        <button
          type="button"
          className="button-primary"
          onClick={onConfirm}
          disabled={pending || !identity.name.trim() || !note.trim()}
        >
          {pending ? "Saving…" : "Confirm identity"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </ReviewDialog>
  );
}

function CertificationDialog({
  verifiedGrade,
  setVerifiedGrade,
  verifiedName,
  setVerifiedName,
  verifiedYear,
  setVerifiedYear,
  verifiedSet,
  setVerifiedSet,
  verifiedCardNumber,
  setVerifiedCardNumber,
  designation,
  setDesignation,
  providerReference,
  setProviderReference,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  verifiedGrade: string;
  setVerifiedGrade: (value: string) => void;
  verifiedName: string;
  setVerifiedName: (value: string) => void;
  verifiedYear: string;
  setVerifiedYear: (value: string) => void;
  verifiedSet: string;
  setVerifiedSet: (value: string) => void;
  verifiedCardNumber: string;
  setVerifiedCardNumber: (value: string) => void;
  designation: string;
  setDesignation: (value: string) => void;
  providerReference: string;
  setProviderReference: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  return (
    <ReviewDialog title="Manual certification verification" onClose={onCancel}>
      <p className="text-sm text-subtle">
        Compare the official provider reference with the submitted identity. This is verification
        evidence, not an authenticity guarantee.
      </p>
      <div className="admin-review-form-grid">
        <label>
          Verified name
          <input value={verifiedName} onChange={(event) => setVerifiedName(event.target.value)} />
        </label>
        <label>
          Verified year
          <input value={verifiedYear} onChange={(event) => setVerifiedYear(event.target.value)} />
        </label>
        <label>
          Verified set
          <input value={verifiedSet} onChange={(event) => setVerifiedSet(event.target.value)} />
        </label>
        <label>
          Verified card number
          <input
            value={verifiedCardNumber}
            onChange={(event) => setVerifiedCardNumber(event.target.value)}
          />
        </label>
        <label>
          Verified grade
          <input value={verifiedGrade} onChange={(event) => setVerifiedGrade(event.target.value)} />
        </label>
        <label>
          Designation
          <input value={designation} onChange={(event) => setDesignation(event.target.value)} />
        </label>
      </div>
      <label>
        Official reference
        <input
          value={providerReference}
          onChange={(event) => setProviderReference(event.target.value)}
          placeholder="URL or provider reference"
        />
      </label>
      {error ? (
        <p role="alert" className="text-negative">
          {friendlyError(error)}
        </p>
      ) : null}
      <div className="admin-review-dialog-actions">
        <button
          type="button"
          className="button-primary"
          onClick={onConfirm}
          disabled={pending || !verifiedGrade.trim() || !verifiedName.trim()}
        >
          {pending ? "Verifying…" : "Record verification"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </ReviewDialog>
  );
}

function FindingDialog({
  section,
  setSection,
  title,
  setTitle,
  detail,
  setDetail,
  severity,
  setSeverity,
  customerAction,
  setCustomerAction,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  section: "identity" | "evidence" | "certification" | "research" | "assessment" | "decision";
  setSection: (
    value: "identity" | "evidence" | "certification" | "research" | "assessment" | "decision",
  ) => void;
  title: string;
  setTitle: (value: string) => void;
  detail: string;
  setDetail: (value: string) => void;
  severity: "ADVISORY" | "BLOCKING";
  setSeverity: (value: "ADVISORY" | "BLOCKING") => void;
  customerAction: boolean;
  setCustomerAction: (value: boolean) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  return (
    <ReviewDialog title="Add review finding" onClose={onCancel}>
      <label>
        Section
        <select
          value={section}
          onChange={(event) => setSection(event.target.value as typeof section)}
        >
          <option value="identity">Identity</option>
          <option value="evidence">Evidence</option>
          <option value="certification">Grade & Certification</option>
          <option value="research">Market Research</option>
          <option value="assessment">Staff Assessment</option>
          <option value="decision">Decision</option>
        </select>
      </label>
      <label>
        Finding title
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Describe the issue or advisory"
          autoFocus
        />
      </label>
      <label>
        Detail
        <textarea
          rows={3}
          value={detail}
          onChange={(event) => setDetail(event.target.value)}
          placeholder="Context for other reviewers"
        />
      </label>
      <label>
        Severity
        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value as typeof severity)}
        >
          <option value="ADVISORY">Advisory</option>
          <option value="BLOCKING">Blocking</option>
        </select>
      </label>
      <label className="admin-review-checkbox-label">
        <input
          type="checkbox"
          checked={customerAction}
          onChange={(event) => setCustomerAction(event.target.checked)}
        />{" "}
        Collector action required
      </label>
      {error ? (
        <p role="alert" className="text-negative">
          {friendlyError(error)}
        </p>
      ) : null}
      <div className="admin-review-dialog-actions">
        <button
          type="button"
          className="button-primary"
          onClick={onConfirm}
          disabled={pending || !title.trim()}
        >
          {pending ? "Recording…" : "Add finding"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </ReviewDialog>
  );
}

function ResearchDialog({
  provider,
  setProvider,
  url,
  setUrl,
  referenceId,
  setReferenceId,
  currency,
  setCurrency,
  value,
  setValue,
  note,
  setNote,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  provider: string;
  setProvider: (value: string) => void;
  url: string;
  setUrl: (value: string) => void;
  referenceId: string;
  setReferenceId: (value: string) => void;
  currency: string;
  setCurrency: (value: string) => void;
  value: string;
  setValue: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  return (
    <ReviewDialog title="Add research reference" onClose={onCancel}>
      <label>
        Source
        <select value={provider} onChange={(event) => setProvider(event.target.value)}>
          <option value="">Select a source</option>
          <option>PriceCharting</option>
          <option>PSA</option>
          <option>eBay</option>
          <option>Other</option>
        </select>
      </label>
      <label>
        Reference URL
        <input
          type="url"
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          placeholder="https://…"
        />
      </label>
      <label>
        Reference ID <span className="text-subtle">(optional)</span>
        <input value={referenceId} onChange={(event) => setReferenceId(event.target.value)} />
      </label>
      <div className="admin-review-form-grid">
        <label>
          Reference value
          <input
            inputMode="decimal"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder="e.g. 125.00"
          />
        </label>
        <label>
          Currency
          <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
            <option value="">Select</option>
            <option>GBP</option>
            <option>USD</option>
            <option>EUR</option>
          </select>
        </label>
      </div>
      <label>
        Research note
        <textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} />
      </label>
      {error ? (
        <p role="alert" className="text-negative">
          {friendlyError(error)}
        </p>
      ) : null}
      <div className="admin-review-dialog-actions">
        <button
          type="button"
          className="button-primary"
          onClick={onConfirm}
          disabled={pending || !provider.trim() || (!url.trim() && !referenceId.trim())}
        >
          {pending ? "Adding…" : "Add reference"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </ReviewDialog>
  );
}

function ConditionDialog({
  condition,
  setCondition,
  note,
  setNote,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  condition: string;
  setCondition: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  return (
    <ReviewDialog title="Record staff condition" onClose={onCancel}>
      <label>
        Condition
        <select value={condition} onChange={(event) => setCondition(event.target.value)}>
          <option value="">Select condition</option>
          <option>Mint</option>
          <option>Near Mint</option>
          <option>Excellent</option>
          <option>Very Good</option>
          <option>Good</option>
        </select>
      </label>
      <label>
        Assessment note
        <textarea
          rows={4}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Staff-only assessment context"
        />
      </label>
      {error ? (
        <p role="alert" className="text-negative">
          {friendlyError(error)}
        </p>
      ) : null}
      <div className="admin-review-dialog-actions">
        <button
          type="button"
          className="button-primary"
          onClick={onConfirm}
          disabled={pending || !condition.trim()}
        >
          {pending ? "Saving…" : "Save condition"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </ReviewDialog>
  );
}

function ValuationDialog({
  value,
  setValue,
  basis,
  setBasis,
  confidence,
  setConfidence,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  value: string;
  setValue: (value: string) => void;
  basis: string;
  setBasis: (value: string) => void;
  confidence: string;
  setConfidence: (value: string) => void;
  onCancel: () => void;
  onConfirm: () => void;
  pending: boolean;
  error: Error | null;
}) {
  return (
    <ReviewDialog title="Add review valuation" onClose={onCancel}>
      <p className="text-sm text-subtle">
        Review-stage staff context only. Final canonical Asset valuation is managed in Asset
        Operations.
      </p>
      <label>
        Estimated GBP value
        <input
          inputMode="decimal"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          placeholder="e.g. 250.00"
          autoFocus
        />
      </label>
      <label>
        Valuation basis
        <input value={basis} onChange={(event) => setBasis(event.target.value)} />
      </label>
      <label>
        Confidence (%)
        <input
          type="number"
          min="0"
          max="100"
          value={confidence}
          onChange={(event) => setConfidence(event.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-negative">
          {friendlyError(error)}
        </p>
      ) : null}
      <div className="admin-review-dialog-actions">
        <button
          type="button"
          className="button-primary"
          onClick={onConfirm}
          disabled={pending || !/^\d+(\.\d{1,2})?$/.test(value)}
        >
          {pending ? "Saving…" : "Save valuation"}
        </button>
        <button type="button" className="button-secondary" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </ReviewDialog>
  );
}

function ReviewHelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <ReviewDialog title="How review works" onClose={onClose}>
      <div className="admin-review-help">
        <p>
          <strong>Purpose</strong> Determine whether Slice should accept this collectible.
        </p>
        <p>
          <strong>Required</strong> Identity, evidence, and certification where applicable.
        </p>
        <p>
          <strong>Optional</strong> Market research and staff assessment.
        </p>
        <p>
          <strong>Reviewers</strong> Any authorized reviewer may contribute; primary assignment is
          coordination only.
        </p>
        <p>
          <strong>Restriction</strong> The person who submitted the collectible cannot review their
          own submission.
        </p>
        <p>
          <strong>After approval</strong> Create the Canonical Collectible, then continue to
          Physical Intake.
        </p>
        <p>
          <strong>Not handled here</strong> Custody, final valuation, ownership, offering, or market
          launch.
        </p>
      </div>
    </ReviewDialog>
  );
}

function ManageSubmissionDialog({
  detail,
  onClose,
}: {
  detail: SubmissionReviewDetail;
  onClose: () => void;
}) {
  return (
    <ReviewDialog title="Manage submission" onClose={onClose}>
      <p className="text-sm text-subtle">
        Protected recovery commands remain reasoned, revision-checked, and audited by the backend.
      </p>
      <div className="admin-review-manage-list">
        <div>
          <strong>Current revision</strong>
          <span>v{detail.version}</span>
        </div>
        <div>
          <strong>Submission state</strong>
          <span>{currentStateLabel(detail)}</span>
        </div>
        <div>
          <strong>History</strong>
          <a href="#review-history" onClick={onClose}>
            View operational history
          </a>
        </div>
        <div>
          <strong>Technical audit</strong>
          <span>Available through Platform Operations → Audit Log</span>
        </div>
      </div>
    </ReviewDialog>
  );
}

function MediaDialog({
  items,
  selectedId,
  onClose,
  onSelect,
}: {
  items: NonNullable<SubmissionReviewDetail["evidenceSummary"]>["items"];
  selectedId: string | null;
  onClose: () => void;
  onSelect: (id: string | null) => void;
}) {
  const [zoom, setZoom] = useState(1);
  const dialogRef = useRef<HTMLDivElement>(null);
  const index = selectedId ? items.findIndex((item) => item.id === selectedId) : -1;
  const item = index >= 0 ? items[index] : null;
  useEffect(() => {
    if (!item) return;
    setZoom(1);
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft" && index > 0) onSelect(items[index - 1]!.id);
      if (event.key === "ArrowRight" && index < items.length - 1) onSelect(items[index + 1]!.id);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, item, items, onClose, onSelect]);
  if (!item) return null;
  return (
    <div
      className="admin-review-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={label(item.slot) + " evidence"}
    >
      <div className="admin-panel-card admin-review-lightbox-card" ref={dialogRef} tabIndex={-1}>
        <div className="flex items-center justify-between">
          <strong>
            {label(item.slot)} evidence · {index + 1} of {items.length}
          </strong>
          <button type="button" className="button-secondary" onClick={onClose}>
            Close
          </button>
        </div>
        <div className="admin-review-lightbox-toolbar" aria-label="Evidence viewer controls">
          <button
            type="button"
            onClick={() => index > 0 && onSelect(items[index - 1]!.id)}
            disabled={index === 0}
            aria-label="Previous evidence"
          >
            ‹
          </button>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.max(0.6, value - 0.2))}
            aria-label="Zoom out"
          >
            −
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button
            type="button"
            onClick={() => setZoom((value) => Math.min(2.4, value + 0.2))}
            aria-label="Zoom in"
          >
            +
          </button>
          <button type="button" onClick={() => setZoom(1)}>
            Fit
          </button>
          {item.thumbnailUrl ? (
            <a href={item.thumbnailUrl} target="_blank" rel="noreferrer">
              Full image ↗
            </a>
          ) : null}
          <button
            type="button"
            onClick={() => index < items.length - 1 && onSelect(items[index + 1]!.id)}
            disabled={index === items.length - 1}
            aria-label="Next evidence"
          >
            ›
          </button>
        </div>
        <div
          className="admin-review-lightbox-media"
          style={{ "--review-media-zoom": String(zoom) } as CSSProperties}
        >
          <AdminReviewMedia
            src={item.thumbnailUrl}
            alt={label(item.slot) + " evidence enlarged"}
            fallback={<span>Secure preview unavailable</span>}
          />
        </div>
      </div>
    </div>
  );
}
function Info({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="admin-review-info-panel">
      <span>{title}</span>
      {children}
    </div>
  );
}
function StatusPill({ value }: { value: string }) {
  const lower = value.toLowerCase();
  const tone =
    lower.includes("complete") ||
    lower.includes("ready") ||
    lower.includes("approved") ||
    lower.includes("verified")
      ? "ready"
      : lower.includes("blocked") ||
          lower.includes("reject") ||
          lower.includes("mismatch") ||
          lower.includes("conflict")
        ? "negative"
        : lower.includes("await") || lower.includes("required") || lower.includes("needs review")
          ? "warning"
          : lower.includes("optional") || lower.includes("not applicable")
            ? "neutral"
            : "info";
  return <span className={"admin-review-status-pill is-" + tone}>{value}</span>;
}
function reviewPurpose(step: string) {
  return (
    (
      {
        identity: "Confirm canonical identity",
        evidence: "Confirm required evidence",
        certification: "Validate grade and certification",
        research: "Review optional market context",
        assessment: "Record optional staff assessment",
        decision: "Record the authorized review decision",
      } as Record<string, string>
    )[step] ?? "Review this section"
  );
}
function isStaleReviewError(error: unknown) {
  return error instanceof ApiError && error.code === "SUBMISSION_VERSION_CONFLICT";
}
function commandAllowed(detail: SubmissionReviewDetail, id: string) {
  const command = detail.availableCommands?.find((item) => item.id === id);
  if (command) return command.allowed;
  return Boolean(detail.allowedActions?.canEdit ?? detail.reviewWorkspace?.canEdit);
}
function ReviewLoadingSkeleton() {
  return (
    <section
      className="admin-review-loading"
      aria-label="Loading submission review"
      aria-busy="true"
    >
      <div />
      <div />
      <div />
      <div />
    </section>
  );
}
function PageState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <section className="admin-panel-card p-8 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-subtle">{detail}</p>
      {retry ? (
        <button type="button" className="button-secondary mt-4" onClick={retry}>
          Try again
        </button>
      ) : null}
    </section>
  );
}
function fact(name: string, value: string | null | undefined) {
  return (
    <div className="admin-review-identity-field" key={name}>
      <span>{name}</span>
      <strong>{value || "Not supplied"}</strong>
    </div>
  );
}
function metadataValue(detail: SubmissionReviewDetail | undefined, key: string) {
  const value = detail?.declaredMetadata?.[key];
  return typeof value === "string" || typeof value === "number" ? String(value) : null;
}
type ReviewProgressItem = NonNullable<SubmissionReviewDetail["readiness"]>["progress"][number];

function progressLabel(item: ReviewProgressItem) {
  return item.key === "certification" ? "Grade & Cert." : item.label;
}
function progressSummary(item: ReviewProgressItem) {
  if (item.key === "identity" && item.status === "COMPLETE") return "Confirmed";
  if (item.key === "certification" && item.status === "NOT_APPLICABLE") return "Resolved";
  if (item.key === "decision" && item.status === "BLOCKED") return "Awaiting reviewer";
  return item.summary
    .replace("Identity confirmed", "Confirmed")
    .replace("Certification resolved", "Resolved");
}
function workflowSummary(detail: SubmissionReviewDetail, step: string, status: string | undefined) {
  const actor = workflowActor(detail, step);
  if (step === "identity")
    return actor ? `Confirmed by ${actor}` : status === "COMPLETE" ? "Confirmed" : "Needs review";
  if (step === "evidence") {
    const evidence = detail.evidenceSummary;
    return evidence
      ? `${evidence.acceptedRequired} of ${evidence.required} accepted`
      : "Evidence unavailable";
  }
  if (step === "certification") {
    return detail.collectible?.grader
      ? detail.certificationVerification?.status === "MISMATCH"
        ? "Mismatch requires review"
        : "Resolved"
      : "Resolved";
  }
  if (step === "research") {
    const recorded = detail.marketResearch
      ? Math.min(detail.marketResearch.observations.length || 1, 3)
      : 0;
    return `${recorded} of 3 recorded`;
  }
  if (step === "assessment") return actor ? "Recorded" : "Not recorded";
  if (detail.status === "APPROVED") return "Approved";
  if (detail.status === "REJECTED") return "Rejected";
  if (detail.status === "CHANGES_REQUESTED") return "Changes requested";
  return detail.reviewWorkspace?.selfReviewBlocked ? "Awaiting reviewer" : "Not recorded";
}
function workflowStatusLabel(status: string) {
  if (status === "NOT_APPLICABLE") return "Resolved";
  if (status === "BLOCKED") return "Blocked";
  if (status === "NEEDS_REVIEW") return "Action required";
  return label(status);
}
function workflowDetail(detail: SubmissionReviewDetail, step: string) {
  const actor = workflowActor(detail, step);
  if (step === "identity")
    return actor ? workflowDate(detail, step) : "Collector identity is ready for confirmation";
  if (step === "evidence")
    return actor
      ? `Reviewed by ${actor} · ${workflowDate(detail, step)}`
      : "Required evidence review pending";
  if (step === "certification")
    return detail.collectible?.grader
      ? "Official grading reference checked"
      : "Raw / Ungraded · certification not required";
  if (step === "research")
    return detail.marketResearch?.collectedAt
      ? `Last checked ${shortDate(detail.marketResearch.collectedAt)}`
      : "Optional · reference available";
  if (step === "assessment")
    return actor ? `${actor} · ${workflowDate(detail, step)}` : "Optional staff assessment";
  return detail.reviewWorkspace?.selfReviewBlocked
    ? "Another authorized reviewer must act"
    : nextActionCopy(detail.reviewWorkspace?.nextAction);
}
function workflowActor(detail: SubmissionReviewDetail, step: string) {
  if (step === "identity") {
    return (
      detail.activity?.find((item) => item.action === "SUBMISSION_REVIEW_IDENTITY_CONFIRMED")
        ?.actor ?? null
    );
  }
  if (step === "assessment") {
    return (
      [...detail.reviews].reverse().find((item) => item.note || item.actor)?.actor?.displayName ??
      null
    );
  }
  if (step === "evidence")
    return (
      detail.evidenceSummary?.items.find((item) => item.reviewedBy)?.reviewedBy?.displayName ?? null
    );
  return null;
}
function workflowDate(detail: SubmissionReviewDetail, step: string) {
  if (step === "identity") {
    const event = detail.activity?.find(
      (item) => item.action === "SUBMISSION_REVIEW_IDENTITY_CONFIRMED",
    );
    return event ? shortDate(event.occurredAt) : "Recently";
  }
  if (step === "assessment") {
    const review = [...detail.reviews].reverse().find((item) => item.note || item.actor);
    return review ? shortDate(review.updatedAt ?? review.createdAt) : "Recently";
  }
  return detail.reviewAssignment?.lastActivity
    ? shortDate(detail.reviewAssignment.lastActivity)
    : "Recently";
}
function currentStateLabel(detail: SubmissionReviewDetail) {
  if (detail.reviewWorkspace?.selfReviewBlocked) return "Awaiting another reviewer";
  if (detail.status === "APPROVED") return "Approved";
  if (detail.status === "REJECTED") return "Rejected";
  if (detail.status === "CHANGES_REQUESTED") return "Waiting for collector";
  if (detail.status === "SUBMITTED") return "Ready to start";
  if (detail.readiness?.decisionEligible) return "Ready for decision";
  return "Review in progress";
}
function currentStateReason(detail: SubmissionReviewDetail) {
  if (detail.reviewWorkspace?.selfReviewBlocked) return "Self-review is blocked for the submitter.";
  if (detail.status === "SUBMITTED") return "Start review to begin the required checks.";
  return detail.reviewWorkspace?.primaryBlocker ?? "Required review authority is complete.";
}
function nextActionTitle(detail: SubmissionReviewDetail) {
  if (detail.reviewWorkspace?.selfReviewBlocked)
    return "Another authorized reviewer should continue the review.";
  return readinessTitle(detail);
}
function shortDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "Not available";
}
function formatMoneyMinor(value: string, currency: string | null | undefined) {
  const amount = Number(value) / 100;
  if (!Number.isFinite(amount)) return "Unavailable";
  return `${currency ?? "GBP"} ${amount.toFixed(2)}`;
}
function initialsForName(value: string) {
  return (
    value
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0])
      .join("")
      .toUpperCase() || "AD"
  );
}
function readinessTitle(detail: SubmissionReviewDetail) {
  return (
    {
      READY_FOR_DECISION: "Ready for decision",
      CLAIM_REVIEW: "Start collaborative review",
      REVIEWER_REQUIRED: "Another reviewer required",
      REVIEWER_ASSIGNED: "Review in progress",
      REQUIRED_ITEMS_REMAIN: "Required items remain",
      WAITING_FOR_COLLECTOR: "Waiting for collector",
      APPROVED: "Submission approved",
      REJECTED: "Submission rejected",
    } as const
  )[detail.readiness?.state ?? "REQUIRED_ITEMS_REMAIN"];
}
function nextActionCopy(value: string | undefined) {
  return (
    {
      CLAIM_REVIEW: "Assign a primary reviewer to begin collaborative review.",
      WAIT_FOR_REVIEWER: "",
      COMPLETE_REQUIRED_REVIEW: "Resolve the required items shown below.",
      READY_FOR_DECISION: "Required review is complete; choose a decision.",
      WAIT_FOR_COLLECTOR: "The collector must update the submission before review resumes.",
      CREATE_CANONICAL_ASSET: "Create the canonical collectible before Physical Intake.",
      OPEN_PHYSICAL_INTAKE: "Open Physical Intake when ready to begin the physical workflow.",
      COMPLETE: "No further review action is required.",
    } as Record<string, string>
  )[value ?? "COMPLETE_REQUIRED_REVIEW"];
}
function friendlyError(error: unknown) {
  if (error instanceof ApiError && error.message !== "Request failed") return error.message;
  return "The review service could not complete that request safely. Refresh and try again.";
}
function humanReviewEvent(value: string) {
  return (
    (
      {
        CLAIMED: "Review claimed",
        SUBMISSION_REVIEW_CLAIMED: "Review claimed",
        SUBMISSION_REVIEW_RELEASED: "Review released",
        SUBMISSION_REVIEW_PRIMARY_ASSIGNED: "Primary reviewer assigned",
        SUBMISSION_REVIEW_PRIMARY_REASSIGNED: "Primary reviewer reassigned",
        SUBMISSION_REVIEW_PRIMARY_CLEARED: "Primary reviewer cleared",
        SUBMISSION_REVIEW_EVIDENCE_ACCEPTED: "Evidence accepted",
        SUBMISSION_REVIEW_EVIDENCE_FLAGGED: "Evidence flagged",
        SUBMISSION_REVIEW_RESEARCH_REFERENCE_ADDED: "Research reference added",
        SUBMISSION_REVIEW_RESEARCH_REFERENCE_REMOVED: "Research reference removed",
        SUBMISSION_REVIEW_RESEARCH_NOTE_ADDED: "Research note added",
        SUBMISSION_REVIEW_READINESS_RECALCULATED: "Review state re-evaluated",
        SUBMISSION_REVIEW_IDENTITY_CONFIRMED: "Identity confirmed",
        SUBMISSION_REVIEW_FINDING_CREATED: "Review finding created",
        SUBMISSION_REVIEW_FINDING_UPDATED: "Review finding updated",
        CERT_VERIFICATION_MISMATCH: "Certification mismatch recorded",
        CERT_VERIFIED: "Certification verified",
        SUBMISSION_APPROVED: "Submission approved",
        SUBMISSION_REJECTED: "Submission rejected",
        SUBMISSION_CHANGES_REQUESTED: "Changes requested",
        CANONICAL_ASSET_CREATED_AND_LINKED: "Canonical collectible created",
      } as Record<string, string>
    )[value] ?? label(value)
  );
}
function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function shortId(value: string) {
  return value.length > 14 ? value.slice(0, 8) + "…" + value.slice(-4) : value;
}
function formatDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Not available";
}
function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) return "—";
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
function marketAmount(value?: string, currency?: string) {
  return value && currency
    ? new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(Number(value) / 100)
    : "Unavailable";
}
function marketRange(range: {
  lowMinor?: string;
  highMinor?: string;
  medianMinor?: string;
  currency?: string;
}) {
  return range.lowMinor && range.highMinor
    ? marketAmount(range.lowMinor, range.currency) +
        " – " +
        marketAmount(range.highMinor, range.currency)
    : marketAmount(range.medianMinor, range.currency);
}
