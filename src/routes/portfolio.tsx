import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BanknoteArrowDown,
  ChartNoAxesCombined,
  CircleGauge,
  Clock3,
  Landmark,
  Layers3,
  ListOrdered,
  LockKeyhole,
  RefreshCw,
  WalletCards,
  type LucideIcon,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import { KpiIconTile } from "@/components/ui/KpiIconTile";
import type {
  PortfolioHolding,
  PortfolioSummary,
  PortfolioTransaction,
  TradingOrderPage,
  TradingOrderView,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { queryKeys } from "@/queries/keys";
import {
  PORTFOLIO_EMPTY_STATES,
  PORTFOLIO_ERROR_STATES,
  deriveCategoryAllocation,
  deriveHoldingAllocation,
  deriveHoldingValuation,
  derivePortfolioValuationSnapshot,
  formatPortfolioMoney,
  formatSignedPortfolioMoney,
  holdingDisplayLabel,
  latestPortfolioMarkAt,
  portfolioValueLabel,
  valuationDescription,
} from "./-portfolio-presentation";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio | Slice" }] }),
  validateSearch: (search: Record<string, unknown>): { tab?: PortfolioTab } => ({
    tab: ["overview", "holdings", "orders", "activity"].includes(String(search.tab))
      ? (String(search.tab) as PortfolioTab)
      : "overview",
  }),
  component: Portfolio,
});

type HoldingFilter = "ALL" | string;
type PortfolioTab = "overview" | "holdings" | "orders" | "activity";

export function Portfolio() {
  useCurrency();
  const services = useAppServices();
  const { isAuthenticated } = useSession();
  const tab = usePortfolioTab();
  const [holdingFilter, setHoldingFilter] = useState<HoldingFilter>("ALL");
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
    queryFn: () => services.portfolio.transactions({ limit: 6 }),
    enabled: isAuthenticated,
  });
  const orders = useQuery({
    queryKey: queryKeys.trading.orders,
    queryFn: () => services.trading.orders({ limit: 100 }),
    enabled: isAuthenticated,
  });
  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          (holdings.data ?? [])
            .map((holding) => holding.category?.trim())
            .filter((category): category is string => Boolean(category)),
        ),
      ),
    [holdings.data],
  );
  const visibleHoldings = useMemo(
    () =>
      holdingFilter === "ALL"
        ? holdings.data
        : (holdings.data ?? []).filter((holding) => holding.category === holdingFilter),
    [holdingFilter, holdings.data],
  );
  const authRequired =
    (!isAuthenticated && !summary.data) ||
    (summary.error instanceof ApiError && summary.error.status === 401);
  if (authRequired) return <PortfolioAccessRequired />;

  return (
    <main className="portfolio-page portfolio-page--approved">
      <div className="page-shell portfolio-shell">
        <PortfolioHeading query={summary} />
        <PortfolioTabs active={tab} />
        <PortfolioKpis query={summary} />
        {tab === "orders" ? <PortfolioOrdersSection query={orders} /> : null}
        <section
          className={`portfolio-workspace-grid${tab === "orders" ? " sr-only" : ""}`}
          aria-label="Portfolio holdings workspace"
        >
          <div className="portfolio-workspace-grid__main">
            <PortfolioPerformancePanel query={summary} />
            <HoldingsPanel
              summary={summary}
              query={holdings}
              categories={categories}
              filter={holdingFilter}
              onFilterChange={setHoldingFilter}
              visibleHoldings={visibleHoldings}
            />
          </div>
          <aside className="portfolio-workspace-grid__side" aria-label="Portfolio account summary">
            <AllocationPanel query={summary} />
            <CurrentPerformancePanel query={summary} />
            <PortfolioBreakdownPanel query={summary} />
            <OpenOrdersPanel summary={summary} query={orders} />
          </aside>
        </section>
        <section
          className={`portfolio-activity-grid${tab === "activity" || tab === "overview" ? "" : " sr-only"}`}
          aria-label="Portfolio activity and transactions"
        >
          <ActivityPanel query={transactions} />
          <TransactionsPanel query={transactions} />
        </section>
        <section
          className={`portfolio-insights-grid${tab === "overview" ? "" : " sr-only"}`}
          aria-label="Portfolio insights"
        >
          <TopHoldingPanel query={summary} />
          <PortfolioInsightsPanel query={summary} />
        </section>
      </div>
    </main>
  );
}

function usePortfolioTab(): PortfolioTab {
  const routeSearch = Route.useSearch?.() ?? {};
  return routeSearch.tab ?? "overview";
}

function PortfolioTabs({ active }: { active: PortfolioTab }) {
  const tabs: Array<[PortfolioTab, string]> = [
    ["overview", "Overview"],
    ["holdings", "Holdings"],
    ["orders", "Orders"],
    ["activity", "Activity"],
  ];
  return (
    <nav className="mb-6 flex flex-wrap gap-2" aria-label="Portfolio sections">
      {tabs.map(([tab, label]) => (
        <Link
          key={tab}
          to="/portfolio"
          search={{ tab }}
          className={`rounded-lg border px-4 py-2 text-sm font-semibold transition ${
            active === tab
              ? "border-accent/40 bg-accent/10 text-foreground"
              : "border-border bg-surface text-subtle hover:border-accent/30 hover:text-foreground"
          }`}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

function PortfolioOrdersSection({ query }: { query: UseQueryResult<TradingOrderPage> }) {
  const items = query.data?.items ?? [];
  return (
    <PortfolioPanel title="Orders" className="mb-6">
      {query.isLoading ? (
        <RowsSkeleton rows={4} />
      ) : query.isError ? (
        <PanelError message="Unable to load orders." retry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="py-6 text-sm text-subtle">
          No orders yet. Orders you place will appear here.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead className="text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th className="px-3 py-3 font-semibold">Order</th>
                <th className="px-3 py-3 font-semibold">Side</th>
                <th className="px-3 py-3 font-semibold">Shares</th>
                <th className="px-3 py-3 font-semibold">Status</th>
                <th className="px-3 py-3 font-semibold">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((order) => (
                <tr key={order.id}>
                  <td className="max-w-[260px] truncate px-3 py-4 font-semibold text-foreground">
                    {order.assetSlug ?? order.assetId}
                  </td>
                  <td
                    className={
                      order.side === "BUY" ? "px-3 py-4 text-positive" : "px-3 py-4 text-negative"
                    }
                  >
                    {order.side}
                  </td>
                  <td className="px-3 py-4 text-subtle">
                    {order.filledUnits} / {order.originalUnits}
                  </td>
                  <td className="px-3 py-4 text-subtle">{formatPortfolioOrderStatus(order)}</td>
                  <td className="px-3 py-4 text-subtle">{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortfolioPanel>
  );
}

function formatPortfolioOrderStatus(order: TradingOrderView) {
  return order.status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function PortfolioHeading({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  const markedAt = query.data ? latestPortfolioMarkAt(query.data) : null;
  return (
    <header className="portfolio-heading">
      <div>
        <p className="page-kicker">Portfolio</p>
        <h1>
          Your <span>Portfolio</span>
        </h1>
        <p>
          Track your collectible investments, ownership positions and performance across all asset
          classes.
        </p>
      </div>
      <div className="portfolio-heading__freshness" aria-live="polite">
        <span>Portfolio last updated</span>
        <strong>{markedAt ? formatDateTime(markedAt) : "Mark time unavailable"}</strong>
        <i aria-hidden="true" />
      </div>
    </header>
  );
}

function PortfolioKpis({ query }: { query: UseQueryResult<PortfolioSummary> }) {
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
  const valuation = derivePortfolioValuationSnapshot(summary);
  const unrealisedPercent = valuation
    ? percentageOf(valuation.unrealisedValueMinor, valuation.investedCostMinor)
    : null;
  return (
    <section className="portfolio-kpis" aria-label="Portfolio summary">
      <PortfolioKpi
        label="Portfolio value"
        value={portfolioValueLabel(summary)}
        icon={Layers3}
        detail={
          summary.valuationStatus === "FULL"
            ? "Current account value"
            : valuationDescription(summary.valuationStatus)
        }
      />
      <PortfolioKpi
        label="Available cash"
        value={formatPortfolioMoney(summary.cash.availableMinor)}
        icon={WalletCards}
        detail="Available to place eligible orders"
      />
      <PortfolioKpi
        label="Holdings value"
        value={
          summary.estimatedHoldingsValueMinor === null
            ? "Unavailable"
            : formatPortfolioMoney(summary.estimatedHoldingsValueMinor)
        }
        icon={Landmark}
        detail={`${summary.holdings.length} current marked position${summary.holdings.length === 1 ? "" : "s"}`}
      />
      <PortfolioKpi
        label="Invested cost"
        value={valuation ? formatPortfolioMoney(valuation.investedCostMinor) : "Unavailable"}
        icon={BanknoteArrowDown}
        detail={valuation ? "Open-position cost basis" : "Cost basis is not complete"}
      />
      <PortfolioKpi
        label="Unrealised gain/loss"
        value={
          valuation ? formatSignedPortfolioMoney(valuation.unrealisedValueMinor) : "Unavailable"
        }
        icon={ChartNoAxesCombined}
        tone={
          valuation
            ? BigInt(valuation.unrealisedValueMinor) >= 0n
              ? "positive"
              : "negative"
            : undefined
        }
        detail={
          unrealisedPercent === null
            ? "Marked value less open cost"
            : `${unrealisedPercent} vs. open cost`
        }
      />
    </section>
  );
}

function KpiSkeletons() {
  return (
    <section className="portfolio-kpis" aria-label="Loading portfolio summary">
      {[0, 1, 2, 3, 4].map((item) => (
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
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: LucideIcon;
  tone?: "positive" | "negative";
}) {
  return (
    <article className="portfolio-summary-kpi">
      <KpiIconTile icon={icon} />
      <div className="portfolio-kpi__content">
        <p>{label}</p>
        <strong className={tone ? `is-${tone}` : undefined}>{value}</strong>
        <span>{detail}</span>
      </div>
    </article>
  );
}

function PortfolioPerformancePanel({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  const valuation = query.data ? derivePortfolioValuationSnapshot(query.data) : null;
  return (
    <PortfolioPanel
      title="Portfolio performance"
      className="portfolio-panel--hero-performance"
      header={<PerformancePeriods />}
    >
      {query.isLoading ? (
        <ChartSkeleton />
      ) : query.isError || !query.data ? (
        <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
      ) : (
        <div className="portfolio-performance-hero">
          <div className="portfolio-performance-hero__value">
            <span>Current portfolio value</span>
            <strong>{portfolioValueLabel(query.data)}</strong>
            {valuation ? (
              <p
                className={BigInt(valuation.unrealisedValueMinor) >= 0n ? "is-credit" : "is-debit"}
              >
                {formatSignedPortfolioMoney(valuation.unrealisedValueMinor)}{" "}
                <small>unrealised</small>
              </p>
            ) : null}
          </div>
          <div className="portfolio-performance-limited">
            <ChartNoAxesCombined aria-hidden="true" />
            <div>
              <strong>Historical performance data is not yet available.</strong>
              <p>
                Slice will show period changes and a performance chart once sufficient portfolio
                snapshots exist.
              </p>
            </div>
          </div>
          <dl className="portfolio-performance-periods">
            <div>
              <dt>Current marked value</dt>
              <dd>
                {valuation ? formatPortfolioMoney(valuation.holdingsValueMinor) : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Open position cost</dt>
              <dd>
                {valuation ? formatPortfolioMoney(valuation.investedCostMinor) : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>Unrealised P/L</dt>
              <dd
                className={
                  valuation && BigInt(valuation.unrealisedValueMinor) < 0n
                    ? "is-debit"
                    : "is-credit"
                }
              >
                {valuation
                  ? formatSignedPortfolioMoney(valuation.unrealisedValueMinor)
                  : "Unavailable"}
              </dd>
            </div>
            <div>
              <dt>All-time high</dt>
              <dd>Unavailable</dd>
            </div>
          </dl>
        </div>
      )}
    </PortfolioPanel>
  );
}

function PerformancePeriods() {
  return (
    <div className="portfolio-periods" aria-label="Historical performance range unavailable">
      {["1D", "7D", "30D", "90D", "1Y", "ALL"].map((period) => (
        <button
          key={period}
          type="button"
          disabled
          title="Historical snapshots are not available yet"
        >
          {period}
        </button>
      ))}
    </div>
  );
}

function AllocationPanel({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  if (query.isLoading)
    return (
      <PortfolioPanel title="Allocation by asset class" className="portfolio-panel--allocation">
        <ChartSkeleton />
      </PortfolioPanel>
    );
  if (query.isError || !query.data)
    return (
      <PortfolioPanel title="Allocation by asset class" className="portfolio-panel--allocation">
        <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
      </PortfolioPanel>
    );
  const rows = deriveCategoryAllocation(query.data);
  if (!rows)
    return (
      <PortfolioPanel title="Allocation by asset class" className="portfolio-panel--allocation">
        <AllocationEmpty
          message={
            query.data.holdings.length
              ? "Collectible allocation is unavailable."
              : PORTFOLIO_EMPTY_STATES.allocation
          }
        />
      </PortfolioPanel>
    );
  const gradient = allocationGradient(rows.map((row) => row.percentageBps));
  return (
    <PortfolioPanel
      title="Allocation by asset class"
      className="portfolio-panel--allocation"
      header={<span className="portfolio-panel__status">Collectibles only</span>}
    >
      <div className="portfolio-allocation">
        <div
          className="portfolio-donut"
          style={{ background: gradient }}
          role="img"
          aria-label="Allocation by asset category using authoritative marked values"
        >
          <div>
            <strong>{formatPortfolioMoney(query.data.estimatedHoldingsValueMinor ?? "0")}</strong>
            <span>Holdings value</span>
          </div>
        </div>
        <div className="portfolio-allocation-table">
          {rows.map((row, index) => (
            <div key={row.label} className="portfolio-allocation-table__row">
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

function HoldingsPanel({
  summary,
  query,
  categories,
  filter,
  onFilterChange,
  visibleHoldings,
}: {
  summary: UseQueryResult<PortfolioSummary>;
  query: UseQueryResult<PortfolioHolding[]>;
  categories: string[];
  filter: HoldingFilter;
  onFilterChange: (filter: HoldingFilter) => void;
  visibleHoldings: PortfolioHolding[] | undefined;
}) {
  return (
    <PortfolioPanel
      title={query.data ? `Your holdings (${query.data.length})` : "Your holdings"}
      className="portfolio-panel--holdings"
      header={
        <div className="portfolio-holding-filters" role="tablist" aria-label="Filter holdings">
          <button
            type="button"
            role="tab"
            aria-selected={filter === "ALL"}
            className={filter === "ALL" ? "is-active" : ""}
            onClick={() => onFilterChange("ALL")}
          >
            All holdings
          </button>
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              role="tab"
              aria-selected={filter === category}
              className={filter === category ? "is-active" : ""}
              onClick={() => onFilterChange(category)}
            >
              {category}
            </button>
          ))}
        </div>
      }
    >
      {query.isLoading || summary.isLoading ? (
        <RowsSkeleton rows={5} />
      ) : query.isError ? (
        <PanelError message={PORTFOLIO_ERROR_STATES.holdings} retry={() => void query.refetch()} />
      ) : (
        <div className="portfolio-table-wrap portfolio-table-wrap--holdings" tabIndex={0}>
          <table className="portfolio-table portfolio-table--holdings">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Qty / shares</th>
                <th>Avg. cost</th>
                <th>Current value</th>
                <th>Allocation</th>
                <th>Unrealised P/L</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleHoldings?.length ? (
                visibleHoldings.map((holding) => (
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
                  <td colSpan={7}>
                    <PortfolioEmptyState
                      className="portfolio-empty-state--table"
                      icon={<Landmark aria-hidden="true" />}
                      message={
                        query.data?.length
                          ? "No holdings match this filter."
                          : PORTFOLIO_EMPTY_STATES.holdings
                      }
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
  const valuation = deriveHoldingValuation(holding);
  const averageCost = averageUnitCost(holding);
  return (
    <tr>
      <td data-label="Asset">
        {holding.slug ? (
          <Link
            to="/asset/$id"
            params={{ id: holding.slug }}
            className="portfolio-asset portfolio-asset--link"
          >
            <HoldingIdentity holding={holding} />
          </Link>
        ) : (
          <div className="portfolio-asset">
            <HoldingIdentity holding={holding} />
          </div>
        )}
      </td>
      <td data-label="Qty / shares">
        <span className="portfolio-table__quantity">
          <strong>{holding.ownedUnits}</strong>
          <small>
            {holding.availableUnits} available · {holding.reservedUnits} reserved
          </small>
        </span>
      </td>
      <td data-label="Avg. cost">{averageCost ?? "Unavailable"}</td>
      <td data-label="Current value">
        {holding.estimatedValueMinor
          ? formatPortfolioMoney(holding.estimatedValueMinor)
          : "Unavailable"}
      </td>
      <td data-label="Allocation">{allocation ?? "Unavailable"}</td>
      <td
        data-label="Unrealised P/L"
        className={
          valuation && BigInt(valuation.unrealisedValueMinor) < 0n ? "is-debit" : "is-credit"
        }
      >
        {valuation ? (
          <span className="portfolio-table__pnl">
            <strong>{formatSignedPortfolioMoney(valuation.unrealisedValueMinor)}</strong>
            <small>
              {percentageOf(valuation.unrealisedValueMinor, holding.costBasisMinor as string) ??
                "—"}
            </small>
          </span>
        ) : (
          "Unavailable"
        )}
      </td>
      <td data-label="Actions">
        {holding.slug ? (
          <Link to="/asset/$id" params={{ id: holding.slug }} className="portfolio-table__action">
            View <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <span className="portfolio-table__action portfolio-table__action--disabled">
            View unavailable
          </span>
        )}
      </td>
    </tr>
  );
}

function HoldingIdentity({ holding }: { holding: PortfolioHolding }) {
  const media = holding.slug ? assetShowcaseMedia(holding.slug) : undefined;
  return (
    <>
      <span className="portfolio-asset__icon" aria-hidden="true">
        {media ? <img src={media.src} alt="" /> : <Landmark />}
      </span>
      <span className="portfolio-asset__copy">
        <strong title={holdingDisplayLabel(holding)}>{holdingDisplayLabel(holding)}</strong>
        <small>
          {[holding.category, holding.grade].filter(Boolean).join(" · ") || "Collectible"}
        </small>
      </span>
    </>
  );
}

function CurrentPerformancePanel({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  const valuation = query.data ? derivePortfolioValuationSnapshot(query.data) : null;
  return (
    <PortfolioPanel title="Current performance" className="portfolio-panel--current-performance">
      {query.isLoading ? (
        <RowsSkeleton rows={3} />
      ) : query.isError ? (
        <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
      ) : valuation ? (
        <>
          <dl className="portfolio-performance-snapshot">
            <div>
              <dt>Market value</dt>
              <dd>{formatPortfolioMoney(valuation.holdingsValueMinor)}</dd>
            </div>
            <div>
              <dt>Open position cost</dt>
              <dd>{formatPortfolioMoney(valuation.investedCostMinor)}</dd>
            </div>
            <div>
              <dt>Unrealised change</dt>
              <dd
                className={BigInt(valuation.unrealisedValueMinor) >= 0n ? "is-credit" : "is-debit"}
              >
                {formatSignedPortfolioMoney(valuation.unrealisedValueMinor)}
              </dd>
            </div>
          </dl>
          <p className="portfolio-performance-note">
            Historical performance data is not yet available.
          </p>
        </>
      ) : (
        <PortfolioEmptyState
          icon={<ChartNoAxesCombined aria-hidden="true" />}
          message={PORTFOLIO_EMPTY_STATES.performance}
          detail="Current marked value and open cost will appear once every holding has supported data."
        />
      )}
    </PortfolioPanel>
  );
}

function PortfolioBreakdownPanel({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  const summary = query.data;
  const total = summary?.estimatedPortfolioValueMinor ?? null;
  const collectibles = summary?.estimatedHoldingsValueMinor ?? null;
  return (
    <PortfolioPanel title="Portfolio breakdown" className="portfolio-panel--breakdown">
      {query.isLoading ? (
        <RowsSkeleton rows={4} />
      ) : query.isError || !summary ? (
        <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
      ) : (
        <dl className="portfolio-breakdown">
          <BreakdownRow label="Available cash" value={summary.cash.availableMinor} total={total} />
          <BreakdownRow label="Collectibles" value={collectibles} total={total} />
          <BreakdownRow
            label="Reserved for orders"
            value={summary.cash.reservedMinor}
            total={total}
          />
          <BreakdownRow label="Total" value={total} total={total} totalRow />
        </dl>
      )}
    </PortfolioPanel>
  );
}

function BreakdownRow({
  label,
  value,
  total,
  totalRow = false,
}: {
  label: string;
  value: string | null;
  total: string | null;
  totalRow?: boolean;
}) {
  return (
    <div className={totalRow ? "portfolio-breakdown__total" : undefined}>
      <dt>{label}</dt>
      <dd>{value === null ? "Unavailable" : formatPortfolioMoney(value)}</dd>
      <small>
        {totalRow
          ? "100%"
          : value === null || total === null
            ? "Unavailable"
            : (percentageOf(value, total) ?? "Unavailable")}
      </small>
    </div>
  );
}

function OpenOrdersPanel({
  summary,
  query,
}: {
  summary: UseQueryResult<PortfolioSummary>;
  query: UseQueryResult<TradingOrderPage>;
}) {
  const openOrders =
    query.data?.items.filter(
      (order) => order.status === "OPEN" || order.status === "PARTIALLY_FILLED",
    ) ?? [];
  const reservedShares =
    summary.data?.holdings.reduce((total, holding) => total + BigInt(holding.reservedUnits), 0n) ??
    null;
  return (
    <PortfolioPanel
      title="Open orders / reserved cash"
      className="portfolio-panel--open-orders"
      header={
        <Link to="/portfolio" search={{ tab: "orders" }}>
          View orders <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      {query.isLoading || summary.isLoading ? (
        <RowsSkeleton rows={3} />
      ) : query.isError || !summary.data ? (
        <PanelError
          message="Unable to load open order summary."
          retry={() => void query.refetch()}
        />
      ) : (
        <dl className="portfolio-open-orders">
          <div>
            <dt>Open orders</dt>
            <dd>{query.isError ? "Unavailable" : String(openOrders.length)}</dd>
          </div>
          <div>
            <dt>Reserved cash</dt>
            <dd>{formatPortfolioMoney(summary.data.cash.reservedMinor)}</dd>
          </div>
          <div>
            <dt>Reserved shares</dt>
            <dd>{reservedShares === null ? "Unavailable" : reservedShares.toString()}</dd>
          </div>
        </dl>
      )}
    </PortfolioPanel>
  );
}

function ActivityPanel({ query }: { query: UseQueryResult<{ items: PortfolioTransaction[] }> }) {
  return (
    <PortfolioPanel
      title="Recent activity"
      className="portfolio-panel--activity"
      header={<span className="portfolio-panel__status">Account events</span>}
    >
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
                <strong>{transactionLabel(item)}</strong>
                <p>{transactionDetail(item)}</p>
              </div>
              <aside>
                <strong className={item.side === "CREDIT" ? "is-credit" : "is-debit"}>
                  {formatTransactionMoney(item)}
                </strong>
                <span>{formatDate(item.effectiveAt)}</span>
              </aside>
            </li>
          ))}
        </ul>
      ) : (
        <PanelEmpty message="No recent activity." />
      )}
    </PortfolioPanel>
  );
}

function TransactionsPanel({
  query,
}: {
  query: UseQueryResult<{ items: PortfolioTransaction[] }>;
}) {
  return (
    <PortfolioPanel
      title="Recent transactions"
      className="portfolio-panel--transactions"
      header={<span className="portfolio-panel__status">Authoritative ledger</span>}
    >
      {query.isLoading ? (
        <RowsSkeleton rows={5} />
      ) : query.isError ? (
        <PanelError
          message={PORTFOLIO_ERROR_STATES.transactions}
          retry={() => void query.refetch()}
        />
      ) : query.data?.items.length ? (
        <div className="portfolio-transactions-table">
          {query.data.items.map((item, index) => (
            <div key={`${item.reference ?? item.type}-${item.effectiveAt}-${index}`}>
              <span className={`portfolio-transaction-pill is-${item.side.toLowerCase()}`}>
                {transactionLabel(item)}
              </span>
              <p>{transactionDetail(item)}</p>
              <strong className={item.side === "CREDIT" ? "is-credit" : "is-debit"}>
                {formatTransactionMoney(item)}
              </strong>
              <time dateTime={item.effectiveAt}>{formatDate(item.effectiveAt)}</time>
            </div>
          ))}
        </div>
      ) : (
        <PanelEmpty message={PORTFOLIO_EMPTY_STATES.transactions} />
      )}
    </PortfolioPanel>
  );
}

function TopHoldingPanel({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  const topHolding = query.data ? highestMarkedHolding(query.data) : null;
  return (
    <PortfolioPanel title="Top holding" className="portfolio-panel--top-holding">
      {query.isLoading ? (
        <RowsSkeleton rows={2} />
      ) : query.isError ? (
        <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
      ) : topHolding ? (
        <div className="portfolio-top-holding">
          {topHolding.slug ? (
            <Link to="/asset/$id" params={{ id: topHolding.slug }} className="portfolio-asset">
              <HoldingIdentity holding={topHolding} />
            </Link>
          ) : (
            <div className="portfolio-asset">
              <HoldingIdentity holding={topHolding} />
            </div>
          )}
          <div>
            <span>Current value</span>
            <strong>{formatPortfolioMoney(topHolding.estimatedValueMinor as string)}</strong>
            <small>
              {query.data
                ? (allocationForHolding(query.data, topHolding.assetId) ?? "Allocation unavailable")
                : "Allocation unavailable"}
            </small>
          </div>
          {topHolding.slug ? (
            <Link
              to="/asset/$id"
              params={{ id: topHolding.slug }}
              className="portfolio-top-holding__action"
            >
              View asset <ArrowRight aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : (
        <PanelEmpty message="No marked holdings yet." />
      )}
    </PortfolioPanel>
  );
}

function PortfolioInsightsPanel({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  const summary = query.data;
  const categories = summary
    ? new Set(summary.holdings.map((holding) => holding.category).filter(Boolean)).size
    : 0;
  const reservedPositions =
    summary?.holdings.filter((holding) => BigInt(holding.reservedUnits) > 0n).length ?? 0;
  return (
    <PortfolioPanel title="Portfolio insights" className="portfolio-panel--insights">
      {query.isLoading ? (
        <RowsSkeleton rows={3} />
      ) : query.isError || !summary ? (
        <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
      ) : (
        <dl className="portfolio-insights">
          <div>
            <dt>Held assets</dt>
            <dd>{summary.holdings.length}</dd>
            <small>Current positions</small>
          </div>
          <div>
            <dt>Categories</dt>
            <dd>{categories}</dd>
            <small>Represented in your holdings</small>
          </div>
          <div>
            <dt>Positions reserved</dt>
            <dd>{reservedPositions}</dd>
            <small>With shares reserved for open orders</small>
          </div>
        </dl>
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

function PanelEmpty({ message }: { message: string }) {
  return (
    <PortfolioEmptyState
      icon={<Clock3 aria-hidden="true" />}
      message={message}
      detail="Supported account activity will appear here when it is recorded."
    />
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
    <div className="portfolio-chart-skeleton" aria-label="Loading portfolio performance">
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
function averageUnitCost(holding: PortfolioHolding) {
  if (holding.costBasisMinor === null || BigInt(holding.ownedUnits) <= 0n) return null;
  return formatPortfolioMoney(
    (BigInt(holding.costBasisMinor) / BigInt(holding.ownedUnits)).toString(),
  );
}
function highestMarkedHolding(summary: PortfolioSummary) {
  return summary.holdings.reduce<PortfolioHolding | null>((highest, holding) => {
    if (holding.estimatedValueMinor === null) return highest;
    if (
      !highest ||
      BigInt(holding.estimatedValueMinor) > BigInt(highest.estimatedValueMinor as string)
    )
      return holding;
    return highest;
  }, null);
}
function percentageOf(value: string, total: string) {
  const numerator = BigInt(value);
  const denominator = BigInt(total);
  if (denominator <= 0n) return null;
  const sign = numerator > 0n ? "+" : "";
  return `${sign}${(Number((numerator * 10_000n) / denominator) / 100).toFixed(2)}%`;
}
function formatBps(value: number) {
  return `${(value / 100).toFixed(2)}%`;
}
function transactionLabel(item: PortfolioTransaction) {
  const type = item.type.toLowerCase();
  if (type.includes("fund") || type.includes("deposit")) return "Funds added";
  if (type.includes("withdraw")) return "Funds withdrawn";
  if (type.includes("reservation")) return "Buy order placed";
  if (type.includes("release")) return "Reservation released";
  if (type.includes("reversal")) return "Transaction reversed";
  if (type.includes("refund")) return "Marketplace refund";
  if (type.includes("fee")) return "Marketplace fee";
  if (type.includes("settle") || type.includes("trade") || type.includes("execution"))
    return item.side === "CREDIT" ? "Sell completed" : "Buy trade settled";
  return item.side === "CREDIT" ? "Account credit" : "Account debit";
}
function transactionDetail(item: PortfolioTransaction) {
  const type = item.type.toLowerCase();
  if (type.includes("fund") || type.includes("deposit")) return "Cash added to your Slice wallet";
  if (type.includes("withdraw")) return "Cash withdrawn from your Slice wallet";
  if (type.includes("reservation")) return "Cash reserved while a buy order is open";
  if (type.includes("release")) return "Cash returned after an order reservation was released";
  if (type.includes("reversal")) return "A previously recorded transaction was reversed";
  if (type.includes("refund")) return "A marketplace amount was returned to your wallet";
  if (type.includes("fee")) return "Fee recorded for marketplace activity";
  if (type.includes("settle") || type.includes("trade") || type.includes("execution"))
    return item.side === "CREDIT"
      ? "Proceeds recorded from a completed marketplace sale"
      : "Cash recorded for a completed marketplace purchase";
  return item.side === "CREDIT" ? "Recorded account credit" : "Recorded account debit";
}
function formatTransactionMoney(item: PortfolioTransaction) {
  const amount = formatPortfolioMoney(item.amountMinor);
  const absolute = amount.startsWith("-") ? amount.slice(1) : amount;
  return `${item.side === "CREDIT" ? "+" : "-"}${absolute}`;
}
function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}
function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
