import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Database,
  Flag,
  HeartPulse,
  RefreshCw,
  Search,
  Settings2,
  Webhook,
} from "lucide-react";

import type {
  AdminPlatformDashboard,
  AdminPlatformRecordsResponse,
  AdminPlatformRecord,
} from "@/data/repositories";
import "@/styles/admin-platform-operations.css";

type PlatformTab =
  "health" | "jobs" | "webhooks" | "integrations" | "audit" | "feature-flags" | "settings";
type Props = {
  dashboard?: AdminPlatformDashboard;
  records?: AdminPlatformRecordsResponse;
  dashboardLoading: boolean;
  recordsLoading: boolean;
  failed: boolean;
  retry: () => void;
  tab: string;
  query: string;
  status: string;
  page: number;
  update: (patch: Record<string, string | undefined>) => void;
};

const tabs: Array<{ id: PlatformTab; label: string }> = [
  { id: "health", label: "Health" },
  { id: "jobs", label: "Jobs" },
  { id: "webhooks", label: "Webhooks" },
  { id: "integrations", label: "Integrations" },
  { id: "audit", label: "Audit" },
  { id: "feature-flags", label: "Feature Flags" },
  { id: "settings", label: "Settings" },
];
const statuses: Record<PlatformTab, string[]> = {
  health: [],
  jobs: ["PENDING", "PROCESSING", "DELIVERED", "FAILED", "DEAD_LETTER"],
  webhooks: ["ACCEPTED", "PROCESSING", "PROCESSED", "FAILED", "REJECTED"],
  integrations: [
    "Operational",
    "Degraded",
    "Unavailable",
    "Unknown",
    "BETA_DISABLED",
    "NOT_CONFIGURED",
  ],
  audit: [],
  "feature-flags": [],
  settings: [],
};

const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
const label = (value: unknown) =>
  text(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
const date = (value: unknown) => {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(parsed);
};

function Status({ value }: { value: unknown }) {
  const normalized = String(value ?? "unknown").toLowerCase();
  return (
    <span
      className={`admin-platform-status ${normalized.includes("fail") || normalized.includes("reject") || normalized.includes("unavailable") ? "danger" : normalized.includes("degrad") || normalized.includes("attention") || normalized.includes("not_configured") ? "warning" : normalized.includes("unknown") || normalized.includes("beta_disabled") ? "muted" : "ok"}`}
    >
      {label(value)}
    </span>
  );
}

function Empty({ title, detail, retry }: { title: string; detail: string; retry?: () => void }) {
  return (
    <div className="admin-platform-empty">
      <CircleHelp aria-hidden="true" />
      <strong>{title}</strong>
      <p>{detail}</p>
      {retry ? (
        <button type="button" onClick={retry}>
          <RefreshCw aria-hidden="true" /> Retry
        </button>
      ) : null}
    </div>
  );
}

function RecordTable({ tab, items }: { tab: PlatformTab; items: AdminPlatformRecord[] }) {
  const columns: Record<PlatformTab, Array<[string, string]>> = {
    health: [],
    jobs: [
      ["eventType", "Event"],
      ["aggregate", "Aggregate"],
      ["status", "Status"],
      ["attempts", "Attempts"],
      ["updatedAt", "Updated"],
      ["error", "Safe error"],
    ],
    webhooks: [
      ["provider", "Provider"],
      ["eventType", "Event"],
      ["eventId", "Event reference"],
      ["status", "Status"],
      ["attempts", "Attempts"],
      ["receivedAt", "Received"],
      ["error", "Error"],
    ],
    integrations: [
      ["name", "Provider"],
      ["status", "Status"],
      ["configured", "Configured"],
      ["failedEvents", "Failures"],
      ["summary", "Authority"],
    ],
    audit: [
      ["actor", "Actor"],
      ["action", "Action"],
      ["resourceType", "Resource"],
      ["resourceId", "Reference"],
      ["result", "Result"],
      ["createdAt", "Created"],
    ],
    "feature-flags": [],
    settings: [],
  };
  const activeColumns = columns[tab];
  return (
    <div className="admin-platform-table-wrap">
      <table className="admin-platform-table">
        <thead>
          <tr>
            {activeColumns.map(([key, heading]) => (
              <th key={key}>{heading}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {activeColumns.map(([key]) => (
                <td key={key} title={text(item[key])}>
                  {key === "status" || key === "result" ? (
                    <Status value={item[key]} />
                  ) : key.toLowerCase().includes("at") || key === "createdAt" ? (
                    date(item[key])
                  ) : (
                    text(item[key])
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AdminPlatformOperations({
  dashboard,
  records,
  dashboardLoading,
  recordsLoading,
  failed,
  retry,
  tab: rawTab,
  query,
  status,
  page,
  update,
}: Props) {
  const activeTab: PlatformTab = tabs.some((item) => item.id === rawTab)
    ? (rawTab as PlatformTab)
    : "health";
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim() || undefined;
      if (next !== (query || undefined)) update({ q: next, page: "1" });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, search, update]);
  const selectTab = (next: PlatformTab) => update({ tab: next, status: undefined, page: "1" });
  const activeStatus = statuses[activeTab].includes(status) ? status : "";
  const loading = dashboardLoading || (activeTab !== "health" && recordsLoading);
  const pageInfo = records?.pagination ?? { page, pageSize: 10, total: 0, totalPages: 0 };
  return (
    <section className="admin-platform-page">
      <header className="admin-platform-header">
        <div>
          <p className="admin-platform-breadcrumb">
            Admin Console <span>›</span> Platform Dashboard
          </p>
          <h2>Platform Operations</h2>
          <p>System health, jobs, integrations, and platform configuration.</p>
        </div>
        <div className="admin-platform-header-actions">
          <button type="button" onClick={retry}>
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
          <button type="button" className="primary" onClick={() => selectTab("settings")}>
            <Settings2 aria-hidden="true" /> Platform Settings
          </button>
        </div>
      </header>
      <div className="admin-platform-kpis">
        <div className="admin-platform-kpi">
          <HeartPulse aria-hidden="true" />
          <small>Overall health</small>
          <strong>{dashboard ? dashboard.overallHealth : "—"}</strong>
          <span>Based on connected telemetry</span>
        </div>
        <Kpi
          label="Failed jobs"
          value={dashboard?.kpis.failedJobs}
          icon={<Activity />}
          tone="red"
        />
        <Kpi
          label="Webhook failures"
          value={dashboard?.kpis.webhookFailures}
          icon={<Webhook />}
          tone="blue"
        />
        <Kpi
          label="Degraded providers"
          value={dashboard?.kpis.degradedProviders}
          icon={<AlertTriangle />}
          tone="gold"
        />
        <Kpi
          label="Pending changes"
          value={dashboard?.kpis.pendingChanges}
          icon={<Flag />}
          tone="purple"
        />
      </div>
      <div className="admin-platform-tabs">
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            className={activeTab === item.id ? "active" : ""}
            onClick={() => selectTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {failed ? (
        <Empty
          title="Platform operations unavailable"
          detail="The authoritative platform projection could not be loaded safely."
          retry={retry}
        />
      ) : loading ? (
        <div className="admin-platform-loading">
          <span />
          <span />
          <span />
        </div>
      ) : activeTab === "health" ? (
        <Health dashboard={dashboard} onTab={selectTab} />
      ) : (
        <Records
          tab={activeTab}
          records={records}
          query={search}
          setSearch={setSearch}
          status={activeStatus}
          update={update}
          pageInfo={pageInfo}
        />
      )}
    </section>
  );
}

function Kpi({
  label: title,
  value,
  icon,
  tone,
}: {
  label: string;
  value: number | null | undefined;
  icon: ReactNode;
  tone: string;
}) {
  return (
    <div className={`admin-platform-kpi ${tone}`}>
      <span className="admin-platform-kpi-icon">{icon}</span>
      <small>{title}</small>
      <strong>{value === null || value === undefined ? "—" : value}</strong>
      <span>
        {value === null || value === undefined
          ? "Not exposed by the read model"
          : "Current projection"}
      </span>
    </div>
  );
}

function Health({
  dashboard,
  onTab,
}: {
  dashboard?: AdminPlatformDashboard;
  onTab: (tab: PlatformTab) => void;
}) {
  if (!dashboard)
    return (
      <Empty title="Health data unavailable" detail="No platform health projection was returned." />
    );
  return (
    <div className="admin-platform-health-grid">
      <div className="admin-platform-card admin-platform-health-card">
        <div className="admin-platform-card-heading">
          <h3>System Health</h3>
          <span>Live projection</span>
        </div>
        {dashboard.systemHealth.length ? (
          dashboard.systemHealth.map((item) => (
            <div className="admin-platform-health-row" key={item.name}>
              <span className="dot" />
              <strong>{item.name}</strong>
              <Status value={item.status} />
              <small>{item.summary}</small>
              <time>{date(item.lastCheckedAt)}</time>
            </div>
          ))
        ) : (
          <Empty title="No health checks" detail="The API returned no system health checks." />
        )}
      </div>
      <div className="admin-platform-health-column">
        <div className="admin-platform-card">
          <div className="admin-platform-card-heading">
            <h3>Queue & delivery resources</h3>
            <Database aria-hidden="true" />
          </div>
          {dashboard.resources.length ? (
            dashboard.resources.map((item) => (
              <div className="admin-platform-resource" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
                <Status value={item.status} />
              </div>
            ))
          ) : (
            <p className="admin-platform-muted">Resource telemetry is not exposed.</p>
          )}
        </div>
        <div className="admin-platform-card">
          <div className="admin-platform-card-heading">
            <h3>System alerts</h3>
            <span>{dashboard.alerts.length}</span>
          </div>
          {dashboard.alerts.length ? (
            dashboard.alerts.map((item) => (
              <div className="admin-platform-alert" key={item.id}>
                <AlertTriangle aria-hidden="true" />
                <div>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </div>
                <time>{date(item.occurredAt)}</time>
              </div>
            ))
          ) : (
            <p className="admin-platform-muted">No active alerts in the current projection.</p>
          )}
        </div>
      </div>
      <aside className="admin-platform-rail">
        <div className="admin-platform-card">
          <div className="admin-platform-card-heading">
            <h3>Provider status</h3>
            <button type="button" onClick={() => onTab("integrations")}>
              View all →
            </button>
          </div>
          {dashboard.providers.length ? (
            dashboard.providers.map((item) => (
              <div className="admin-platform-provider" key={item.name}>
                <span className="dot" />
                <strong>{item.name}</strong>
                <Status value={item.status} />
              </div>
            ))
          ) : (
            <p className="admin-platform-muted">No provider status records.</p>
          )}
        </div>
        <div className="admin-platform-card">
          <div className="admin-platform-card-heading">
            <h3>Feature flags</h3>
            <span>{dashboard.featureFlags.available ? "Available" : "Unavailable"}</span>
          </div>
          <p className="admin-platform-muted">{dashboard.featureFlags.message}</p>
        </div>
        <div className="admin-platform-card">
          <div className="admin-platform-card-heading">
            <h3>Quick actions</h3>
          </div>
          <button
            type="button"
            className="admin-platform-action"
            onClick={retryAction(onTab, "jobs")}
          >
            View all jobs <span>→</span>
          </button>
          <button
            type="button"
            className="admin-platform-action"
            onClick={retryAction(onTab, "webhooks")}
          >
            View webhooks <span>→</span>
          </button>
          <button
            type="button"
            className="admin-platform-action"
            onClick={retryAction(onTab, "audit")}
          >
            View audit logs <span>→</span>
          </button>
        </div>
      </aside>
    </div>
  );
}

const retryAction = (onTab: (tab: PlatformTab) => void, tab: PlatformTab) => () => onTab(tab);

function Records({
  tab,
  records,
  query,
  setSearch,
  status,
  update,
  pageInfo,
}: {
  tab: PlatformTab;
  records?: AdminPlatformRecordsResponse;
  query: string;
  setSearch: (value: string) => void;
  status: string;
  update: (patch: Record<string, string | undefined>) => void;
  pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
}) {
  const supported = records?.supported ?? true;
  return (
    <div className="admin-platform-records admin-platform-card">
      <div className="admin-platform-toolbar">
        <label className="admin-platform-search">
          <Search aria-hidden="true" />
          <input
            value={query}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${tab}…`}
          />
        </label>
        {statuses[tab].length ? (
          <select
            value={status}
            onChange={(event) => update({ status: event.target.value || undefined, page: "1" })}
          >
            <option value="">All statuses</option>
            {statuses[tab].map((item) => (
              <option key={item} value={item}>
                {label(item)}
              </option>
            ))}
          </select>
        ) : null}
      </div>
      {!supported ? (
        <Empty
          title="Not available"
          detail={records?.message ?? "This read model is not configured."}
        />
      ) : records?.items.length ? (
        <RecordTable tab={tab} items={records.items} />
      ) : (
        <Empty
          title={`No ${tab} records`}
          detail="No authoritative records match the current filters."
        />
      )}
      <div className="admin-platform-pagination">
        <span>
          {pageInfo.total
            ? `${(pageInfo.page - 1) * pageInfo.pageSize + 1}–${Math.min(pageInfo.page * pageInfo.pageSize, pageInfo.total)} of ${pageInfo.total}`
            : "0 records"}
        </span>
        <div>
          <button
            type="button"
            disabled={pageInfo.page <= 1}
            onClick={() => update({ page: String(pageInfo.page - 1) })}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>{pageInfo.page}</strong>
          <button
            type="button"
            disabled={pageInfo.page >= pageInfo.totalPages}
            onClick={() => update({ page: String(pageInfo.page + 1) })}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}
