import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  CircleGauge,
  Clock3,
  Landmark,
  Layers3,
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
  PortfolioPerformance,
  PortfolioPerformanceRange,
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
  const [holdingSearch, setHoldingSearch] = useState("");
  const [holdingView, setHoldingView] = useState<"list" | "grid">("list");
  const [holdingPage, setHoldingPage] = useState(1);
  const [holdingPageSize, setHoldingPageSize] = useState(10);
  const [performanceRange, setPerformanceRange] = useState<PortfolioPerformanceRange>("1M");
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
  const performance = useQuery({
    queryKey: ["portfolio", "performance", performanceRange],
    queryFn: () => services.portfolio.performance(performanceRange),
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
  const searchedHoldings = useMemo(() => {
    const normalized = holdingSearch.trim().toLowerCase();
    if (!normalized) return visibleHoldings ?? [];
    return (visibleHoldings ?? []).filter((holding) =>
      [holding.title, holding.category, holding.grade, holding.slug]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [holdingSearch, visibleHoldings]);
  const holdingPageCount = Math.max(1, Math.ceil(searchedHoldings.length / holdingPageSize));
  const pagedHoldings = searchedHoldings.slice(
    (holdingPage - 1) * holdingPageSize,
    holdingPage * holdingPageSize,
  );
  const authRequired =
    (!isAuthenticated && !summary.data) ||
    (summary.error instanceof ApiError && summary.error.status === 401);
  if (authRequired) return <PortfolioAccessRequired />;

  const holdingsForOrders = holdings.data ?? summary.data?.holdings ?? [];

  return (
    <main className="portfolio-page portfolio-page--approved">
      <div className="page-shell portfolio-shell">
        <PortfolioHeading
          query={summary}
          tab={tab}
          holdingSearch={holdingSearch}
          holdingFilter={holdingFilter}
          categories={categories}
          onHoldingSearchChange={(value) => {
            setHoldingSearch(value);
            setHoldingPage(1);
          }}
          onHoldingFilterChange={(value) => {
            setHoldingFilter(value);
            setHoldingPage(1);
          }}
        />
        <PortfolioTabs active={tab} />
        {tab === "holdings" ? <HoldingsKpis query={summary} /> : <PortfolioKpis query={summary} />}
        {tab === "overview" ? (
          <>
            <section className="portfolio-overview-content" aria-label="Portfolio overview">
              <HoldingsPanel
                summary={summary}
                query={holdings}
                categories={categories}
                filter={holdingFilter}
                onFilterChange={setHoldingFilter}
                visibleHoldings={visibleHoldings?.slice(0, 5)}
                compact
              />
              <PortfolioPerformancePanel
                query={summary}
                performance={performance}
                range={performanceRange}
                onRangeChange={setPerformanceRange}
              />
              <AllocationPanel query={summary} />
            </section>
            <section className="portfolio-overview-bottom" aria-label="Recent portfolio updates">
              <RecentOrdersPanel query={orders} holdings={holdingsForOrders} />
              <ActivityPanel query={transactions} compact />
            </section>
          </>
        ) : tab === "holdings" ? (
          <HoldingsExperience
            summary={summary}
            query={holdings}
            holdings={pagedHoldings}
            totalMatches={searchedHoldings.length}
            view={holdingView}
            onViewChange={setHoldingView}
            page={holdingPage}
            pageCount={holdingPageCount}
            pageSize={holdingPageSize}
            onPageChange={setHoldingPage}
            onPageSizeChange={(value) => {
              setHoldingPageSize(value);
              setHoldingPage(1);
            }}
          />
        ) : tab === "orders" ? (
          <PortfolioOrdersSection query={orders} holdings={holdingsForOrders} />
        ) : (
          <ActivityPanel query={transactions} />
        )}
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

function PortfolioOrdersSection({
  query,
  holdings,
}: {
  query: UseQueryResult<TradingOrderPage>;
  holdings: PortfolioHolding[];
}) {
  const items = query.data?.items ?? [];
  const holdingByAsset = new Map(holdings.map((holding) => [holding.assetId, holding]));
  return (
    <PortfolioPanel
      title="Orders"
      className="portfolio-orders-page"
      header={<span className="portfolio-panel__status">Your trading activity</span>}
    >
      {query.isLoading ? (
        <RowsSkeleton rows={4} />
      ) : query.isError ? (
        <PanelError message="Unable to load orders." retry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <p className="py-6 text-sm text-subtle">
          No orders yet. Orders you place will appear here.
        </p>
      ) : (
        <div className="portfolio-orders-table-wrap">
          <table className="portfolio-orders-table">
            <thead className="text-xs uppercase tracking-[0.12em] text-muted">
              <tr>
                <th>Asset</th>
                <th>Side</th>
                <th>Ownership</th>
                <th>Quantity</th>
                <th>Price per Slice</th>
                <th>Status</th>
                <th>Created</th>
              </tr>
            </thead>
            <tbody>
              {items.map((order) => (
                <tr key={order.id}>
                  <td>
                    <OrderAssetIdentity order={order} holding={holdingByAsset.get(order.assetId)} />
                  </td>
                  <td className={order.side === "BUY" ? "is-buy" : "is-sell"}>{order.side}</td>
                  <td>
                    {order.requestedOwnershipPercent
                      ? `${order.requestedOwnershipPercent}% requested`
                      : "Ownership unavailable"}
                    {order.filledOwnershipPercent ? (
                      <small>{order.filledOwnershipPercent}% filled</small>
                    ) : null}
                  </td>
                  <td>
                    <strong>{order.filledUnits}</strong>
                    <small>of {order.originalUnits} units</small>
                  </td>
                  <td>{formatPortfolioMoney(order.limitPriceMinor)}</td>
                  <td>
                    <span className={`portfolio-order-status is-${order.status.toLowerCase()}`}>
                      {formatPortfolioOrderStatus(order)}
                    </span>
                  </td>
                  <td>{formatDateTime(order.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </PortfolioPanel>
  );
}

function OrderAssetIdentity({
  order,
  holding,
}: {
  order: TradingOrderView;
  holding?: PortfolioHolding;
}) {
  const slug = holding?.slug ?? order.assetSlug;
  const media = slug ? assetShowcaseMedia(slug) : undefined;
  const content = (
    <>
      <span className="portfolio-order-asset__icon" aria-hidden="true">
        {media ? <img src={media.src} alt="" /> : <Landmark />}
      </span>
      <span className="portfolio-order-asset__copy">
        <strong>
          {holdingDisplayLabel(holding ?? ({ title: order.assetSlug, slug } as PortfolioHolding))}
        </strong>
        <small>
          {[holding?.category, holding?.grade].filter(Boolean).join(" · ") || "Collectible"}
        </small>
      </span>
    </>
  );
  return slug ? (
    <Link to="/asset/$id" params={{ id: slug }} className="portfolio-order-asset">
      {content}
    </Link>
  ) : (
    <div className="portfolio-order-asset">{content}</div>
  );
}

function RecentOrdersPanel({
  query,
  holdings,
}: {
  query: UseQueryResult<TradingOrderPage>;
  holdings: PortfolioHolding[];
}) {
  const holdingByAsset = new Map(holdings.map((holding) => [holding.assetId, holding]));
  const items = (query.data?.items ?? []).slice(0, 4);
  return (
    <PortfolioPanel
      title="Recent orders"
      className="portfolio-panel--recent-orders"
      header={
        <Link to="/portfolio" search={{ tab: "orders" }} className="portfolio-panel__link">
          View all orders <ArrowRight aria-hidden="true" />
        </Link>
      }
    >
      {query.isLoading ? (
        <RowsSkeleton rows={3} />
      ) : query.isError ? (
        <PanelError message="Unable to load orders." retry={() => void query.refetch()} />
      ) : items.length ? (
        <div className="portfolio-recent-orders">
          {items.map((order) => {
            const holding = holdingByAsset.get(order.assetId);
            return (
              <div key={order.id} className="portfolio-recent-order">
                <OrderAssetIdentity order={order} holding={holding} />
                <span className={order.side === "BUY" ? "is-buy" : "is-sell"}>{order.side}</span>
                <span>
                  {order.requestedOwnershipPercent
                    ? `${order.requestedOwnershipPercent}%`
                    : `${order.originalUnits} units`}
                </span>
                <span>{formatPortfolioMoney(order.limitPriceMinor)}</span>
                <span className={`portfolio-order-status is-${order.status.toLowerCase()}`}>
                  {formatPortfolioOrderStatus(order)}
                </span>
              </div>
            );
          })}
        </div>
      ) : (
        <PanelEmpty message="You don't have any recent orders." />
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

function PortfolioHeading({
  query,
  tab,
  holdingSearch,
  holdingFilter,
  categories,
  onHoldingSearchChange,
  onHoldingFilterChange,
}: {
  query: UseQueryResult<PortfolioSummary>;
  tab: PortfolioTab;
  holdingSearch: string;
  holdingFilter: HoldingFilter;
  categories: string[];
  onHoldingSearchChange: (value: string) => void;
  onHoldingFilterChange: (value: HoldingFilter) => void;
}) {
  const markedAt = query.data ? latestPortfolioMarkAt(query.data) : null;
  const holdingsCount = query.data?.holdings.length ?? 0;
  const isHoldings = tab === "holdings";
  return (
    <header className="portfolio-heading">
      <div>
        <p className="page-kicker">Portfolio</p>
        <h1>
          Your{" "}
          <span>
            {isHoldings
              ? query.isLoading
                ? "Holdings"
                : `Holdings (${holdingsCount})`
              : "Portfolio"}
          </span>
        </h1>
        <p>
          {isHoldings
            ? "A detailed view of the collectibles you own."
            : "Track your collectible investments, ownership positions and performance across all asset classes."}
        </p>
      </div>
      {isHoldings ? (
        <div className="portfolio-heading__controls">
          <label className="portfolio-holdings-search">
            <span className="sr-only">Search your holdings</span>
            <input
              type="search"
              value={holdingSearch}
              onChange={(event) => onHoldingSearchChange(event.target.value)}
              placeholder="Search your holdings..."
            />
          </label>
          <label className="portfolio-holdings-filter">
            <span className="sr-only">Filter by asset class</span>
            <select
              value={holdingFilter}
              onChange={(event) => onHoldingFilterChange(event.target.value)}
            >
              <option value="ALL">All asset classes</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
        </div>
      ) : (
        <div className="portfolio-heading__freshness" aria-live="polite">
          <span>Portfolio last updated</span>
          <strong>{markedAt ? formatDateTime(markedAt) : "Mark time unavailable"}</strong>
          <i aria-hidden="true" />
        </div>
      )}
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
            ? "Total account value"
            : valuationDescription(summary.valuationStatus)
        }
      />
      <PortfolioKpi
        label="Available cash"
        value={formatPortfolioMoney(summary.cash.availableMinor)}
        icon={WalletCards}
        detail="Available to invest"
      />
      <PortfolioKpi
        label="Holdings value"
        value={
          summary.estimatedHoldingsValueMinor === null
            ? "Unavailable"
            : formatPortfolioMoney(summary.estimatedHoldingsValueMinor)
        }
        icon={Landmark}
        detail={`Across ${summary.holdings.length} position${summary.holdings.length === 1 ? "" : "s"}`}
      />
      <PortfolioKpi
        label="Unrealised P/L"
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
            ? "Compared with open cost"
            : `${unrealisedPercent} vs. open cost`
        }
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

function HoldingsKpis({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  if (query.isLoading) return <KpiSkeletons />;
  if (query.isError || !query.data) {
    return (
      <section className="portfolio-kpis" aria-label="Holdings summary">
        <PortfolioPanel className="portfolio-kpis__error">
          <PanelError message={PORTFOLIO_ERROR_STATES.summary} retry={() => void query.refetch()} />
        </PortfolioPanel>
      </section>
    );
  }
  const valuation = derivePortfolioValuationSnapshot(query.data);
  const unrealisedPercent = valuation
    ? percentageOf(valuation.unrealisedValueMinor, valuation.investedCostMinor)
    : null;
  return (
    <section className="portfolio-kpis portfolio-kpis--holdings" aria-label="Holdings summary">
      <PortfolioKpi
        label="Holdings value"
        value={
          query.data.estimatedHoldingsValueMinor === null
            ? "Unavailable"
            : formatPortfolioMoney(query.data.estimatedHoldingsValueMinor)
        }
        icon={Landmark}
        detail={`Across ${query.data.holdings.length} position${query.data.holdings.length === 1 ? "" : "s"}`}
      />
      <PortfolioKpi
        label="Total positions"
        value={String(query.data.holdings.length)}
        icon={Layers3}
        detail="Across all collectibles"
      />
      <PortfolioKpi
        label="Unrealised P/L"
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
        detail={unrealisedPercent ?? "Compared with invested cost"}
      />
      <PortfolioKpi
        label="Invested cost"
        value={valuation ? formatPortfolioMoney(valuation.investedCostMinor) : "Unavailable"}
        icon={WalletCards}
        detail="Total invested"
      />
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

function PortfolioPerformancePanel({
  query,
  performance,
  range,
  onRangeChange,
}: {
  query: UseQueryResult<PortfolioSummary>;
  performance: UseQueryResult<PortfolioPerformance>;
  range: PortfolioPerformanceRange;
  onRangeChange: (range: PortfolioPerformanceRange) => void;
}) {
  const valuation = query.data ? derivePortfolioValuationSnapshot(query.data) : null;
  return (
    <PortfolioPanel
      title="Portfolio performance"
      className="portfolio-panel--hero-performance"
      header={<PerformancePeriods active={range} onChange={onRangeChange} />}
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
          <PerformanceChart query={performance} />
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
              <dd>
                {performance.data?.points.length
                  ? formatPortfolioMoney(
                      performance.data.points.reduce(
                        (max, point) =>
                          BigInt(point.valueMinor) > BigInt(max) ? point.valueMinor : max,
                        performance.data.points[0]!.valueMinor,
                      ),
                    )
                  : "Insufficient history"}
              </dd>
            </div>
          </dl>
        </div>
      )}
    </PortfolioPanel>
  );
}

function PerformancePeriods({
  active,
  onChange,
}: {
  active: PortfolioPerformanceRange;
  onChange: (range: PortfolioPerformanceRange) => void;
}) {
  const periods: PortfolioPerformanceRange[] = ["1D", "1W", "1M", "3M", "1Y", "ALL"];
  return (
    <div className="portfolio-periods" aria-label="Historical performance range">
      {periods.map((period) => (
        <button
          key={period}
          type="button"
          className={period === active ? "is-active" : undefined}
          onClick={() => onChange(period)}
        >
          {period}
        </button>
      ))}
    </div>
  );
}

function PerformanceChart({ query }: { query: UseQueryResult<PortfolioPerformance> }) {
  const points = query.data?.points ?? [];
  if (query.isLoading) return <ChartSkeleton />;
  if (points.length < 2) {
    return (
      <div className="portfolio-performance-limited">
        <ChartNoAxesCombined aria-hidden="true" />
        <div>
          <strong>
            Portfolio performance will appear here as market and trading history is recorded.
          </strong>
          <p>
            {points.length
              ? "One snapshot is recorded; a second legitimate point is needed to draw the chart."
              : "Historical performance data is not yet available. No historical snapshots are available for this range yet."}
          </p>
        </div>
      </div>
    );
  }
  const values = points.map((point) => Number(point.valueMinor));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const line = points
    .map(
      (point, index) =>
        `${(index / (points.length - 1)) * 100},${100 - ((Number(point.valueMinor) - min) / span) * 84 - 8}`,
    )
    .join(" ");
  const direction = query.data?.direction ?? "NEUTRAL";
  return (
    <div
      className={`portfolio-performance-chart portfolio-performance-chart--${direction.toLowerCase()}`}
    >
      <svg
        viewBox="0 0 100 100"
        role="img"
        aria-label="Portfolio value over the selected period"
        preserveAspectRatio="none"
      >
        <polyline points={line} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="portfolio-performance-chart__legend">
        <span>{formatPortfolioMoney(points[0]!.valueMinor)}</span>
        <span>{formatPortfolioMoney(points.at(-1)!.valueMinor)}</span>
      </div>
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

function HoldingsExperience({
  summary,
  query,
  holdings,
  totalMatches,
  view,
  onViewChange,
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  summary: UseQueryResult<PortfolioSummary>;
  query: UseQueryResult<PortfolioHolding[]>;
  holdings: PortfolioHolding[];
  totalMatches: number;
  view: "list" | "grid";
  onViewChange: (view: "list" | "grid") => void;
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const hasSearchResults = totalMatches > 0;
  return (
    <PortfolioPanel
      title="Your holdings"
      className="portfolio-panel--holdings-dedicated"
      header={
        <div className="portfolio-view-toggle" role="group" aria-label="Holdings view">
          <button
            type="button"
            className={view === "list" ? "is-active" : ""}
            aria-pressed={view === "list"}
            onClick={() => onViewChange("list")}
          >
            List view
          </button>
          <button
            type="button"
            className={view === "grid" ? "is-active" : ""}
            aria-pressed={view === "grid"}
            onClick={() => onViewChange("grid")}
          >
            Grid view
          </button>
        </div>
      }
    >
      {query.isLoading || summary.isLoading ? (
        <div className="portfolio-holdings-loading">
          <RowsSkeleton rows={3} />
        </div>
      ) : query.isError ? (
        <PanelError
          message="Your holdings are temporarily unavailable."
          retry={() => void query.refetch()}
        />
      ) : !query.data?.length ? (
        <PortfolioEmptyState
          className="portfolio-empty-state--holdings-page"
          icon={<Landmark aria-hidden="true" />}
          message="You don't own a Slice in any collectibles yet."
          detail="Explore the market to find a collectible you'd like to own."
        />
      ) : !hasSearchResults ? (
        <PortfolioEmptyState
          className="portfolio-empty-state--holdings-page"
          icon={<ChartNoAxesCombined aria-hidden="true" />}
          message="No holdings match your search."
          detail="Clear your search or asset-class filter to see your holdings."
        />
      ) : view === "grid" ? (
        <div className="portfolio-holdings-grid">
          {holdings.map((holding) => (
            <HoldingCard key={holding.assetId} holding={holding} />
          ))}
        </div>
      ) : (
        <div className="portfolio-table-wrap portfolio-table-wrap--holdings-dedicated" tabIndex={0}>
          <table className="portfolio-table portfolio-table--holdings-dedicated">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Ownership</th>
                <th>Available</th>
                <th>Price per Slice</th>
                <th>Current value</th>
                <th>P/L (unrealised)</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {holdings.map((holding) => (
                <HoldingRow key={holding.assetId} holding={holding} />
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasSearchResults ? (
        <HoldingsPagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          onPageChange={onPageChange}
          onPageSizeChange={onPageSizeChange}
        />
      ) : null}
    </PortfolioPanel>
  );
}

function HoldingCard({ holding }: { holding: PortfolioHolding }) {
  const valuation = deriveHoldingValuation(holding);
  const media = holding.slug ? assetShowcaseMedia(holding.slug) : undefined;
  const currentSlicePrice =
    holding.estimatedValueMinor && BigInt(holding.ownedUnits) > 0n
      ? (BigInt(holding.estimatedValueMinor) / BigInt(holding.ownedUnits)).toString()
      : null;
  return (
    <article className="portfolio-holding-card">
      <div className="portfolio-holding-card__media">
        <span aria-hidden="true">{media ? <img src={media.src} alt="" /> : <Landmark />}</span>
      </div>
      <div className="portfolio-holding-card__body">
        <h3>{holdingDisplayLabel(holding)}</h3>
        <p>{[holding.category, holding.grade].filter(Boolean).join(" · ") || "Collectible"}</p>
        <dl>
          <div>
            <dt>Ownership</dt>
            <dd>
              {holding.totalUnits
                ? `${ownershipPercent(holding.ownedUnits, holding.totalUnits)}%`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Available</dt>
            <dd>
              {holding.totalUnits
                ? `${ownershipPercent(holding.availableUnits, holding.totalUnits)}%`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Price per Slice</dt>
            <dd>{currentSlicePrice ? formatPortfolioMoney(currentSlicePrice) : "Unavailable"}</dd>
          </div>
          <div>
            <dt>Current value</dt>
            <dd>
              {holding.estimatedValueMinor
                ? formatPortfolioMoney(holding.estimatedValueMinor)
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>P/L</dt>
            <dd
              className={
                valuation && BigInt(valuation.unrealisedValueMinor) < 0n ? "is-debit" : "is-credit"
              }
            >
              {valuation
                ? formatSignedPortfolioMoney(valuation.unrealisedValueMinor)
                : "Unavailable"}
            </dd>
          </div>
        </dl>
        {holding.slug ? (
          <Link to="/asset/$id" params={{ id: holding.slug }} className="portfolio-table__action">
            View <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </article>
  );
}

function HoldingsPagination({
  page,
  pageCount,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  return (
    <footer className="portfolio-holdings-pagination">
      <label>
        Show{" "}
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>{" "}
        per page
      </label>
      <div aria-label="Holdings pages">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          ‹
        </button>
        <strong>{page}</strong>
        <button
          type="button"
          aria-label="Next page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          ›
        </button>
      </div>
    </footer>
  );
}

function HoldingsPanel({
  summary,
  query,
  categories,
  filter,
  onFilterChange,
  visibleHoldings,
  compact = false,
}: {
  summary: UseQueryResult<PortfolioSummary>;
  query: UseQueryResult<PortfolioHolding[]>;
  categories: string[];
  filter: HoldingFilter;
  onFilterChange: (filter: HoldingFilter) => void;
  visibleHoldings: PortfolioHolding[] | undefined;
  compact?: boolean;
}) {
  return (
    <PortfolioPanel
      title={query.data ? `Your holdings (${query.data.length})` : "Your holdings"}
      className="portfolio-panel--holdings"
      header={
        <div className="portfolio-holdings-header">
          {!compact ? (
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
          ) : (
            <Link to="/portfolio" search={{ tab: "holdings" }} className="portfolio-panel__link">
              View all holdings <ArrowRight aria-hidden="true" />
            </Link>
          )}
          {!compact ? (
            <span className="portfolio-market-freshness">
              Market values updated{" "}
              {query.data?.[0]?.valuationAsOf
                ? formatDateTime(query.data[0].valuationAsOf)
                : "when marks are available"}
            </span>
          ) : null}
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
                <th>Ownership</th>
                <th>Available</th>
                <th>Price per Slice</th>
                <th>Current value</th>
                <th>P/L (unrealised)</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleHoldings?.length ? (
                visibleHoldings.map((holding) => (
                  <HoldingRow key={holding.assetId} holding={holding} />
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

function HoldingRow({ holding }: { holding: PortfolioHolding }) {
  const valuation = deriveHoldingValuation(holding);
  const currentSlicePrice =
    holding.estimatedValueMinor && BigInt(holding.ownedUnits) > 0n
      ? (BigInt(holding.estimatedValueMinor) / BigInt(holding.ownedUnits)).toString()
      : null;
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
      <td data-label="Ownership">
        <span className="portfolio-table__quantity">
          <strong>
            {holding.totalUnits
              ? `${ownershipPercent(holding.ownedUnits, holding.totalUnits)}%`
              : "Ownership unavailable"}
          </strong>
          <small>{holding.ownedUnits} units owned</small>
        </span>
      </td>
      <td data-label="Available">
        <span className="portfolio-table__quantity">
          <strong>
            {holding.totalUnits
              ? `${ownershipPercent(holding.availableUnits, holding.totalUnits)}%`
              : "Unavailable"}
          </strong>
          <small>{holding.availableUnits} units available</small>
        </span>
      </td>
      <td data-label="Price per Slice">
        {currentSlicePrice ? formatPortfolioMoney(currentSlicePrice) : "Unavailable"}
      </td>
      <td data-label="Current value">
        {holding.estimatedValueMinor
          ? formatPortfolioMoney(holding.estimatedValueMinor)
          : "Unavailable"}
      </td>
      <td
        data-label="P/L (unrealised)"
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

function ActivityPanel({
  query,
  compact = false,
}: {
  query: UseQueryResult<{ items: PortfolioTransaction[] }>;
  compact?: boolean;
}) {
  return (
    <PortfolioPanel
      title="Recent activity"
      className="portfolio-panel--activity"
      header={
        compact ? (
          <Link to="/portfolio" search={{ tab: "activity" }} className="portfolio-panel__link">
            View all activity <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <span className="portfolio-panel__status">Account events</span>
        )
      }
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
          {query.data.items.slice(0, compact ? 3 : undefined).map((item, index) => (
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
function percentageOf(value: string, total: string) {
  const numerator = BigInt(value);
  const denominator = BigInt(total);
  if (denominator <= 0n) return null;
  const sign = numerator > 0n ? "+" : "";
  return `${sign}${(Number((numerator * 10_000n) / denominator) / 100).toFixed(2)}%`;
}
function ownershipPercent(units: string, total: string) {
  const denominator = BigInt(total);
  if (denominator <= 0n) return "0";
  const scaled = (BigInt(units) * 10_000n) / denominator;
  const whole = scaled / 100n;
  const fraction = (scaled % 100n).toString().padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : whole.toString();
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
