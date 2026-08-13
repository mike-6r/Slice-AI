import { useEffect, useState } from "react";
import { Download, Filter, MoreHorizontal, Settings2, UsersRound } from "lucide-react";
import type { AdminMembershipDirectoryResponse, AdminMembershipRow } from "@/data/repositories";
import "@/styles/admin-memberships.css";

const tabs = [
  ["", "All"],
  ["ACTIVE", "Active"],
  ["PAST_DUE", "Past Due"],
  ["CANCELLED", "Cancelled"],
  ["CANCEL_AT_PERIOD_END", "Canceling"],
  ["TRIALING", "Trialing"],
  ["EXPIRED", "Expired"],
] as const;

function statusLabel(status: string) {
  return (
    {
      ACTIVE: "Active",
      PAST_DUE: "Past Due",
      CANCEL_AT_PERIOD_END: "Canceling",
      CANCELLED: "Cancelled",
      TRIALING: "Trialing",
      EXPIRED: "Expired",
    }[status] ?? status.replaceAll("_", " ")
  );
}

function planLabel(code: string) {
  return `${code.slice(0, 1)}${code.slice(1).toLowerCase()} Plan`;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(parsed);
}

function initials(displayName: string) {
  return displayName
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AdminMemberships({
  data,
  loading,
  failed,
  retry,
  query,
  plan,
  status,
  page,
  sort,
  sortDirection,
  update,
}: {
  data?: AdminMembershipDirectoryResponse;
  loading: boolean;
  failed: boolean;
  retry: () => void;
  query: string;
  plan: string;
  status: string;
  page: number;
  sort: string;
  sortDirection: "asc" | "desc";
  update: (patch: Record<string, string | undefined>) => void;
}) {
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim() || undefined;
      if (next !== (query || undefined)) update({ q: next, page: "1" });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, search, update]);

  if (loading) return <MembershipLoading />;
  if (failed || !data)
    return (
      <section className="admin-memberships-state">
        <h2>Memberships unavailable</h2>
        <p>We couldn't load Collector memberships right now.</p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </section>
    );

  const total = data.pagination.total;
  const filteredTotal = Object.values(data.statusOverview).reduce((sum, value) => sum + value, 0);
  const statusCount = (key: string) => data.statusOverview[key] ?? 0;
  const activePlanTotal = Object.values(data.planDistribution).reduce(
    (sum, value) => sum + value,
    0,
  );

  return (
    <main className="admin-memberships-page">
      <header className="admin-memberships-header">
        <div>
          <p className="admin-memberships-breadcrumb">
            Memberships <span aria-hidden="true">&gt;</span> Memberships Overview
          </p>
          <h2>Memberships</h2>
          <p>Manage collector memberships, plans, and usage.</p>
        </div>
        <div className="admin-memberships-header-actions">
          <button type="button" className="admin-memberships-button" disabled>
            <Download aria-hidden="true" /> Export
          </button>
          <button type="button" className="admin-memberships-button primary" disabled>
            <Settings2 aria-hidden="true" /> Membership Settings
          </button>
        </div>
      </header>

      <div className="admin-membership-kpis">
        <Kpi label="Active memberships" value={data.kpis.active} tone="teal" />
        <Kpi label="Starter plan" value={data.kpis.starter} tone="blue" />
        <Kpi label="Pro plan" value={data.kpis.pro} tone="purple" />
        <Kpi label="Elite plan" value={data.kpis.elite} tone="gold" />
        <Kpi label="Past due" value={data.kpis.pastDue} tone="red" />
        <Kpi label="Trialing" value={data.kpis.trialing} tone="cyan" />
      </div>

      <div className="admin-memberships-layout">
        <section className="admin-membership-table-card">
          <nav className="admin-membership-tabs" aria-label="Membership status">
            {tabs.map(([key, label]) => (
              <button
                type="button"
                className={(status || "") === key ? "active" : ""}
                key={key || "all"}
                onClick={() => update({ status: key || undefined, page: "1" })}
              >
                {label} <b>{key ? statusCount(key) : filteredTotal}</b>
              </button>
            ))}
          </nav>
          <div className="admin-membership-toolbar">
            <label className="admin-membership-search">
              <UsersRound aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by collector, email, username..."
                aria-label="Search memberships"
              />
            </label>
            <select
              value={plan}
              onChange={(event) => update({ plan: event.target.value || undefined, page: "1" })}
              aria-label="Plan"
            >
              <option value="">Plan: All</option>
              <option value="STARTER">Starter</option>
              <option value="PRO">Pro</option>
              <option value="ELITE">Elite</option>
            </select>
            <select
              value={status}
              onChange={(event) => update({ status: event.target.value || undefined, page: "1" })}
              aria-label="Status"
            >
              <option value="">Status: All</option>
              {tabs.slice(1).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
            <button type="button" className="admin-membership-filter" disabled>
              <Filter aria-hidden="true" /> More Filters
            </button>
          </div>
          <div className="admin-membership-table-wrap">
            <table className="admin-membership-table">
              <thead>
                <tr>
                  <th>Collector</th>
                  <th>Plan</th>
                  <th>Status</th>
                  <th>Active collectibles</th>
                  <th>Plan limit</th>
                  <th>Monthly usage</th>
                  <th>Concurrent intake</th>
                  <th>Next billing</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((row) => (
                  <MembershipRow key={row.id} row={row} update={update} />
                ))}
              </tbody>
            </table>
          </div>
          {!data.items.length ? (
            <div className="admin-membership-empty">
              {query || plan || status
                ? "No memberships match these filters."
                : "No Collector memberships found."}
            </div>
          ) : null}
          <footer className="admin-membership-pagination">
            <span>
              Showing {total ? (data.pagination.page - 1) * data.pagination.pageSize + 1 : 0} to{" "}
              {Math.min(data.pagination.page * data.pagination.pageSize, total)} of {total}{" "}
              memberships
            </span>
            <div>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                ‹
              </button>
              <strong>{data.pagination.page}</strong>
              <button
                type="button"
                disabled={page >= data.pagination.totalPages}
                onClick={() => update({ page: String(page + 1) })}
              >
                ›
              </button>
            </div>
          </footer>
        </section>

        <aside className="admin-membership-rail">
          <MembershipOverview data={data} />
          <PlanDistribution data={data} total={activePlanTotal} />
          <section className="admin-membership-side-card">
            <h3>Quick Actions</h3>
            <button type="button" disabled>
              View Cancelled
            </button>
            <button type="button" disabled>
              Export Usage Report
            </button>
            <p>Membership changes require the provider or an audited entitlement workflow.</p>
          </section>
          <section className="admin-membership-side-card">
            <div className="admin-membership-side-heading">
              <h3>Recent Activity</h3>
              <span>Live history</span>
            </div>
            {data.recentActivity.length ? (
              data.recentActivity.map((event) => (
                <div className="admin-membership-activity" key={event.id}>
                  <span />
                  <div>
                    <strong>{event.title}</strong>
                    <small>{event.reference ?? "Membership event"}</small>
                  </div>
                  <time>{formatDate(event.occurredAt)}</time>
                </div>
              ))
            ) : (
              <p className="admin-membership-muted">No membership events recorded.</p>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}

function Kpi({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <article className={`admin-membership-kpi tone-${tone}`}>
      <span>{label}</span>
      <strong>{value.toLocaleString("en-GB")}</strong>
      <small>Backend projection</small>
    </article>
  );
}

function MembershipRow({
  row,
  update,
}: {
  row: AdminMembershipRow;
  update: (patch: Record<string, string | undefined>) => void;
}) {
  const status = row.membership.status;
  const activePercent = row.usage.activeCollectiblesPercent ?? 0;
  const monthlyPercent = row.usage.monthlySubmissionsPercent ?? 0;
  const nextBilling = row.billing.nextBillingDate;
  return (
    <tr>
      <td>
        <div className="admin-membership-collector">
          <span className="admin-membership-avatar">{initials(row.collector.displayName)}</span>
          <div>
            <strong>{row.collector.displayName}</strong>
            <small>
              {row.collector.username ? `@${row.collector.username}` : row.collector.email}
            </small>
            <small>{row.collector.email}</small>
          </div>
        </div>
      </td>
      <td>
        <strong>{planLabel(row.plan.code)}</strong>
        <span className={`admin-membership-plan-badge plan-${row.plan.code.toLowerCase()}`}>
          {row.plan.code.slice(0, 1) + row.plan.code.slice(1).toLowerCase()}
        </span>
      </td>
      <td>
        <span className={`admin-membership-status status-${status.toLowerCase()}`}>
          {statusLabel(status)}
        </span>
      </td>
      <td>
        <Usage
          value={row.usage.activeCollectibles}
          limit={row.usage.activeCollectiblesLimit}
          percent={activePercent}
        />
      </td>
      <td>
        <strong>{row.usage.activeCollectiblesLimit ?? "—"}</strong>
      </td>
      <td>
        <Usage
          value={row.usage.monthlySubmissions}
          limit={row.usage.monthlySubmissionsLimit}
          percent={monthlyPercent}
        />
      </td>
      <td>
        <strong>
          {row.usage.concurrentIntake} / {row.usage.concurrentIntakeLimit ?? "—"}
        </strong>
        {row.usage.concurrentIntakeAtLimit ? (
          <small className="admin-membership-at-limit">At limit</small>
        ) : null}
      </td>
      <td>
        <strong>{formatDate(nextBilling)}</strong>
        <small>
          {row.membership.cancelAtPeriodEnd
            ? "Cancels at period end"
            : status === "PAST_DUE"
              ? "Past due"
              : nextBilling
                ? "Renews"
                : "No billing date"}
        </small>
      </td>
      <td>
        <button
          type="button"
          className="admin-membership-action"
          aria-label={`View ${row.collector.displayName} membership`}
          onClick={() => update({ section: "users", user: row.collector.id, tab: "membership" })}
        >
          <MoreHorizontal aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function Usage({
  value,
  limit,
  percent,
}: {
  value: number;
  limit: number | null;
  percent: number;
}) {
  return (
    <div className="admin-membership-usage">
      <strong>{limit === null ? `${value}` : `${value} / ${limit}`}</strong>
      <span className="admin-membership-progress">
        <i style={{ width: `${percent}%` }} />
      </span>
      <small>{limit === null ? "No limit" : `${percent}% used`}</small>
    </div>
  );
}

function MembershipOverview({ data }: { data: AdminMembershipDirectoryResponse }) {
  const total = Object.values(data.statusOverview).reduce((sum, value) => sum + value, 0) || 1;
  const active = data.statusOverview.ACTIVE ?? 0;
  const activePercent = Math.round((active / total) * 100);
  const gradient = `conic-gradient(#00c9a7 0 ${activePercent}%, #f04444 ${activePercent}% ${activePercent + Math.round(((data.statusOverview.PAST_DUE ?? 0) / total) * 100)}%, #64748b 0)`;
  return (
    <section className="admin-membership-side-card">
      <h3>Membership Overview</h3>
      <div className="admin-membership-donut" style={{ background: gradient }}>
        <div>
          <strong>{total.toLocaleString("en-GB")}</strong>
          <span>Total</span>
        </div>
      </div>
      <div className="admin-membership-legend">
        {tabs.slice(1).map(([key, label]) => (
          <span key={key}>
            <i className={`legend-${key.toLowerCase()}`} />
            {label}
            <b>{data.statusOverview[key] ?? 0}</b>
          </span>
        ))}
      </div>
    </section>
  );
}

function PlanDistribution({
  data,
  total,
}: {
  data: AdminMembershipDirectoryResponse;
  total: number;
}) {
  return (
    <section className="admin-membership-side-card">
      <h3>Plan Distribution</h3>
      {["ELITE", "PRO", "STARTER"].map((code) => {
        const value = data.planDistribution[code] ?? 0;
        const percent = total ? Math.round((value / total) * 100) : 0;
        return (
          <div className="admin-membership-plan-distribution" key={code}>
            <div>
              <strong>{planLabel(code)}</strong>
              <span>
                {value} ({percent}%)
              </span>
            </div>
            <span>
              <i className={`plan-bar-${code.toLowerCase()}`} style={{ width: `${percent}%` }} />
            </span>
          </div>
        );
      })}
      <small className="admin-membership-muted">Active, trialing and past-due memberships</small>
    </section>
  );
}

function MembershipLoading() {
  return (
    <main className="admin-memberships-page">
      <div className="admin-membership-loading">
        <span />
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <section className="admin-membership-table-card admin-membership-loading-table">
        <div />
        <div />
        <div />
        <div />
        <div />
      </section>
    </main>
  );
}
