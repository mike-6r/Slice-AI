import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type { SubmissionReviewDetail } from "@/domain";
import { AdminReviewMedia } from "@/components/admin/AdminReviewMedia";
import { Wordmark } from "@/components/layout/MainNavigation";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/operations/submissions")({
  validateSearch: (search: Record<string, unknown>) => ({
    submission: typeof search.submission === "string" ? search.submission : undefined,
    ...(typeof search.tab === "string" ? { tab: search.tab } : {}),
  }),
  component: SubmissionOperationsPage,
});

type Decision = "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";

export function SubmissionOperationsPage() {
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const navigate = Route.useNavigate();
  const { submission: initial } = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(initial ?? null);
  const [condition, setCondition] = useState("");
  const [conditionNote, setConditionNote] = useState("");
  const [valuation, setValuation] = useState("");
  const [basis, setBasis] = useState("External reference and staff assessment");
  const [confidence, setConfidence] = useState("80");
  const [note, setNote] = useState("");
  const [decision, setDecision] = useState<Decision | null>(null);
  const [reason, setReason] = useState("INCOMPLETE_EVIDENCE");
  const [requestedItems, setRequestedItems] = useState<string[]>(["Front image"]);
  const [message, setMessage] = useState("");
  const [internalDecisionNote, setInternalDecisionNote] = useState("");
  const [focusedMedia, setFocusedMedia] = useState<string | null>(null);
  const [staleReview, setStaleReview] = useState(false);
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
  const claim = useMutation({
    mutationFn: (id: string) => services.repositories.reviews.claim(id),
    onSuccess: refresh,
  });
  const release = useMutation({
    mutationFn: (id: string) => services.repositories.reviews.release(id),
    onSuccess: refresh,
  });
  const saveCondition = useMutation({
    mutationFn: () =>
      services.repositories.reviews.saveCondition(selected!, {
        condition: condition.trim(),
        ...(conditionNote.trim() ? { note: conditionNote.trim() } : {}),
      }),
    onSuccess: refresh,
  });
  const saveValuation = useMutation({
    mutationFn: () =>
      services.repositories.reviews.saveValuation(selected!, {
        valueMinor: String(Math.round(Number(valuation) * 100)),
        currency: "GBP",
        basis: basis.trim(),
        confidence: Number(confidence),
      }),
    onSuccess: refresh,
  });
  const saveNote = useMutation({
    mutationFn: () => services.repositories.reviews.saveNote(selected!, note),
    onSuccess: refresh,
  });
  const decide = useMutation({
    mutationFn: (value: Decision) =>
      services.repositories.reviews.decide(selected!, value, {
        version: detail.data?.version ?? 0,
        reasonCode: reason,
        ...(internalDecisionNote.trim() ? { note: internalDecisionNote.trim() } : {}),
        ...(value === "CHANGES_REQUESTED"
          ? { requestedItems, customerMessage: message.trim() }
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
    mutationFn: () => services.repositories.reviews.canonicalize(selected!),
    onSuccess: refresh,
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
    setStaleReview(false);
    void navigate({ search: { submission: id } });
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
      <ReviewShell>
        <PageState
          title="Select a submission"
          detail="Open a submission from Review Queue to begin guided review."
        />
      </ReviewShell>
    );
  if (detail.isLoading)
    return (
      <ReviewShell>
        <ReviewLoadingSkeleton />
      </ReviewShell>
    );
  if (detail.isError || !detail.data)
    return (
      <ReviewShell>
        <PageState
          title="Submission review unavailable"
          detail={friendlyError(detail.error)}
          retry={() => void detail.refetch()}
        />
      </ReviewShell>
    );

  const review = detail.data;
  const canEdit = Boolean(review.reviewWorkspace?.canEdit && !staleReview);
  const position =
    navigation.index >= 0
      ? String(navigation.index + 1) + " of " + String(navigation.total)
      : "Review queue";
  const next = navigation.index >= 0 ? navigation.items[navigation.index + 1] : undefined;
  const previous = navigation.index > 0 ? navigation.items[navigation.index - 1] : undefined;
  return (
    <ReviewShell>
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
            <ReviewerBanner detail={review} />
            {review.status === "CHANGES_REQUESTED" ? <ChangeRequestNotice detail={review} /> : null}
            {review.status === "APPROVED" ? (
              <PostApproval
                detail={review}
                onCanonicalize={() => canonicalize.mutate()}
                canonicalizing={canonicalize.isPending}
                error={canonicalize.error}
              />
            ) : null}
            <Progress detail={review} />
            <ReviewSection title="Identity" detail={review} step="identity" number={1}>
              <Identity detail={review} />
            </ReviewSection>
            <ReviewSection title="Evidence" detail={review} step="evidence" number={2} open>
              <Evidence detail={review} onFocus={setFocusedMedia} />
            </ReviewSection>
            <ReviewSection
              title="Grade & Certification"
              detail={review}
              step="certification"
              number={3}
            >
              <Certification detail={review} />
            </ReviewSection>
            <ReviewSection title="Research" detail={review} step="research" number={4}>
              <Research detail={review} />
            </ReviewSection>
            <ReviewSection title="Staff Assessment" detail={review} step="assessment" number={5}>
              <Assessment
                detail={review}
                canEdit={canEdit}
                condition={condition}
                setCondition={setCondition}
                conditionNote={conditionNote}
                setConditionNote={setConditionNote}
                valuation={valuation}
                setValuation={setValuation}
                basis={basis}
                setBasis={setBasis}
                confidence={confidence}
                setConfidence={setConfidence}
                note={note}
                setNote={setNote}
                onSaveCondition={() => saveCondition.mutate()}
                savingCondition={saveCondition.isPending}
                onSaveValuation={() => saveValuation.mutate()}
                savingValuation={saveValuation.isPending}
                onSaveNote={() => saveNote.mutate()}
                savingNote={saveNote.isPending}
              />
            </ReviewSection>
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
            onCanonicalize={() => canonicalize.mutate()}
            canonicalizing={canonicalize.isPending}
            onDecision={setDecision}
          />
        </div>
        {decision ? (
          <DecisionDialog
            decision={decision}
            reason={reason}
            setReason={setReason}
            requestedItems={requestedItems}
            setRequestedItems={setRequestedItems}
            message={message}
            setMessage={setMessage}
            internalNote={internalDecisionNote}
            setInternalNote={setInternalDecisionNote}
            onCancel={() => setDecision(null)}
            onConfirm={() => decide.mutate(decision)}
            pending={decide.isPending}
            error={decide.error}
          />
        ) : null}
        <MediaDialog
          items={review.evidenceSummary?.items ?? []}
          selectedId={focusedMedia}
          onClose={() => setFocusedMedia(null)}
          onSelect={setFocusedMedia}
        />
      </section>
    </ReviewShell>
  );
}

function ReviewShell({ children }: { children: ReactNode }) {
  return (
    <div className="admin-console-shell admin-review-console-shell">
      <aside className="admin-console-sidebar">
        <div className="admin-console-brand">
          <Wordmark />
        </div>
        <p className="admin-console-eyebrow">Admin Console</p>
        <nav className="admin-console-nav" aria-label="Admin Console">
          <Link to="/admin" search={{ section: "control" }}>
            Overview
          </Link>
          <Link to="/admin" search={{ section: "users" }}>
            Accounts
          </Link>
          <Link to="/admin" search={{ section: "moderation" }} className="is-active">
            Review Queue
          </Link>
          <Link to="/admin" search={{ section: "intake" }}>
            Physical Intake
          </Link>
          <Link to="/admin" search={{ section: "collectibles" }}>
            Collectibles
          </Link>
          <Link to="/admin" search={{ section: "assetOperations" }}>
            Asset Operations
          </Link>
          <p className="admin-console-nav-label">Business</p>
          <Link to="/admin" search={{ section: "memberships" }}>
            Memberships
          </Link>
          <Link to="/admin" search={{ section: "payments" }}>
            Finance & Trading
          </Link>
          <Link to="/admin" search={{ section: "support" }}>
            Trust & Support
          </Link>
          <p className="admin-console-nav-label">Platform</p>
          <Link to="/admin" search={{ section: "health" }}>
            Platform Operations
          </Link>
        </nav>
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
        <h1>Submission Review</h1>
      </div>
      <div className="admin-review-toolbar-actions">
        <Link className="admin-review-back-link" to="/admin" search={{ section: "moderation" }}>
          ‹ Back to queue
        </Link>
        <div className="admin-review-nav-actions" aria-label="Review queue navigation">
          <button type="button" onClick={() => previous && choose(previous)} disabled={!previous}>
            Previous
          </button>
          <strong>{position}</strong>
          <button type="button" onClick={() => next && choose(next)} disabled={!next}>
            Next ›
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
            <StatusPill value={label(detail.status)} />
          </div>
          <h2>{item?.title ?? "Untitled submission"}</h2>
          <p>
            {[item?.year, item?.set, item?.cardNumber, item?.variant].filter(Boolean).join(" · ") ||
              "Collector-supplied identity"}
          </p>
          <div className="admin-review-chip-row">
            <span>{item?.grader ? item.grader + " " + (item.grade ?? "") : "Raw / ungraded"}</span>
            {item?.certificationNumber ? <span>Cert {item.certificationNumber}</span> : null}
            <span>{shortId(detail.id)}</span>
          </div>
        </div>
      </div>
      <div className="admin-review-workspace-header-meta">
        <span>
          Submitted<strong>{formatDate(detail.submittedAt)}</strong>
        </span>
        <span>
          Collector<strong>{detail.collectorSummary?.displayName ?? "Collector"}</strong>
        </span>
        <span>
          Reviewer<strong>{detail.reviewAssignment?.reviewer?.displayName ?? "Unclaimed"}</strong>
        </span>
      </div>
    </header>
  );
}

function ReviewerBanner({ detail }: { detail: SubmissionReviewDetail }) {
  const assignment = detail.reviewAssignment;
  const self = detail.reviewWorkspace?.selfReviewBlocked;
  const copy = self
    ? "You submitted this collectible and cannot review it. Another authorized reviewer must claim this submission."
    : assignment?.state === "CLAIMED_BY_ME"
      ? "You are reviewing this submission. Complete required checks, then choose a decision."
      : assignment?.state === "CLAIMED_BY_OTHER"
        ? "Assigned to " +
          (assignment.reviewer?.displayName ?? "another reviewer") +
          ". This view is read-only."
        : detail.status === "CHANGES_REQUESTED"
          ? "Changes have been requested. Review resumes after the collector updates the submission."
          : "This submission has not been assigned. Claim review to begin.";
  const title = self
    ? "Reviewer required"
    : assignment?.state === "CLAIMED_BY_ME"
      ? "You are reviewing this submission"
      : assignment?.state === "CLAIMED_BY_OTHER"
        ? "Assigned to another reviewer"
        : detail.status === "CHANGES_REQUESTED"
          ? "Waiting for collector"
          : "This submission has not been assigned";
  return (
    <section className={"admin-review-reviewer-banner " + (self ? "is-restricted" : "")}>
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
    <section className="admin-panel-card admin-review-progress">
      <div>
        <p className="page-kicker">Review progress</p>
        <h3>{readinessTitle(detail)}</h3>
      </div>
      <ol>
        {detail.readiness?.progress.map((item, index) => (
          <li key={item.key} className={"is-" + item.status.toLowerCase()}>
            <span>{index + 1}</span>
            <div>
              <strong>{item.label}</strong>
              <small>{item.summary}</small>
            </div>
          </li>
        ))}
      </ol>
    </section>
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
  const defaultOpen = item?.required && !["COMPLETE", "NOT_APPLICABLE"].includes(item.status);
  return (
    <details className="admin-panel-card admin-review-workspace-section" open={open ?? defaultOpen}>
      <summary>
        <span
          className={`admin-review-section-number is-${(item?.status ?? "NEEDS_REVIEW").toLowerCase()}`}
        >
          {number}
        </span>
        <div>
          <h3>{title}</h3>
          <p>
            {purpose} · {item?.summary ?? "Review required"}
          </p>
        </div>
        <StatusPill value={label(item?.status ?? "NEEDS_REVIEW")} />
      </summary>
      <div className="admin-review-workspace-section-body">{children}</div>
    </details>
  );
}
function Identity({ detail }: { detail: SubmissionReviewDetail }) {
  const item = detail.collectible;
  const source = detail.marketResearch?.observations[0];
  return (
    <div className="admin-review-identity-panels">
      <Info title="Submitted identity">
        <dl className="admin-review-facts">
          {fact("Category", item?.category)}
          {fact("Title", item?.title)}
          {fact("Set", item?.set)}
          {fact("Card number", item?.cardNumber)}
          {fact("Variant", item?.variant)}
          {fact("Year", item?.year)}
        </dl>
      </Info>
      <Info title="Grade / certification">
        <dl className="admin-review-facts">
          {fact("Grade", item?.grader ? item.grader + " " + (item.grade ?? "") : "Raw / Ungraded")}
          {fact("Certification", item?.certificationNumber ?? "Not required")}
          {fact("Grading company", item?.grader ?? "Not required")}
        </dl>
      </Info>
      <Info title="Authority signals">
        <dl className="admin-review-facts">
          {fact(
            "Certification status",
            detail.certificationVerification
              ? label(detail.certificationVerification.status)
              : "Not applicable",
          )}
          {fact(
            "Identity conflict",
            detail.certificationVerification?.status === "MISMATCH"
              ? "Certification mismatch requires review"
              : "No known identity conflicts",
          )}
          {fact("Reference source", source?.providerCode?.replaceAll("_", " ") ?? "Not attached")}
        </dl>
        {source?.externalUrl ? (
          <a
            className="admin-review-provider-link"
            href={source.externalUrl}
            target="_blank"
            rel="noreferrer"
          >
            View source ↗
          </a>
        ) : null}
      </Info>
      <p className="admin-review-section-footnote">
        Submitted information is preserved alongside any normalized or provider-verified authority.
        Exact certificate conflicts are surfaced when verification detects them.
      </p>
    </div>
  );
}
function Evidence({
  detail,
  onFocus,
}: {
  detail: SubmissionReviewDetail;
  onFocus: (id: string) => void;
}) {
  const summary = detail.evidenceSummary;
  return (
    <div className="admin-review-evidence-layout">
      <div className="admin-review-evidence-overview">
        <p>Required images</p>
        <strong>
          {summary ? `${summary.presentRequired} of ${summary.required}` : "Unavailable"}
        </strong>
        <span>
          {summary?.missingRequired
            ? `${summary.missingRequired} required image${summary.missingRequired === 1 ? "" : "s"} missing`
            : "All required images provided"}
        </span>
      </div>
      <div className="admin-review-workspace-gallery">
        {summary?.items.map((item) => (
          <button
            type="button"
            key={item.id}
            className="admin-review-workspace-media"
            onClick={() => onFocus(item.id)}
          >
            <AdminReviewMedia
              src={item.thumbnailUrl}
              alt={label(item.slot) + " evidence"}
              fallback={<span>{label(item.slot)}</span>}
            />
            <strong>
              {label(item.slot)} {item.required ? "· Required" : "· Optional"}
            </strong>
            <small>Source: collector · {formatDate(item.uploadedAt)}</small>
            <small>{item.status === "SAFE" ? "Usable for review" : label(item.status)}</small>
          </button>
        ))}
      </div>
    </div>
  );
}
function Certification({ detail }: { detail: SubmissionReviewDetail }) {
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
  );
}
function Research({ detail }: { detail: SubmissionReviewDetail }) {
  const research = detail.marketResearch;
  if (!research)
    return (
      <div className="admin-review-compact-result">
        <strong>Reference unavailable</strong>
        <span>Review may continue. External research never sets Slice valuation.</span>
      </div>
    );
  const source = research.observations[0];
  return (
    <div className="admin-review-two-panel">
      <Info title="Source">
        <strong>{source?.providerCode?.replaceAll("_", " ") ?? "External reference"}</strong>
        <span>
          {label(research.state)} · checked {formatDate(research.collectedAt)}
        </span>
      </Info>
      <Info title="Current reference">
        <strong>
          {research.snapshot.sales ? marketRange(research.snapshot.sales) : "Unavailable"}
        </strong>
        <span>External reference only · {source?.currency ?? "source currency retained"}</span>
        {source?.externalUrl ? (
          <a href={source.externalUrl} target="_blank" rel="noreferrer">
            Open source ↗
          </a>
        ) : null}
      </Info>
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
      <details className="admin-review-notes">
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
    </div>
  );
}
function DecisionRail({
  detail,
  staleReview,
  onRefresh,
  onClaim,
  claiming,
  onRelease,
  releasing,
  onCanonicalize,
  canonicalizing,
  onDecision,
}: {
  detail: SubmissionReviewDetail;
  staleReview: boolean;
  onRefresh: () => void;
  onClaim: () => void;
  claiming: boolean;
  onRelease: () => void;
  releasing: boolean;
  onCanonicalize: () => void;
  canonicalizing: boolean;
  onDecision: (value: Decision) => void;
}) {
  const workspace = detail.reviewWorkspace;
  if (!workspace) return null;
  return (
    <aside className="admin-review-decision-rail">
      <section className="admin-panel-card admin-review-status-card">
        <div className="admin-review-status-card-heading">
          <h2>Review status</h2>
          {workspace.selfReviewBlocked ? <StatusPill value="Self-review blocked" /> : null}
        </div>
        <div className="admin-review-status-line">
          <span>Claim status</span>
          <strong>{claimLabel(workspace.claimState)}</strong>
          <small>{claimDetail(detail)}</small>
        </div>
        <div className="admin-review-next-action">
          <span>Next action</span>
          <strong>{readinessTitle(detail)}</strong>
          <p>{nextActionCopy(workspace.nextAction)}</p>
        </div>
        <small className="admin-review-updated">
          Last updated {formatDate(workspace.lastUpdated)}
        </small>
        {workspace.selfReviewBlocked ? (
          <div className="admin-review-info-callout">
            You submitted this collectible. Another authorized reviewer must claim this submission
            before review can begin.
          </div>
        ) : null}
      </section>
      <section className="admin-panel-card admin-review-readiness-card">
        <h2>Decision readiness</h2>
        <div className="admin-review-rail-readiness">
          <ReadinessLine
            label="Required items"
            value={`${workspace.requiredComplete} of ${workspace.requiredTotal} complete`}
            tone={workspace.blockingIssues.length ? "warning" : "ready"}
          />
          <ReadinessLine
            label="Optional items"
            value={`${workspace.optionalRecorded} of ${workspace.optionalTotal} recorded`}
            tone="warning"
          />
          <ReadinessLine
            label="Blocking issues"
            value={String(workspace.blockingIssues.length)}
            tone={workspace.blockingIssues.length ? "negative" : "ready"}
          />
        </div>
        {workspace.primaryBlocker ? (
          <div className="admin-review-primary-blocker">
            <span>Primary blocker</span>
            <strong>{workspace.primaryBlocker}</strong>
          </div>
        ) : null}
      </section>
      <section className="admin-panel-card admin-review-actions-card">
        <h2>Review actions</h2>
        {staleReview ? (
          <div className="admin-review-decision-actions">
            <p className="text-negative">This review changed while you were working.</p>
            <button type="button" className="button-secondary" onClick={onRefresh}>
              Refresh review
            </button>
          </div>
        ) : (
          <div className="admin-review-decision-actions">
            {workspace.canClaim ? (
              <button
                type="button"
                className="admin-review-action is-claim"
                onClick={onClaim}
                disabled={claiming}
              >
                {claiming ? "Claiming…" : "Claim review"}
                <small>Start the authorized review</small>
              </button>
            ) : null}
            {workspace.canRelease ? (
              <button
                type="button"
                className="admin-review-action is-claim"
                onClick={onRelease}
                disabled={releasing}
              >
                {releasing ? "Releasing…" : "Release claim"}
                <small>Return this review to the queue</small>
              </button>
            ) : null}
            {workspace.canApprove || workspace.canRequestChanges || workspace.canReject ? (
              <>
                <button
                  type="button"
                  className="admin-review-action is-accept"
                  onClick={() => onDecision("APPROVED")}
                  disabled={!workspace.canApprove}
                >
                  Approve submission<small>Next: create canonical collectible</small>
                </button>
                <button
                  type="button"
                  className="admin-review-action is-changes"
                  onClick={() => onDecision("CHANGES_REQUESTED")}
                  disabled={!workspace.canRequestChanges}
                >
                  Request changes<small>Send a collector request</small>
                </button>
                <button
                  type="button"
                  className="admin-review-action is-reject"
                  onClick={() => onDecision("REJECTED")}
                  disabled={!workspace.canReject}
                >
                  Reject submission<small>Close this submission</small>
                </button>
              </>
            ) : null}
            {workspace.canCanonicalize ? (
              <button
                type="button"
                className="admin-review-action is-accept"
                onClick={onCanonicalize}
                disabled={canonicalizing}
              >
                {canonicalizing ? "Creating collectible…" : "Create canonical collectible"}
                <small>Creates one linked master record</small>
              </button>
            ) : null}
            {workspace.canOpenPhysicalIntake && detail.assetId ? (
              <Link
                className="admin-review-action is-accept"
                to="/admin"
                search={{ section: "intake" }}
              >
                Open Physical Intake<small>Continue in the separate physical workflow</small>
              </Link>
            ) : null}
            {!workspace.canClaim &&
            !workspace.canRelease &&
            !workspace.canApprove &&
            !workspace.canRequestChanges &&
            !workspace.canReject &&
            !workspace.canCanonicalize &&
            !workspace.canOpenPhysicalIntake ? (
              <p className="text-sm text-subtle">
                No further review command is available in the current state.
              </p>
            ) : null}
          </div>
        )}
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

function claimLabel(
  state: NonNullable<SubmissionReviewDetail["reviewAssignment"]>["state"] | undefined,
) {
  return (
    (
      {
        CLAIMED_BY_ME: "Claimed by you",
        CLAIMED_BY_OTHER: "Claimed",
        UNCLAIMED: "Unclaimed",
        COMPLETED: "Completed",
      } as Record<string, string>
    )[state ?? "UNCLAIMED"] ?? "Unclaimed"
  );
}

function claimDetail(detail: SubmissionReviewDetail) {
  if (detail.reviewWorkspace?.selfReviewBlocked) return "You cannot review your own submission.";
  if (detail.reviewWorkspace?.claimState === "CLAIMED_BY_OTHER")
    return `Assigned to ${detail.reviewWorkspace.reviewer?.displayName ?? "an authorized reviewer"}.`;
  if (detail.reviewWorkspace?.claimState === "CLAIMED_BY_ME") return "You are the active reviewer.";
  return "This submission has not been claimed.";
}
function DecisionDialog({
  decision,
  reason,
  setReason,
  requestedItems,
  setRequestedItems,
  message,
  setMessage,
  internalNote,
  setInternalNote,
  onCancel,
  onConfirm,
  pending,
  error,
}: {
  decision: Decision;
  reason: string;
  setReason: (value: string) => void;
  requestedItems: string[];
  setRequestedItems: (value: string[]) => void;
  message: string;
  setMessage: (value: string) => void;
  internalNote: string;
  setInternalNote: (value: string) => void;
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
          Reason
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            <option value="INCOMPLETE_EVIDENCE">Incomplete evidence</option>
            <option value="IDENTITY_UNCLEAR">Identity needs attention</option>
            <option value="UNSUPPORTED_COLLECTIBLE">Unsupported collectible</option>
            <option value="DUPLICATE_SUBMISSION">Possible duplicate</option>
            <option value="OTHER">Other</option>
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
        ) : null}
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
            {canonicalizing ? "Creating collectible…" : "Create & Link Collectible"}
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
function ReviewHistory({ detail }: { detail: SubmissionReviewDetail }) {
  return (
    <section className="admin-panel-card">
      <h3>Review history</h3>
      <ul className="admin-review-history mt-4">
        {detail.reviews.length ? (
          detail.reviews.map((item) => (
            <li key={item.id ?? item.createdAt}>
              <strong>{humanReviewEvent(item.decision ?? item.status)}</strong>
              <span>{formatDate(item.createdAt)}</span>
              {item.note ? <p>{item.note}</p> : null}
            </li>
          ))
        ) : (
          <li className="text-sm text-subtle">No review history yet.</li>
        )}
      </ul>
    </section>
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
function readinessTitle(detail: SubmissionReviewDetail) {
  return (
    {
      READY_FOR_DECISION: "Ready for decision",
      CLAIM_REVIEW: "Claim review to continue",
      REVIEWER_REQUIRED: "Another reviewer required",
      REVIEWER_ASSIGNED: "Assigned to another reviewer",
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
      CLAIM_REVIEW: "Claim this review to begin.",
      WAIT_FOR_REVIEWER: "Another authorized reviewer must act.",
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
