import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Download,
  ExternalLink,
  Filter,
  Landmark,
  ListFilter,
  LoaderCircle,
  RefreshCw,
  Search,
  Settings2,
  WalletCards,
} from "lucide-react";

import type {
  AdminFinanceDashboard,
  AdminFinanceRecord,
  AdminFinanceRecordsResponse,
} from "@/data/repositories";
import "@/styles/admin-finance.css";

type FinanceTab =
  "wallets" | "movements" | "orders" | "executions" | "reconciliation" | "adjustments";

type Props = {
  dashboard?: AdminFinanceDashboard;
  records?: AdminFinanceRecordsResponse;
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

const tabs: Array<{ id: FinanceTab; label: string }> = [
  { id: "wallets", label: "Wallets" },
  { id: "movements", label: "Movements" },
  { id: "orders", label: "Orders" },
  { id: "executions", label: "Executions" },
  { id: "reconciliation", label: "Reconciliation" },
  { id: "adjustments", label: "Adjustments" },
];

const statuses: Record<FinanceTab, string[]> = {
  wallets: ["ACTIVE", "FROZEN", "CLOSED"],
  movements: [
    "CREATED",
    "PENDING_PROVIDER",
    "PROCESSING",
    "SETTLED",
    "FAILED",
    "CANCELLED",
    "REVERSED",
    "MANUAL_REVIEW",
    "HELD",
  ],
  orders: [
    "PENDING_RESERVATION",
    "OPEN",
    "PARTIALLY_FILLED",
    "FILLED",
    "CANCELLED",
    "EXPIRED",
    "REJECTED",
  ],
  executions: ["SETTLED", "FAILED"],
  reconciliation: ["RECONCILED", "MISMATCH"],
  adjustments: ["DRAFT", "PENDING_APPROVAL", "APPROVED", "APPLIED", "REJECTED"],
};

const money = (minor: unknown, currency = "GBP") => {
  if (minor === null || minor === undefined || minor === "") return "—";
  const numeric = Number(minor);
  if (!Number.isFinite(numeric)) return "—";
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(numeric / 100);
};

const number = (value: unknown) =>
  new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(Number(value ?? 0));

const date = (value: unknown) => {
  if (!value) return "—";
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.valueOf())
    ? "—"
    : new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(
        parsed,
      );
};

const text = (value: unknown) =>
  value === null || value === undefined || value === "" ? "—" : String(value);
const titleCase = (value: unknown) =>
  text(value)
    .toLowerCase()
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());

function identity(value: unknown) {
  if (!value || typeof value !== "object") return { id: "", name: "—", email: "" };
  const record = value as Record<string, unknown>;
  return {
    id: text(record.id) === "—" ? "" : String(record.id),
    name: text(record.displayName ?? record.username ?? record.email),
    email: record.email ? String(record.email) : "",
  };
}

function FinanceIdentity({ value, onOpen }: { value: unknown; onOpen?: (id: string) => void }) {
  const item = identity(value);
  return (
    <button
      className="admin-finance-identity"
      disabled={!item.id || !onOpen}
      onClick={() => item.id && onOpen?.(item.id)}
      title={item.email || item.name}
      type="button"
    >
      <span>{item.name}</span>
      {item.email ? <small>{item.email}</small> : null}
    </button>
  );
}

export function AdminFinanceTrading({
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
  const activeTab: FinanceTab = tabs.some((entry) => entry.id === rawTab)
    ? (rawTab as FinanceTab)
    : "wallets";
  const [search, setSearch] = useState(query);
  useEffect(() => setSearch(query), [query]);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = search.trim() || undefined;
      if (next !== (query || undefined)) update({ q: next, page: "1" });
    }, 280);
    return () => window.clearTimeout(timer);
  }, [query, search, update]);

  const activeStatus = statuses[activeTab].includes(status) ? status : "";
  const openUser = useCallback(
    (id: string, detailTab = "wallet") =>
      update({
        section: "users",
        user: id,
        tab: detailTab,
        q: undefined,
        status: undefined,
        page: undefined,
      }),
    [update],
  );
  const selectTab = (next: FinanceTab) => update({ tab: next, status: undefined, page: "1" });
  const pageInfo = records?.pagination ?? { page, pageSize: 10, total: 0, totalPages: 0 };
  const maxVolume = Math.max(
    ...(dashboard?.overview.history ?? []).map((entry) => Number(entry.volumeMinor)),
    1,
  );
  const loading = dashboardLoading || recordsLoading;

  const table = useMemo(() => {
    const rows = records?.items ?? [];
    if (!rows.length && !recordsLoading)
      return (
        <EmptyState
          title={`No ${tabs.find((entry) => entry.id === activeTab)?.label.toLowerCase()} found`}
          detail="Try a different search or status filter."
        />
      );
    if (recordsLoading)
      return (
        <div className="admin-finance-table-loading">
          <span />
          <span />
          <span />
          <span />
        </div>
      );
    return (
      <div className="admin-finance-table-wrap">
        <table className="admin-finance-table">
          <thead>
            <FinanceHeader tab={activeTab} />
          </thead>
          <tbody>
            {rows.map((row) => (
              <FinanceRow key={row.id} row={row} tab={activeTab} openUser={openUser} />
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [activeTab, records?.items, recordsLoading, openUser]);

  return (
    <section className="admin-finance-page">
      <header className="admin-finance-header">
        <div>
          <p className="admin-finance-breadcrumb">
            Finance &amp; Trading <span>›</span> Finance Dashboard
          </p>
          <h2>Finance &amp; Trading</h2>
          <p>Monitor wallets, orders, executions, and financial activity across the platform.</p>
        </div>
        <div className="admin-finance-header-actions">
          <button className="admin-finance-button" disabled title="Export is not configured">
            <Download size={15} /> Export
          </button>
          <button
            className="admin-finance-button primary"
            disabled
            title="Settings are managed through protected configuration"
          >
            <Settings2 size={15} /> Finance Settings
          </button>
        </div>
      </header>

      <div className="admin-finance-kpis">
        <FinanceKpi
          icon={<WalletCards />}
          label="Total customer cash"
          value={money(dashboard?.kpis.totalCustomerCashMinor)}
          detail="Authoritative GBP wallet balances"
        />
        <FinanceKpi
          icon={<Landmark />}
          label="Reserved funds"
          value={money(dashboard?.kpis.reservedFundsMinor)}
          detail="Locked in open orders"
          tone="blue"
        />
        <FinanceKpi
          icon={<ArrowDownToLine />}
          label="Pending deposits"
          value={money(dashboard?.kpis.pendingDepositsMinor)}
          detail="Pending money movements"
          tone="purple"
        />
        <FinanceKpi
          icon={<ArrowUpRight />}
          label="Pending withdrawals"
          value={money(dashboard?.kpis.pendingWithdrawalsMinor)}
          detail="Pending money movements"
          tone="gold"
        />
        <FinanceKpi
          icon={<ListFilter />}
          label="Open orders"
          value={number(dashboard?.kpis.openOrders)}
          detail="Across all assets"
          tone="cyan"
        />
        <FinanceKpi
          icon={<BarChart3 />}
          label="Executions today"
          value={number(dashboard?.kpis.executionsToday)}
          detail="Authoritative trading executions"
          tone="red"
        />
      </div>

      <div className="admin-finance-layout">
        <div className="admin-finance-main-card">
          <nav className="admin-finance-tabs" aria-label="Finance sections">
            {tabs.map((entry) => (
              <button
                className={entry.id === activeTab ? "active" : ""}
                key={entry.id}
                onClick={() => selectTab(entry.id)}
                type="button"
              >
                {entry.label}
              </button>
            ))}
          </nav>
          <div className="admin-finance-toolbar">
            <label className="admin-finance-search">
              <Search size={15} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  activeTab === "wallets"
                    ? "Search by collector, email, username…"
                    : "Search finance records…"
                }
              />
            </label>
            <select
              aria-label="Status"
              value={activeStatus}
              onChange={(event) => update({ status: event.target.value || undefined, page: "1" })}
            >
              <option value="">Status: All</option>
              {statuses[activeTab].map((entry) => (
                <option key={entry} value={entry}>
                  {titleCase(entry)}
                </option>
              ))}
            </select>
            <button className="admin-finance-filter" disabled>
              <Filter size={14} /> More Filters
            </button>
          </div>
          {failed ? (
            <EmptyState
              title="Finance data unavailable"
              detail="The authoritative finance projection could not be loaded safely."
              retry={retry}
            />
          ) : loading && !records ? (
            <div className="admin-finance-table-loading">
              <span />
              <span />
              <span />
              <span />
            </div>
          ) : (
            table
          )}
          {!failed && records ? <FinancePagination info={pageInfo} update={update} /> : null}
        </div>

        <aside className="admin-finance-rail">
          <section className="admin-finance-side-card">
            <div className="admin-finance-side-heading">
              <h3>Finance Overview</h3>
              <span>Last 7 days</span>
            </div>
            <strong className="admin-finance-total">
              {money(dashboard?.overview.totalVolumeMinor)}
            </strong>
            <div className="admin-finance-chart" aria-label="Seven day volume history">
              {(dashboard?.overview.history ?? []).map((entry) => (
                <div
                  className="admin-finance-bar"
                  key={entry.date}
                  title={`${date(entry.date)} ${money(entry.volumeMinor)}`}
                >
                  <i
                    style={{
                      height: `${Math.max(8, (Number(entry.volumeMinor) / maxVolume) * 100)}%`,
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="admin-finance-side-grid">
              <Metric
                label="Buy volume"
                value={money(dashboard?.overview.buyVolumeMinor)}
                tone="green"
              />
              <Metric
                label="Sell volume"
                value={money(dashboard?.overview.sellVolumeMinor)}
                tone="purple"
              />
              <Metric label="Total fees" value={money(dashboard?.overview.totalFeesMinor)} />
              <Metric label="Net fees" value={money(dashboard?.overview.netFeesMinor)} />
            </div>
          </section>
          <section className="admin-finance-side-card">
            <div className="admin-finance-side-heading">
              <h3>Slice revenue</h3>
              <span>GBP authority</span>
            </div>
            <div className="admin-finance-side-grid">
              <Metric
                label="Fee revenue"
                value={money(dashboard?.platformRevenue?.grossRevenueMinor)}
                tone="green"
              />
              <Metric
                label="Provider expense"
                value={money(dashboard?.platformRevenue?.providerExpensesMinor)}
                tone="gold"
              />
              <Metric
                label="Known provider costs"
                value={money(dashboard?.platformRevenue?.knownProviderCostsMinor)}
                tone="gold"
              />
              <Metric
                label="Net contribution"
                value={money(dashboard?.platformRevenue?.estimatedNetContributionMinor)}
                tone="purple"
              />
              <Metric
                label="Eligible to settle"
                value={money(dashboard?.platformRevenue?.eligibleSettlementMinor)}
                tone="cyan"
              />
            </div>
            <p className="admin-finance-muted">
              {dashboard?.platformRevenue?.pendingProviderCostCount
                ? `${dashboard.platformRevenue.pendingProviderCostCount} provider cost record${dashboard.platformRevenue.pendingProviderCostCount === 1 ? "" : "s"} awaiting evidence.`
                : "Provider expenses are shown only from recorded provider evidence."}
            </p>
            <p className="admin-finance-muted">
              External settlement:{" "}
              {dashboard?.platformRevenue?.externalSettlement.status ?? "Not configured"}. No payout
              is implied.
            </p>
          </section>
          <section
            className={`admin-finance-side-card${dashboard?.payoutLiquidity?.warning ? " is-warning" : ""}`}
          >
            <div className="admin-finance-side-heading">
              <h3>Payout liquidity</h3>
              <span>{titleCase(dashboard?.payoutLiquidity?.providerLiquidityStatus)}</span>
            </div>
            <div className="admin-finance-side-grid">
              <Metric
                label="Stripe available"
                value={money(dashboard?.payoutLiquidity?.providerAvailableMinor)}
                tone={dashboard?.payoutLiquidity?.warning ? "gold" : "green"}
              />
              <Metric
                label="Stripe pending"
                value={money(dashboard?.payoutLiquidity?.providerPendingMinor)}
                tone="purple"
              />
              <Metric
                label="Withdrawal liabilities"
                value={money(dashboard?.payoutLiquidity?.withdrawalEligibleLiabilityMinor)}
                tone="cyan"
              />
              <Metric
                label="Settling for withdrawal"
                value={money(dashboard?.payoutLiquidity?.settlingMinor)}
                tone="gold"
              />
              <Metric
                label="Payout liquidity coverage"
                value={formatCoverage(dashboard?.payoutLiquidity?.payoutLiquidityCoverageBps)}
                tone={dashboard?.payoutLiquidity?.warning ? "gold" : "green"}
              />
              <Metric
                label="Reserved for payouts"
                value={money(dashboard?.payoutLiquidity?.activeReservationMinor)}
                tone="blue"
              />
            </div>
            <p
              className={`admin-finance-muted${dashboard?.payoutLiquidity?.warning ? " is-warning" : ""}`}
            >
              {dashboard?.payoutLiquidity?.warning
                ? dashboard.payoutLiquidity.nextAvailabilityAt
                  ? `Provider liquidity is below eligible withdrawal liabilities. Expected availability: ${date(dashboard.payoutLiquidity.nextAvailabilityAt)}.`
                  : "Provider liquidity is below eligible withdrawal liabilities. Review before approving payouts."
                : dashboard?.payoutLiquidity?.providerLiquidityStatus === "NOT_APPLICABLE"
                  ? "No external payout rail is configured in this environment."
                  : "Available provider liquidity is sufficient for eligible withdrawals."}
            </p>
          </section>
          <section className="admin-finance-side-card">
            <div className="admin-finance-side-heading">
              <h3>Recent Activity</h3>
              <button type="button" onClick={() => selectTab("movements")}>
                View all
              </button>
            </div>
            {(dashboard?.recentActivity ?? []).slice(0, 6).map((entry) => (
              <div className="admin-finance-activity" key={entry.id}>
                <span />
                <div>
                  <strong>{entry.title}</strong>
                  <small>
                    {entry.detail} · {date(entry.occurredAt)}
                  </small>
                </div>
                <b>{entry.amountMinor ? money(entry.amountMinor) : ""}</b>
              </div>
            ))}
          </section>
          <section className="admin-finance-side-card">
            <h3>Quick Actions</h3>
            <QuickAction
              label="View All Orders"
              icon={<ExternalLink />}
              onClick={() => selectTab("orders")}
            />
            <QuickAction
              label="View All Executions"
              icon={<ExternalLink />}
              onClick={() => selectTab("executions")}
            />
            <QuickAction label="Run Reconciliation" icon={<RefreshCw />} disabled />
            <QuickAction label="Create Adjustment" icon={<CircleAlert />} disabled />
            <QuickAction label="Export Ledger Report" icon={<Download />} disabled />
          </section>
        </aside>
      </div>

      <div className="admin-finance-bottom-grid">
        <SummaryCard
          title="Order Summary"
          total={dashboard?.orderSummary.total ?? 0}
          items={[
            ["Buy orders", dashboard?.orderSummary.buy ?? 0, "green"],
            ["Sell orders", dashboard?.orderSummary.sell ?? 0, "purple"],
            ["Open", dashboard?.orderSummary.open ?? 0, "gold"],
          ]}
        />
        <SummaryCard
          title="Execution Summary"
          total={dashboard?.executionSummary.total ?? 0}
          items={[
            ["Buy executions", dashboard?.executionSummary.buyInitiated ?? 0, "green"],
            ["Sell executions", dashboard?.executionSummary.sellInitiated ?? 0, "purple"],
          ]}
        />
        <section className="admin-finance-bottom-card">
          <h3>Reconciliation Status</h3>
          {(dashboard?.reconciliationSummary ?? []).length ? (
            dashboard?.reconciliationSummary.map((entry) => (
              <div className="admin-finance-recon" key={entry.status}>
                <span>{titleCase(entry.status)}</span>
                <b>{money(entry.amountMinor)}</b>
                <small>{number(entry.count)} records</small>
              </div>
            ))
          ) : (
            <p className="admin-finance-muted">No reconciliation runs have been recorded.</p>
          )}
        </section>
      </div>
    </section>
  );
}

function FinanceKpi({
  icon,
  label,
  value,
  detail,
  tone = "green",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  tone?: string;
}) {
  return (
    <article className={`admin-finance-kpi tone-${tone}`}>
      <span className="admin-finance-kpi-icon">{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{detail}</em>
    </article>
  );
}
function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="admin-finance-metric">
      <small>{label}</small>
      <strong>{value}</strong>
      {tone ? <em className={tone}>•</em> : null}
    </div>
  );
}
function formatCoverage(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value / 100).toFixed(2)}%`;
}
function QuickAction({
  label,
  icon,
  onClick,
  disabled,
}: {
  label: string;
  icon: React.ReactNode;
  onClick?: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      className="admin-finance-quick-action"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <span>{icon}</span>
      {label}
      <ArrowRight size={14} />
    </button>
  );
}
function EmptyState({
  title,
  detail,
  retry,
}: {
  title: string;
  detail: string;
  retry?: () => void;
}) {
  return (
    <div className="admin-finance-empty">
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
function FinancePagination({
  info,
  update,
}: {
  info: { page: number; pageSize: number; total: number; totalPages: number };
  update: Props["update"];
}) {
  return (
    <footer className="admin-finance-pagination">
      <span>
        Showing {info.total ? (info.page - 1) * info.pageSize + 1 : 0} to{" "}
        {Math.min(info.total, info.page * info.pageSize)} of {number(info.total)} records
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
function FinanceHeader({ tab }: { tab: FinanceTab }) {
  const columns = {
    wallets: [
      "Collector",
      "Wallet Balance",
      "Reserved",
      "Available",
      "Currency",
      "Status",
      "Actions",
    ],
    movements: [
      "Reference",
      "User",
      "Type",
      "Amount",
      "Provider",
      "Provider State",
      "Slice State",
      "Created",
    ],
    orders: [
      "Order ID",
      "User",
      "Asset",
      "Side",
      "Shares",
      "Limit",
      "Filled",
      "Remaining",
      "Status",
      "Created",
    ],
    executions: [
      "Execution ID",
      "Asset",
      "Buyer",
      "Seller",
      "Shares",
      "Price",
      "Fee",
      "Executed",
      "Settlement",
    ],
    reconciliation: [
      "Reference",
      "Scope",
      "Status",
      "Expected",
      "Observed",
      "Difference",
      "Created",
      "Actions",
    ],
    adjustments: [
      "Request",
      "User",
      "Amount",
      "Status",
      "Before outstanding",
      "After outstanding",
      "Initiated",
      "Applied",
    ],
  } as Record<FinanceTab, string[]>;
  return (
    <tr>
      {columns[tab].map((column) => (
        <th key={column}>{column}</th>
      ))}
    </tr>
  );
}
function FinanceRow({
  row,
  tab,
  openUser,
}: {
  row: AdminFinanceRecord;
  tab: FinanceTab;
  openUser: (id: string, detailTab?: string) => void;
}) {
  const value = (key: string) => row[key];
  const user = row.user ?? row.collector;
  return (
    <tr>
      {tab === "wallets" ? (
        <>
          <td>
            <FinanceIdentity value={row.collector} onOpen={(id) => openUser(id)} />
          </td>
          <td>{money(value("walletBalanceMinor"))}</td>
          <td>{money(value("reservedMinor"))}</td>
          <td>{money(value("availableMinor"))}</td>
          <td>{text(value("currency"))}</td>
          <td>
            <Status value={value("status")} />
          </td>
          <td>···</td>
        </>
      ) : null}
      {tab === "movements" ? (
        <>
          <td>{text(value("reference"))}</td>
          <td>
            <FinanceIdentity value={user} onOpen={(id) => openUser(id)} />
          </td>
          <td>{titleCase(value("type"))}</td>
          <td>{money(value("amountMinor"))}</td>
          <td>{text(value("provider"))}</td>
          <td>
            <Status value={value("providerState")} />
          </td>
          <td>
            <Status value={value("sliceState")} />
          </td>
          <td>{date(value("createdAt"))}</td>
        </>
      ) : null}
      {tab === "orders" ? (
        <>
          <td>{text(row.id)}</td>
          <td>
            <FinanceIdentity value={user} onOpen={(id) => openUser(id, "Orders")} />
          </td>
          <td>{text((value("asset") as { title?: string } | null)?.title)}</td>
          <td>
            <Status value={value("side")} />
          </td>
          <td>{text(value("shares"))}</td>
          <td>{money(value("limitPriceMinor"))}</td>
          <td>{text(value("filled"))}</td>
          <td>{text(value("remaining"))}</td>
          <td>
            <Status value={value("status")} />
          </td>
          <td>{date(value("createdAt"))}</td>
        </>
      ) : null}
      {tab === "executions" ? (
        <>
          <td>{text(row.id)}</td>
          <td>{text((value("asset") as { title?: string } | null)?.title)}</td>
          <td>
            <FinanceIdentity value={value("buyer")} />
          </td>
          <td>
            <FinanceIdentity value={value("seller")} />
          </td>
          <td>{text(value("shares"))}</td>
          <td>{money(value("priceMinor"))}</td>
          <td>{money(value("feeMinor"))}</td>
          <td>{date(value("executedAt"))}</td>
          <td>
            <Status value={value("settlementStatus")} />
          </td>
        </>
      ) : null}
      {tab === "reconciliation" ? (
        <>
          <td>{text(value("reference"))}</td>
          <td>{text(value("scope"))}</td>
          <td>
            <Status value={value("status")} />
          </td>
          <td>{money(value("expectedMinor"))}</td>
          <td>{money(value("observedMinor"))}</td>
          <td>{money(value("differenceMinor"))}</td>
          <td>{date(value("createdAt"))}</td>
          <td>
            <button
              className="admin-finance-row-action"
              disabled
              title="Protected reconciliation workflow"
            >
              Inspect
            </button>
          </td>
        </>
      ) : null}
      {tab === "adjustments" ? (
        <>
          <td>{text(row.id)}</td>
          <td>
            <FinanceIdentity value={value("user")} onOpen={(id) => openUser(id)} />
          </td>
          <td>{money(value("amountMinor"), text(value("currency")))}</td>
          <td>
            <Status value={value("status")} />
          </td>
          <td>{money(value("beforeOutstandingMinor"), text(value("currency")))}</td>
          <td>{money(value("afterOutstandingMinor"), text(value("currency")))}</td>
          <td>{date(value("requestedAt"))}</td>
          <td>{date(value("appliedAt"))}</td>
        </>
      ) : null}
    </tr>
  );
}
function Status({ value }: { value: unknown }) {
  return <span className="admin-finance-status">{titleCase(value)}</span>;
}
function SummaryCard({
  title,
  total,
  items,
}: {
  title: string;
  total: number;
  items: Array<[string, number, string]>;
}) {
  return (
    <section className="admin-finance-bottom-card">
      <h3>{title}</h3>
      <div className="admin-finance-summary-total">{number(total)}</div>
      {items.map(([label, value, tone]) => (
        <div className="admin-finance-summary-row" key={label}>
          <span>
            <i className={tone} />
            {label}
          </span>
          <b>{number(value)}</b>
        </div>
      ))}
    </section>
  );
}
