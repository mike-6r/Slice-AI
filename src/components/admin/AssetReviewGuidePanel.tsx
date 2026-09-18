import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  ListChecks,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import type { AssetReviewGuide, GuideStepId } from "./assetReviewGuide";

type GuideSelection = {
  guide: AssetReviewGuide;
  selected: GuideStepId;
  onSelect: (id: GuideStepId) => void;
};

export function AssetReviewSteps({ guide, selected, onSelect }: GuideSelection) {
  return (
    <aside className="asset-guide__sidebar" aria-label="Review progress">
      <div className="asset-guide__sidebar-heading">
        <ListChecks aria-hidden="true" /> <strong>Review checklist</strong>
      </div>
      <div className="asset-guide__progress">
        <label htmlFor="asset-guide-progress">
          {guide.completed} of {guide.steps.length} steps resolved
        </label>
        <progress id="asset-guide-progress" value={guide.completed} max={guide.steps.length} />
        <span>Saved checks, including steps not required.</span>
      </div>
      <nav aria-label="Review steps">
        <ol className="asset-guide__steps">
          {guide.steps.map((item, position) => (
            <li key={item.id}>
              {position === 0 || position === 5 || position === 7 ? (
                <p className="asset-guide__phase">
                  {position === 0
                    ? "Submission review"
                    : position === 5
                      ? "Intake & custody"
                      : "Valuation & launch"}
                </p>
              ) : null}
              <button
                type="button"
                aria-current={item.id === selected ? "step" : undefined}
                data-complete={item.complete || item.notApplicable}
                onClick={() => onSelect(item.id)}
              >
                <i aria-hidden="true">
                  {item.complete || item.notApplicable ? <Check /> : position + 1}
                </i>
                <span>
                  {item.title}
                  <small>
                    {item.notApplicable
                      ? "Not required"
                      : item.complete
                        ? "Complete"
                        : item.id === guide.recommended
                          ? guide.pause
                            ? "Needs another actor"
                            : "Up next"
                          : "To do"}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </nav>
      <p className="asset-guide__sidebar-note">
        Select any step to inspect it. Progress updates when your changes are saved.
      </p>
    </aside>
  );
}

export function AssetReviewGuidePanel({
  guide,
  selected,
  onSelect,
  onShowRecord,
  busy,
  issue,
  onRefresh,
}: GuideSelection & {
  onShowRecord: () => void;
  busy: boolean;
  issue: string | null;
  onRefresh: () => void;
}) {
  const step = guide.steps.find((item) => item.id === selected)!;
  const index = guide.steps.indexOf(step);
  const recommendedIndex = guide.steps.findIndex((item) => item.id === guide.recommended);
  const preview = index > recommendedIndex && !step.complete && !step.notApplicable;
  return (
    <section className="asset-guide" aria-label="Step-by-step asset review" aria-busy={busy}>
      <header className="asset-guide__header">
        <div>
          <p className="asset-guide__eyebrow">
            Step {index + 1} of {guide.steps.length} ·{" "}
            {index < 5
              ? "Submission review"
              : index < 7
                ? "Intake & custody"
                : "Valuation & launch"}
          </p>
          <h2 id="asset-guide-task-title" tabIndex={-1}>
            {step.title}
          </h2>
        </div>
        <div className="asset-guide__header-actions">
          <button type="button" onClick={onRefresh} disabled={busy} aria-label="Refresh record">
            <RefreshCw aria-hidden="true" /> {busy ? "Refreshing…" : "Refresh"}
          </button>
          <button type="button" onClick={onShowRecord}>
            Full record <ArrowRight aria-hidden="true" />
          </button>
        </div>
      </header>
      {issue ? (
        <div className="asset-guide__notice is-error" role="alert">
          <strong>Could not refresh this record</strong>
          <p>{issue}</p>
          <button type="button" disabled={busy} onClick={onRefresh}>
            <RefreshCw aria-hidden="true" /> Refresh record
          </button>
        </div>
      ) : null}
      {guide.pause ? (
        <div className="asset-guide__notice" role="status">
          <ShieldCheck aria-hidden="true" />
          <div>
            <strong>
              {guide.pause.startsWith("Another")
                ? "Another reviewer is needed"
                : "Waiting for the next action"}
            </strong>
            <p>{guide.pause}</p>
          </div>
        </div>
      ) : null}
      {preview ? (
        <div className="asset-guide__preview">
          <span>Preview · Complete earlier checks before this stage.</span>
          <button type="button" onClick={() => onSelect(guide.recommended)}>
            Return to current step <ArrowLeft aria-hidden="true" />
          </button>
        </div>
      ) : null}
      {guide.finished ? (
        <p className="asset-guide__notice" role="status">
          All stages are recorded. You can monitor this asset in the full record.
        </p>
      ) : null}
      <div className="asset-guide__task" key={step.id}>
        <div>
          <h3>What to do</h3>
          <ol>
            {step.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
        </div>
        <aside>
          <strong>
            <CircleHelp aria-hidden="true" /> Why this step matters
          </strong>
          <p>{step.why}</p>
          {!guide.pause && (
            <>
              <strong>
                {step.complete
                  ? "Completed"
                  : step.notApplicable
                    ? "Not required"
                    : "Current status"}
              </strong>
              <p>{step.detail}</p>
            </>
          )}
        </aside>
      </div>
    </section>
  );
}

export function GuideNavigation({
  guide,
  selected,
  onSelect,
  busy,
  unavailable = false,
}: GuideSelection & { busy: boolean; unavailable?: boolean }) {
  const index = guide.steps.findIndex((step) => step.id === selected);
  const step = guide.steps[index];
  const next = guide.steps[index + 1];
  const canContinue = (step.complete || step.notApplicable) && !guide.pause;
  return (
    <footer className="asset-guide__navigation">
      <button
        type="button"
        disabled={index === 0 || busy}
        onClick={() => onSelect(guide.steps[index - 1].id)}
      >
        <ArrowLeft aria-hidden="true" /> Back
      </button>
      <p aria-live="polite">
        {unavailable
          ? "Refresh the record to continue."
          : busy
            ? "Checking the latest saved state…"
            : guide.pause
              ? "You can inspect every step using the checklist."
              : canContinue
                ? "Checks saved. Ready for the next step."
                : "Complete the checks above to continue."}
      </p>
      {selected !== guide.recommended && !guide.finished ? (
        <button
          type="button"
          className="is-primary"
          disabled={busy || unavailable}
          onClick={() => onSelect(guide.recommended)}
        >
          Go to next required step <ArrowRight aria-hidden="true" />
        </button>
      ) : next ? (
        <button
          type="button"
          className="is-primary"
          disabled={busy || unavailable || !canContinue}
          onClick={() => onSelect(next.id)}
        >
          Continue <ArrowRight aria-hidden="true" />
        </button>
      ) : null}
    </footer>
  );
}
