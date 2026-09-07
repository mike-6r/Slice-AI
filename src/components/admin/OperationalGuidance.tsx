import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CircleDot,
  Clock3,
  ExternalLink,
  LockKeyhole,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import "@/styles/admin-operational-guidance.css";

export type GuidanceActor =
  | "ADMIN"
  | "COLLECTOR"
  | "EXTERNAL_PROVIDER"
  | "FINANCE"
  | "INTAKE_STAFF"
  | "NO_ACTION_REQUIRED"
  | "REVIEWER"
  | "SLICE"
  | "STAFF"
  | "SYSTEM";

export type GuidanceStepState =
  | "BLOCKED"
  | "COMPLETE"
  | "CURRENT"
  | "NOT_APPLICABLE"
  | "NOT_STARTED"
  | "WAITING";

export type DeepLinkActionProps = {
  label: string;
  href?: string;
  onClick?: () => void;
  disabled?: boolean;
  unavailableReason?: string | null;
};

export type GuidanceStep = {
  id: string;
  label: string;
  state: GuidanceStepState;
  detail?: string | null;
  action?: DeepLinkActionProps;
};

export type GuidanceBlocker = {
  label: string;
  reason?: string | null;
  severity?: "HIGH" | "MEDIUM" | "LOW";
  action?: DeepLinkActionProps;
};

export type GuidanceCommand = {
  label: string;
  available: boolean;
  unavailableReason?: string | null;
  action?: DeepLinkActionProps;
};

export type GuidancePanelProps = {
  title?: string;
  currentState?: string | null;
  nextAction: {
    title: string;
    why: string;
    actor: GuidanceActor;
    blocker?: string | null;
    afterThis?: string | null;
    action?: DeepLinkActionProps;
  };
  progress?: GuidanceStep[];
  blockers?: GuidanceBlocker[];
  commands?: GuidanceCommand[];
  className?: string;
  compact?: boolean;
};

const actorLabels: Record<GuidanceActor, string> = {
  ADMIN: "Admin",
  COLLECTOR: "Collector",
  EXTERNAL_PROVIDER: "External provider",
  FINANCE: "Finance",
  INTAKE_STAFF: "Physical Intake",
  NO_ACTION_REQUIRED: "No action required",
  REVIEWER: "Reviewer",
  SLICE: "Slice staff",
  STAFF: "Slice staff",
  SYSTEM: "Automated system",
};

export function actionOwnerLabel(actor: GuidanceActor) {
  return actorLabels[actor];
}

export function adminActionRequired(actor: GuidanceActor) {
  return ["ADMIN", "FINANCE", "INTAKE_STAFF", "REVIEWER", "SLICE", "STAFF"].includes(actor);
}

export function guidanceActorFromAuthority(
  actor: "COLLECTOR" | "NONE" | "PROVIDER" | "STAFF" | "SYSTEM",
): GuidanceActor {
  if (actor === "NONE") return "NO_ACTION_REQUIRED";
  if (actor === "PROVIDER") return "EXTERNAL_PROVIDER";
  return actor;
}

export function guidanceStepState(
  state: "BLOCKED" | "COMPLETE" | "CURRENT" | "IN_PROGRESS" | "LIVE" | "NOT_APPLICABLE" | "NOT_STARTED" | "READY" | "WAITING",
): GuidanceStepState {
  if (["COMPLETE", "LIVE", "READY"].includes(state)) return "COMPLETE";
  if (state === "IN_PROGRESS") return "CURRENT";
  return state as GuidanceStepState;
}

export function DeepLinkAction({
  label,
  href,
  onClick,
  disabled = false,
  unavailableReason,
}: DeepLinkActionProps) {
  const content = (
    <>
      {label}
      {href ? <ExternalLink aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
    </>
  );
  if (href && !disabled)
    return (
      <a className="admin-guidance-action" href={href}>
        {content}
      </a>
    );
  return (
    <span className="admin-guidance-action-wrap">
      <button
        type="button"
        className="admin-guidance-action"
        onClick={onClick}
        disabled={disabled || !onClick}
      >
        {content}
      </button>
      {disabled && unavailableReason ? (
        <small className="admin-guidance-action-reason">{unavailableReason}</small>
      ) : null}
    </span>
  );
}

export function ActionOwnerBadge({ actor }: { actor: GuidanceActor }) {
  const needsAdminAction = adminActionRequired(actor);
  return (
    <span
      className={`admin-guidance-owner admin-guidance-owner--${needsAdminAction ? "action" : "waiting"}`}
    >
      {needsAdminAction ? <CircleDot aria-hidden="true" /> : <Clock3 aria-hidden="true" />}
      <span>
        <small>Next actor</small>
        <strong>{actionOwnerLabel(actor)}</strong>
      </span>
    </span>
  );
}

export function OperationalProgress({ steps }: { steps: GuidanceStep[] }) {
  if (!steps.length) return null;
  const iconFor = (state: GuidanceStepState): LucideIcon =>
    state === "COMPLETE" || state === "NOT_APPLICABLE"
      ? CheckCircle2
      : state === "BLOCKED"
        ? AlertTriangle
        : state === "WAITING"
          ? Clock3
          : CircleDot;
  return (
    <section className="admin-guidance-progress" aria-label="Operational progress">
      <header>
        <span>Operational progress</span>
        <small>Authoritative lifecycle</small>
      </header>
      <ol>
        {steps.map((step) => {
          const Icon = iconFor(step.state);
          const body = (
            <>
              <Icon aria-hidden="true" />
              <span>
                <strong>{step.label}</strong>
                <small>{step.detail ?? guidanceStepLabel(step.state)}</small>
              </span>
            </>
          );
          return (
            <li key={step.id} data-state={step.state.toLowerCase()}>
              {step.action ? (
                <DeepLinkAction {...step.action} label={step.action.label || step.label} />
              ) : (
                <div>{body}</div>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export function BlockerList({ blockers }: { blockers: GuidanceBlocker[] }) {
  if (!blockers.length) return null;
  const [primary, ...downstream] = blockers;
  return (
    <section className="admin-guidance-blockers" aria-label="Operational blockers">
      <header>
        <span>Primary blocker</span>
        <small>{downstream.length ? `${downstream.length} downstream impact${downstream.length === 1 ? "" : "s"}` : ""}</small>
      </header>
      <strong>{primary.label}</strong>
      {primary.reason ? <p>{primary.reason}</p> : null}
      {primary.action ? <DeepLinkAction {...primary.action} /> : null}
      {downstream.length ? (
        <ul>
          {downstream.map((blocker) => (
            <li key={`${blocker.label}-${blocker.reason ?? ""}`}>
              <LockKeyhole aria-hidden="true" />
              <span>
                <strong>{blocker.label}</strong>
                {blocker.reason ? <small>{blocker.reason}</small> : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

export function CommandAvailabilityExplanation({ commands }: { commands: GuidanceCommand[] }) {
  if (!commands.length) return null;
  return (
    <section className="admin-guidance-commands" aria-label="Command availability">
      <header>
        <span>Relevant commands</span>
        <small>Only server-authorized actions are enabled.</small>
      </header>
      <div>
        {commands.map((command) => (
          <article key={command.label} data-available={command.available}>
            <div>
              <strong>{command.label}</strong>
              <small>
                {command.available
                  ? "Available at the current lifecycle stage."
                  : command.unavailableReason ?? "Not available at the current lifecycle stage."}
              </small>
            </div>
            {command.action ? (
              <DeepLinkAction
                {...command.action}
                disabled={!command.available || command.action.disabled}
                unavailableReason={command.unavailableReason ?? command.action.unavailableReason}
              />
            ) : (
              <span className="admin-guidance-command-status">
                {command.available ? "Available" : "Unavailable"}
              </span>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}

export function OperationalSummary({ children }: { children: ReactNode }) {
  return <div className="admin-guidance-summary">{children}</div>;
}

export function GuidancePanel({
  title = "Next required action",
  currentState,
  nextAction,
  progress = [],
  blockers = [],
  commands = [],
  className = "",
  compact = false,
}: GuidancePanelProps) {
  const requiresAction = adminActionRequired(nextAction.actor);
  return (
    <section
      className={`admin-guidance-panel ${compact ? "admin-guidance-panel--compact" : ""} ${className}`}
      aria-label={title}
    >
      <div className="admin-guidance-primary">
        <div className="admin-guidance-primary__heading">
          <div>
            <span>{requiresAction ? title : "Next step"}</span>
            <h2>{nextAction.title}</h2>
          </div>
          {currentState ? <em>{currentState}</em> : null}
        </div>
        <p>{nextAction.why}</p>
        <div className="admin-guidance-primary__meta">
          <ActionOwnerBadge actor={nextAction.actor} />
          <div>
            <small>{requiresAction ? "Blocking" : "Admin action"}</small>
            <strong>{requiresAction ? nextAction.blocker ?? "No additional blocker recorded" : "None required"}</strong>
          </div>
          {nextAction.afterThis ? (
            <div>
              <small>After this</small>
              <strong>{nextAction.afterThis}</strong>
            </div>
          ) : null}
        </div>
        {nextAction.action && requiresAction ? <DeepLinkAction {...nextAction.action} /> : null}
      </div>
      {!compact ? <OperationalProgress steps={progress} /> : null}
      <BlockerList blockers={blockers} />
      <CommandAvailabilityExplanation commands={commands} />
    </section>
  );
}

function guidanceStepLabel(state: GuidanceStepState) {
  const labels: Record<GuidanceStepState, string> = {
    BLOCKED: "Blocked",
    COMPLETE: "Complete",
    CURRENT: "In progress",
    NOT_APPLICABLE: "Not applicable",
    NOT_STARTED: "Not started",
    WAITING: "Waiting for the next actor",
  };
  return labels[state];
}
