import {
  Activity,
  AlertTriangle,
  BadgeCheck,
  Check,
  CircleDot,
  Clock3,
  Copy,
  FileClock,
  Fingerprint,
  RefreshCw,
  ShieldCheck,
  UserRound,
  WalletCards,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import type {
  AdminComplianceDetail,
  AdminComplianceRefreshResult,
  AdminUserDetail,
} from "@/data/repositories";
import "@/styles/admin-compliance-case-review.css";

type WorkflowState = "complete" | "current" | "upcoming" | "attention";

type WorkflowStep = {
  label: string;
  detail: string;
  state: WorkflowState;
};

const terminalCaseStatuses = new Set(["APPROVED", "REJECTED", "EXPIRED"]);

const readable = (value: string | null | undefined, fallback = "Not reported") => {
  if (!value) return fallback;
  return value
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const timestamp = (value: string | null | undefined, fallback = "Not recorded") => {
  if (!value) return fallback;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return fallback;
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(parsed);
};

const statusTone = (value: string) => {
  const normalized = value.toUpperCase();
  if (["APPROVED", "VERIFIED", "CLEAR", "ACTIVE"].includes(normalized)) return "positive";
  if (["REJECTED", "FAILED", "SUSPENDED", "REVIEW_REQUIRED"].includes(normalized))
    return "critical";
  if (["PENDING", "REVIEW", "MANUAL_REVIEW", "PROCESSING", "REQUIRES_INPUT"].includes(normalized))
    return "attention";
  return "neutral";
};

const caseGuidance = (detail: AdminComplianceDetail) => {
  const identityState = (
    detail.identity?.state ??
    detail.identityState ??
    detail.status
  ).toUpperCase();
  if (identityState === "REQUIRES_INPUT" || identityState === "NOT_STARTED") {
    return {
      actor: "Customer",
      title: "Customer evidence is required",
      detail:
        "The customer must return to their verification flow and provide the missing identity evidence. Staff can monitor, document, or restrict the account, but cannot mark provider verification as complete.",
    };
  }
  if (["PROCESSING", "PENDING", "REVIEW", "MANUAL_REVIEW"].includes(identityState)) {
    return {
      actor: "Provider / Compliance",
      title: "Verification is still being evaluated",
      detail:
        "Refresh the provider projection, inspect safe failure information, and confirm that account restrictions match the current risk posture.",
    };
  }
  if (identityState === "VERIFIED" || detail.status === "APPROVED") {
    return {
      actor: "Slice",
      title: "Identity verification is complete",
      detail:
        "Review capability and payout projections, then release only the admin-owned restrictions that are no longer required.",
    };
  }
  return {
    actor: "Compliance",
    title: "Review the failed or closed verification",
    detail:
      "Use the safe failure code and immutable history to determine whether the customer should retry. Provider and legal restrictions cannot be overridden here.",
  };
};

const workflowFor = (detail: AdminComplianceDetail): WorkflowStep[] => {
  const identityState = (
    detail.identity?.state ??
    detail.identityState ??
    detail.status
  ).toUpperCase();
  const terminal = terminalCaseStatuses.has(detail.status.toUpperCase());
  const needsCustomer = ["NOT_STARTED", "REQUIRES_INPUT"].includes(identityState);
  const providerBusy = ["PROCESSING", "PENDING", "REVIEW", "MANUAL_REVIEW"].includes(identityState);
  const hasRiskAttention =
    detail.riskReview?.status === "REVIEW_REQUIRED" ||
    (detail.riskReview?.activeHoldCount ?? 0) > 0;

  return [
    {
      label: "Case opened",
      detail: timestamp(detail.createdAt),
      state: "complete",
    },
    {
      label: "Customer evidence",
      detail: needsCustomer ? "Waiting for customer" : "Evidence received",
      state: needsCustomer ? "current" : "complete",
    },
    {
      label: "Provider verification",
      detail: providerBusy ? "Provider evaluation" : readable(identityState),
      state: needsCustomer ? "upcoming" : providerBusy ? "current" : "complete",
    },
    {
      label: "Risk & restrictions",
      detail: hasRiskAttention ? "Attention required" : "No active risk hold",
      state: hasRiskAttention ? "attention" : terminal ? "complete" : "upcoming",
    },
    {
      label: "Outcome",
      detail: terminal ? readable(detail.status) : "Awaiting resolution",
      state: terminal ? "complete" : "upcoming",
    },
  ];
};

function Fact({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="kyc-review__fact">
      <dt>{label}</dt>
      <dd data-tone={tone}>{value}</dd>
    </div>
  );
}

function EmptyLine({ children }: { children: ReactNode }) {
  return <p className="kyc-review__empty">{children}</p>;
}

export function AdminComplianceCaseReview({
  detail,
  customer,
  controls,
  refreshing = false,
  refreshError = false,
  refreshResult,
  onRefresh,
}: {
  detail: AdminComplianceDetail;
  customer?: AdminUserDetail;
  controls?: ReactNode;
  refreshing?: boolean;
  refreshError?: boolean;
  refreshResult?: AdminComplianceRefreshResult | null;
  onRefresh?: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const guidance = useMemo(() => caseGuidance(detail), [detail]);
  const workflow = useMemo(() => workflowFor(detail), [detail]);
  const activeRestrictions = detail.restrictions.filter((item) => item.status === "ACTIVE");
  const capabilities = customer?.capabilitySummary ?? [];
  const refreshAllowed = Boolean(onRefresh && customer?.permissions.canManageCompliance);

  const copyCaseId = async () => {
    if (!navigator.clipboard?.writeText) return;
    await navigator.clipboard.writeText(detail.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="kyc-review" aria-label="KYC compliance case review">
      <section className="kyc-review__hero">
        <div className="kyc-review__hero-copy">
          <span className="kyc-review__eyebrow">
            <Fingerprint aria-hidden="true" /> {readable(detail.type)} review
          </span>
          <div className="kyc-review__title-row">
            <h2>{detail.user.displayName}</h2>
            <span className="kyc-review__status" data-tone={statusTone(detail.status)}>
              {readable(detail.status)}
            </span>
          </div>
          <p>
            Provider-backed identity case with safe operational evidence, restrictions, decisions,
            and audit history in one workspace.
          </p>
          <div className="kyc-review__meta">
            <span>Provider · {readable(detail.provider)}</span>
            <span>Opened · {timestamp(detail.createdAt)}</span>
            <span>Updated · {timestamp(detail.updatedAt)}</span>
          </div>
        </div>
        <div className="kyc-review__hero-actions">
          <button type="button" className="kyc-review__button" onClick={() => void copyCaseId()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? "Copied" : "Copy case ID"}
          </button>
          <button
            type="button"
            className="kyc-review__button kyc-review__button--primary"
            onClick={onRefresh}
            disabled={!refreshAllowed || refreshing}
            title={
              refreshAllowed
                ? "Read the current status from the configured identity provider."
                : "Provider refresh requires compliance-management permission."
            }
          >
            <RefreshCw aria-hidden="true" className={refreshing ? "is-spinning" : undefined} />
            {refreshing ? "Checking provider…" : "Refresh provider status"}
          </button>
        </div>
      </section>

      <section
        className="kyc-review__next"
        data-tone={statusTone(detail.identity?.state ?? detail.status)}
      >
        <span className="kyc-review__next-icon">
          <AlertTriangle aria-hidden="true" />
        </span>
        <div>
          <span>Next actor · {guidance.actor}</span>
          <h3>{guidance.title}</h3>
          <p>{guidance.detail}</p>
        </div>
        <strong>{readable(detail.identity?.state ?? detail.status)}</strong>
      </section>

      {refreshError ? (
        <p className="kyc-review__feedback" data-tone="critical" role="alert">
          Provider status could not be refreshed. Nothing was changed; retry when the provider is
          available.
        </p>
      ) : refreshResult ? (
        <p className="kyc-review__feedback" data-tone="positive" role="status">
          Provider checked {timestamp(refreshResult.checkedAt)}. Current state:{" "}
          {readable(refreshResult.identityState)}
          {refreshResult.changed
            ? " — the authoritative case projection was updated."
            : " — no change was reported."}
        </p>
      ) : null}

      <section className="kyc-review__workflow" aria-label="KYC review progress">
        <div className="kyc-review__section-heading">
          <div>
            <span>Review path</span>
            <h3>Where this case is now</h3>
          </div>
          <small>Provider truth → Slice controls → account access</small>
        </div>
        <ol>
          {workflow.map((step, index) => (
            <li key={step.label} data-state={step.state}>
              <span className="kyc-review__step-marker">
                {step.state === "complete" ? <Check aria-hidden="true" /> : index + 1}
              </span>
              <div>
                <strong>{step.label}</strong>
                <small>{step.detail}</small>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <div className="kyc-review__layout">
        <main className="kyc-review__main">
          <section className="kyc-review__card">
            <div className="kyc-review__section-heading">
              <div>
                <span>Authoritative verification</span>
                <h3>Identity & provider evidence</h3>
              </div>
              <ShieldCheck aria-hidden="true" />
            </div>
            <div className="kyc-review__signal-grid">
              <article>
                <span>Provider status</span>
                <strong data-tone={statusTone(detail.providerStatus)}>
                  {readable(detail.providerStatus)}
                </strong>
                <small>Normalized provider state: {readable(detail.providerStatus)}</small>
              </article>
              <article>
                <span>Identity state</span>
                <strong data-tone={statusTone(detail.identity?.state ?? detail.status)}>
                  {readable(detail.identity?.state ?? detail.status)}
                </strong>
                <small>{readable(detail.identity?.provider ?? detail.provider)}</small>
              </article>
              <article>
                <span>Risk projection</span>
                <strong data-tone={statusTone(detail.riskReview?.status ?? "UNKNOWN")}>
                  {readable(detail.riskReview?.status)}
                </strong>
                <small>{detail.riskReview?.activeHoldCount ?? 0} active hold(s)</small>
              </article>
            </div>
            <dl className="kyc-review__facts">
              <Fact
                label="Verification session"
                value={detail.verificationSessionReference ?? "Not available"}
              />
              <Fact label="Evidence requested" value={timestamp(detail.identityRequestedAt)} />
              <Fact label="Last provider sync" value={timestamp(detail.identityLastProviderSync)} />
              <Fact label="Completed" value={timestamp(detail.identityCompletedAt)} />
              <Fact
                label="Verified"
                value={timestamp(detail.identityVerifiedAt ?? detail.identity?.verifiedAt)}
              />
              <Fact
                label="Safe failure code"
                value={readable(
                  detail.identitySafeFailureCode ?? detail.identity?.safeFailureCode,
                  "None",
                )}
                tone={
                  (detail.identitySafeFailureCode ?? detail.identity?.safeFailureCode)
                    ? "critical"
                    : "positive"
                }
              />
            </dl>
            <p className="kyc-review__guardrail">
              <ShieldCheck aria-hidden="true" /> Raw identity documents, document numbers, and
              provider payloads are intentionally never exposed in Admin.
            </p>
          </section>

          <section className="kyc-review__card">
            <div className="kyc-review__section-heading">
              <div>
                <span>Downstream access</span>
                <h3>Capabilities & payout readiness</h3>
              </div>
              <WalletCards aria-hidden="true" />
            </div>
            {capabilities.length ? (
              <div className="kyc-review__capabilities">
                {capabilities.map((capability) => (
                  <article key={capability.capability} data-available={capability.allowed}>
                    {capability.allowed ? (
                      <BadgeCheck aria-hidden="true" />
                    ) : (
                      <AlertTriangle aria-hidden="true" />
                    )}
                    <div>
                      <strong>{readable(capability.capability)}</strong>
                      <span>
                        {capability.allowed
                          ? "Available"
                          : readable(capability.reason ?? capability.status)}
                      </span>
                      {!capability.allowed && capability.nextAction ? (
                        <small>{capability.nextAction}</small>
                      ) : null}
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyLine>No capability projection is available for this customer.</EmptyLine>
            )}
            <div className="kyc-review__payouts">
              {(detail.connectPayoutReadiness ?? []).map((account) => (
                <article key={`${account.provider}-${account.environment}`}>
                  <div>
                    <span>{readable(account.provider)} payout account</span>
                    <strong data-tone={statusTone(account.status)}>
                      {readable(account.status)}
                    </strong>
                  </div>
                  <dl>
                    <Fact label="Environment" value={readable(account.environment)} />
                    <Fact
                      label="Details submitted"
                      value={account.detailsSubmitted ? "Yes" : "No"}
                    />
                    <Fact label="Payouts enabled" value={account.payoutsEnabled ? "Yes" : "No"} />
                    <Fact label="Transfers" value={readable(account.transfersCapability)} />
                    <Fact label="Last synced" value={timestamp(account.lastSyncedAt)} />
                  </dl>
                </article>
              ))}
              {detail.connectPayoutReadiness?.length ? null : (
                <EmptyLine>No connected payout account has been established.</EmptyLine>
              )}
            </div>
          </section>

          <section className="kyc-review__card">
            <div className="kyc-review__section-heading">
              <div>
                <span>Immutable record</span>
                <h3>Decision & audit timeline</h3>
              </div>
              <FileClock aria-hidden="true" />
            </div>
            <div className="kyc-review__history-grid">
              <div>
                <h4>Decisions</h4>
                {detail.decisions.length ? (
                  <ol className="kyc-review__timeline">
                    {detail.decisions.map((decision) => (
                      <li key={`${decision.createdAt}-${decision.reasonCode}`}>
                        <CircleDot aria-hidden="true" />
                        <div>
                          <strong>{readable(decision.status)}</strong>
                          <span>{readable(decision.reasonCode)}</span>
                          <small>
                            {decision.actorUserId
                              ? `Staff · ${decision.actorUserId.slice(0, 8)}`
                              : "System / provider"}{" "}
                            · {timestamp(decision.createdAt)}
                          </small>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyLine>No decision has been recorded.</EmptyLine>
                )}
              </div>
              <div>
                <h4>Audit events</h4>
                {detail.audit.length ? (
                  <ol className="kyc-review__timeline">
                    {detail.audit.map((event) => (
                      <li key={`${event.createdAt}-${event.action}`}>
                        <Activity aria-hidden="true" />
                        <div>
                          <strong>{readable(event.action)}</strong>
                          <span>{readable(event.result)}</span>
                          <small>{timestamp(event.createdAt)}</small>
                        </div>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyLine>No case-specific audit event is available.</EmptyLine>
                )}
              </div>
            </div>
          </section>
        </main>

        <aside className="kyc-review__rail">
          <section className="kyc-review__card kyc-review__card--rail">
            <div className="kyc-review__section-heading">
              <div>
                <span>Case control</span>
                <h3>Operational summary</h3>
              </div>
              <Clock3 aria-hidden="true" />
            </div>
            <dl className="kyc-review__rail-facts">
              <Fact label="Case ID" value={detail.id} />
              <Fact label="Customer ID" value={detail.user.id} />
              <Fact
                label="Username"
                value={detail.user.username ? `@${detail.user.username}` : "Not set"}
              />
              <Fact label="Decisions" value={String(detail.decisions.length)} />
              <Fact label="Active restrictions" value={String(activeRestrictions.length)} />
              <Fact label="Audit events" value={String(detail.audit.length)} />
            </dl>
          </section>

          <section className="kyc-review__card kyc-review__card--rail">
            <div className="kyc-review__section-heading">
              <div>
                <span>Risk controls</span>
                <h3>Restrictions</h3>
              </div>
              <AlertTriangle aria-hidden="true" />
            </div>
            {detail.restrictions.length ? (
              <div className="kyc-review__restrictions">
                {detail.restrictions.map((restriction) => (
                  <article key={`${restriction.createdAt}-${restriction.scope}`}>
                    <span data-tone={statusTone(restriction.status)}>
                      {readable(restriction.status)}
                    </span>
                    <strong>{readable(restriction.scope)}</strong>
                    <p>{readable(restriction.reasonCode)}</p>
                    <small>
                      {readable(restriction.source)} · {timestamp(restriction.createdAt)}
                    </small>
                  </article>
                ))}
              </div>
            ) : (
              <EmptyLine>No compliance restriction is recorded.</EmptyLine>
            )}
          </section>

          {controls ? <div className="kyc-review__controls">{controls}</div> : null}

          <section className="kyc-review__boundary">
            <UserRound aria-hidden="true" />
            <div>
              <strong>Authority boundary</strong>
              <p>
                Staff may refresh provider state, record internal notes, and manage eligible
                admin-owned restrictions. Only the configured identity provider can verify this
                customer.
              </p>
            </div>
          </section>
        </aside>
      </div>
    </div>
  );
}
