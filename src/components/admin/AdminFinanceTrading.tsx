import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  RefreshCw,
  Search,
} from "lucide-react";

import type {
  AdminFinanceDashboard,
  AdminFinanceRecord,
  AdminFinanceRecordsResponse,
} from "@/data/repositories";
import { GuidancePanel } from "./OperationalGuidance";
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
  dataClass: "OPERATIONAL" | "QA_DEMO" | "ALL";
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

const liquidityState = (status: unknown) => {
  switch (status) {
    case "AVAILABLE":
      return "Healthy";
    case "INSUFFICIENT":
      return "Insufficient";
    case "UNAVAILABLE":
      return "Unavailable";
    case "NOT_APPLICABLE":
      return "Not applicable";
    default:
      return "—";
  }
};

const operationalLiquidityTone = (status: unknown) => {
  switch (status) {
    case "HEALTHY":
      return "green";
    case "CAUTION":
      return "gold";
    case "DEFICIT":
      return "red";
    default:
      return "blue";
  }
};

const providerMoney = (minor: unknown, status: unknown) =>
  status === "UNAVAILABLE" ? "Unavailable" : money(minor);

const providerCoverage = (coverage: number | null | undefined, status: unknown) =>
  status === "UNAVAILABLE" ? "Unavailable" : formatCoverage(coverage);

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
  dataClass,
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
  const reconciliationMismatches =
    dashboard?.reconciliationSummary.find((entry) => entry.status === "MISMATCH")?.count ?? 0;
  const payoutLiquidityWarning = Boolean(dashboard?.payoutLiquidity?.warning);
  const pendingDeposits = Number(dashboard?.kpis.pendingDepositsMinor ?? 0) > 0;
  const financialSeparation = dashboard?.financialSeparation;
  const separatedStripe = financialSeparation?.stripePlatformLiquidity;
  const separatedRevenue = financialSeparation?.sliceCompanyRevenue;
  const liquidityOperationalStatus = separatedStripe?.operationalStatus;
  const financeGuidance = reconciliationMismatches
    ? {
        title: "Review reconciliation mismatches",
        why: `${reconciliationMismatches} backend-reported reconciliation record${reconciliationMismatches === 1 ? " requires" : "s require"} Finance review.`,
        actor: "FINANCE" as const,
        blocker: "A reconciliation mismatch is still open.",
        afterThis: "The authoritative reconciliation state can be updated after investigation.",
        action: { label: "Open reconciliation", onClick: () => selectTab("reconciliation") },
      }
    : liquidityOperationalStatus === "DEFICIT"
      ? {
          title: "Provider liquidity deficit",
          why: `${money(separatedStripe?.liquidityShortfallMinor)} short against the protected customer-liability and reserve projection.`,
          actor: "FINANCE" as const,
          blocker:
            "Withdrawal preflight remains fail-closed while Stripe available liquidity is below the protected requirement.",
          afterThis: separatedStripe?.providerPendingMinor
            ? `${money(separatedStripe.providerPendingMinor)} is still pending at Stripe.${separatedStripe.nextAvailabilityAt ? ` Next provider availability: ${date(separatedStripe.nextAvailabilityAt)}.` : ""}`
            : "Investigate the provider balance and open payout obligations before releasing any new external payout.",
          action: { label: "Open movements", onClick: () => selectTab("movements") },
        }
      : separatedRevenue?.safeToSweepStatus === "READY"
        ? {
            title: "Company revenue available to sweep",
            why: `${money(separatedRevenue.safeToSweepMinor)} is within the server-derived company sweep cap.`,
            actor: "FINANCE" as const,
            blocker:
              "A reason, idempotency key, and second finance approver are still required. No external Stripe payment is sent by approval.",
            afterThis:
              "Use the protected company-revenue sweep command only after reviewing the separation snapshot.",
          }
        : payoutLiquidityWarning
          ? {
              title: "Review payout liquidity",
              why: "Stripe platform available balance is below the current withdrawal-eligible customer liabilities.",
              actor: "FINANCE" as const,
              blocker:
                "Payout liquidity is insufficient for the current eligible liability projection.",
              afterThis:
                "Withdrawal preflight remains fail-closed until the provider balance covers the liability.",
              action: { label: "Open movements", onClick: () => selectTab("movements") },
            }
          : pendingDeposits
            ? {
                title: "Waiting for deposit clearing",
                why: "Customer deposits are pending the provider or bank clearing process.",
                actor: "EXTERNAL_PROVIDER" as const,
                blocker: "Provider clearing has not completed.",
                afterThis: "The ledger will show the settled provider outcome when it is received.",
              }
            : {
                title: "No finance action required",
                why: "No current reconciliation or payout-liquidity exception is reported by the finance projection.",
                actor: "NO_ACTION_REQUIRED" as const,
                afterThis: "Continue monitoring immutable ledger and provider projections.",
              };

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

  if (failed)
    return (
      <section className="admin-finance-page admin-list-workspace">
        <EmptyState
          title="Finance & Trading is unavailable"
          detail="The current finance authority could not be loaded safely. Balances and activity will be available when it responds."
          retry={retry}
        />
      </section>
    );
  if (dashboardLoading && !dashboard)
    return (
      <section className="admin-finance-page admin-list-workspace">
        <div className="admin-finance-table-loading">
          <span />
          <span />
          <span />
          <span />
        </div>
      </section>
    );
  if (!dashboard)
    return (
      <section className="admin-finance-page admin-list-workspace">
        <EmptyState
          title="Finance & Trading is unavailable"
          detail="The current finance authority did not return a usable response."
          retry={retry}
        />
      </section>
    );

  return (
    <section className="admin-finance-page admin-list-workspace">
      <header className="admin-finance-header admin-list-workspace__heading">
        <div>
          <p className="admin-finance-breadcrumb">
            Finance &amp; Trading <span>›</span> Finance Dashboard
          </p>
          <h2>Finance &amp; Trading</h2>
          <p>One control surface for customer funds, provider liquidity, and company revenue.</p>
        </div>
        <div
          className={`admin-finance-posture tone-${operationalLiquidityTone(liquidityOperationalStatus)}`}
        >
          <span>Live control posture</span>
          <strong>{titleCase(liquidityOperationalStatus ?? "UNKNOWN")}</strong>
          <small>
            {liquidityOperationalStatus === "DEFICIT"
              ? "Payout rail is protected"
              : "Finance controls are monitoring"}
          </small>
        </div>
      </header>

      <GuidancePanel compact currentState="Financial operations" nextAction={financeGuidance} />

      <section className="admin-finance-domain-grid" aria-label="Financial control domains">
        <article className="admin-finance-domain-card is-customer">
          <header className="admin-finance-domain-heading">
            <div>
              <span>Ledger authority</span>
              <h3>Customer funds</h3>
              <p>Internal liabilities held for collectors. This is never provider liquidity.</p>
            </div>
            <b>GBP</b>
          </header>
          <div className="admin-finance-domain-primary">
            <span>Total customer cash</span>
            <strong>{money(dashboard.kpis.totalCustomerCashMinor)}</strong>
            <small>Every active collector wallet, in one protected ledger.</small>
          </div>
          <div className="admin-finance-domain-metrics">
            <Metric
              label="Available"
              value={money(dashboard.kpis.availableCustomerCashMinor)}
              tone="cyan"
            />
            <Metric label="Reserved" value={money(dashboard.kpis.reservedFundsMinor)} tone="blue" />
            <Metric
              label="Withdrawal eligible"
              value={money(financialSeparation?.customerLiabilities.withdrawalEligibleMinor)}
              tone="green"
            />
            <Metric
              label="Collector proceeds"
              value={money(financialSeparation?.customerLiabilities.collectorProceedsMinor)}
              tone="purple"
            />
            <Metric
              label="Withdrawal holds"
              value={money(financialSeparation?.customerLiabilities.withdrawalReservationMinor)}
              tone="gold"
            />
          </div>
          <footer className="admin-finance-domain-footer">
            Pending deposits {money(dashboard.kpis.pendingDepositsMinor)} · pending withdrawals{" "}
            {money(dashboard.kpis.pendingWithdrawalsMinor)}
          </footer>
        </article>

        <article className="admin-finance-domain-card is-provider">
          <header className="admin-finance-domain-heading">
            <div>
              <span>Provider evidence</span>
              <h3>Stripe payout capacity</h3>
              <p>Live provider proof for the withdrawal rail, kept separate from wallets.</p>
            </div>
            <b>{liquidityOperationalStatus ?? "UNKNOWN"}</b>
          </header>
          <div className="admin-finance-domain-primary">
            <span>Available GBP at Stripe</span>
            <strong>
              {providerMoney(
                separatedStripe?.providerAvailableMinor ??
                  dashboard.payoutLiquidity?.providerAvailableMinor,
                separatedStripe?.payoutLiquidityStatus ??
                  dashboard.payoutLiquidity?.providerLiquidityStatus,
              )}
            </strong>
            <small>
              {liquidityState(
                separatedStripe?.payoutLiquidityStatus ??
                  dashboard.payoutLiquidity?.providerLiquidityStatus,
              )}{" "}
              Payments Balance.
            </small>
          </div>
          <div className="admin-finance-domain-metrics">
            <Metric
              label="After reservations"
              value={providerMoney(
                separatedStripe?.availableAfterReservationsMinor ??
                  dashboard.payoutLiquidity?.availableAfterReservationsMinor,
                separatedStripe?.payoutLiquidityStatus ??
                  dashboard.payoutLiquidity?.providerLiquidityStatus,
              )}
              tone="cyan"
            />
            <Metric
              label="Pending at Stripe"
              value={providerMoney(
                separatedStripe?.providerPendingMinor ??
                  dashboard.payoutLiquidity?.providerPendingMinor,
                separatedStripe?.payoutLiquidityStatus ??
                  dashboard.payoutLiquidity?.providerLiquidityStatus,
              )}
              tone="purple"
            />
            <Metric
              label="Payout obligations"
              value={money(separatedStripe?.pendingPayoutObligationMinor)}
              tone="gold"
            />
            <Metric
              label="Coverage"
              value={providerCoverage(
                separatedStripe?.payoutLiquidityCoverageBps ??
                  dashboard.payoutLiquidity?.payoutLiquidityCoverageBps,
                separatedStripe?.payoutLiquidityStatus ??
                  dashboard.payoutLiquidity?.providerLiquidityStatus,
              )}
              tone={operationalLiquidityTone(liquidityOperationalStatus)}
            />
            <Metric
              label="Projected shortfall"
              value={money(separatedStripe?.liquidityShortfallMinor)}
              tone={operationalLiquidityTone(liquidityOperationalStatus)}
            />
          </div>
          <footer className="admin-finance-domain-footer">
            {separatedStripe?.payoutLiquidityStatus === "UNAVAILABLE"
              ? "Stripe could not be read. Preflight stays fail-closed until provider evidence returns."
              : liquidityOperationalStatus === "DEFICIT"
                ? `${money(separatedStripe?.liquidityShortfallMinor)} below the protected liability and reserve projection.`
                : "Only Stripe Platform Payments Balance can release a customer withdrawal."}
          </footer>
        </article>

        <article className="admin-finance-domain-card is-company">
          <header className="admin-finance-domain-heading">
            <div>
              <span>Company ledger</span>
              <h3>Slice revenue</h3>
              <p>Recognised fees, provider costs, and controlled settlement readiness.</p>
            </div>
            <b>{separatedRevenue?.safeToSweepStatus ?? "BLOCKED"}</b>
          </header>
          <div className="admin-finance-domain-primary">
            <span>Recognised net revenue</span>
            <strong>
              {money(
                separatedRevenue?.recognisedNetRevenueMinor ??
                  dashboard.platformRevenue?.estimatedNetContributionMinor,
              )}
            </strong>
            <small>Company revenue only — never customer cash or Stripe liquidity.</small>
          </div>
          <div className="admin-finance-domain-metrics">
            <Metric
              label="Safe to sweep"
              value={money(separatedRevenue?.safeToSweepMinor)}
              tone={separatedRevenue?.safeToSweepStatus === "READY" ? "green" : "red"}
            />
            <Metric
              label="Operating reserve"
              value={
                separatedRevenue?.operationalReserveConfigured
                  ? money(separatedRevenue.operationalReserveMinor)
                  : "Not configured"
              }
              tone="gold"
            />
            <Metric
              label="Provider evidence"
              value={
                separatedRevenue?.pendingProviderCostCount
                  ? `${separatedRevenue.pendingProviderCostCount} pending`
                  : "Complete"
              }
              tone={separatedRevenue?.pendingProviderCostCount ? "gold" : "green"}
            />
            <Metric
              label="Already swept"
              value={money(separatedRevenue?.alreadySweptMinor)}
              tone="purple"
            />
            <Metric label="External settlement" value="Not configured" tone="blue" />
          </div>
          <footer
            className={`admin-finance-domain-footer${separatedRevenue?.safeToSweepStatus === "BLOCKED" ? " is-warning" : ""}`}
          >
            {separatedRevenue?.safeToSweepStatus === "READY"
              ? "A dual-control sweep request may be recorded; approval does not send a Stripe payout."
              : separatedRevenue?.blockedReasons.length
                ? `Sweep blocked: ${separatedRevenue.blockedReasons.map(titleCase).join(", ")}.`
                : "Sweep readiness remains blocked until the server proves a safe amount."}
          </footer>
        </article>
      </section>

      <section className="admin-finance-ledger-card">
        <header className="admin-finance-ledger-heading">
          <div>
            <span>Finance ledger</span>
            <h3>Accounts, movements &amp; settlement records</h3>
            <p>Filter the authoritative record stream without leaving the control room.</p>
          </div>
          <b>
            {dataClass === "OPERATIONAL"
              ? `${titleCase(activeTab)} · operational`
              : `${titleCase(activeTab)} · ${dataClass === "QA_DEMO" ? "QA / demo" : "all data"}`}
          </b>
        </header>
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
          <select
            aria-label="Financial data classification"
            value={dataClass}
            onChange={(event) => update({ financeDataClass: event.target.value, page: "1" })}
          >
            <option value="OPERATIONAL">Operational only</option>
            <option value="QA_DEMO">QA / demo only</option>
            <option value="ALL">All classifications</option>
          </select>
        </div>
        {dataClass !== "OPERATIONAL" ? (
          <p className="admin-finance-scope-note">
            {dataClass === "QA_DEMO"
              ? "Non-authoritative fixture data — never used for finance controls."
              : "Includes operational and non-authoritative QA / demo records."}
          </p>
        ) : null}
        {loading && !records ? (
          <div className="admin-finance-table-loading">
            <span />
            <span />
            <span />
            <span />
          </div>
        ) : (
          table
        )}
        {records ? <FinancePagination info={pageInfo} update={update} /> : null}
      </section>

      <section className="admin-finance-insights-grid" aria-label="Finance operations insight">
        <article className="admin-finance-insight-card is-volume">
          <header className="admin-finance-insight-heading">
            <div>
              <span>Market pulse</span>
              <h3>Seven-day volume</h3>
            </div>
            <b>GBP</b>
          </header>
          <strong className="admin-finance-total">
            {money(dashboard.overview.totalVolumeMinor)}
          </strong>
          <div className="admin-finance-chart" aria-label="Seven day volume history">
            {(dashboard.overview.history ?? []).map((entry) => (
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
          <div className="admin-finance-insight-metrics">
            <Metric
              label="Buy volume"
              value={money(dashboard.overview.buyVolumeMinor)}
              tone="green"
            />
            <Metric
              label="Sell volume"
              value={money(dashboard.overview.sellVolumeMinor)}
              tone="purple"
            />
            <Metric
              label="Total fees"
              value={money(dashboard.overview.totalFeesMinor)}
              tone="gold"
            />
            <Metric label="Net fees" value={money(dashboard.overview.netFeesMinor)} tone="cyan" />
          </div>
        </article>

        <article className="admin-finance-insight-card is-operations">
          <header className="admin-finance-insight-heading">
            <div>
              <span>Operations pulse</span>
              <h3>Trading &amp; controls</h3>
            </div>
            <button type="button" onClick={() => selectTab("reconciliation")}>
              Review
            </button>
          </header>
          <div className="admin-finance-operation-counts">
            <div>
              <small>Orders</small>
              <strong>{number(dashboard.orderSummary.total)}</strong>
              <span>{number(dashboard.orderSummary.open)} open</span>
            </div>
            <div>
              <small>Executions</small>
              <strong>{number(dashboard.executionSummary.total)}</strong>
              <span>
                {number(dashboard.executionSummary.buyInitiated)} buy /{" "}
                {number(dashboard.executionSummary.sellInitiated)} sell
              </span>
            </div>
            <div>
              <small>Recon mismatches</small>
              <strong>{number(reconciliationMismatches)}</strong>
              <span>{reconciliationMismatches ? "Needs review" : "All clear"}</span>
            </div>
          </div>
          <div className="admin-finance-recon-list">
            {(dashboard.reconciliationSummary ?? []).length ? (
              dashboard.reconciliationSummary.map((entry) => (
                <div className="admin-finance-recon" key={entry.status}>
                  <span>{titleCase(entry.status)}</span>
                  <b>{money(entry.amountMinor)}</b>
                  <small>{number(entry.count)} records</small>
                </div>
              ))
            ) : (
              <p className="admin-finance-muted">No reconciliation runs recorded yet.</p>
            )}
          </div>
          <div className="admin-finance-action-row">
            <QuickAction
              label="Orders"
              icon={<ExternalLink />}
              onClick={() => selectTab("orders")}
            />
            <QuickAction
              label="Executions"
              icon={<ExternalLink />}
              onClick={() => selectTab("executions")}
            />
          </div>
        </article>

        <article className="admin-finance-insight-card is-activity">
          <header className="admin-finance-insight-heading">
            <div>
              <span>Audit trail</span>
              <h3>Recent financial activity</h3>
            </div>
            <button type="button" onClick={() => selectTab("movements")}>
              View all
            </button>
          </header>
          <div className="admin-finance-activity-list">
            {(dashboard.recentActivity ?? []).slice(0, 5).map((entry) => (
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
            {!(dashboard.recentActivity ?? []).length ? (
              <p className="admin-finance-muted">No recent financial activity.</p>
            ) : null}
          </div>
        </article>
      </section>
    </section>
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
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button className="admin-finance-quick-action" onClick={onClick} type="button">
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
    wallets: ["Collector", "Wallet Balance", "Reserved", "Available", "Currency", "Status"],
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
