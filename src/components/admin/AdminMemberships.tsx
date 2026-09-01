import { ArrowRight, ChevronDown, Search, ShieldCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import type { AdminMembershipDirectoryResponse, AdminMembershipRow } from "@/data/repositories";
import "@/styles/admin-memberships.css";

const statusTabs = [
  ["", "All"],
  ["NEEDS_ACTION", "Needs action"],
  ["ACTIVE", "Active"],
  ["INCOMPLETE", "Payment setup"],
  ["PAST_DUE", "Past due"],
  ["TRIALING", "Trialing"],
  ["SUSPENDED", "Suspended"],
  ["CANCELLED", "Cancelled"],
] as const;
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
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
function date(value: string | null) {
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
function money(minor: string, currency: string) {
  try {
    return new Intl.NumberFormat("en-GB", { style: "currency", currency }).format(
      Number(minor) / 100,
    );
  } catch {
    return `${minor} ${currency}`;
  }
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
  billing,
  usage,
  fixture,
  needsAction,
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
  billing: string;
  usage: string;
  fixture: string;
  needsAction: boolean;
  update: (patch: Record<string, string | undefined>) => void;
  selectedId?: string;
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
        <p>Membership and entitlement authority could not be loaded. Counts are unavailable.</p>
        <button type="button" onClick={retry}>
          Try again
        </button>
      </section>
    );
  const selected = selectedId ? data.items.find((row) => row.id === selectedId) : undefined;
  const activeTab = needsAction ? "NEEDS_ACTION" : status;
  const filtered = Boolean(
    query || plan || status || billing || usage || fixture !== "ALL" || needsAction,
  );
  return (
    <main className="admin-memberships-page admin-list-workspace">
      <header className="admin-memberships-header admin-list-workspace__heading">
        <div>
          <p className="admin-memberships-eyebrow">ADMIN CONSOLE / MEMBERSHIPS</p>
          <h2>Memberships</h2>
          <p>Operational view of Collector plans, entitlements, usage and provider capability.</p>
        </div>
        <div className="admin-memberships-provider">
          <span>Billing integration</span>
          <strong>
            {data.capabilities.providerConfigured
              ? `${data.capabilities.provider ?? "Provider"} configured`
              : "Not configured in Beta"}
          </strong>
        </div>
      </header>
      <section className="admin-membership-summary">
        <Summary label="Active" value={data.kpis.active} tone="green" />
        <Summary label="Payment setup" value={data.statusOverview.INCOMPLETE ?? 0} tone="blue" />
        <Summary label="Past due" value={data.kpis.pastDue} tone="amber" />
        <Summary label="Trialing" value={data.kpis.trialing} tone="purple" />
        <Summary label="Suspended" value={data.statusOverview.SUSPENDED ?? 0} tone="red" />
        <Summary label="Total" value={data.kpis.total} />
      </section>
      <section className="admin-membership-workspace">
        <div className="admin-membership-main">
          <nav className="admin-membership-tabs" aria-label="Membership views">
            {statusTabs.map(([key, label]) => (
              <button
                type="button"
                key={key || "all"}
                className={activeTab === key ? "active" : ""}
                onClick={() =>
                  key === "NEEDS_ACTION"
                    ? update({ needsAction: "true", status: undefined, page: "1" })
                    : update({ needsAction: undefined, status: key || undefined, page: "1" })
                }
              >
                {label}
                {key && key !== "NEEDS_ACTION" ? <b>{data.statusOverview[key] ?? 0}</b> : null}
              </button>
            ))}
          </nav>
          <div className="admin-membership-toolbar">
            <label className="admin-membership-search">
              <Search aria-hidden="true" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search collector, email, username or membership ID"
                aria-label="Search memberships"
              />
            </label>
            <Select
              label="Plan"
              value={plan}
              onChange={(value) => update({ plan: value || undefined, page: "1" })}
              options={[
                ["", "All plans"],
                ["STARTER", "Starter"],
                ["PRO", "Pro"],
                ["ELITE", "Elite"],
              ]}
            />
            <Select
              label="Status"
              value={status}
              onChange={(value) =>
                update({ needsAction: undefined, status: value || undefined, page: "1" })
              }
              options={[
                ["", "All states"],
                ...statusTabs.slice(2).map(([value, label]) => [value, label] as [string, string]),
              ]}
            />
            <Select
              label="Billing"
              value={billing}
              onChange={(value) => update({ billing: value || undefined, page: "1" })}
              options={[
                ["", "All billing"],
                ["CURRENT", "Current"],
                ["PENDING", "Payment setup"],
                ["PAST_DUE", "Past due"],
                ["SUSPENDED", "Suspended"],
                ["DISABLED", "Not configured"],
              ]}
            />
            <Select
              label="Usage"
              value={usage}
              onChange={(value) => update({ usage: value || undefined, page: "1" })}
              options={[
                ["", "All usage"],
                ["NORMAL", "Normal"],
                ["AT_LIMIT", "At limit"],
                ["OVER_LIMIT", "Over limit"],
              ]}
            />
            <Select
              label="Fixtures"
              value={fixture}
              onChange={(value) => update({ fixture: value, page: "1" })}
              options={[
                ["ALL", "All records"],
                ["NORMAL", "Production work"],
                ["TEST", "Test/demo"],
              ]}
            />
            {filtered ? (
              <button
                type="button"
                className="admin-membership-clear"
                onClick={() => {
                  setSearch("");
                  update({
                    q: undefined,
                    plan: undefined,
                    status: undefined,
                    billing: undefined,
                    usage: undefined,
                    needsAction: undefined,
                    fixture: "ALL",
                    page: "1",
                  });
                }}
              >
                Clear filters
              </button>
            ) : null}
          </div>
          <div className="admin-membership-meta">
            <span>
              <strong>{data.pagination.total}</strong>{" "}
              {filtered ? "matching memberships" : "memberships"}
            </span>
            <span>
              {data.capabilities.usageThresholds === "AT_LIMIT_ONLY"
                ? "Usage health reports configured limits only"
                : "Usage thresholds unavailable"}
            </span>
          </div>
          {data.items.length ? (
            <MembershipTable
              rows={data.items}
              selectedId={selectedId}
              open={(id) => update({ membership: id })}
            />
          ) : (
            <div className="admin-membership-empty">
              <strong>
                {filtered
                  ? "No memberships match these filters."
                  : "No Collector memberships exist."}
              </strong>
              <p>
                {filtered
                  ? "Try clearing a filter or searching another collector field."
                  : "Membership records will appear here when Slice creates them."}
              </p>
            </div>
          )}
          <footer className="admin-membership-pagination">
            <span>
              {data.pagination.total
                ? `Showing ${(page - 1) * data.pagination.pageSize + 1}–${Math.min(page * data.pagination.pageSize, data.pagination.total)} of ${data.pagination.total}`
                : filtered
                  ? "No matching records"
                  : "No memberships"}
            </span>
            <div>
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => update({ page: String(page - 1) })}
              >
                ‹
              </button>
              <strong>{page}</strong>
              <button
                type="button"
                disabled={page >= data.pagination.totalPages}
                onClick={() => update({ page: String(page + 1) })}
              >
                ›
              </button>
            </div>
          </footer>
        </div>
        {selected ? (
          <MembershipDrawer row={selected} close={() => update({ membership: undefined })} />
        ) : (
          <aside className="admin-membership-drawer admin-membership-drawer--empty">
            <strong>Select a membership</strong>
            <p>
              Review plan, billing capability, entitlements, usage, cycle state and allowed actions.
            </p>
          </aside>
        )}
      </section>
    </main>
  );
}

function MembershipTable({
  rows,
  selectedId,
  open,
}: {
  rows: AdminMembershipRow[];
  selectedId?: string;
  open: (id: string) => void;
}) {
  return (
    <div className="admin-membership-table-wrap">
      <table className="admin-membership-table">
        <thead>
          <tr>
            <th>Collector</th>
            <th>Plan</th>
            <th>State</th>
            <th>Billing</th>
            <th>Usage</th>
            <th>Limits</th>
            <th>Current period</th>
            <th>Next change</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.id}
              className={row.id === selectedId ? "is-selected" : ""}
              onClick={() => open(row.id)}
            >
              <td>
                <div className="admin-membership-collector">
                  <span className="admin-membership-avatar">
                    {initials(row.collector.displayName)}
                  </span>
                  <div>
                    <strong>{row.collector.displayName}</strong>
                    <small>
                      {row.collector.username ? `@${row.collector.username}` : row.collector.email}
                    </small>
                    {row.testFixture ? <em>TEST / DEMO</em> : null}
                  </div>
                </div>
              </td>
              <td>
                <strong>{row.plan.displayName}</strong>
                <small>
                  {row.billing.configured
                    ? money(row.plan.monthlyPriceMinor, row.plan.currency) + " / month"
                    : "Internal beta plan"}
                </small>
              </td>
              <td>
                <span
                  className={`admin-membership-status status-${row.membership.status.toLowerCase()}`}
                >
                  {statusLabel(row.membership.status)}
                </span>
                <small>
                  {row.needsAction
                    ? "Staff/user action required"
                    : row.membership.betaEntitlement
                      ? "Internal Beta entitlement"
                      : "No action required"}
                </small>
              </td>
              <td>
                <span
                  className={`admin-membership-billing billing-${row.billing.health.toLowerCase()}`}
                >
                  {sentence(row.billing.health)}
                </span>
                <small>
                  {row.billing.configured
                    ? (row.billing.provider ?? "Provider")
                    : "Provider not configured"}
                </small>
              </td>
              <td>
                <Usage
                  value={row.usage.activeCollectibles}
                  limit={row.usage.activeCollectiblesLimit}
                  percent={row.usage.activeCollectiblesPercent}
                  label="Collectibles"
                />
                <Usage
                  value={row.usage.monthlySubmissions}
                  limit={row.usage.monthlySubmissionsLimit}
                  percent={row.usage.monthlySubmissionsPercent}
                  label="Submissions"
                />
              </td>
              <td>
                <Usage
                  value={row.usage.concurrentIntake}
                  limit={row.usage.concurrentIntakeLimit}
                  percent={null}
                  label="Concurrent intake"
                />
              </td>
              <td>
                <strong>{date(row.membership.currentPeriodStart)}</strong>
                <small>{date(row.membership.currentPeriodEnd)} end</small>
              </td>
              <td>
                <strong>{row.nextChange.label}</strong>
                <small>{date(row.nextChange.at)}</small>
              </td>
              <td>
                <button
                  type="button"
                  className="admin-membership-manage"
                  onClick={(event) => {
                    event.stopPropagation();
                    open(row.id);
                  }}
                >
                  Manage <ArrowRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="admin-membership-mobile-list">
        {rows.map((row) => (
          <article
            key={row.id}
            className="admin-membership-mobile-card"
            onClick={() => open(row.id)}
          >
            <div className="admin-membership-collector">
              <span className="admin-membership-avatar">{initials(row.collector.displayName)}</span>
              <div>
                <strong>{row.collector.displayName}</strong>
                <small>
                  {row.plan.displayName} · {statusLabel(row.membership.status)}
                </small>
              </div>
            </div>
            <div className="admin-membership-mobile-states">
              <span>{sentence(row.billing.health)}</span>
              <span>
                {row.usageHealth === "NORMAL" ? "Within limits" : sentence(row.usageHealth)}
              </span>
              <span>{row.nextChange.label}</span>
            </div>
            <button
              type="button"
              className="admin-membership-manage"
              onClick={(event) => {
                event.stopPropagation();
                open(row.id);
              }}
            >
              Open membership <ArrowRight size={14} />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}
function Usage({
  value,
  limit,
  percent,
  label,
}: {
  value: number;
  limit: number | null;
  percent: number | null;
  label: string;
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
      {percent !== null ? (
        <span className="admin-membership-progress">
          <i style={{ width: `${Math.min(percent, 100)}%` }} />
        </span>
      ) : null}
    </div>
  );
}
function MembershipDrawer({ row, close }: { row: AdminMembershipRow; close: () => void }) {
  return (
    <aside className="admin-membership-drawer">
      <div className="admin-membership-drawer-head">
        <span>Membership detail</span>
        <button type="button" onClick={close} aria-label="Close membership detail">
          <X size={16} />
        </button>
      </div>
      <div className="admin-membership-drawer-hero">
        <span className="admin-membership-avatar">{initials(row.collector.displayName)}</span>
        <div>
          <h3>{row.collector.displayName}</h3>
          <p>{row.collector.email}</p>
          {row.testFixture ? <em>TEST / DEMO ACCOUNT</em> : null}
        </div>
      </div>
      <DrawerSection title="Membership">
        <p>
          <b>Plan:</b> {row.plan.displayName}
        </p>
        <p>
          <b>State:</b> {statusLabel(row.membership.status)}
        </p>
        <p>
          <b>Membership ID:</b> {row.id}
        </p>
        <p>
          <b>Source:</b> {sentence(row.membership.source)}
        </p>
      </DrawerSection>
      <DrawerSection title="Billing">
        <p>
          <b>Capability:</b>{" "}
          {row.billing.configured ? "Provider configured" : "Not configured in Beta"}
        </p>
        <p>
          <b>State:</b> {sentence(row.billing.health)}
        </p>
        <p>
          <b>Next event:</b> {row.nextChange.label}
        </p>
        <p>
          <b>Last sync:</b> {date(row.billing.lastSyncAt)}
        </p>
      </DrawerSection>
      <DrawerSection title="Plan entitlements">
        <div className="admin-membership-entitlements">
          {Object.entries(row.entitlements).length ? (
            Object.entries(row.entitlements).map(([key, value]) => (
              <p key={key}>
                <b>{sentence(key)}:</b>{" "}
                {typeof value === "boolean" ? (value ? "Enabled" : "Disabled") : String(value)}
              </p>
            ))
          ) : (
            <p>No plan entitlements configured.</p>
          )}
        </div>
      </DrawerSection>
      <DrawerSection title="Usage">
        <Usage
          value={row.usage.activeCollectibles}
          limit={row.usage.activeCollectiblesLimit}
          percent={row.usage.activeCollectiblesPercent}
          label="Active collectibles"
        />
        <Usage
          value={row.usage.monthlySubmissions}
          limit={row.usage.monthlySubmissionsLimit}
          percent={row.usage.monthlySubmissionsPercent}
          label="Submissions this period"
        />
        <Usage
          value={row.usage.concurrentIntake}
          limit={row.usage.concurrentIntakeLimit}
          percent={null}
          label="Concurrent intake"
        />
        {row.warnings.length ? (
          <ul className="admin-membership-warnings">
            {row.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        ) : (
          <p className="admin-membership-good">
            <ShieldCheck size={15} /> Within configured limits
          </p>
        )}
      </DrawerSection>
      <DrawerSection title="Recent membership events">
        {row.events.length ? (
          <ul className="admin-membership-events">
            {row.events.map((event) => (
              <li key={event.id}>
                <strong>{sentence(event.toStatus)}</strong>
                <small>
                  {event.source} · {date(event.occurredAt)}
                </small>
              </li>
            ))}
          </ul>
        ) : (
          <p>No membership events recorded.</p>
        )}
      </DrawerSection>
      <div className="admin-membership-drawer-actions">
        <button
          type="button"
          onClick={() =>
            window.location.assign(`/admin?section=users&user=${row.collector.id}&tab=membership`)
          }
        >
          Open account
        </button>
        <button type="button" disabled={!row.eligibleActions.includes("VIEW_AUDIT_HISTORY")}>
          View audit history
        </button>
      </div>
    </aside>
  );
}
function DrawerSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="admin-membership-drawer-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}
function Summary({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`admin-membership-summary-card ${tone ? `tone-${tone}` : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<[string, string]>;
}) {
  return (
    <label className="admin-membership-select">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([key, text]) => (
          <option value={key} key={key}>
            {text}
          </option>
        ))}
      </select>
      <ChevronDown size={14} />
    </label>
  );
}
function MembershipLoading() {
  return (
    <main className="admin-memberships-page admin-list-workspace">
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
