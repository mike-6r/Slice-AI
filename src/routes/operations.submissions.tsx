import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type { AssetSubmission, SubmissionReviewDetail } from "@/domain";
import { Wordmark } from "@/components/layout/MainNavigation";
import { AdminReviewMedia } from "@/components/admin/AdminReviewMedia";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/operations/submissions")({
  validateSearch: (search: Record<string, unknown>) => ({
    submission: typeof search.submission === "string" ? search.submission : undefined,
    tab: typeof search.tab === "string" ? search.tab : undefined,
  }),
  component: SubmissionOperationsPage,
});

const tabs = [
  "Review",
  "Evidence",
  "AI Review",
  "Market",
  "History",
] as const;
type Tab = (typeof tabs)[number];
type Decision = "CHANGES_REQUESTED" | "APPROVED" | "REJECTED";

export function SubmissionOperationsPage() {
  const services = useAppServices();
  const session = useSession();
  const client = useQueryClient();
  const navigate = Route.useNavigate();
  const { submission: deepLinkedSubmission, tab: deepLinkedTab } = Route.useSearch();
  const [selected, setSelected] = useState<string | null>(deepLinkedSubmission ?? null);
  const [activeTab, setActiveTab] = useState<Tab>(
    isTab(deepLinkedTab) ? deepLinkedTab : "Review",
  );
  const [reason, setReason] = useState("INCOMPLETE_EVIDENCE");
  const [note, setNote] = useState("");
  const [requestedItems, setRequestedItems] = useState<string[]>(["Front image"]);
  const [customerMessage, setCustomerMessage] = useState(
    "Please provide the requested information so our team can continue the review.",
  );
  const [confirmAction, setConfirmAction] = useState<Decision | null>(null);
  useEffect(() => setSelected(deepLinkedSubmission ?? null), [deepLinkedSubmission]);
  useEffect(() => setActiveTab(isTab(deepLinkedTab) ? deepLinkedTab : "Review"), [deepLinkedTab]);
  const queue = useQuery({
    queryKey: ["review", "queue"],
    queryFn: () => services.repositories.reviews.listQueue({ limit: 50 }),
    enabled: session.isAuthenticated,
  });
  const detail = useQuery({
    queryKey: ["review", selected],
    queryFn: () => services.repositories.reviews.getDetail(selected!),
    enabled: Boolean(selected),
  });
  const refresh = () => void client.invalidateQueries({ queryKey: ["review"] });
  const claim = useMutation({
    mutationFn: (id: string) => services.repositories.reviews.claim(id),
    onSuccess: refresh,
  });
  const decide = useMutation<AssetSubmission, Error, Decision>({
    mutationFn: (decision) =>
      services.repositories.reviews.decide(selected!, decision, {
        reasonCode: reason,
        ...(note.trim() ? { note: note.trim() } : {}),
        ...(decision === "CHANGES_REQUESTED"
          ? { requestedItems, customerMessage: customerMessage.trim() }
          : {}),
      }),
    onSuccess: () => {
      setNote("");
      setConfirmAction(null);
      refresh();
    },
  });
  const saveNote = useMutation({
    mutationFn: () => services.repositories.reviews.saveNote(selected!, note),
    onSuccess: refresh,
  });
  const nextSubmission = useMemo(() => {
    const items = queue.data?.items ?? [];
    const index = items.findIndex((item) => item.id === selected);
    return index >= 0 ? (items[index + 1]?.id ?? items[0]?.id) : items[0]?.id;
  }, [queue.data?.items, selected]);
  const choose = (id: string) => {
    setSelected(id);
    void navigate({ search: (previous) => ({ ...previous, submission: id }) });
  };
  const changeTab = (tab: Tab) => {
    setActiveTab(tab);
    void navigate({ search: (previous) => ({ ...previous, tab }) });
  };
  if (
    !session.isAuthenticated ||
    (queue.error instanceof ApiError && [401, 403].includes(queue.error.status ?? 0))
  )
    return (
      <State
        title="Reviewer access required"
        detail="This private operations queue is available only to authorized reviewers."
      />
    );
  if (queue.isLoading)
    return (
      <State title="Loading review queue" detail="Retrieving the authorized submission queue." />
    );
  if (queue.isError)
    return (
      <State
        title="Review queue unavailable"
        detail="The queue could not be loaded safely."
        retry={() => void queue.refetch()}
      />
    );
  const detailData = detail.data;
  return (
    <ReviewAdminShell>
      <main className="page-shell admin-review-detail py-8">
      <div className="admin-review-layout">
        <aside className="admin-review-queue admin-panel-card">
          <p className="page-kicker">Submissions</p>
          <h1 className="mt-1 text-xl font-semibold">Review queue</h1>
          <p className="mt-2 text-sm text-subtle">
            {queue.data?.pagination.total ?? 0} items awaiting staff review
          </p>
          <div className="admin-review-queue-list mt-5">
            {(queue.data?.items ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`admin-review-queue-item ${selected === item.id ? "is-selected" : ""}`}
                onClick={() => choose(item.id)}
              >
                <span className="admin-review-queue-thumb">
                  <AdminReviewMedia
                    src={item.thumbnailUrl}
                    alt=""
                    fallback={<span>{item.collectible.title.slice(0, 1)}</span>}
                  />
                </span>
                <span className="min-w-0 text-left">
                  <strong className="block truncate">{item.collectible.title}</strong>
                  <small className="mt-1 block truncate text-subtle">
                    {item.submissionReference} · {item.collector.displayName}
                  </small>
                </span>
                <span className={`admin-review-status status-${item.reviewState.toLowerCase()}`}>
                  {label(item.reviewState)}
                </span>
              </button>
            ))}
          </div>
        </aside>
        {!selected ? (
          <section className="admin-panel-card p-8">
            <State
              title="Select a submission"
              detail="Choose an item from the review queue to inspect its evidence and review history."
            />
          </section>
        ) : detail.isLoading ? (
          <section className="admin-panel-card p-8">
            <State
              title="Loading review detail"
              detail="Retrieving the authorized submission record."
            />
          </section>
        ) : detail.isError || !detailData ? (
          <section className="admin-panel-card p-8">
            <State
              title="Review detail unavailable"
              detail="This submission could not be loaded safely."
              retry={() => void detail.refetch()}
            />
          </section>
        ) : (
          <ReviewDetail
            detail={detailData}
            activeTab={activeTab}
            onTab={changeTab}
            onClaim={() => claim.mutate(selected)}
            claiming={claim.isPending}
            reason={reason}
            setReason={setReason}
            note={note}
            setNote={setNote}
            requestedItems={requestedItems}
            setRequestedItems={setRequestedItems}
            customerMessage={customerMessage}
            setCustomerMessage={setCustomerMessage}
            confirmAction={confirmAction}
            setConfirmAction={setConfirmAction}
            decide={decide}
            saveNote={saveNote}
            nextSubmission={nextSubmission}
            onNext={() => nextSubmission && choose(nextSubmission)}
          />
        )}
      </div>
      </main>
    </ReviewAdminShell>
  );
}

function ReviewAdminShell({ children }: { children: ReactNode }) {
  const items = [
    ["Overview", "control"],
    ["Accounts", "users"],
    ["Review Queue", "moderation"],
    ["Physical Intake", "intake"],
    ["Collectibles", "collectibles"],
    ["Asset Operations", "assetOperations"],
    ["Finance & Trading", "payments"],
    ["Platform Operations", "health"],
  ] as const;
  return (
    <div className="admin-console-shell admin-review-console-shell">
      <aside className="admin-console-sidebar">
        <div className="admin-console-brand"><Wordmark /></div>
        <p className="admin-console-eyebrow">Admin Console</p>
        <nav className="admin-console-nav" aria-label="Admin Console">
          {items.map(([labelText, section]) => (
            <Link key={section} to="/admin" search={{ section }} className={section === "moderation" ? "is-active" : ""}>
              <span>{labelText}</span>
            </Link>
          ))}
        </nav>
        <div className="admin-console-account">
          <span>Review workspace</span>
          <Link to="/admin" search={{ section: "moderation" }}>Back to queue</Link>
        </div>
      </aside>
      <div className="admin-console-main">
        <header className="admin-console-topbar admin-review-console-topbar">
          <div>
            <p>Admin Console · Submissions</p>
            <h1>Submission Review</h1>
          </div>
          <Link className="admin-review-back-link" to="/admin" search={{ section: "moderation" }}>
            Review Queue →
          </Link>
        </header>
        {children}
      </div>
    </div>
  );
}

function ReviewDetail({
  detail,
  activeTab,
  onTab,
  onClaim,
  claiming,
  reason,
  setReason,
  note,
  setNote,
  requestedItems,
  setRequestedItems,
  customerMessage,
  setCustomerMessage,
  confirmAction,
  setConfirmAction,
  decide,
  saveNote,
  nextSubmission,
  onNext,
}: {
  detail: SubmissionReviewDetail;
  activeTab: Tab;
  onTab: (tab: Tab) => void;
  onClaim: () => void;
  claiming: boolean;
  reason: string;
  setReason: (value: string) => void;
  note: string;
  setNote: (value: string) => void;
  requestedItems: string[];
  setRequestedItems: (value: string[]) => void;
  customerMessage: string;
  setCustomerMessage: (value: string) => void;
  confirmAction: Decision | null;
  setConfirmAction: (value: Decision | null) => void;
  decide: ReturnType<typeof useMutation<AssetSubmission, Error, Decision>>;
  saveNote: ReturnType<
    typeof useMutation<{ submissionId: string; updatedAt: string }, Error, void>
  >;
  nextSubmission?: string;
  onNext: () => void;
}) {
  const meta = detail.declaredMetadata ?? {};
  const collectible = detail.collectible ?? {
    title: String(meta.name ?? "Untitled submission"),
    category: "Collectible",
    set: null,
    variant: null,
    cardNumber: null,
    grader: null,
    grade: null,
    certificationNumber: null,
    year: null,
    manufacturer: null,
    thumbnailUrl: null,
  };
  const evidence = detail.evidenceSummary;
  const inReview = detail.status === "IN_REVIEW";
  const submitAction = () => {
    if (confirmAction) decide.mutate(confirmAction);
  };
  return (
    <section className="admin-review-detail-main min-w-0">
      <header className="admin-review-header">
        <div className="min-w-0">
          <p className="page-kicker">Submission review</p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <h2 className="truncate text-2xl font-semibold">
              {collectible.title}
              <span className="admin-review-id"> · {shortId(detail.id)}</span>
            </h2>
            <span className="admin-review-badge">{label(detail.status)}</span>
          </div>
          <p className="mt-2 text-sm text-subtle">
            Submitted {formatDate(detail.submittedAt)} · {detail.media.length} evidence items
          </p>
        </div>
        <div className="admin-review-header-actions">
          <button
            className="button-secondary"
            type="button"
            onClick={onNext}
            disabled={!nextSubmission}
          >
            Next submission →
          </button>
          {detail.status === "SUBMITTED" ? (
            <button className="button-primary" type="button" onClick={onClaim} disabled={claiming}>
              {claiming ? "Claiming…" : "Claim review"}
            </button>
          ) : null}
        </div>
      </header>
      <div className="admin-review-top-grid mt-5">
        <section className="admin-panel-card admin-review-collectible">
          <div className="admin-review-card-media">
            <AdminReviewMedia
              src={collectible.thumbnailUrl}
              alt={`${collectible.title} front`}
              fallback={<span>No front preview</span>}
            />
          </div>
          <div className="min-w-0">
            <p className="page-kicker">{collectible.category}</p>
            <h3 className="mt-1 text-lg font-semibold">{collectible.title}</h3>
            <div className="admin-review-facts mt-4">
              {fact("Set", collectible.set)}
              {fact("Variant", collectible.variant)}
              {fact("Card number", collectible.cardNumber)}
              {fact("Grader", collectible.grader)}
              {fact("Grade", collectible.grade)}
              {fact("Certification", collectible.certificationNumber)}
            </div>
          </div>
        </section>
        <section className="admin-panel-card">
          <SectionTitle title="Collector" />
          <div className="admin-review-person mt-4">
            <span className="admin-review-avatar">
              {(detail.collectorSummary?.displayName ?? "C").slice(0, 1)}
            </span>
            <div className="min-w-0">
              <strong className="block truncate">
                {detail.collectorSummary?.displayName ?? "Collector"}
              </strong>
              <span className="block truncate text-sm text-subtle">
                {detail.collectorSummary?.username
                  ? `@${detail.collectorSummary.username}`
                  : "Private profile"}
              </span>
            </div>
          </div>
          <dl className="admin-review-mini-facts mt-4">
            {fact("Membership", detail.collectorSummary?.membership)}
            {fact(
              "Member since",
              detail.collectorSummary ? formatDate(detail.collectorSummary.memberSince) : null,
            )}
            {fact(
              "Submissions",
              detail.collectorSummary ? String(detail.collectorSummary.submissionCount) : null,
            )}
          </dl>
          {detail.collectorSummary ? (
            <Link
              className="mt-4 inline-block text-sm font-semibold text-accent"
              to="/admin"
              search={{ section: "users", user: detail.collectorSummary.userId, tab: "Collector" }}
            >
              View collector profile →
            </Link>
          ) : null}
        </section>
        <ReviewActions
          detail={detail}
          inReview={inReview}
          reason={reason}
          setReason={setReason}
          requestedItems={requestedItems}
          setRequestedItems={setRequestedItems}
          customerMessage={customerMessage}
          setCustomerMessage={setCustomerMessage}
          confirmAction={confirmAction}
          setConfirmAction={setConfirmAction}
          submitAction={submitAction}
          decidePending={decide.isPending}
        />
      </div>
      <nav className="admin-review-tabs mt-4" aria-label="Submission review sections">
        {tabs.map((tab) => (
          <button
            key={tab}
            type="button"
            className={activeTab === tab ? "is-active" : ""}
            onClick={() => onTab(tab)}
          >
            {tab}
          </button>
        ))}
      </nav>
      <div className="admin-review-content-grid mt-4">
        <div className="min-w-0">
          {activeTab === "Review" ? (
            <Overview
              detail={detail}
              evidence={evidence}
              note={note}
              setNote={setNote}
              saveNote={saveNote}
            />
          ) : activeTab === "Evidence" ? (
            <Evidence detail={detail} evidence={evidence} />
          ) : activeTab === "AI Review" ? (
            <AiReview detail={detail} />
          ) : activeTab === "Market" ? (
            <Research detail={detail} />
          ) : activeTab === "History" ? (
            <History detail={detail} />
          ) : (
            <Evidence detail={detail} evidence={evidence} />
          )}
        </div>
        {activeTab === "Review" ? <ReviewRail detail={detail} /> : null}
      </div>
      {decide.isError ? (
        <p role="alert" className="mt-4 text-sm text-negative">
          The backend refused this transition. Refresh before trying again.
        </p>
      ) : null}
    </section>
  );
}

function ReviewActions({
  detail,
  inReview,
  reason,
  setReason,
  requestedItems,
  setRequestedItems,
  customerMessage,
  setCustomerMessage,
  confirmAction,
  setConfirmAction,
  submitAction,
  decidePending,
}: {
  detail: SubmissionReviewDetail;
  inReview: boolean;
  reason: string;
  setReason: (value: string) => void;
  requestedItems: string[];
  setRequestedItems: (value: string[]) => void;
  customerMessage: string;
  setCustomerMessage: (value: string) => void;
  confirmAction: Decision | null;
  setConfirmAction: (value: Decision | null) => void;
  submitAction: () => void;
  decidePending: boolean;
}) {
  return (
    <section className="admin-panel-card">
      <SectionTitle title="Review actions" />
      {inReview ? (
        <div className="mt-4 space-y-3">
          <label className="grid gap-1 text-sm">
            Decision reason
            <select
              value={reason}
              onChange={(event) => setReason(event.target.value.toUpperCase())}
              className="admin-review-decision-select"
            >
              <option value="INCOMPLETE_EVIDENCE">Incomplete evidence</option>
              <option value="IDENTITY_UNCLEAR">Identity needs attention</option>
              <option value="UNSUPPORTED_COLLECTIBLE">Unsupported collectible</option>
              <option value="DUPLICATE_SUBMISSION">Possible duplicate</option>
              <option value="OTHER">Other</option>
            </select>
          </label>
          <div className="grid gap-2">
            <button
              className="admin-review-action is-accept"
              type="button"
              onClick={() => setConfirmAction("APPROVED")}
            >
              Approve submission <small>Move to physical intake review</small>
            </button>
            <button
              className="admin-review-action is-changes"
              type="button"
              onClick={() => setConfirmAction("CHANGES_REQUESTED")}
            >
              Request changes <small>Ask collector for information</small>
            </button>
            <button
              className="admin-review-action is-reject"
              type="button"
              onClick={() => setConfirmAction("REJECTED")}
            >
              Reject submission <small>Close this submission</small>
            </button>
          </div>
          {confirmAction === "CHANGES_REQUESTED" ? (
            <div className="admin-review-change-request">
              <strong>What should the collector update?</strong>
              <p className="text-sm text-subtle">Select the evidence that needs attention before resubmission.</p>
              <div className="admin-review-change-options">
                {["Front image", "Back image", "Identity details", "Grade / certification", "Condition", "Other"].map((item) => (
                  <label key={item}><input type="checkbox" checked={requestedItems.includes(item)} onChange={() => setRequestedItems(requestedItems.includes(item) ? requestedItems.filter((value) => value !== item) : [...requestedItems, item])} /> {item}</label>
                ))}
              </div>
              <label className="grid gap-1 text-sm">
                Message to collector
                <textarea value={customerMessage} onChange={(event) => setCustomerMessage(event.target.value)} rows={3} />
              </label>
            </div>
          ) : null}
          {confirmAction ? (
            <div className="admin-review-confirmation">
              <strong>Confirm {label(confirmAction).toLowerCase()}?</strong>
              <p className="mt-1 text-sm text-subtle">
                This action is recorded in the review history and cannot be undone here.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  className="button-primary"
                  type="button"
                  onClick={submitAction}
                  disabled={decidePending}
                >
                  {decidePending ? "Saving…" : "Confirm"}
                </button>
                <button
                  className="button-secondary"
                  type="button"
                  onClick={() => setConfirmAction(null)}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm text-subtle">Claim this submission to enable review actions.</p>
      )}
    </section>
  );
}

function Overview({
  detail,
  evidence,
  note,
  setNote,
  saveNote,
}: {
  detail: SubmissionReviewDetail;
  evidence: SubmissionReviewDetail["evidenceSummary"];
  note: string;
  setNote: (value: string) => void;
  saveNote: ReturnType<
    typeof useMutation<{ submissionId: string; updatedAt: string }, Error, void>
  >;
}) {
  return (
    <div className="space-y-4">
      <div className="admin-review-overview-grid">
        <section className="admin-panel-card">
          <SectionTitle title="Evidence summary" />
          <div className="admin-review-evidence-meter mt-4">
            <strong>{evidence?.percent ?? 0}%</strong>
            <span>
              {evidence?.presentRequired ?? 0}/{evidence?.required ?? 0} required complete
            </span>
          </div>
          <p className="mt-3 text-sm text-subtle">
            {evidence?.missingRequired
              ? `${evidence.missingRequired} required item(s) missing`
              : "All required evidence is present"}{" "}
            · {evidence?.presentOptional ?? 0} optional
          </p>
        </section>
        <section className="admin-panel-card">
          <SectionTitle title="Condition summary" />
          <p className="mt-4 text-2xl font-semibold">
            {detail.condition?.overallGrade ?? detail.collectible?.grade ?? "Not provided"}
          </p>
          <dl className="admin-review-mini-facts mt-3">
            {Object.entries(detail.condition?.fields ?? {}).map(([key, value]) => fact(key, value))}
          </dl>
        </section>
        {detail.preGrade ? (
          <section className="admin-panel-card">
            <SectionTitle title="AI Pre-Grade · Ximilar" />
            <p className="mt-3 text-2xl font-semibold">
              {detail.preGrade.status === "SUCCEEDED"
                ? (detail.preGrade.overallEstimate ?? "Not returned")
                : detail.preGrade.status.replaceAll("_", " ")}
            </p>
            {detail.preGrade.conditionLabel ? (
              <p className="mt-1 text-sm text-accent">{detail.preGrade.conditionLabel}</p>
            ) : null}
            <dl className="admin-review-mini-facts mt-3">
              {[
                ["Centering", detail.preGrade.centeringScore],
                ["Corners", detail.preGrade.cornerScore],
                ["Edges", detail.preGrade.edgeScore],
                ["Surface", detail.preGrade.surfaceScore],
              ].map(([label, value]) =>
                fact(String(label), value == null ? "Not returned" : String(value)),
              )}
            </dl>
            <p className="mt-3 text-xs text-subtle">
              Preliminary AI evidence only. It is not an official grading certification, Slice
              verification, or an automatic valuation/condition decision.
            </p>
            {detail.preGrade.analyzedAt ? (
              <p className="mt-2 text-xs text-subtle">
                Analyzed {formatDate(detail.preGrade.analyzedAt)}
              </p>
            ) : null}
          </section>
        ) : null}
        <section className="admin-panel-card">
          <SectionTitle title="Notable details" />
          {detail.notableDetails?.length ? (
            <ul className="admin-review-check-list mt-4">
              {detail.notableDetails.map((item) => (
                <li key={item.label}>
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-subtle">No additional details supplied.</p>
          )}
        </section>
        <CustomerReference detail={detail} />
      </div>
      <Evidence detail={detail} evidence={evidence} />
      <Notes detail={detail} note={note} setNote={setNote} saveNote={saveNote} />
    </div>
  );
}

function Evidence({
  detail,
  evidence,
}: {
  detail: SubmissionReviewDetail;
  evidence: SubmissionReviewDetail["evidenceSummary"];
}) {
  const [focused, setFocused] = useState<string | null>(null);
  const items =
    evidence?.items ??
    detail.media.map((item) => ({
      id: item.id,
      slot: item.slot,
      status: item.status,
      required: ["front", "back"].includes(item.slot),
      thumbnailUrl: null,
    }));
  const active = items.find((item) => item.id === focused);
  return (
    <section className="admin-panel-card">
      <div className="flex items-center justify-between gap-3">
        <SectionTitle title="Evidence gallery" />
        <span className="text-xs text-subtle">{items.length} items</span>
      </div>
      <div className="admin-review-gallery mt-4">
        {items.map((item) => (
          <button
            className="admin-review-evidence-tile text-left"
            type="button"
            key={item.id}
            onClick={() => setFocused(item.id)}
          >
            <div className="admin-review-evidence-image">
              <AdminReviewMedia
                src={item.thumbnailUrl}
                alt={`${label(item.slot)} evidence`}
                fallback={<span>{label(item.slot)} preview unavailable</span>}
              />
            </div>
            <strong>{label(item.slot)}</strong>
            <small>
              {item.required ? "Required" : "Optional"} · {label(item.status)}
            </small>
          </button>
        ))}
      </div>
      {active ? (
        <div
          className="admin-review-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`${label(active.slot)} evidence`}
        >
          <div className="admin-panel-card">
            <div className="flex items-center justify-between gap-3">
              <strong>{label(active.slot)}</strong>
              <button className="button-secondary" type="button" onClick={() => setFocused(null)}>
                Close
              </button>
            </div>
            <div className="admin-review-lightbox-media mt-4">
              <AdminReviewMedia
                src={active.thumbnailUrl}
                alt={`${label(active.slot)} evidence enlarged`}
                fallback={<span>Evidence preview is not available from secure storage.</span>}
              />
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
function CustomerReference({ detail }: { detail: SubmissionReviewDetail }) {
  const ref = detail.customerReference ?? detail.declaredMetadata?.customerReference;
  return (
    <section className="admin-panel-card">
      <SectionTitle title="Customer reference" />
      <p className="mt-3 text-sm text-subtle">
        Customer-supplied context is kept separate from trusted market research.
      </p>
      {ref && typeof ref === "object" ? (
        <dl className="admin-review-reference mt-4">
          {Object.entries(ref as Record<string, unknown>)
            .filter(([, value]) => typeof value === "string" || typeof value === "number")
            .slice(0, 8)
            .map(([key, value]) => fact(key, String(value)))}
        </dl>
      ) : (
        <p className="mt-4 text-sm text-subtle">No customer reference supplied.</p>
      )}
    </section>
  );
}
function AiReview({ detail }: { detail: SubmissionReviewDetail }) {
  const result = detail.preGrade;
  if (!result) {
    return (
      <section className="admin-panel-card admin-review-empty-state">
        <SectionTitle title="AI card review" />
        <p className="mt-3 text-sm text-subtle">AI review has not been completed for this submission.</p>
        <span className="admin-review-advisory">Optional advisory evidence · no provider call was made while opening this review.</span>
      </section>
    );
  }
  const score = result.overallEstimate == null ? "Not returned" : result.overallEstimate.toFixed(1);
  return (
    <div className="admin-review-tab-stack">
      <section className="admin-panel-card admin-review-ai-summary">
        <div>
          <p className="page-kicker">AI Card Review · {result.provider}</p>
          <h3>{result.status === "SUCCEEDED" ? score : label(result.status)}</h3>
          <p className="text-sm text-subtle">Advisory estimate only — never an official grade or valuation.</p>
        </div>
        <span className={`admin-review-ai-state admin-review-ai-state--${result.status.toLowerCase()}`}>
          {result.conditionLabel ?? "No condition estimate"}
        </span>
      </section>
      <section className="admin-panel-card">
        <SectionTitle title="Component signals" />
        <div className="admin-review-score-grid mt-4">
          {[["Centering", result.centeringScore], ["Corners", result.cornerScore], ["Edges", result.edgeScore], ["Surface", result.surfaceScore]].map(([name, value]) => (
            <Metric key={String(name)} title={String(name)} value={value == null ? "Not returned" : String(value)} />
          ))}
        </div>
        {result.analyzedAt ? <p className="mt-4 text-xs text-subtle">Analyzed {formatDate(result.analyzedAt)}</p> : null}
      </section>
      {result.visualizations?.length ? (
        <section className="admin-panel-card">
          <SectionTitle title="AI visual review" />
          <div className="admin-review-gallery mt-4">
            {result.visualizations.filter((item) => item.url).map((item) => (
              <figure key={`${item.side}-${item.type}`} className="admin-review-ai-visual">
                <img src={item.url!} alt={`${label(item.side)} ${item.type} analysis`} />
                <figcaption>{label(item.side)} · {label(item.type)}</figcaption>
              </figure>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
function Research({ detail }: { detail: SubmissionReviewDetail }) {
  const research = detail.marketResearch;
  return (
    <section className="admin-panel-card">
      <SectionTitle title="Market research" />
      {research ? (
        <>
          <p className="mt-3 text-sm text-subtle">
            Captured {formatDate(research.collectedAt)} · supporting reference data only.
          </p>
          <div className="admin-review-overview-grid mt-4">
            <Metric
              title="Completed sales"
              value={
                research.snapshot.sales ? marketRange(research.snapshot.sales) : "Not available"
              }
            />
            <Metric
              title="Current listings"
              value={
                research.snapshot.listings
                  ? marketRange(research.snapshot.listings)
                  : "Not available"
              }
            />
          </div>
          <ul className="admin-review-observations mt-4">
            {research.observations.map((item) => (
              <li key={`${item.providerCode}-${item.externalReferenceId}`}>
                <strong>
                  {item.observationType === "SALE"
                    ? "Completed sale"
                    : item.observationType === "LISTING"
                      ? "Current listing"
                      : "Price guide"}
                </strong>
                <span>
                  {marketAmount(item.amountMinor, item.currency)} ·{" "}
                  {item.providerCode.replaceAll("_", " ")}
                </span>
                {item.externalUrl ? (
                  <a href={item.externalUrl} target="_blank" rel="noreferrer">
                    View source ↗
                  </a>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-4 text-sm text-subtle">No external research attached.</p>
      )}
    </section>
  );
}
function History({ detail }: { detail: SubmissionReviewDetail }) {
  return (
    <div className="admin-review-tab-stack">
      <section className="admin-panel-card">
        <SectionTitle title="Review history" />
        <ul className="admin-review-history mt-4">
          {detail.reviews.length ? detail.reviews.map((item) => (
            <li key={item.id ?? item.createdAt}>
              <strong>{humanReviewEvent(item.decision ?? item.status)}</strong>
              <span>{formatDate(item.createdAt)} · {item.actor?.displayName ?? "Staff"}</span>
              {item.note ? <p>{item.note}</p> : null}
            </li>
          )) : <li className="text-sm text-subtle">No review history yet.</li>}
        </ul>
      </section>
      {detail.activity?.length ? (
        <section className="admin-panel-card">
          <SectionTitle title="Submission activity" />
          <ul className="admin-review-activity mt-4">
            {detail.activity.map((item) => <li key={item.id}><strong>{humanReviewEvent(item.action)}</strong><span>{item.actor} · {formatDate(item.occurredAt)}</span>{item.detail ? <small>{item.detail}</small> : null}</li>)}
          </ul>
        </section>
      ) : null}
      <Related detail={detail} />
    </div>
  );
}
function Notes({
  detail,
  note,
  setNote,
  saveNote,
}: {
  detail: SubmissionReviewDetail;
  note: string;
  setNote: (value: string) => void;
  saveNote: ReturnType<
    typeof useMutation<{ submissionId: string; updatedAt: string }, Error, void>
  >;
}) {
  return (
    <section className="admin-panel-card">
      <SectionTitle title="Review notes" />
      <p className="mt-2 text-sm text-subtle">Staff-only notes are never sent to the collector.</p>
      <textarea
        className="mt-4 w-full"
        rows={5}
        maxLength={2000}
        value={note || detail.notes?.current || ""}
        onChange={(event) => setNote(event.target.value)}
        placeholder="Write private notes…"
      />
      <button
        className="button-primary mt-3"
        type="button"
        onClick={() => saveNote.mutate()}
        disabled={saveNote.isPending || detail.status !== "IN_REVIEW"}
      >
        {saveNote.isPending ? "Saving…" : "Save notes"}
      </button>
      {detail.notes?.history.length ? (
        <ul className="admin-review-note-history mt-5">
          {detail.notes.history.map((item) => (
            <li key={item.id}>
              <span>
                {item.author} · {formatDate(item.createdAt)}
              </span>
              <p>{item.note}</p>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
function Related({ detail }: { detail: SubmissionReviewDetail }) {
  return (
    <section className="admin-panel-card">
      <SectionTitle title="Related submissions" />
      {detail.relatedItems?.length ? (
        <ul className="admin-review-related mt-4">
          {detail.relatedItems.map((item) => (
            <li key={item.id}>
              <strong>{item.title}</strong>
              <span>
                {item.id} · {label(item.status)} ·{" "}
                {item.submittedAt ? formatDate(item.submittedAt) : "Draft"}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 text-sm text-subtle">No related submissions found.</p>
      )}
    </section>
  );
}
function ReviewRail({ detail }: { detail: SubmissionReviewDetail }) {
  return (
    <aside className="admin-review-rail">
      <section className="admin-panel-card">
        <SectionTitle title="Review readiness" />
        <p className="mt-2 text-xs text-subtle">Required checks gate approval. AI and market research are advisory.</p>
        <ul className="admin-review-check-list mt-4">
          {(detail.reviewChecklist ?? []).map((item) => (
            <li key={item.key}>
              <span className={item.satisfied ? "is-complete" : ""}>
                {item.satisfied ? "✓" : "○"}
              </span>
              <strong>{item.label}</strong>
              <small>{item.required ? "Required" : "Advisory"}</small>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}
function SectionTitle({ title }: { title: string }) {
  return <h3 className="font-semibold">{title}</h3>;
}
function Metric({ title, value }: { title: string; value: string }) {
  return (
    <div className="admin-review-metric">
      <span>{title}</span>
      <strong>{value}</strong>
    </div>
  );
}
function fact(labelText: string, value: string | null | undefined) {
  return value ? (
    <div key={labelText}>
      <dt>{label(labelText)}</dt>
      <dd>{value}</dd>
    </div>
  ) : null;
}
function label(value: string) {
  return value
    .replaceAll("_", " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}
function humanReviewEvent(value: string) {
  const events: Record<string, string> = {
    CLAIMED: "Review claimed",
    SUBMISSION_REVIEW_CLAIMED: "Review claimed",
    SUBMISSION_SUBMITTED: "Submission submitted",
    SUBMISSION_DRAFT_CREATED: "Draft created",
    APPROVED: "Submission approved",
    REJECTED: "Submission rejected",
    CHANGES_REQUESTED: "Changes requested",
  };
  return events[value] ?? label(value);
}
function shortId(value: string) {
  return value.length > 14 ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
function formatDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(
        new Date(value),
      )
    : "Not available";
}
function marketAmount(amount: string | undefined, currency: string | undefined) {
  return amount && currency
    ? new Intl.NumberFormat("en-GB", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(Number(amount) / 100)
    : "Not available";
}
function marketRange(range: {
  lowMinor?: string;
  highMinor?: string;
  medianMinor?: string;
  currency?: string;
}) {
  return range.lowMinor && range.highMinor
    ? `${marketAmount(range.lowMinor, range.currency)} – ${marketAmount(range.highMinor, range.currency)}`
    : marketAmount(range.medianMinor, range.currency);
}
function isTab(value: string | undefined): value is Tab {
  return Boolean(value && tabs.includes(value as Tab));
}
function State({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return (
    <div className="py-8 text-center">
      <h2 className="text-xl font-semibold">{title}</h2>
      <p className="mt-2 text-subtle">{detail}</p>
      {retry ? (
        <button className="mt-4 text-sm font-semibold text-accent" type="button" onClick={retry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
