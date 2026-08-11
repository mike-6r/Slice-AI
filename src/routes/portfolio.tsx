import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowUpRight,
  BanknoteArrowDown,
  ChartNoAxesCombined,
  CircleGauge,
  Clock3,
  Landmark,
  Layers3,
  LockKeyhole,
  RefreshCw,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { KpiIconTile } from "@/components/ui/KpiIconTile";
import type { PortfolioHolding, PortfolioSummary, PortfolioTransaction } from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import {
  PORTFOLIO_EMPTY_STATES,
  PORTFOLIO_ERROR_STATES,
  deriveHoldingAllocation,
  formatPortfolioMoney,
  portfolioValueLabel,
  valuationDescription,
} from "./-portfolio-presentation";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio | Slice" }] }),
  component: Portfolio,
});

export function Portfolio() {
  const services = useAppServices();
  const { isAuthenticated } = useSession();
  const summary = useQuery({
    queryKey: queryKeys.portfolio.summary,
    queryFn: services.portfolio.portfolio,
    enabled: isAuthenticated,
  });
  const holdings = useQuery({
    queryKey: queryKeys.portfolio.holdings,
    queryFn: services.portfolio.holdings,
    enabled: isAuthenticated,
  });
  const transactions = useQuery({
    queryKey: queryKeys.portfolio.transactions(),
    queryFn: () => services.portfolio.transactions({ limit: 5 }),
    enabled: isAuthenticated,
  });

  const authRequired =
    (!isAuthenticated && !summary.data) ||
    (summary.error instanceof ApiError && summary.error.status === 401);
  if (authRequired) return <PortfolioAccessRequired />;

  return (
    <main className="portfolio-page">
      <div className="page-shell portfolio-shell">
        <PortfolioHeading />
        <PortfolioKpis query={summary} />
        <section className="portfolio-row portfolio-row--insight" aria-label="Portfolio insights">
          <AllocationPanel query={summary} />
          <PerformancePanel query={summary} />
          <ActivityPanel query={transactions} />
        </section>
        <section
          className="portfolio-row portfolio-row--detail"
          aria-label="Portfolio holdings and activity"
        >
          <HoldingsPanel summary={summary} query={holdings} />
          <TransactionsPanel query={transactions} />
        </section>
      </div>
    </main>
  );
}

function PortfolioHeading() {
  return (
    <header className="portfolio-heading">
      <div>
        <p className="page-kicker">Portfolio</p>
        <h1>
          Your <span>Portfolio</span>
        </h1>
        <p>
          Track your collectible investments, performance and activity across all asset classes.
        </p>
      </div>
    </header>
  );
}

function PortfolioKpis({ query }: { query: ReturnType<typeof useQuery<PortfolioSummary>> }) {
  if (query.isLoading) return <KpiSkeletons />;
  if (query.isError || !query.data)
    return (
      <section className="portfolio-kpis">
        <PortfolioPanel className="portfolio-kpis__error">
          <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
        </PortfolioPanel>
      </section>
    );
  const summary = query.data;
  return (
    <section className="portfolio-kpis" aria-label="Portfolio summary">
      <PortfolioKpi
        label="Portfolio value"
        value={portfolioValueLabel(summary)}
        icon={Layers3}
        detail={
          summary.valuationStatus === "FULL"
            ? "No trend data"
            : valuationDescription(summary.valuationStatus)
        }
      />
      <PortfolioKpi
        label="Available cash"
        value={formatPortfolioMoney(summary.cash.availableMinor)}
        icon={WalletCards}
        detail="Authoritative available cash"
      />
      <PortfolioKpi
        label="Reserved cash"
        value={formatPortfolioMoney(summary.cash.reservedMinor)}
        icon={LockKeyhole}
        detail="Reserved for supported account activity"
      />
      <PortfolioKpi
        label="Total return"
        value="Unavailable"
        icon={BanknoteArrowDown}
        detail="No return history available"
      />
    </section>
  );
}

function KpiSkeletons() {
  return (
    <section className="portfolio-kpis" aria-label="Loading portfolio summary">
      {[0, 1, 2, 3].map((item) => (
        <article key={item} className="portfolio-summary-kpi portfolio-summary-kpi--loading">
          <div className="customer-skeleton size-11" />
          <div className="min-w-0 flex-1">
            <div className="customer-skeleton h-3 w-24" />
            <div className="customer-skeleton mt-4 h-8 w-32" />
            <div className="customer-skeleton mt-4 h-3 w-36" />
          </div>
        </article>
      ))}
    </section>
  );
}

function PortfolioKpi({
  label,
  value,
  detail,
  icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
}) {
  return (
    <article className="portfolio-summary-kpi">
      <KpiIconTile icon={icon} />
      <div className="portfolio-kpi__content">
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function AllocationPanel({ query }: { query: ReturnType<typeof useQuery<PortfolioSummary>> }) {
  if (query.isLoading)
    return (
      <PortfolioPanel title="Portfolio allocation" className="portfolio-panel--allocation">
        <ChartSkeleton />
      </PortfolioPanel>
    );
  if (query.isError || !query.data)
    return (
      <PortfolioPanel title="Portfolio allocation" className="portfolio-panel--allocation">
        <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
      </PortfolioPanel>
    );
  const rows = deriveHoldingAllocation(query.data);
  if (!rows)
    return (
      <PortfolioPanel title="Portfolio allocation" className="portfolio-panel--allocation">
        <AllocationEmpty
          message={
            query.data.holdings.length
              ? "Portfolio allocation unavailable."
              : PORTFOLIO_EMPTY_STATES.allocation
          }
        />
      </PortfolioPanel>
    );
  const gradient = allocationGradient(rows.map((row) => row.percentageBps));
  return (
    <PortfolioPanel title="Portfolio allocation" className="portfolio-panel--allocation">
      <div className="portfolio-allocation">
        <div
          className="portfolio-donut"
          style={{ background: gradient }}
          role="img"
          aria-label="Allocation by holding using authoritative marked values"
        >
          <div>
            <strong>{portfolioValueLabel(query.data)}</strong>
            <span>Total value</span>
          </div>
        </div>
        <div className="portfolio-allocation-table">
          <div className="portfolio-allocation-table__head">
            <span>Holding</span>
            <span>Value</span>
            <span>Allocation</span>
          </div>
          {rows.map((row, index) => (
            <div key={row.assetId} className="portfolio-allocation-table__row">
              <span>
                <i
                  style={{ backgroundColor: ALLOCATION_COLOURS[index % ALLOCATION_COLOURS.length] }}
                />
                {row.label}
              </span>
              <strong>{formatPortfolioMoney(row.valueMinor)}</strong>
              <strong>{formatBps(row.percentageBps)}</strong>
            </div>
          ))}
        </div>
      </div>
    </PortfolioPanel>
  );
}

function AllocationEmpty({ message }: { message: string }) {
  return (
    <div className="portfolio-empty-state portfolio-empty-state--allocation">
      <div className="portfolio-chart-empty__ring" aria-hidden="true">
        <CircleGauge />
      </div>
      <div className="portfolio-empty-state__copy">
        <strong>{message}</strong>
        <p>Slice shows allocation only when every holding has an authoritative mark.</p>
      </div>
    </div>
  );
}

function PerformancePanel({ query }: { query: ReturnType<typeof useQuery<PortfolioSummary>> }) {
  return (
    <PortfolioPanel
      title="Performance"
      className="portfolio-panel--performance"
      header={
        <div className="portfolio-periods" aria-label="Portfolio performance periods unavailable">
          {["1D", "7D", "30D", "3M", "1Y", "All"].map((period) => (
            <button
              key={period}
              type="button"
              disabled
              aria-label={`${period} history unavailable`}
            >
              {period}
            </button>
          ))}
        </div>
      }
    >
      {query.isLoading ? (
        <ChartSkeleton />
      ) : query.isError ? (
        <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
      ) : (
        <PortfolioEmptyState
          className="portfolio-empty-state--performance"
          icon={<ChartNoAxesCombined aria-hidden="true" />}
          message={PORTFOLIO_EMPTY_STATES.performance}
          detail="Historical portfolio values are not currently exposed by Slice."
        />
      )}
      <div className="portfolio-range-summary" aria-label="Performance periods">
        {["Starting value", "Net contributions", "Total return", "Best day"].map((period) => (
          <div key={period}>
            <span>{period}</span>
            <strong>Unavailable</strong>
          </div>
        ))}
      </div>
    </PortfolioPanel>
  );
}

function ActivityPanel({
  query,
}: {
  query: ReturnType<typeof useQuery<{ items: PortfolioTransaction[] }>>;
}) {
  return (
    <PortfolioPanel title="Recent activity" className="portfolio-panel--activity">
      {query.isLoading ? (
        <RowsSkeleton rows={4} />
      ) : query.isError ? (
        <PanelError
          message={PORTFOLIO_ERROR_STATES.transactions}
          retry={() => void query.refetch()}
        />
      ) : query.data?.items.length ? (
        <ul className="portfolio-activity">
          {query.data.items.map((item, index) => (
            <li key={`${item.reference ?? item.type}-${item.effectiveAt}-${index}`}>
              <span
                className={item.side === "CREDIT" ? "is-credit" : "is-debit"}
                aria-hidden="true"
              >
                {item.side === "CREDIT" ? <ArrowUpRight /> : <ArrowDownRight />}
              </span>
              <div>
                <strong>{humanise(item.type)}</strong>
                <p>
                  {item.reference ?? (item.status ? humanise(item.status) : "Recorded activity")}
                </p>
              </div>
              <aside>
                <strong>{formatPortfolioMoney(item.amountMinor)}</strong>
                <span>{formatDate(item.effectiveAt)}</span>
              </aside>
            </li>
          ))}
        </ul>
      ) : (
        <PortfolioEmptyState
          className="portfolio-empty-state--activity"
          icon={<Clock3 aria-hidden="true" />}
          message="No recent activity."
          detail="Supported account activity will appear here when it is recorded."
        />
      )}
    </PortfolioPanel>
  );
}

function HoldingsPanel({
  summary,
  query,
}: {
  summary: ReturnType<typeof useQuery<PortfolioSummary>>;
  query: ReturnType<typeof useQuery<PortfolioHolding[]>>;
}) {
  return (
    <PortfolioPanel
      title={query.data ? `Holdings (${query.data.length})` : "Holdings"}
      className="portfolio-panel--holdings"
    >
      {query.isLoading || summary.isLoading ? (
        <RowsSkeleton rows={5} />
      ) : query.isError ? (
        <PanelError message={PORTFOLIO_ERROR_STATES.holdings} retry={() => void query.refetch()} />
      ) : (
        <div
          className="portfolio-table-wrap"
          tabIndex={0}
          aria-label="Holdings table; scroll horizontally on smaller screens"
        >
          <table className="portfolio-table">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Quantity</th>
                <th>Avg. cost</th>
                <th>Market value</th>
                <th>Allocation</th>
              </tr>
            </thead>
            <tbody>
              {query.data?.length ? (
                query.data.map((holding) => (
                  <HoldingRow
                    key={holding.assetId}
                    holding={holding}
                    allocation={
                      summary.data ? allocationForHolding(summary.data, holding.assetId) : null
                    }
                  />
                ))
              ) : (
                <tr className="portfolio-table__empty-row">
                  <td colSpan={5}>
                    <PortfolioEmptyState
                      className="portfolio-empty-state--table"
                      icon={<Landmark aria-hidden="true" />}
                      message={PORTFOLIO_EMPTY_STATES.holdings}
                      detail="Your authoritative holdings will appear here once they are issued or acquired."
                    />
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </PortfolioPanel>
  );
}

function HoldingRow({
  holding,
  allocation,
}: {
  holding: PortfolioHolding;
  allocation: string | null;
}) {
  return (
    <tr>
      <td>
        <div className="portfolio-asset">
          <span aria-hidden="true">
            <Landmark />
          </span>
          <strong>{holding.title ?? holding.slug ?? "Asset"}</strong>
        </div>
      </td>
      <td>{holding.ownedUnits}</td>
      <td>
        {holding.costBasisMinor === null
          ? "Unavailable"
          : formatPortfolioMoney(holding.costBasisMinor)}
      </td>
      <td>
        {holding.estimatedValueMinor === null
          ? "Unavailable"
          : formatPortfolioMoney(holding.estimatedValueMinor)}
      </td>
      <td>{allocation ?? "Unavailable"}</td>
    </tr>
  );
}

function TransactionsPanel({
  query,
}: {
  query: ReturnType<typeof useQuery<{ items: PortfolioTransaction[] }>>;
}) {
  return (
    <PortfolioPanel title="Recent transactions" className="portfolio-panel--transactions">
      {query.isLoading ? (
        <RowsSkeleton rows={5} />
      ) : query.isError ? (
        <PanelError
          message={PORTFOLIO_ERROR_STATES.transactions}
          retry={() => void query.refetch()}
        />
      ) : query.data?.items.length ? (
        <div className="portfolio-table-wrap" tabIndex={0} aria-label="Recent transactions table">
          <table className="portfolio-table portfolio-table--transactions">
            <thead>
              <tr>
                <th>Type</th>
                <th>Details</th>
                <th>Amount</th>
                <th>Date</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((item, index) => (
                <tr key={`${item.reference ?? item.type}-${item.effectiveAt}-${index}`}>
                  <td>
                    <span className={`portfolio-transaction-pill is-${item.side.toLowerCase()}`}>
                      {humanise(item.type)}
                    </span>
                  </td>
                  <td>
                    {item.reference ??
                      (item.status ? humanise(item.status) : "Recorded financial activity")}
                  </td>
                  <td className={item.side === "CREDIT" ? "is-credit" : "is-debit"}>
                    {formatPortfolioMoney(item.amountMinor)}
                  </td>
                  <td>{formatDate(item.effectiveAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PanelEmpty message={PORTFOLIO_EMPTY_STATES.transactions} />
      )}
    </PortfolioPanel>
  );
}

function PortfolioPanel({
  title,
  header,
  className = "",
  children,
}: {
  title?: string;
  header?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`portfolio-panel ${className}`}>
      <div className="portfolio-panel__head">
        {title ? <h2>{title}</h2> : null}
        {header ?? null}
      </div>
      <div className="portfolio-panel__body">{children}</div>
    </section>
  );
}

function PanelEmpty({ message }: { message: string }) {
  return (
    <PortfolioEmptyState
      className="portfolio-empty-state--transactions"
      icon={<Clock3 aria-hidden="true" />}
      message={message}
      detail="Supported financial activity will appear here when it is recorded."
    />
  );
}
function PortfolioEmptyState({
  className = "",
  detail,
  icon,
  message,
}: {
  className?: string;
  detail: string;
  icon: ReactNode;
  message: string;
}) {
  return (
    <div className={`portfolio-empty-state ${className}`}>
      <span className="portfolio-empty-state__icon" aria-hidden="true">
        {icon}
      </span>
      <div className="portfolio-empty-state__copy">
        <strong>{message}</strong>
        <p>{detail}</p>
      </div>
    </div>
  );
}
function PanelError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="portfolio-panel__error">
      <p>{message}</p>
      <button type="button" onClick={retry}>
        <RefreshCw aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
function RowsSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-label="Loading panel data">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="customer-skeleton h-11" />
      ))}
    </div>
  );
}
function ChartSkeleton() {
  return (
    <div className="portfolio-chart-skeleton" aria-label="Loading portfolio chart">
      <div className="customer-skeleton portfolio-chart-skeleton__plot" />
      <div className="customer-skeleton h-3 w-4/5" />
    </div>
  );
}

function PortfolioAccessRequired() {
  return (
    <main className="page-shell py-16">
      <section className="customer-state text-center">
        <ChartNoAxesCombined className="mx-auto size-8 text-accent" aria-hidden="true" />
        <p className="page-kicker mt-5">Portfolio</p>
        <h1 className="page-title mt-3">Sign in to view your portfolio</h1>
        <p className="mx-auto mt-4 max-w-xl text-subtle">
          Financial data is available only to your authenticated session.
        </p>
        <Link
          to="/login"
          className="primary-action mt-6 inline-flex rounded-lg px-5 py-3 text-sm font-semibold text-background"
        >
          Sign in
        </Link>
      </section>
    </main>
  );
}

const ALLOCATION_COLOURS = ["#23d9b4", "#8a64e9", "#f4bc28", "#3d7fe6", "#8791a1"];
function allocationGradient(bps: number[]) {
  let cursor = 0;
  return `conic-gradient(${bps
    .map((value, index) => {
      const next = cursor + value / 100;
      const result = `${ALLOCATION_COLOURS[index % ALLOCATION_COLOURS.length]} ${cursor}% ${next}%`;
      cursor = next;
      return result;
    })
    .join(", ")})`;
}
function allocationForHolding(summary: PortfolioSummary, assetId: string) {
  const row = deriveHoldingAllocation(summary)?.find((item) => item.assetId === assetId);
  return row ? formatBps(row.percentageBps) : null;
}
function formatBps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}
function humanise(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}
