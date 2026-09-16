import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowRight,
  Bot,
  MapPin,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from "lucide-react";

import { AdminIntakeLocations } from "./AdminIntakeLocations";
import { useAppServices } from "@/providers/AppServicesProvider";
import "@/styles/admin-platform-settings.css";

type QualificationTab =
  "HUMAN_REVIEW_REQUIRED" | "COLLECTOR_ACTION_REQUIRED" | "AUTO_QUALIFIED" | "BLOCKED";

type PendingChange = {
  label: string;
  detail: string;
  previous: string;
  next: string;
  patch?: {
    enabled?: boolean;
    autoPreSaleLaunch?: boolean;
    emergencyDisabled?: boolean;
    qaSamplingBps?: number;
  };
  rerunSubmissionId?: string;
};

const qualificationTabs: Array<{ id: QualificationTab; label: string }> = [
  { id: "HUMAN_REVIEW_REQUIRED", label: "Needs human review" },
  { id: "COLLECTOR_ACTION_REQUIRED", label: "Customer action" },
  { id: "AUTO_QUALIFIED", label: "Auto-qualified" },
  { id: "BLOCKED", label: "Blocked" },
];

export function AdminPlatformSettings({
  locationId,
  locationTab,
  openLocation,
  closeLocations,
}: {
  locationId?: string;
  locationTab?: string;
  openLocation: (id: string, tab?: string) => void;
  closeLocations: () => void;
}) {
  const { repositories } = useAppServices();
  const [qualificationTab, setQualificationTab] =
    useState<QualificationTab>("HUMAN_REVIEW_REQUIRED");
  const [pending, setPending] = useState<PendingChange | null>(null);
  const policy = useQuery({
    queryKey: ["admin", "qualification-policy"],
    queryFn: () => repositories.reviews.getQualificationPolicy(),
    staleTime: 20_000,
  });
  const qualification = useQuery({
    queryKey: ["admin", "qualification", qualificationTab],
    queryFn: () => repositories.reviews.listQualification(qualificationTab),
    staleTime: 15_000,
  });
  const updatePolicy = useMutation({
    mutationFn: (input: NonNullable<PendingChange["patch"]> & { reason: string }) =>
      repositories.reviews.updateQualificationPolicy(input),
    onSuccess: () => void policy.refetch(),
  });
  const rerun = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      repositories.reviews.rerunQualification(id, { reason }),
    onSuccess: () => void qualification.refetch(),
  });

  if (locationId) {
    return (
      <section className="admin-platform-settings-page">
        <AdminIntakeLocations
          locationId={locationId === "__directory__" ? undefined : locationId}
          tab={locationTab}
          onBack={closeLocations}
          onOpen={openLocation}
        />
      </section>
    );
  }

  const policyValue = policy.data;
  const controlledChange = (input: PendingChange) => setPending(input);
  return (
    <section className="admin-platform-settings-page admin-list-workspace">
      <header className="admin-platform-settings-page__heading admin-list-workspace__heading">
        <div>
          <p>Platform · Audit &amp; Settings</p>
          <h2>Authoritative platform controls</h2>
          <span>
            Changes require a reason, show their exact state transition, and are written to the
            immutable audit trail.
          </span>
        </div>
      </header>

      <div className="admin-platform-settings-grid">
        <section className="admin-platform-settings-card admin-platform-settings-card--wide">
          <header>
            <div>
              <span className="admin-platform-settings-icon">
                <Bot aria-hidden="true" />
              </span>
              <p>Automated qualification</p>
              <h3>Conservative automation policy</h3>
            </div>
            <button type="button" onClick={() => void policy.refetch()}>
              <RefreshCw aria-hidden="true" /> Refresh policy
            </button>
          </header>
          {policy.isLoading ? (
            <p className="admin-platform-settings-muted">Loading the authoritative policy…</p>
          ) : null}
          {policy.isError || !policyValue ? (
            <p className="admin-platform-settings-error">
              Policy settings could not be read safely. No change can be made until the authority is
              available.
            </p>
          ) : (
            <div className="admin-platform-policy-grid">
              <PolicyControl
                label="Automation"
                detail="Runs eligible qualification checks; it never replaces the required human decision path."
                value={policyValue.enabled}
                onChange={() =>
                  controlledChange({
                    label: "Automation",
                    detail: "Update the qualification automation gate.",
                    previous: policyValue.enabled ? "Enabled" : "Paused",
                    next: policyValue.enabled ? "Paused" : "Enabled",
                    patch: { enabled: !policyValue.enabled },
                  })
                }
              />
              <PolicyControl
                label="Conditional Pre-Sale"
                detail="Allows only policy-eligible auto-qualified records to progress to the controlled pre-sale stage."
                value={policyValue.autoPreSaleLaunch}
                onChange={() =>
                  controlledChange({
                    label: "Conditional Pre-Sale",
                    detail: "Update the conditional pre-sale gate.",
                    previous: policyValue.autoPreSaleLaunch ? "Enabled" : "Paused",
                    next: policyValue.autoPreSaleLaunch ? "Paused" : "Enabled",
                    patch: { autoPreSaleLaunch: !policyValue.autoPreSaleLaunch },
                  })
                }
              />
              <PolicyControl
                dangerous
                label="Emergency stop"
                detail="Stops automated decisions immediately. Existing records remain available for human review."
                value={policyValue.emergencyDisabled}
                trueLabel="Active"
                falseLabel="Inactive"
                onChange={() =>
                  controlledChange({
                    label: "Emergency stop",
                    detail: "Update the emergency stop for automated qualification.",
                    previous: policyValue.emergencyDisabled ? "Active" : "Inactive",
                    next: policyValue.emergencyDisabled ? "Inactive" : "Active",
                    patch: { emergencyDisabled: !policyValue.emergencyDisabled },
                  })
                }
              />
              <div className="admin-platform-policy-sample">
                <span>
                  <SlidersHorizontal aria-hidden="true" /> QA sample
                </span>
                <strong>{(policyValue.qaSamplingBps / 100).toFixed(2)}%</strong>
                <button
                  type="button"
                  onClick={() =>
                    controlledChange({
                      label: "QA sample rate",
                      detail: "Update the audited qualification sample percentage.",
                      previous: `${(policyValue.qaSamplingBps / 100).toFixed(2)}%`,
                      next: `${Math.min(100, Math.max(0, policyValue.qaSamplingBps / 100 + 1)).toFixed(2)}%`,
                      patch: { qaSamplingBps: Math.min(10_000, policyValue.qaSamplingBps + 100) },
                    })
                  }
                >
                  Adjust with reason
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="admin-platform-settings-card">
          <header>
            <div>
              <span className="admin-platform-settings-icon">
                <MapPin aria-hidden="true" />
              </span>
              <p>Receiving locations</p>
              <h3>Global intake configuration</h3>
            </div>
          </header>
          <p>
            Configure approved receiving locations once. Asset operators can assign them to a
            submission but cannot change the global configuration from the intake queue.
          </p>
          <button
            type="button"
            className="admin-platform-settings-primary"
            onClick={() => openLocation("__directory__")}
          >
            Manage receiving locations <ArrowRight aria-hidden="true" />
          </button>
        </section>

        <section className="admin-platform-settings-card">
          <header>
            <div>
              <span className="admin-platform-settings-icon">
                <ShieldCheck aria-hidden="true" />
              </span>
              <p>Audit standard</p>
              <h3>Protected actions</h3>
            </div>
          </header>
          <p>
            Every policy change and controlled rerun below captures the administrator, time,
            previous state, new state, and the mandatory reason.
          </p>
          <span className="admin-platform-settings-note">
            Authority is server-side; UI controls never fabricate an outcome.
          </span>
        </section>
      </div>

      <section className="admin-platform-settings-card admin-platform-settings-card--wide">
        <header>
          <div>
            <span className="admin-platform-settings-icon">
              <AlertTriangle aria-hidden="true" />
            </span>
            <p>Automation exceptions</p>
            <h3>Controlled qualification reruns</h3>
          </div>
          <button type="button" onClick={() => void qualification.refetch()}>
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
        </header>
        <nav className="admin-platform-settings-tabs" aria-label="Qualification outcomes">
          {qualificationTabs.map((tab) => (
            <button
              type="button"
              key={tab.id}
              className={qualificationTab === tab.id ? "is-active" : ""}
              onClick={() => setQualificationTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>
        {qualification.isLoading ? (
          <p className="admin-platform-settings-muted">Loading qualification runs…</p>
        ) : null}
        {!qualification.isLoading && !qualification.data?.items.length ? (
          <p className="admin-platform-settings-muted">
            No authoritative qualification runs match this outcome.
          </p>
        ) : null}
        {qualification.data?.items.length ? (
          <div className="admin-platform-exception-list">
            {qualification.data.items.map((item) => (
              <article key={item.runId}>
                <div>
                  <span>{item.outcome.replaceAll("_", " ")}</span>
                  <strong>{item.submission.id}</strong>
                  <p>{item.reasons.join(" · ") || "No additional decision reason was returned."}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    controlledChange({
                      label: "Rerun qualification",
                      detail:
                        "Request a controlled qualification rerun after new evidence or a corrected integration result.",
                      previous: item.outcome.replaceAll("_", " "),
                      next: "A new authoritative run",
                      rerunSubmissionId: item.submission.id,
                    })
                  }
                >
                  Rerun with reason
                </button>
              </article>
            ))}
          </div>
        ) : null}
      </section>

      {pending ? (
        <Confirmation
          change={pending}
          saving={updatePolicy.isPending || rerun.isPending}
          error={updatePolicy.error ?? rerun.error}
          onCancel={() => setPending(null)}
          onConfirm={(reason) => {
            if (pending.rerunSubmissionId)
              rerun.mutate(
                { id: pending.rerunSubmissionId, reason },
                { onSuccess: () => setPending(null) },
              );
            else if (pending.patch)
              updatePolicy.mutate(
                { ...pending.patch, reason },
                { onSuccess: () => setPending(null) },
              );
          }}
        />
      ) : null}
    </section>
  );
}

function PolicyControl({
  label,
  detail,
  value,
  onChange,
  dangerous = false,
  trueLabel = "Enabled",
  falseLabel = "Paused",
}: {
  label: string;
  detail: string;
  value: boolean;
  onChange: () => void;
  dangerous?: boolean;
  trueLabel?: string;
  falseLabel?: string;
}) {
  return (
    <article className={`admin-platform-policy-control${dangerous ? " is-danger" : ""}`}>
      <div>
        <strong>{label}</strong>
        <p>{detail}</p>
      </div>
      <button
        type="button"
        className={value ? "is-on" : ""}
        onClick={onChange}
        aria-pressed={value}
      >
        {value ? trueLabel : falseLabel}
      </button>
    </article>
  );
}

function Confirmation({
  change,
  saving,
  error,
  onCancel,
  onConfirm,
}: {
  change: PendingChange;
  saving: boolean;
  error: unknown;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  return (
    <div className="admin-platform-confirm-layer" role="presentation">
      <button
        type="button"
        aria-label="Cancel change"
        className="admin-platform-confirm-scrim"
        onClick={onCancel}
      />
      <section
        className="admin-platform-confirm"
        role="dialog"
        aria-modal="true"
        aria-label={`Confirm ${change.label}`}
      >
        <p>Protected platform action</p>
        <h3>Confirm {change.label}</h3>
        <span>{change.detail}</span>
        <dl>
          <div>
            <dt>Current state</dt>
            <dd>{change.previous}</dd>
          </div>
          <div>
            <dt>New state</dt>
            <dd>{change.next}</dd>
          </div>
        </dl>
        <label>
          Reason for this change
          <textarea
            value={reason}
            rows={4}
            minLength={3}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Explain why this action is necessary."
          />
        </label>
        {error ? (
          <p className="admin-platform-settings-error">
            The action was not completed. Check the authority and try again.
          </p>
        ) : null}
        <footer>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="is-primary"
            disabled={saving || reason.trim().length < 3}
            onClick={() => onConfirm(reason.trim())}
          >
            {saving ? "Recording…" : "Confirm and audit"}
          </button>
        </footer>
      </section>
    </div>
  );
}
