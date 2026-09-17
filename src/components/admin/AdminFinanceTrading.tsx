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
import { AdminRecordDrawer } from "./AdminRecordDrawer";
import { adminStatusLabel } from "./admin-status";
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
  simplified?: boolean;
  recordId?: string;
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
  simplified = false,
  recordId,
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
        section: "customers",
        view: "directory",
        user: id,
        tab: detailTab,
        q: undefined,
        status: undefined,
        page: undefined,
      }),
    [update],
  );
  const selectTab = (next: FinanceTab) => update({ tab: next, status: undefined, page: "1" });
  const openRecord = useCallback(
    (id: string) => update({ record: id, recordType: "money" }),
    [update],
  );
  const closeRecord = () => update({ record: undefined, recordType: undefined });
  const selectedRecord = recordId ? records?.items.find((row) => row.id === recordId) : undefined;
  const pageInfo = records?.pagination ?? { page, pageSize: 10, total: 0, totalPages: 0 };
  const visibleTabs = !simplified
    ? tabs
    : activeTab === "wallets" || activeTab === "movements"
      ? tabs.filter((item) => item.id === "wallets" || item.id === "movements")
      : activeTab === "orders" || activeTab === "executions"
        ? tabs.filter((item) => item.id === "orders" || item.id === "executions")
        : [];
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
              <FinanceRow
                key={row.id}
                row={row}
                tab={activeTab}
                openUser={openUser}
                openRecord={openRecord}
              />
            ))}
          </tbody>
        </table>
      </div>
    );
  }, [activeTab, records?.items, recordsLoading, openUser, openRecord]);

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
            {simplified ? "Money" : "Finance & Trading"} <span>›</span> Finance Dashboard
          </p>
          <h2>{simplified ? "Money" : "Finance & Trading"}</h2>
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

      <GuidancePanel
        compact
        className={`admin-finance-action-center tone-${operationalLiquidityTone(liquidityOperationalStatus)}`}
        currentState="Financial operations"
        nextAction={financeGuidance}
      />

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
              label="Withdrawal holds"
              value={money(financialSeparation?.customerLiabilities.withdrawalReservationMinor)}
              tone="gold"
            />
          </div>
          <footer className="admin-finance-domain-footer">
            <span>
              Withdrawal eligible{" "}
              {money(financialSeparation?.customerLiabilities.withdrawalEligibleMinor)}
            </span>
            <span>
              Collector proceeds{" "}
              {money(financialSeparation?.customerLiabilities.collectorProceedsMinor)}
            </span>
            <p>
              Pending deposits {money(dashboard.kpis.pendingDepositsMinor)} · pending withdrawals{" "}
              {money(dashboard.kpis.pendingWithdrawalsMinor)}
            </p>
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
            <span>
              Pending at Stripe{" "}
              {providerMoney(
                separatedStripe?.providerPendingMinor ??
                  dashboard.payoutLiquidity?.providerPendingMinor,
                separatedStripe?.payoutLiquidityStatus ??
                  dashboard.payoutLiquidity?.providerLiquidityStatus,
              )}
            </span>
            <p>
              {separatedStripe?.payoutLiquidityStatus === "UNAVAILABLE"
                ? "Stripe could not be read. Preflight stays fail-closed until provider evidence returns."
                : liquidityOperationalStatus === "DEFICIT"
                  ? `${money(separatedStripe?.liquidityShortfallMinor)} below the protected liability and reserve projection.`
                  : "Only Stripe Platform Payments Balance can release a customer withdrawal."}
            </p>
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
          </div>
          <footer
            className={`admin-finance-domain-footer${separatedRevenue?.safeToSweepStatus === "BLOCKED" ? " is-warning" : ""}`}
          >
            <span>Already swept {money(separatedRevenue?.alreadySweptMinor)}</span>
            <span>External settlement not configured</span>
            <p>
              {separatedRevenue?.safeToSweepStatus === "READY"
                ? "A dual-control sweep request may be recorded; approval does not send a Stripe payout."
                : separatedRevenue?.blockedReasons.length
                  ? `Sweep blocked: ${separatedRevenue.blockedReasons.map(titleCase).join(", ")}.`
                  : "Sweep readiness remains blocked until the server proves a safe amount."}
            </p>
          </footer>
        </article>
      </section>

      <section className="admin-finance-ledger-card">
        <header className="admin-finance-ledger-heading">
          <div>
            <span>Finance ledger</span>
            <h3>Ledger records</h3>
            <p>Search the authoritative account and settlement record without leaving Finance.</p>
          </div>
          <b>
            {dataClass === "OPERATIONAL"
              ? `${titleCase(activeTab)} · operational`
              : `${titleCase(activeTab)} · ${dataClass === "QA_DEMO" ? "QA / demo" : "all data"}`}
          </b>
        </header>
        {visibleTabs.length ? (
          <nav className="admin-finance-tabs" aria-label="Finance sections">
            {visibleTabs.map((entry) => (
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
        ) : null}
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

      {recordId ? (
        <FinanceRecordDrawer
          record={selectedRecord}
          recordId={recordId}
          onClose={closeRecord}
          openUser={openUser}
          openMovements={(value) => {
            const person = identity(value);
            update({
              tab: "movements",
              q: person.email || (person.name === "—" ? undefined : person.name),
              status: undefined,
              page: "1",
              record: undefined,
              recordType: undefined,
            });
          }}
          openAdjustments={() =>
            update({
              tab: "adjustments",
              q: undefined,
              status: undefined,
              page: "1",
              record: undefined,
              recordType: undefined,
            })
          }
        />
      ) : null}

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
    wallets: [
      "Collector",
      "Wallet Balance",
      "Reserved",
      "Available",
      "Ledger accounts",
      "Currency",
      "Status",
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
      "Exceptions",
      "Last run",
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
      <th>
        <span className="sr-only">Open record</span>
      </th>
    </tr>
  );
}
function FinanceRow({
  row,
  tab,
  openUser,
  openRecord,
}: {
  row: AdminFinanceRecord;
  tab: FinanceTab;
  openUser: (id: string, detailTab?: string) => void;
  openRecord: (id: string) => void;
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
          <td>{number(value("accountCount"))}</td>
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
          <td>{text(value("mismatchCodes"))}</td>
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
      <td>
        <button
          type="button"
          className="admin-finance-open-record"
          onClick={() => openRecord(row.id)}
        >
          Open
        </button>
      </td>
    </tr>
  );
}

function FinanceRecordDrawer({
  record,
  recordId,
  onClose,
  openUser,
  openMovements,
  openAdjustments,
}: {
  record?: AdminFinanceRecord;
  recordId: string;
  onClose: () => void;
  openUser: (id: string, detailTab?: string) => void;
  openMovements: (value: unknown) => void;
  openAdjustments: () => void;
}) {
  const title = record ? `${titleCase(record.kind)} record` : "Money record";
  const subtitle = record
    ? `Reference ${recordId}. Values are read from the authoritative financial projection.`
    : "The selected record is outside the current page or filter. Clear the filters or return to the result.";
  const person = record ? (record.collector ?? record.user) : undefined;
  const personInfo = identity(person);
  const currency = text(record?.currency) === "—" ? "GBP" : text(record?.currency);
  const accounts = walletAccountBreakdown(record);
  return (
    <AdminRecordDrawer title={title} subtitle={subtitle} onClose={onClose}>
      {record ? (
        <section className="admin-finance-record-workspace">
          <header className="admin-finance-record-hero">
            <div>
              <span>Authoritative finance projection</span>
              <h3>{financeRecordHeading(record)}</h3>
              <p>{financeRecordSummary(record)}</p>
            </div>
            <div className="admin-finance-record-hero__states">
              <Status value={record.status ?? record.providerState ?? record.settlementStatus} />
              {record.financialDataClass ? (
                <span className="admin-finance-record-class">
                  {titleCase(record.financialDataClass)} data
                </span>
              ) : null}
            </div>
          </header>

          {record.kind === "wallet" ? (
            <>
              <section className="admin-finance-record-metrics" aria-label="Wallet position">
                <RecordMetric
                  label="Total balance"
                  value={money(record.walletBalanceMinor, currency)}
                  tone="primary"
                />
                <RecordMetric label="Available" value={money(record.availableMinor, currency)} />
                <RecordMetric label="Reserved" value={money(record.reservedMinor, currency)} />
                <RecordMetric
                  label="Ledger accounts"
                  value={`${number(record.accountCount)} protected account${Number(record.accountCount) === 1 ? "" : "s"}`}
                />
              </section>
              <section className="admin-finance-record-panel">
                <header>
                  <div>
                    <span>Ledger composition</span>
                    <h4>Underlying protected accounts</h4>
                    <p>
                      These are ledger components of one customer wallet. They remain separate for
                      auditability, but are not separate customer accounts.
                    </p>
                  </div>
                  <span className="admin-finance-record-count">{accounts.length} shown</span>
                </header>
                <div className="admin-finance-account-breakdown">
                  {accounts.map((account) => (
                    <article key={account.id}>
                      <div>
                        <span>{titleCase(account.code)}</span>
                        <small>
                          {titleCase(account.financialDataClass)} · {date(account.lastActivityAt)}
                        </small>
                      </div>
                      <strong>{money(account.balanceMinor, currency)}</strong>
                      <dl>
                        <div>
                          <dt>Available</dt>
                          <dd>{money(account.availableMinor, currency)}</dd>
                        </div>
                        <div>
                          <dt>Reserved</dt>
                          <dd>{money(account.reservedMinor, currency)}</dd>
                        </div>
                      </dl>
                      <Status value={account.status} />
                    </article>
                  ))}
                </div>
              </section>
            </>
          ) : (
            <section className="admin-finance-record-panel admin-finance-record-panel--details">
              <header>
                <div>
                  <span>Record detail</span>
                  <h4>Operational fields</h4>
                  <p>Only fields relevant to this {record.kind} are shown.</p>
                </div>
              </header>
              <dl className="admin-finance-record-details">
                {financeRecordDetails(record, currency).map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <section className="admin-finance-record-panel admin-finance-record-panel--controls">
            <header>
              <div>
                <span>Control boundary</span>
                <h4>Investigate without changing the ledger</h4>
                <p>
                  Financial state is immutable in this workspace. Corrections remain in the
                  protected Adjustments workflow with their required approvals.
                </p>
              </div>
            </header>
            <div className="admin-finance-record-actions">
              {personInfo.id ? (
                <button type="button" onClick={() => openUser(personInfo.id)}>
                  Open customer workspace <ArrowRight aria-hidden="true" />
                </button>
              ) : null}
              {personInfo.name !== "—" ? (
                <button type="button" onClick={() => openMovements(person)}>
                  View related movements <ArrowRight aria-hidden="true" />
                </button>
              ) : null}
              <button type="button" onClick={openAdjustments}>
                Open protected adjustments <ArrowRight aria-hidden="true" />
              </button>
              <button type="button" onClick={onClose}>
                Return to ledger <ArrowRight aria-hidden="true" />
              </button>
            </div>
          </section>
        </section>
      ) : (
        <section className="admin-finance-record-empty">
          <h3>Record not in the current result</h3>
          <p>Clear the current filters or return to the ledger and select the record again.</p>
          <button type="button" onClick={onClose}>
            Return to ledger <ArrowRight aria-hidden="true" />
          </button>
        </section>
      )}
    </AdminRecordDrawer>
  );
}

function RecordMetric({ label, value, tone }: { label: string; value: string; tone?: "primary" }) {
  return (
    <article
      className={tone ? `admin-finance-record-metric is-${tone}` : "admin-finance-record-metric"}
    >
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function financeRecordHeading(record: AdminFinanceRecord) {
  const person = identity(record.collector ?? record.user);
  if (record.kind === "wallet") return `${person.name} wallet`;
  if (record.kind === "movement") return `${titleCase(record.type)} movement`;
  if (record.kind === "order") return text((record.asset as { title?: string } | undefined)?.title);
  if (record.kind === "execution")
    return `${text((record.asset as { title?: string } | undefined)?.title)} execution`;
  if (record.kind === "reconciliation") return `${titleCase(record.scope)} reconciliation`;
  return `${titleCase(record.status)} adjustment`;
}

function financeRecordSummary(record: AdminFinanceRecord) {
  if (record.kind === "wallet")
    return "A single customer-facing wallet projection, composed from protected ledger accounts.";
  if (record.kind === "movement")
    return "Provider and Slice settlement states are shown together without altering the source record.";
  if (record.kind === "order" || record.kind === "execution")
    return "Trading state is read from the authoritative order and execution projection.";
  if (record.kind === "reconciliation")
    return "Review the recorded ledger comparison and any backend-reported mismatch.";
  return "Adjustment history remains reviewable and approval-gated.";
}

function financeRecordDetails(record: AdminFinanceRecord, currency: string) {
  const person = identity(record.user ?? record.collector);
  const asset = text((record.asset as { title?: string } | undefined)?.title);
  const details = (fields: Array<[string, string]>) => fields.filter(([, value]) => value !== "—");
  switch (record.kind) {
    case "movement":
      return details([
        ["Reference", text(record.reference ?? record.id)],
        ["Customer", person.name],
        ["Type", titleCase(record.type)],
        ["Amount", money(record.amountMinor, currency)],
        ["Provider", text(record.provider)],
        ["Provider state", titleCase(record.providerState)],
        ["Slice state", titleCase(record.sliceState)],
        ["Created", date(record.createdAt)],
        ["Last updated", date(record.updatedAt)],
      ]);
    case "order":
      return details([
        ["Order reference", text(record.id)],
        ["Customer", person.name],
        ["Asset", asset],
        ["Side", titleCase(record.side)],
        ["Limit price", money(record.limitPriceMinor, currency)],
        ["Original units", text(record.shares)],
        ["Filled units", text(record.filled)],
        ["Remaining units", text(record.remaining)],
        ["Created", date(record.createdAt)],
      ]);
    case "execution":
      return details([
        ["Execution reference", text(record.id)],
        ["Asset", asset],
        ["Buyer", identity(record.buyer).name],
        ["Seller", identity(record.seller).name],
        ["Units", text(record.shares)],
        ["Price", money(record.priceMinor, currency)],
        ["Fees", money(record.feeMinor, currency)],
        ["Executed", date(record.executedAt)],
        ["Settlement", titleCase(record.settlementStatus)],
      ]);
    case "reconciliation":
      return details([
        ["Reference", text(record.reference ?? record.id)],
        ["Scope", titleCase(record.scope)],
        ["Expected", money(record.expectedMinor, currency)],
        ["Observed", money(record.observedMinor, currency)],
        ["Difference", money(record.differenceMinor, currency)],
        ["Exceptions", text(record.mismatchCodes)],
        ["Last run", date(record.createdAt)],
      ]);
    case "adjustment":
      return details([
        ["Request", text(record.id)],
        ["Customer", person.name],
        ["Amount", money(record.amountMinor, currency)],
        ["Reason", text(record.reason)],
        ["Before outstanding", money(record.beforeOutstandingMinor, currency)],
        ["After outstanding", money(record.afterOutstandingMinor, currency)],
        ["Requested", date(record.requestedAt)],
        ["Applied", date(record.appliedAt)],
      ]);
    default:
      return [];
  }
}

function walletAccountBreakdown(record?: AdminFinanceRecord) {
  if (!Array.isArray(record?.accountBreakdown)) return [];
  return record.accountBreakdown.flatMap((value) => {
    if (!value || typeof value !== "object") return [];
    const account = value as Record<string, unknown>;
    return [
      {
        id: text(account.id),
        code: text(account.code),
        status: text(account.status),
        financialDataClass: text(account.financialDataClass),
        balanceMinor: account.balanceMinor,
        reservedMinor: account.reservedMinor,
        availableMinor: account.availableMinor,
        lastActivityAt: account.lastActivityAt,
      },
    ];
  });
}
function Status({ value }: { value: unknown }) {
  return (
    <span className="admin-finance-status" title={titleCase(value)}>
      {adminStatusLabel(value)}
    </span>
  );
}
