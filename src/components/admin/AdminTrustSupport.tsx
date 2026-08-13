import { useEffect, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  Filter,
  Flag,
  LifeBuoy,
  LockKeyhole,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";

import type {
  AdminTrustSupportDashboard,
  AdminTrustSupportRecord,
  AdminTrustSupportRecordsResponse,
} from "@/data/repositories";
import "@/styles/admin-trust-support.css";

type TrustTab = "compliance" | "restrictions" | "tickets" | "escalations";
type Props = {
  dashboard?: AdminTrustSupportDashboard;
  records?: AdminTrustSupportRecordsResponse;
  dashboardLoading: boolean;
  recordsLoading: boolean;
  failed: boolean;
  retry: () => void;
  tab: string;
  query: string;
  status: string;
  type: string;
  priority: string;
  page: number;
  update: (patch: Record<string, string | undefined>) => void;
};

const tabs: Array<{ id: TrustTab; label: string }> = [
  { id: "compliance", label: "Compliance" },
  { id: "restrictions", label: "Restrictions" },
  { id: "tickets", label: "Support Tickets" },
  { id: "escalations", label: "Escalations" },
];
const statusOptions: Record<TrustTab, string[]> = {
  compliance: ["PENDING", "REVIEW", "MANUAL_REVIEW", "SUSPENDED"],
  restrictions: ["ACTIVE", "RELEASED"],
  tickets: ["OPEN", "CLAIMED", "WAITING_USER", "WAITING_STAFF", "ESCALATED", "RESOLVED", "CLOSED"],
  escalations: ["ESCALATED"],
};
const priorityOptions = ["LOW", "NORMAL", "HIGH", "URGENT"];

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
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
        parsed,
      );
};

function person(value: unknown) {
  if (!value || typeof value !== "object") return { id: "", name: "—", username: "", email: "" };
  const item = value as Record<string, unknown>;
  return {
    id: typeof item.id === "string" ? item.id : "",
    name: text(item.displayName),
    username: item.username ? `@${String(item.username)}` : "",
    email: item.email ? String(item.email) : "",
  };
}

function PersonCell({ value, onOpen }: { value: unknown; onOpen?: (id: string) => void }) {
  const item = person(value);
  return (
    <button
      className="admin-trust-person"
      disabled={!item.id || !onOpen}
      onClick={() => item.id && onOpen?.(item.id)}
      type="button"
      title={item.email || item.name}
    >
      <span>{item.name}</span>
      {item.username ? <small>{item.username}</small> : null}
      {item.email ? <small>{item.email}</small> : null}
    </button>
  );
}

function Status({ value, tone }: { value: unknown; tone?: string }) {
  return <span className={`admin-trust-status ${tone ?? ""}`}>{label(value)}</span>;
}

export function AdminTrustSupport({
  dashboard,
  records,
  dashboardLoading,
  recordsLoading,
  failed,
  retry,
  tab: rawTab,
  query,
  status,
  type,
  priority,
  page,
  update,
}: Props) {
  const activeTab: TrustTab = tabs.some((item) => item.id === rawTab)
    ? (rawTab as TrustTab)
    : "compliance";
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim() || undefined;
      if (next !== (query || undefined)) update({ q: next, page: "1" });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, search, update]);
  const activeStatus = statusOptions[activeTab].includes(status) ? status : "";
  const activeType = activeTab === "compliance" && ["KYC", "KYT"].includes(type) ? type : "";
  const activePriority = ["LOW", "NORMAL", "HIGH", "URGENT"].includes(priority) ? priority : "";
  const openUser = (id: string) =>
    update({
      section: "users",
      user: id,
      tab: "Compliance",
      q: undefined,
      status: undefined,
      type: undefined,
      page: undefined,
    });
  const selectTab = (next: TrustTab) =>
    update({ tab: next, status: undefined, type: undefined, priority: undefined, page: "1" });
  const pageInfo = records?.pagination ?? { page, pageSize: 10, total: 0, totalPages: 0 };
  const loading = dashboardLoading || recordsLoading;
  const emptyCopy: Record<TrustTab, string> = {
    compliance: "No open compliance cases match these filters.",
    restrictions: "No restrictions match these filters.",
    tickets: "No support tickets match these filters.",
    escalations: "No escalated Trust & Support items currently require attention.",
  };
  return (
    <section className="admin-trust-page">
      <header className="admin-trust-header">
        <div>
          <p className="admin-trust-breadcrumb">
            Trust &amp; Support <span>›</span> Trust &amp; Support Overview
          </p>
          <h2>Trust &amp; Support</h2>
          <p>Monitor compliance cases, restrictions, and support activity across the platform.</p>
        </div>
        <div className="admin-trust-header-actions">
          <button
            className="admin-trust-button"
            disabled
            title="Trust report export is not configured"
          >
            <Download size={15} /> Export
          </button>
          <button
            className="admin-trust-button primary"
            disabled
            title="Protected settings are not exposed here"
          >
            <Settings2 size={15} /> Trust &amp; Support Settings
          </button>
        </div>
      </header>
      <div className="admin-trust-kpis">
        <TrustKpi
          icon={<ShieldCheck />}
          label="Open compliance cases"
          value={dashboard?.kpis.openComplianceCases ?? 0}
          tone="purple"
        />
        <TrustKpi
          icon={<LockKeyhole />}
          label="Restricted accounts"
          value={dashboard?.kpis.restrictedAccounts ?? 0}
          tone="red"
        />
        <TrustKpi
          icon={<LifeBuoy />}
          label="Open tickets"
          value={dashboard?.kpis.openTickets ?? 0}
          tone="blue"
        />
        <TrustKpi
          icon={<UserRound />}
          label="Unassigned tickets"
          value={dashboard?.kpis.unassignedTickets ?? 0}
          tone="gold"
        />
        <TrustKpi
          icon={<Flag />}
          label="Escalations"
          value={dashboard?.kpis.escalations ?? 0}
          tone="purple"
        />
      </div>
      <div className="admin-trust-layout">
        <div className="admin-trust-main-card">
          <nav className="admin-trust-tabs" aria-label="Trust and Support sections">
            {tabs.map((item) => (
              <button
                className={item.id === activeTab ? "active" : ""}
                key={item.id}
                onClick={() => selectTab(item.id)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="admin-trust-toolbar">
            <label className="admin-trust-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  activeTab === "compliance"
                    ? "Search by collector, email, case ID, reference…"
                    : activeTab === "tickets"
                      ? "Search by ticket, subject, category…"
                      : "Search Trust & Support records…"
                }
              />
            </label>
            {activeTab === "compliance" ? (
              <select
                aria-label="Case type"
                value={activeType}
                onChange={(event) => update({ type: event.target.value || undefined, page: "1" })}
              >
                <option value="">Case Type: All</option>
                <option value="KYC">Identity / KYC</option>
                <option value="KYT">KYT Review</option>
              </select>
            ) : null}
            {activeTab === "tickets" || activeTab === "escalations" ? (
              <select
                aria-label="Priority"
                value={activePriority}
                onChange={(event) =>
                  update({ priority: event.target.value || undefined, page: "1" })
                }
              >
                <option value="">Priority: All</option>
                {priorityOptions.map((item) => (
                  <option key={item} value={item}>
                    {label(item)}
                  </option>
                ))}
              </select>
            ) : null}
            <select
              aria-label="Status"
              value={activeStatus}
              onChange={(event) => update({ status: event.target.value || undefined, page: "1" })}
            >
              <option value="">Status: All</option>
              {statusOptions[activeTab].map((item) => (
                <option key={item} value={item}>
                  {label(item)}
                </option>
              ))}
            </select>
            <button className="admin-trust-filter" disabled>
              <Filter size={14} /> More Filters
            </button>
          </div>
          {failed ? (
            <TrustState
              title="We couldn't load Trust & Support operations."
              detail="The normalized operational projection could not be loaded safely."
              retry={retry}
            />
          ) : loading && !records ? (
            <TableLoading />
          ) : recordsLoading ? (
            <TableLoading />
          ) : records?.items.length ? (
            <TrustTable tab={activeTab} rows={records.items} openUser={openUser} />
          ) : (
            <TrustEmpty detail={emptyCopy[activeTab]} />
          )}
          {!failed && activeTab && records ? (
            <TrustPagination info={pageInfo} update={update} />
          ) : null}
        </div>
        <aside className="admin-trust-rail">
          <section className="admin-trust-side-card">
            <div className="admin-trust-side-heading">
              <h3>Trust &amp; Support Overview</h3>
              <span>Live projection</span>
            </div>
            <div className="admin-trust-count-list">
              <CountRow
                label="Open compliance cases"
                value={dashboard?.overview.complianceCases ?? 0}
                tone="purple"
              />
              <CountRow
                label="Restricted accounts"
                value={dashboard?.overview.restrictedAccounts ?? 0}
                tone="red"
              />
              <CountRow
                label="Open tickets"
                value={dashboard?.overview.openTickets ?? 0}
                tone="blue"
              />
              <CountRow
                label="Unassigned tickets"
                value={dashboard?.overview.unassignedTickets ?? 0}
                tone="gold"
              />
              <CountRow
                label="Escalations"
                value={dashboard?.overview.escalations ?? 0}
                tone="purple"
              />
            </div>
            <p className="admin-trust-muted">
              Categories can overlap; counts are not treated as exclusive percentages.
            </p>
          </section>
          <section className="admin-trust-side-card">
            <h3>Quick Actions</h3>
            <QuickAction label="Create Compliance Case" icon={<ShieldCheck />} />
            <QuickAction label="Restrict Account" icon={<LockKeyhole />} />
            <QuickAction label="Create Support Ticket" icon={<LifeBuoy />} />
            <QuickAction label="Assign Ticket" icon={<UserRound />} />
            <QuickAction label="Escalate Issue" icon={<Flag />} />
            <QuickAction label="Export Trust Report" icon={<Download />} />
          </section>
          <section className="admin-trust-side-card">
            <div className="admin-trust-side-heading">
              <h3>Recent Activity</h3>
              <button type="button" onClick={() => selectTab("compliance")}>
                View all
              </button>
            </div>
            {(dashboard?.recentActivity ?? []).map((item) => (
              <div className="admin-trust-activity" key={item.id}>
                <span />
                <div>
                  <strong>{label(item.title)}</strong>
                  <small>{item.detail}</small>
                </div>
                <time>{date(item.occurredAt)}</time>
              </div>
            ))}
          </section>
        </aside>
      </div>
    </section>
  );
}

function TrustKpi({
  icon,
  label: title,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: string;
}) {
  return (
    <article className={`admin-trust-kpi tone-${tone}`}>
      <span className="admin-trust-kpi-icon">{icon}</span>
      <small>{title}</small>
      <strong>{value.toLocaleString("en-GB")}</strong>
      <em>Authoritative current state</em>
    </article>
  );
}
function CountRow({ label: title, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="admin-trust-count-row">
      <span>
        <i className={tone} />
        {title}
      </span>
      <b>{value.toLocaleString("en-GB")}</b>
    </div>
  );
}
function QuickAction({ label: title, icon }: { label: string; icon: React.ReactNode }) {
  return (
    <button
      className="admin-trust-quick-action"
      disabled
      title="This workflow is not exposed through the Admin API"
    >
      <span>{icon}</span>
      {title}
      <ArrowRight size={14} />
    </button>
  );
}
function TrustState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <div className="admin-trust-empty">
      <strong>{title}</strong>
      <p>{detail}</p>
      {retry ? (
        <button onClick={retry} type="button">
          <RefreshCw size={14} /> Retry
        </button>
      ) : null}
    </div>
  );
}
function TrustEmpty({ detail }: { detail: string }) {
  return (
    <div className="admin-trust-empty">
      <strong>{detail}</strong>
      <p>Try a different search or filter.</p>
    </div>
  );
}
function TableLoading() {
  return (
    <div className="admin-trust-loading">
      <span />
      <span />
      <span />
      <span />
      <span />
    </div>
  );
}
function TrustPagination({
  info,
  update,
}: {
  info: { page: number; pageSize: number; total: number; totalPages: number };
  update: Props["update"];
}) {
  return (
    <footer className="admin-trust-pagination">
      <span>
        Showing {info.total ? (info.page - 1) * info.pageSize + 1 : 0} to{" "}
        {Math.min(info.total, info.page * info.pageSize)} of {info.total.toLocaleString("en-GB")}{" "}
        records
      </span>
      <div>
        <button
          disabled={info.page <= 1}
          onClick={() => update({ page: String(info.page - 1) })}
          type="button"
        >
          <ChevronLeft size={14} />
        </button>
        <strong>{info.page}</strong>
        <button
          disabled={info.page >= info.totalPages}
          onClick={() => update({ page: String(info.page + 1) })}
          type="button"
        >
          <ChevronRight size={14} />
        </button>
      </div>
    </footer>
  );
}

function TrustTable({
  tab,
  rows,
  openUser,
}: {
  tab: TrustTab;
  rows: AdminTrustSupportRecord[];
  openUser: (id: string) => void;
}) {
  return (
    <div className="admin-trust-table-wrap">
      <table className="admin-trust-table">
        <thead>
          <TrustHeader tab={tab} />
        </thead>
        <tbody>
          {rows.map((row) => (
            <TrustRow key={row.id} tab={tab} row={row} openUser={openUser} />
          ))}
        </tbody>
      </table>
    </div>
  );
}
function TrustHeader({ tab }: { tab: TrustTab }) {
  const columns: Record<TrustTab, string[]> = {
    compliance: [
      "Case ID",
      "Collector / User",
      "Case Type",
      "Status",
      "Severity",
      "Opened",
      "Assigned To",
      "Last Update",
      "Actions",
    ],
    restrictions: [
      "User",
      "Restriction Type",
      "Scope",
      "Source",
      "Status",
      "Reason Summary",
      "Applied",
      "Expires",
      "Actions",
    ],
    tickets: [
      "Ticket ID",
      "Discord User",
      "Category",
      "Subject",
      "Priority",
      "Status",
      "Assignee",
      "Updated",
      "Actions",
    ],
    escalations: [
      "Reference",
      "Source",
      "Discord User",
      "Priority",
      "Reason Summary",
      "Owner",
      "Created",
      "Status",
      "Actions",
    ],
  };
  return (
    <tr>
      {columns[tab].map((column) => (
        <th key={column}>{column}</th>
      ))}
    </tr>
  );
}
function TrustRow({
  tab,
  row,
  openUser,
}: {
  tab: TrustTab;
  row: AdminTrustSupportRecord;
  openUser: (id: string) => void;
}) {
  const value = (key: string) => row[key];
  if (tab === "compliance")
    return (
      <tr>
        <td>
          <strong>{text(value("caseReference"))}</strong>
          <small>{text(row.id).slice(0, 12)}</small>
        </td>
        <td>
          <PersonCell value={value("user")} onOpen={openUser} />
        </td>
        <td>
          <strong>{label(value("caseType"))}</strong>
          <small>{text(value("provider"))}</small>
        </td>
        <td>
          <Status value={value("status")} />
        </td>
        <td>
          <Status value={value("severity")} tone="muted" />
        </td>
        <td>{date(value("openedAt"))}</td>
        <td>{text(value("assignedTo"))}</td>
        <td>{date(value("updatedAt"))}</td>
        <td>
          <button
            className="admin-trust-row-action"
            onClick={() => {
              const item = person(value("user"));
              if (item.id) openUser(item.id);
            }}
            type="button"
          >
            Open
          </button>
        </td>
      </tr>
    );
  if (tab === "restrictions")
    return (
      <tr>
        <td>
          <PersonCell value={value("user")} onOpen={openUser} />
        </td>
        <td>{label(value("restrictionType"))}</td>
        <td>{label(value("scope"))}</td>
        <td>{label(value("source"))}</td>
        <td>
          <Status value={value("status")} />
        </td>
        <td className="admin-trust-wrap-text">{text(value("reasonSummary"))}</td>
        <td>{date(value("appliedAt"))}</td>
        <td>{date(value("expiresAt"))}</td>
        <td>
          <button
            className="admin-trust-row-action"
            onClick={() => {
              const item = person(value("user"));
              if (item.id) openUser(item.id);
            }}
            type="button"
          >
            User
          </button>
        </td>
      </tr>
    );
  if (tab === "tickets")
    return (
      <tr>
        <td>
          <strong>{text(value("ticketReference"))}</strong>
          <small>{text(row.id).slice(0, 12)}</small>
        </td>
        <td>{text(value("creatorDiscordId"))}</td>
        <td>{label(value("category"))}</td>
        <td className="admin-trust-wrap-text">
          <strong>{text(value("subject"))}</strong>
          <small>{text(value("safeSummary"))}</small>
        </td>
        <td>
          <Status value={value("priority")} />
        </td>
        <td>
          <Status value={value("status")} />
        </td>
        <td>{text(value("assignedTo"))}</td>
        <td>{date(value("updatedAt"))}</td>
        <td>
          <button
            className="admin-trust-row-action"
            disabled
            title="Ticket actions remain in the Discord ticket authority"
          >
            View
          </button>
        </td>
      </tr>
    );
  return (
    <tr>
      <td>
        <strong>{text(value("reference"))}</strong>
        <small>{text(row.id).slice(0, 12)}</small>
      </td>
      <td>{label(value("sourceType"))}</td>
      <td>{text(value("creatorDiscordId"))}</td>
      <td>
        <Status value={value("priority")} />
      </td>
      <td className="admin-trust-wrap-text">{text(value("reasonSummary"))}</td>
      <td>{text(value("owner"))}</td>
      <td>{date(value("createdAt"))}</td>
      <td>
        <Status value={value("status")} />
      </td>
      <td>
        <button
          className="admin-trust-row-action"
          disabled
          title="Escalation actions are not exposed through the Admin API"
        >
          Inspect
        </button>
      </td>
    </tr>
  );
}
