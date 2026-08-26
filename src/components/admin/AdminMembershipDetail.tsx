import {
  ArrowLeft,
  Check,
  CheckCircle2,
  Clipboard,
  ExternalLink,
  Info,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import type { ReactNode } from "react";
import type { AdminMembershipDetailResponse } from "@/data/repositories";
import "@/styles/admin-memberships.css";

const statusLabel = (value: string) =>
  ({
    INCOMPLETE: "Payment setup",
    ACTIVE: "Active",
    PAST_DUE: "Past due",
    CANCEL_AT_PERIOD_END: "Cancelling",
    CANCELLED: "Cancelled",
    TRIALING: "Trialing",
    SUSPENDED: "Suspended",
    EXPIRED: "Expired",
  })[value] ?? value.replaceAll("_", " ");
const sentence = (value: string) =>
  value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value: string | null) => {
  if (!value) return "Not available";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
};
const dateTime = (value: string) => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not available"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(parsed);
};
const money = (minor: string, currency: string) => {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
      Number(minor) / 100,
    );
  } catch {
    return `${minor} ${currency}`;
  }
};
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

export function AdminMembershipDetail({
  data,
  loading,
  failed,
  retry,
  back,
  openAccount,
  openAudit,
}: {
  data?: AdminMembershipDetailResponse;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  back: () => void;
  openAccount: () => void;
  openAudit: () => void;
}) {
  const [historyFilter, setHistoryFilter] = useState("ALL");
  if (loading) return <DetailLoading />;
  if (failed || !data)
    return (
      <section className="admin-membership-detail-state">
        <button type="button" className="admin-memberships-button" onClick={back}>
          <ArrowLeft size={14} /> Back to memberships
        </button>
        <h2>Membership detail unavailable</h2>
        <p>
          The authoritative membership record could not be loaded. No membership state or billing
          counts are shown.
        </p>
        <button type="button" className="admin-memberships-button" onClick={retry}>
          Try again
        </button>
      </section>
    );
  const filteredHistory = data.history.filter(
    (event) => historyFilter === "ALL" || event.category === historyFilter,
  );
  return (
    <main className="admin-membership-detail-page">
      <div className="admin-membership-detail-breadcrumb">
        <button type="button" onClick={back}>
          <ArrowLeft size={14} /> Back to memberships
        </button>
        <span>Memberships</span>
        <span>/</span>
        <strong>Membership detail</strong>
      </div>
      <header className="admin-membership-detail-header">
        <div className="admin-membership-detail-identity">
          <span className="admin-membership-detail-avatar">
            {initials(data.collector.displayName)}
          </span>
          <div>
            <div className="admin-membership-detail-name-row">
              <h1>{data.collector.displayName}</h1>
              <StatusBadge status={data.membership.status} />
              {data.membership.testFixture ? (
                <span className="admin-membership-fixture">TEST / DEMO</span>
              ) : null}
            </div>
            <p>
              {data.collector.email}
              {data.collector.username ? ` · @${data.collector.username}` : ""}
            </p>
            <div className="admin-membership-detail-subline">
              <span>{data.plan.displayName}</span>
              <span>·</span>
              <span>{data.membership.source.label}</span>
              <span>·</span>
              <span>Member since {date(data.membership.memberSince)}</span>
              <span>·</span>
              <span className="admin-membership-id">ID {data.id}</span>
              <CopyButton value={data.id} />
            </div>
          </div>
        </div>
        <div className="admin-membership-detail-header-actions">
          <button type="button" className="admin-memberships-button" onClick={openAccount}>
            Open account <ExternalLink size={13} />
          </button>
        </div>
      </header>
      <div className="admin-membership-detail-layout">
        <div className="admin-membership-detail-main">
          <SummaryStrip data={data} />
          <div className="admin-membership-detail-grid admin-membership-detail-grid--primary">
            <EntitlementsPanel data={data} />
            <BillingPanel data={data} />
          </div>
          <div className="admin-membership-detail-grid">
            <ConfigurationPanel data={data} />
            <AccountPanel data={data} />
          </div>
          <HistoryPanel
            data={data}
            filter={historyFilter}
            setFilter={setHistoryFilter}
            events={filteredHistory}
          />
        </div>
        <ActionRail data={data} openAccount={openAccount} openAudit={openAudit} />
      </div>
    </main>
  );
}

function SummaryStrip({ data }: { data: AdminMembershipDetailResponse }) {
  const summary = [
    [
      "Plan",
      data.plan.displayName,
      `${data.plan.active ? money(data.plan.monthlyPriceMinor, data.plan.currency) + " / " + data.plan.billingInterval : "Inactive plan configuration"}`,
    ],
    [
      "Membership status",
      statusLabel(data.membership.status),
      `Since ${date(data.membership.memberSince)}`,
    ],
    [
      "Membership source",
      data.membership.source.label,
      data.membership.source.detail ?? "Source recorded by Slice",
    ],
    ["Billing state", sentence(data.billing.state), data.billing.providerLabel],
    [
      "Current period",
      data.period.start && data.period.end
        ? `${date(data.period.start)} – ${date(data.period.end)}`
        : "No period recorded",
      data.period.daysRemaining === null
        ? data.period.label
        : `${data.period.daysRemaining} days remaining`,
    ],
    ["Next change", data.nextChange.label, date(data.nextChange.at)],
    [
      "Usage health",
      sentence(data.usage.health),
      data.usage.health === "NORMAL"
        ? "All tracked usage within limits"
        : "Review tracked capacity below",
    ],
  ];
  return (
    <section className="admin-membership-detail-summary" aria-label="Membership summary">
      {summary.map(([label, value, detail]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}</strong>
          <small>{detail}</small>
        </div>
      ))}
    </section>
  );
}

function EntitlementsPanel({ data }: { data: AdminMembershipDetailResponse }) {
  return (
    <section className="admin-membership-detail-panel admin-membership-detail-panel--entitlements">
      <PanelTitle
        title="Entitlements & usage"
        icon={<CheckCircle2 size={17} />}
        detail={data.entitlements.sourceLabel}
      />
      <div className="admin-membership-detail-source">
        <Info size={14} /> Effective entitlements are read from the persisted plan configuration.{" "}
        {data.entitlements.overrides.supported
          ? "Membership overrides are active."
          : "Membership-specific overrides are not supported."}
      </div>
      <h3>Features</h3>
      <div className="admin-membership-feature-list">
        {data.entitlements.features.length ? (
          data.entitlements.features.map((feature) => (
            <div key={feature.key} className={feature.enabled ? "enabled" : "disabled"}>
              <span>{feature.enabled ? <CheckCircle2 size={15} /> : <XCircle size={15} />}</span>
              <strong>{feature.label}</strong>
              <small>{feature.enabled ? "Enabled" : "Disabled"}</small>
            </div>
          ))
        ) : (
          <p className="admin-membership-muted">No feature entitlements are configured.</p>
        )}
      </div>
      <h3>Limits & usage</h3>
      <div className="admin-membership-limit-list">
        {data.entitlements.limits.length ? (
          data.entitlements.limits.map((limit) => <LimitRow key={limit.key} limit={limit} />)
        ) : (
          <p className="admin-membership-muted">No numeric limits are configured.</p>
        )}
      </div>
      {data.usage.unavailable.length ? (
        <p className="admin-membership-muted admin-membership-detail-note">
          Usage tracking unavailable for: {data.usage.unavailable.join(", ")}.
        </p>
      ) : null}
    </section>
  );
}

function LimitRow({
  limit,
}: {
  limit: AdminMembershipDetailResponse["entitlements"]["limits"][number];
}) {
  const percent =
    limit.used === null || limit.limit <= 0
      ? null
      : Math.min(100, Math.round((limit.used / limit.limit) * 100));
  return (
    <div className="admin-membership-detail-limit">
      <div className="admin-membership-detail-limit-heading">
        <div>
          <strong>{limit.label}</strong>
          <small>
            {limit.used === null
              ? "Usage tracking not available"
              : `${limit.used} used · ${limit.limit} limit`}
          </small>
        </div>
        <b>{limit.used === null ? `Limit: ${limit.limit}` : `${limit.remaining} remaining`}</b>
      </div>
      {percent === null ? (
        <div className="admin-membership-detail-unavailable">
          Limit configured · usage unavailable
        </div>
      ) : (
        <div className="admin-membership-detail-progress">
          <i style={{ width: `${percent}%` }} />
        </div>
      )}
    </div>
  );
}

function BillingPanel({ data }: { data: AdminMembershipDetailResponse }) {
  return (
    <section className="admin-membership-detail-panel">
      <PanelTitle
        title="Billing & period"
        icon={<Clipboard size={17} />}
        detail={
          data.billing.configured ? "Provider capability available" : "Beta capability boundary"
        }
      />
      <DetailRows
        rows={[
          ["Billing provider", data.billing.providerLabel],
          ["Billing state", sentence(data.billing.state)],
          ["Payment setup", data.billing.paymentSetupLabel],
          [
            "Current period",
            data.period.start && data.period.end
              ? `${date(data.period.start)} – ${date(data.period.end)}`
              : "No period recorded",
          ],
          ["Period authority", data.period.label],
          [
            "Next change",
            `${data.nextChange.label}${data.nextChange.at ? ` · ${date(data.nextChange.at)}` : ""}`,
          ],
          [
            "Provider sync",
            data.billing.syncState === "SYNCED"
              ? `Synced ${date(data.billing.lastSyncAt)}`
              : sentence(data.billing.syncState),
          ],
        ]}
      />
      {!data.billing.configured ? (
        <div className="admin-membership-detail-callout">
          <Info size={15} />
          <span>
            This environment has no billing provider configured. Internal membership entitlements
            remain authoritative.
          </span>
        </div>
      ) : null}
    </section>
  );
}

function ConfigurationPanel({ data }: { data: AdminMembershipDetailResponse }) {
  return (
    <section className="admin-membership-detail-panel">
      <PanelTitle
        title="Membership configuration"
        icon={<Info size={17} />}
        detail={`Plan version updated ${date(data.plan.versionUpdatedAt)}`}
      />
      <DetailRows
        rows={[
          ["Plan configuration", data.plan.displayName],
          ["Plan code", data.plan.code],
          ["Description", data.plan.description || "No description recorded"],
          ["Source", data.entitlements.sourceLabel],
          [
            "Overrides",
            data.entitlements.overrides.supported
              ? "Configured"
              : "No membership-specific overrides",
          ],
          [
            "Configuration state",
            data.plan.active ? "Active plan configuration" : "Inactive plan configuration",
          ],
        ]}
      />
    </section>
  );
}

function AccountPanel({ data }: { data: AdminMembershipDetailResponse }) {
  return (
    <section className="admin-membership-detail-panel">
      <PanelTitle
        title="Collector / account context"
        icon={<Info size={17} />}
        detail="Account authority remains in Accounts"
      />
      <DetailRows
        rows={[
          ["Collector", data.collector.displayName],
          ["Account status", sentence(data.account.status)],
          ["Joined", date(data.collector.joinedAt)],
          ["Membership created", date(data.membership.createdAt)],
          [
            "Test account",
            data.account.testFixture ? "Yes — explicitly marked fixture" : "No fixture marker",
          ],
          ["Financial state", "Restricted to authorized finance workspace"],
          ["Compliance state", "Restricted to authorized trust workspace"],
        ]}
      />
    </section>
  );
}

function ActionRail({
  data,
  openAccount,
  openAudit,
}: {
  data: AdminMembershipDetailResponse;
  openAccount: () => void;
  openAudit: () => void;
}) {
  const mutationsSupported = data.allowedActions.some((action) =>
    ["CHANGE_PLAN", "CANCEL", "SUSPEND", "RESTORE", "GRANT_BETA", "REMOVE_BETA"].includes(action),
  );
  return (
    <aside className="admin-membership-detail-rail">
      <section className="admin-membership-detail-panel admin-membership-detail-actions">
        <PanelTitle
          title="Membership health / actions"
          icon={<ShieldAlert size={17} />}
          detail="Backend-authoritative actions"
        />
        <div className="admin-membership-detail-health">
          <StatusBadge status={data.membership.status} />
          <strong>
            {data.issues.length
              ? `${data.issues.length} recorded issue${data.issues.length === 1 ? "" : "s"}`
              : "No recorded issues"}
          </strong>
        </div>
        <div className="admin-membership-issue-list">
          {data.issues.length ? (
            data.issues.map((issue) => (
              <div key={issue.code} className={`issue-${issue.severity.toLowerCase()}`}>
                <span>
                  {issue.severity === "ERROR" ? (
                    <XCircle size={15} />
                  ) : issue.severity === "WARNING" ? (
                    <ShieldAlert size={15} />
                  ) : (
                    <Info size={15} />
                  )}
                </span>
                <div>
                  <strong>{issue.label}</strong>
                  <small>{issue.detail}</small>
                </div>
              </div>
            ))
          ) : (
            <p className="admin-membership-good">
              <CheckCircle2 size={15} /> No blockers recorded
            </p>
          )}
        </div>
        <h3>Allowed actions</h3>
        <button type="button" className="admin-membership-rail-action" onClick={openAccount}>
          Open account <ExternalLink size={14} />
        </button>
        {data.allowedActions.includes("VIEW_AUDIT_HISTORY") ? (
          <button type="button" className="admin-membership-rail-action" onClick={openAudit}>
            View full audit history <ExternalLink size={14} />
          </button>
        ) : null}
        {!mutationsSupported ? (
          <div className="admin-membership-no-actions">
            <Info size={14} />
            <span>No membership mutations are supported by the current admin backend.</span>
          </div>
        ) : null}
      </section>
      <section className="admin-membership-detail-panel admin-membership-detail-links">
        <PanelTitle
          title="Record boundaries"
          icon={<Info size={17} />}
          detail="Keep related authorities separate"
        />
        <p>
          Account status, financial restrictions, compliance, payout blocks, and market permissions
          remain owned by their respective workspaces.
        </p>
        <p>
          Provider references are intentionally not exposed unless the backend marks them available.
        </p>
      </section>
    </aside>
  );
}

function HistoryPanel({
  data,
  filter,
  setFilter,
  events,
}: {
  data: AdminMembershipDetailResponse;
  filter: string;
  setFilter: (value: string) => void;
  events: AdminMembershipDetailResponse["history"];
}) {
  return (
    <section className="admin-membership-detail-panel admin-membership-detail-history">
      <div className="admin-membership-detail-history-head">
        <PanelTitle
          title="Membership history"
          icon={<Clipboard size={17} />}
          detail={`${events.length} visible events`}
        />
        <div className="admin-membership-history-filters">
          {[
            ["ALL", "All"],
            ["MEMBERSHIP", "Membership"],
            ["BILLING", "Billing"],
            ["ADMIN", "Admin actions"],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              className={filter === value ? "active" : ""}
              onClick={() => setFilter(value)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {!data.capabilities.auditAvailable ? (
        <div className="admin-membership-detail-callout">
          <Info size={15} /> Full audit history is restricted for this operator. Membership status
          history remains available.
        </div>
      ) : null}
      {events.length ? (
        <ol className="admin-membership-history-list">
          {events.map((event) => (
            <li key={event.id}>
              <span className="admin-membership-history-dot" />
              <div>
                <div className="admin-membership-history-meta">
                  <span>{dateTime(event.occurredAt)}</span>
                  <b>{sentence(event.category)}</b>
                </div>
                <strong>{sentence(event.event)}</strong>
                <p>{event.detail}</p>
                <small>Performed by {event.performedBy}</small>
              </div>
            </li>
          ))}
        </ol>
      ) : (
        <p className="admin-membership-muted">No events are recorded for this filter.</p>
      )}
    </section>
  );
}

function PanelTitle({ title, icon, detail }: { title: string; icon: ReactNode; detail: string }) {
  return (
    <div className="admin-membership-detail-panel-title">
      <div>
        <span>{icon}</span>
        <h2>{title}</h2>
      </div>
      <small>{detail}</small>
    </div>
  );
}
function DetailRows({ rows }: { rows: Array<[string, string]> }) {
  return (
    <dl className="admin-membership-detail-rows">
      {rows.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}
function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`admin-membership-status status-${status.toLowerCase()}`}>
      {statusLabel(status)}
    </span>
  );
}
function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className="admin-membership-copy"
      aria-label="Copy membership ID"
      onClick={() => {
        void navigator.clipboard?.writeText(value);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? <Check size={13} /> : <Clipboard size={13} />}
    </button>
  );
}
function DetailLoading() {
  return (
    <main className="admin-membership-detail-page">
      <div className="admin-membership-detail-skeleton-header" />
      <div className="admin-membership-detail-skeleton-grid">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
    </main>
  );
}
