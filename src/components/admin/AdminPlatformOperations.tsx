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
import { AdminRecordDrawer } from "./AdminRecordDrawer";
import { adminStatusLabel, adminStatusTone } from "./admin-status";

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
  simplified?: boolean;
  recordId?: string;
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
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
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
  return (
    <span className={`admin-platform-status ${adminStatusTone(value)}`} title={label(value)}>
      {adminStatusLabel(value)}
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

function RecordTable({
  tab,
  items,
  onOpen,
}: {
  tab: PlatformTab;
  items: AdminPlatformRecord[];
  onOpen: (id: string) => void;
}) {
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
            <th>
              <span className="sr-only">Open record</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              {activeColumns.map(([key]) => (
                <td key={key} title={text(item[key])}>
                  {key === "status" || key === "result" ? (
                    <Status value={item[key]} />
                  ) : key.endsWith("At") ? (
                    date(item[key])
                  ) : (
                    text(item[key])
                  )}
                </td>
              ))}
              <td>
                <button
                  type="button"
                  className="admin-finance-open-record"
                  onClick={() => onOpen(item.id)}
                >
                  Open
                </button>
              </td>
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
  simplified = false,
  recordId,
  update,
}: Props) {
  const activeTab: PlatformTab = tabs.some((item) => item.id === rawTab)
    ? (rawTab as PlatformTab)
    : "health";
  const viewTitle =
    activeTab === "health"
      ? "Platform health"
      : activeTab === "jobs" || activeTab === "webhooks"
        ? "Delivery"
        : activeTab === "integrations"
          ? "Integrations"
          : "Audit & settings";
  const viewDescription =
    activeTab === "health"
      ? "Monitor service health, queue resources and the alerts that need attention."
      : activeTab === "jobs" || activeTab === "webhooks"
        ? "Inspect delivery attempts, webhook events and safe error details."
        : activeTab === "integrations"
          ? "Check connected providers, configuration status and service availability."
          : "Inspect the audit trail and manage permission-controlled platform settings.";
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
  const openRecord = (id: string) => update({ record: id, recordType: "platform" });
  const closeRecord = () => update({ record: undefined, recordType: undefined });
  const selectedRecord = recordId
    ? records?.items.find((record) => record.id === recordId)
    : undefined;
  const activeStatus = statuses[activeTab].includes(status) ? status : "";
  const loading = dashboardLoading || (activeTab !== "health" && recordsLoading);
  const pageInfo = records?.pagination ?? { page, pageSize: 10, total: 0, totalPages: 0 };
  const visibleTabs = !simplified
    ? tabs
    : activeTab === "jobs" || activeTab === "webhooks"
      ? tabs.filter((item) => item.id === "jobs" || item.id === "webhooks")
      : activeTab === "audit" || activeTab === "settings" || activeTab === "feature-flags"
        ? tabs.filter((item) => item.id === "audit" || item.id === "settings")
        : [];
  return (
    <section className="admin-platform-page admin-list-workspace">
      <header className="admin-platform-header admin-list-workspace__heading">
        <div>
          <p className="admin-platform-breadcrumb">
            Platform <span>›</span> {viewTitle}
          </p>
          <h2>{viewTitle}</h2>
          <p>{viewDescription}</p>
        </div>
        <div className="admin-platform-header-actions">
          <button type="button" onClick={retry}>
            <RefreshCw aria-hidden="true" /> Refresh
          </button>
          {!simplified ? (
            <button type="button" className="primary" onClick={() => selectTab("settings")}>
              <Settings2 aria-hidden="true" /> Platform Settings
            </button>
          ) : null}
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
        {dashboard?.kpis.pendingChanges !== null && dashboard?.kpis.pendingChanges !== undefined ? (
          <Kpi
            label="Pending changes"
            value={dashboard.kpis.pendingChanges}
            icon={<Flag />}
            tone="purple"
          />
        ) : null}
      </div>
      {visibleTabs.length ? (
        <div className="admin-platform-tabs">
          {visibleTabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={activeTab === item.id ? "active" : ""}
              aria-current={activeTab === item.id ? "page" : undefined}
              onClick={() => selectTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      ) : null}
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
        <Health dashboard={dashboard} onTab={selectTab} simplified={simplified} />
      ) : (
        <Records
          tab={activeTab}
          records={records}
          query={search}
          setSearch={setSearch}
          status={activeStatus}
          update={update}
          pageInfo={pageInfo}
          onOpenRecord={openRecord}
        />
      )}
      {recordId ? (
        <PlatformRecordDrawer record={selectedRecord} recordId={recordId} onClose={closeRecord} />
      ) : null}
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
  simplified,
}: {
  dashboard?: AdminPlatformDashboard;
  onTab: (tab: PlatformTab) => void;
  simplified: boolean;
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
        {!simplified && dashboard.featureFlags.available ? (
          <div className="admin-platform-card">
            <div className="admin-platform-card-heading">
              <h3>Feature flags</h3>
              <span>Available</span>
            </div>
            <p className="admin-platform-muted">{dashboard.featureFlags.message}</p>
          </div>
        ) : null}
        {!simplified ? (
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
        ) : null}
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
  onOpenRecord,
}: {
  tab: PlatformTab;
  records?: AdminPlatformRecordsResponse;
  query: string;
  setSearch: (value: string) => void;
  status: string;
  update: (patch: Record<string, string | undefined>) => void;
  pageInfo: { page: number; pageSize: number; total: number; totalPages: number };
  onOpenRecord: (id: string) => void;
}) {
  const supported = records?.supported ?? true;
  return (
    <div className="admin-platform-records admin-platform-card">
      <div className="admin-platform-toolbar">
        <label className="admin-platform-search">
          <Search aria-hidden="true" />
          <input
            aria-label={`Search ${tab}`}
            value={query}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={`Search ${tab}…`}
          />
        </label>
        {statuses[tab].length ? (
          <select
            aria-label="Platform record status"
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
        <RecordTable tab={tab} items={records.items} onOpen={onOpenRecord} />
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
            aria-label="Previous page"
            onClick={() => update({ page: String(pageInfo.page - 1) })}
          >
            <ChevronLeft aria-hidden="true" />
          </button>
          <strong>{pageInfo.page}</strong>
          <button
            type="button"
            disabled={pageInfo.page >= pageInfo.totalPages}
            aria-label="Next page"
            onClick={() => update({ page: String(pageInfo.page + 1) })}
          >
            <ChevronRight aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );
}

function PlatformRecordDrawer({
  record,
  recordId,
  onClose,
}: {
  record?: AdminPlatformRecord;
  recordId: string;
  onClose: () => void;
}) {
  return (
    <AdminRecordDrawer
      title={record ? `${label(record.kind)} record` : "Platform record"}
      subtitle={
        record
          ? `Reference ${recordId}. This is the server-authoritative delivery, integration, or audit record.`
          : "The selected record is outside the current page or filter."
      }
      onClose={onClose}
    >
      {record ? (
        <dl className="admin-record-inspector">
          {Object.entries(record)
            .filter(
              ([key, value]) =>
                !["id", "kind"].includes(key) && value !== null && value !== undefined,
            )
            .map(([key, value]) => (
              <div key={key}>
                <dt>{label(key)}</dt>
                <dd>{key.endsWith("At") ? date(value) : platformRecordValue(value)}</dd>
              </div>
            ))}
        </dl>
      ) : (
        <p className="admin-record-inspector-empty">
          No authoritative record data is currently loaded.
        </p>
      )}
      <p className="admin-record-inspector-note">
        Retry and remediation actions remain available only when the server exposes a valid action
        and its audit requirements.
      </p>
    </AdminRecordDrawer>
  );
}

function platformRecordValue(value: unknown) {
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean")
    return String(value).replaceAll("_", " ");
  return "Recorded";
}
