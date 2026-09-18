import { ArrowLeft, ArrowRight, Check, CircleHelp, ListChecks, RefreshCw } from "lucide-react";
import type { AssetReviewGuide, GuideStepId } from "./assetReviewGuide";

export function AssetReviewGuidePanel({
  guide,
  selected,
  onSelect,
  onShowRecord,
  busy,
  issue,
  onRefresh,
}: {
  guide: AssetReviewGuide;
  selected: GuideStepId;
  onSelect: (id: GuideStepId) => void;
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
            <ListChecks aria-hidden="true" /> Guided asset review
          </p>
          <h2>One step at a time.</h2>
          <p>
            Follow the instructions, save your work, then continue. Everything stays on this asset.
          </p>
        </div>
        <div className="asset-guide__header-actions">
          <button type="button" onClick={onRefresh} disabled={busy}>
            <RefreshCw aria-hidden="true" /> Refresh status
          </button>
          <button type="button" onClick={onShowRecord}>
            View full record
          </button>
        </div>
      </header>
      <div className="asset-guide__progress">
        <label htmlFor="asset-guide-progress">
          {guide.completed} of {guide.steps.length} steps complete or not applicable
        </label>
        <span>Progress comes from saved records</span>
        <progress id="asset-guide-progress" value={guide.completed} max={guide.steps.length} />
      </div>
      <details className="asset-guide__step-list">
        <summary>
          All {guide.steps.length} steps <span>Jump to saved work or preview what comes next</span>
        </summary>
        <nav aria-label="Review steps">
          <ol className="asset-guide__steps">
            {guide.steps.map((item, position) => (
              <li key={item.id}>
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
                        ? "Not applicable"
                        : item.complete
                          ? "Saved"
                          : item.id === guide.recommended
                            ? guide.pause
                              ? "Waiting"
                              : "Next task"
                            : "To do"}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </nav>
      </details>
      {issue ? (
        <div className="asset-guide__notice is-error" role="alert">
          <strong>Could not confirm the latest record</strong>
          <p>{issue}</p>
          <button type="button" disabled={busy} onClick={onRefresh}>
            <RefreshCw aria-hidden="true" /> Refresh record
          </button>
        </div>
      ) : null}
      {guide.pause ? (
        <div className="asset-guide__notice" role="status">
          {guide.pause}
        </div>
      ) : null}
      {guide.finished ? (
        <div className="asset-guide__notice" role="status">
          All guided stages are recorded. Continue monitoring this asset in the full record.
        </div>
      ) : null}
      <div className="asset-guide__task" key={step.id}>
        <div>
          <p className="asset-guide__eyebrow">
            Step {index + 1} of {guide.steps.length}
            {preview
              ? " · Preview"
              : step.complete
                ? " · Saved"
                : step.notApplicable
                  ? " · Not applicable"
                  : ""}
          </p>
          <h3 id="asset-guide-task-title" tabIndex={-1}>
            {step.title}
          </h3>
          <ol>
            {step.instructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ol>
        </div>
        <aside>
          <strong>
            <CircleHelp aria-hidden="true" /> Why this matters
          </strong>
          <p>{step.why}</p>
          <strong>Saved status</strong>
          <p>{step.detail}</p>
          {preview ? (
            <p>
              Look ahead here, then return to <b>{guide.steps[recommendedIndex].title}</b>. Viewing
              a step does not complete it.
            </p>
          ) : null}
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
}: {
  guide: AssetReviewGuide;
  selected: GuideStepId;
  onSelect: (id: GuideStepId) => void;
  busy: boolean;
  unavailable?: boolean;
}) {
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
          ? "Refresh the record to continue. The latest saved state could not be confirmed."
          : busy
            ? "Checking the latest saved state…"
            : canContinue
              ? "Saved checks confirmed. You can continue."
              : "Use this step’s controls. Continue unlocks when the saved checks pass."}
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
