import { useEffect, useState } from "react";
import { ArrowLeft, Download, Search, ShieldCheck } from "lucide-react";
import type { AdminMembershipDirectoryResponse, AdminMembershipRow } from "@/data/repositories";
import "@/styles/admin-memberships.css";

const tabs = [
  ["", "All"],
  ["INCOMPLETE", "Payment setup"],
  ["ACTIVE", "Active"],
  ["PAST_DUE", "Past due"],
  ["TRIALING", "Trialing"],
  ["CANCEL_AT_PERIOD_END", "Cancelling"],
  ["CANCELLED", "Cancelled"],
  ["SUSPENDED", "Suspended"],
  ["EXPIRED", "Expired"],
] as const;
const statusLabel = (status: string) =>
  ({
    INCOMPLETE: "Payment setup",
    ACTIVE: "Active",
    PAST_DUE: "Past due",
    CANCEL_AT_PERIOD_END: "Cancelling",
    CANCELLED: "Cancelled",
    TRIALING: "Trialing",
    SUSPENDED: "Suspended",
    EXPIRED: "Expired",
  })[status] ?? status.replaceAll("_", " ");
const planLabel = (code: string) =>
  `${{ STARTER: "Starter", PRO: "Pro", ELITE: "Elite" }[code] ?? code} plan`;
function formatDate(value: string | null) {
  if (!value) return "Not configured";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime())
    ? "Not configured"
    : new Intl.DateTimeFormat("en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(parsed);
}
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
function usageState(value: number, limit: number | null, percent: number | null) {
  if (limit === null) return "Uncapped";
  if (value > limit) return "Over limit";
  if ((percent ?? 0) >= 100) return "At limit";
  if ((percent ?? 0) >= 80) return "Near limit";
  return "Within plan";
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
  update,
  selectedId,
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
  selectedId?: string;
}) {
  const [search, setSearch] = useState(query);
  const [billingFilter, setBillingFilter] = useState("");
  const [usageFilter, setUsageFilter] = useState("");
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
  const filteredItems = data.items.filter((row) => {
    const billingMatch = !billingFilter || row.membership.billingState === billingFilter;
    const activePercent = row.usage.activeCollectiblesPercent ?? 0;
    const monthlyPercent = row.usage.monthlySubmissionsPercent ?? 0;
    const state = row.overLimit
      ? "OVER_LIMIT"
      : Math.max(activePercent, monthlyPercent) >= 100
        ? "AT_LIMIT"
        : Math.max(activePercent, monthlyPercent) >= 80
          ? "NEAR_LIMIT"
          : "OK";
    return billingMatch && (!usageFilter || state === usageFilter);
  });
  const selected = selectedId ? data.items.find((row) => row.id === selectedId) : undefined;
  if (selectedId && selected)
    return <MembershipDetail row={selected} back={() => update({ membership: undefined })} />;
  const statusCount = (key: string) => data.statusOverview[key] ?? 0;
  const total = data.pagination.total;
  const totalVisible = Object.values(data.statusOverview).reduce((sum, value) => sum + value, 0);
  return (
    <main className="admin-memberships-page">
      <header className="admin-memberships-header">
        <div>
          <p className="admin-memberships-eyebrow">ADMIN CONSOLE / MEMBERSHIPS</p>
          <h2>Memberships</h2>
          <p>Manage Collector plans, usage, entitlements and subscription status.</p>
        </div>
        <div className="admin-memberships-header-actions">
          <button type="button" className="admin-memberships-button" disabled>
            <Download aria-hidden="true" /> Export
          </button>
          <span className="admin-memberships-beta-note">
            Billing provider is not configured in Beta
          </span>
        </div>
      </header>
      <section className="admin-membership-summary" aria-label="Membership summary">
        <strong>
          {data.kpis.active.toLocaleString("en-GB")} active membership
          {data.kpis.active === 1 ? "" : "s"}
        </strong>
        <span>Starter {data.kpis.starter}</span>
        <span>Pro {data.kpis.pro}</span>
        <span>Elite {data.kpis.elite}</span>
        <span>Past due {data.kpis.pastDue}</span>
        <span>Trialing {data.kpis.trialing}</span>
      </section>
      <section className="admin-membership-table-card">
        <nav className="admin-membership-tabs" aria-label="Membership status">
          {tabs.map(([key, label]) => (
            <button
              type="button"
              className={(status || "") === key ? "active" : ""}
              key={key || "all"}
              onClick={() => update({ status: key || undefined, page: "1" })}
            >
              {label} <b>{key ? statusCount(key) : totalVisible}</b>
            </button>
          ))}
        </nav>
        <div className="admin-membership-toolbar">
          <label className="admin-membership-search">
            <Search aria-hidden="true" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search name, username, email or membership ID"
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
          <select
            value={billingFilter}
            onChange={(event) => setBillingFilter(event.target.value)}
            aria-label="Billing state"
          >
            <option value="">Billing: All</option>
            <option value="CURRENT">Current</option>
            <option value="PENDING">Payment setup</option>
            <option value="PAST_DUE">Past due</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="DISABLED">Not configured</option>
          </select>
          <select
            value={usageFilter}
            onChange={(event) => setUsageFilter(event.target.value)}
            aria-label="Usage state"
          >
            <option value="">Usage: All</option>
            <option value="OK">Within plan</option>
            <option value="NEAR_LIMIT">Near limit</option>
            <option value="AT_LIMIT">At limit</option>
            <option value="OVER_LIMIT">Over limit</option>
          </select>
        </div>
        <div className="admin-membership-table-wrap">
          <table className="admin-membership-table">
            <thead>
              <tr>
                <th>Collector</th>
                <th>Plan</th>
                <th>Status</th>
                <th>Usage</th>
                <th>Capacity</th>
                <th>Renewal</th>
                <th>Manage</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((row) => (
                <MembershipRow key={row.id} row={row} open={() => update({ membership: row.id })} />
              ))}
            </tbody>
          </table>
        </div>
        {!filteredItems.length ? (
          <div className="admin-membership-empty">
            {query || plan || status || billingFilter || usageFilter
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
    </main>
  );
}

function MembershipRow({ row, open }: { row: AdminMembershipRow; open: () => void }) {
  const active = usageState(
    row.usage.activeCollectibles,
    row.usage.activeCollectiblesLimit,
    row.usage.activeCollectiblesPercent,
  );
  const monthly = usageState(
    row.usage.monthlySubmissions,
    row.usage.monthlySubmissionsLimit,
    row.usage.monthlySubmissionsPercent,
  );
  const intakePercent = row.usage.concurrentIntakeLimit
    ? Math.round((row.usage.concurrentIntake / row.usage.concurrentIntakeLimit) * 100)
    : null;
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
        <small className="admin-membership-price">
          {row.plan.monthlyPriceMinor === "0"
            ? "No charge"
            : `${row.plan.currency} ${(Number(row.plan.monthlyPriceMinor) / 100).toFixed(2)} / month`}
        </small>
      </td>
      <td>
        <span className={`admin-membership-status status-${row.membership.status.toLowerCase()}`}>
          {statusLabel(row.membership.status)}
        </span>
        <small>
          {row.membership.betaEntitlement
            ? "Internal Beta entitlement"
            : row.membership.billingState === "DISABLED"
              ? "Billing not configured"
              : "Provider billing"}
        </small>
      </td>
      <td>
        <Usage
          value={row.usage.activeCollectibles}
          limit={row.usage.activeCollectiblesLimit}
          percent={row.usage.activeCollectiblesPercent}
          label="Collectibles"
          state={active}
        />
        <Usage
          value={row.usage.monthlySubmissions}
          limit={row.usage.monthlySubmissionsLimit}
          percent={row.usage.monthlySubmissionsPercent}
          label="Submissions this period"
          state={monthly}
        />
      </td>
      <td>
        <Usage
          value={row.usage.concurrentIntake}
          limit={row.usage.concurrentIntakeLimit}
          percent={intakePercent}
          label="Concurrent intake"
          state={usageState(
            row.usage.concurrentIntake,
            row.usage.concurrentIntakeLimit,
            intakePercent,
          )}
        />
      </td>
      <td>
        <strong>{formatDate(row.billing.nextBillingDate)}</strong>
        <small>
          {row.membership.cancelAtPeriodEnd
            ? "Cancels at period end"
            : row.membership.billingState === "DISABLED"
              ? "Billing not configured"
              : "Renews"}
        </small>
      </td>
      <td>
        <button type="button" className="admin-membership-manage" onClick={open}>
          Manage <span aria-hidden="true">→</span>
        </button>
      </td>
    </tr>
  );
}
function Usage({
  value,
  limit,
  percent,
  label,
  state,
}: {
  value: number;
  limit: number | null;
  percent: number | null;
  label: string;
  state: string;
}) {
  return (
    <div className="admin-membership-usage">
      <div>
        <strong>
          {value}
          {limit === null ? "" : ` / ${limit}`}
        </strong>
        <small>{label}</small>
      </div>
      <span
        className="admin-membership-progress"
        title={`${label}: ${percent === null ? "uncapped" : `${percent}% used`}`}
      >
        <i style={{ width: `${Math.min(percent ?? 0, 100)}%` }} />
      </span>
      <em className={`usage-${state.toLowerCase().replaceAll(" ", "-")}`}>{state}</em>
    </div>
  );
}

function MembershipDetail({ row, back }: { row: AdminMembershipRow; back: () => void }) {
  return (
    <main className="admin-memberships-page admin-membership-detail">
      <button type="button" className="admin-membership-back" onClick={back}>
        <ArrowLeft aria-hidden="true" /> Back to memberships
      </button>
      <header className="admin-memberships-header">
        <div>
          <p className="admin-memberships-eyebrow">MEMBERSHIP DETAIL</p>
          <h2>{row.collector.displayName}</h2>
          <p>
            {row.collector.email} · {planLabel(row.plan.code)}
          </p>
        </div>
        <button
          type="button"
          className="admin-memberships-button"
          onClick={() =>
            window.location.assign(`/admin?section=users&user=${row.collector.id}&tab=membership`)
          }
        >
          Open account
        </button>
      </header>
      <section className="admin-membership-detail-grid">
        <article>
          <h3>Overview</h3>
          <div className="admin-membership-detail-status">
            <span
              className={`admin-membership-status status-${row.membership.status.toLowerCase()}`}
            >
              {statusLabel(row.membership.status)}
            </span>
            <span>
              {row.membership.betaEntitlement
                ? "Internal Beta entitlement"
                : row.membership.billingState === "DISABLED"
                  ? "Billing provider not configured"
                  : "Provider billing connected"}
            </span>
          </div>
          <dl>
            <div>
              <dt>Plan</dt>
              <dd>{planLabel(row.plan.code)}</dd>
            </div>
            <div>
              <dt>Renewal</dt>
              <dd>{formatDate(row.billing.nextBillingDate)}</dd>
            </div>
            <div>
              <dt>Membership ID</dt>
              <dd>{row.id}</dd>
            </div>
            <div>
              <dt>Updated</dt>
              <dd>{formatDate(row.updatedAt)}</dd>
            </div>
          </dl>
        </article>
        <article>
          <h3>Usage & capacity</h3>
          <Usage
            value={row.usage.activeCollectibles}
            limit={row.usage.activeCollectiblesLimit}
            percent={row.usage.activeCollectiblesPercent}
            label="Active collectibles"
            state={usageState(
              row.usage.activeCollectibles,
              row.usage.activeCollectiblesLimit,
              row.usage.activeCollectiblesPercent,
            )}
          />
          <Usage
            value={row.usage.monthlySubmissions}
            limit={row.usage.monthlySubmissionsLimit}
            percent={row.usage.monthlySubmissionsPercent}
            label="Monthly submissions"
            state={usageState(
              row.usage.monthlySubmissions,
              row.usage.monthlySubmissionsLimit,
              row.usage.monthlySubmissionsPercent,
            )}
          />
          {row.warnings.length ? (
            <ul className="admin-membership-warnings">
              {row.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          ) : (
            <p className="admin-membership-good">
              <ShieldCheck aria-hidden="true" /> Within configured limits
            </p>
          )}
        </article>
        <article>
          <h3>Entitlements</h3>
          <p className="admin-membership-muted">Effective limits from the assigned plan.</p>
          <div className="admin-membership-entitlements">
            {Object.entries(row.entitlements)
              .filter(
                ([key]) =>
                  key.startsWith("max") || key.includes("Limit") || key.endsWith("Enabled"),
              )
              .map(([key, value]) => (
                <span key={key}>
                  <strong>{String(value)}</strong>
                  <small>
                    {key.replace(/([A-Z])/g, " $1").replace(/^./, (letter) => letter.toUpperCase())}
                  </small>
                </span>
              ))}
          </div>
        </article>
        <article>
          <h3>Manage membership</h3>
          <p className="admin-membership-muted">
            Changes are provider-owned. This Beta environment has no billing provider configured.
          </p>
          <div className="admin-membership-actions">
            <button type="button" disabled>
              Change plan
            </button>
            <button type="button" disabled>
              {row.membership.cancelAtPeriodEnd ? "Resume membership" : "Cancel at period end"}
            </button>
            <button type="button" disabled>
              Grant Beta entitlement
            </button>
          </div>
        </article>
      </section>
    </main>
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
      </div>
      <section className="admin-membership-table-card admin-membership-loading-table">
        <div />
        <div />
        <div />
      </section>
    </main>
  );
}
