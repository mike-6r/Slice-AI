import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CalendarDays,
  ChartNoAxesCombined,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleGauge,
  Clock3,
  Landmark,
  Layers3,
  PieChart,
  RefreshCw,
  ShoppingCart,
  Wallet,
  WalletCards,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import { KpiIconTile } from "@/components/ui/KpiIconTile";
import type {
  Asset,
  PortfolioHolding,
  PortfolioSummary,
  PortfolioPerformance,
  PortfolioPerformanceRange,
  PortfolioTransaction,
  TradingExecution,
  TradingExecutionPage,
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
import {
  formatOrderStatus,
  isCancellable,
  isOpenOrder,
  orderNotionalMinor,
  type OrderSideFilter,
  type OrderTab,
  ordersForSide,
  ordersForTab,
} from "./-orders-presentation";

export const Route = createFileRoute("/portfolio")({
  head: () => ({ meta: [{ title: "Portfolio | Slice" }] }),
  validateSearch: (search: Record<string, unknown>): PortfolioSearch => ({
    tab: ["overview", "holdings", "orders", "activity"].includes(String(search.tab))
      ? (String(search.tab) as PortfolioTab)
      : "overview",
    activityType: ["all", "trading", "cash", "ownership", "distributions"].includes(
      String(search.activityType),
    )
      ? (String(search.activityType) as ActivityFilter)
      : "all",
    activityRange: ["7d", "30d", "90d", "all"].includes(String(search.activityRange))
      ? (String(search.activityRange) as ActivityRange)
      : "30d",
    activityPage: Math.max(1, Number(search.activityPage ?? 1)),
    activityPageSize: [10, 25, 50].includes(Number(search.activityPageSize))
      ? Number(search.activityPageSize)
      : 10,
  }),
  component: Portfolio,
});

type HoldingFilter = "ALL" | string;
type PortfolioTab = "overview" | "holdings" | "orders" | "activity";
type ActivityFilter = "all" | "trading" | "cash" | "ownership" | "distributions";
type ActivityRange = "7d" | "30d" | "90d" | "all";
type PortfolioSearch = {
  tab?: PortfolioTab;
  activityType?: ActivityFilter;
  activityRange?: ActivityRange;
  activityPage?: number;
  activityPageSize?: number;
};

function activityQueryRetry(failureCount: number, error: unknown) {
  if (
    error instanceof ApiError &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status < 500
  )
    return false;
  return failureCount < 2;
}

export function Portfolio() {
  useCurrency();
  const services = useAppServices();
  const { isAuthenticated } = useSession();
  const queryClient = useQueryClient();
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
  const activityTransactions = useQuery({
    queryKey: queryKeys.portfolio.transactions("activity"),
    queryFn: () => services.portfolio.transactions({ limit: 50 }),
    enabled: isAuthenticated && tab === "activity",
    staleTime: 15_000,
    retry: activityQueryRetry,
  });
  const accountActivity = useQuery({
    queryKey: queryKeys.account.activity("activity"),
    queryFn: () => services.account.activity({ limit: 50 }),
    enabled: isAuthenticated && tab === "activity",
    staleTime: 15_000,
    retry: activityQueryRetry,
  });
  const orders = useQuery({
    queryKey: queryKeys.trading.orders,
    queryFn: () => services.trading.orders({ limit: 100 }),
    enabled: isAuthenticated,
  });
  const executions = useQuery({
    queryKey: queryKeys.trading.executions(),
    queryFn: () => services.trading.executions({ limit: 100 }),
    enabled: isAuthenticated && (tab === "orders" || tab === "activity"),
  });
  const assets = useQuery({
    queryKey: [...queryKeys.assets.all, "portfolio-orders"],
    queryFn: () => services.assets.list({ limit: 48, sort: "title" }),
    enabled: isAuthenticated && (tab === "orders" || tab === "activity"),
    staleTime: 30_000,
  });
  const performance = useQuery({
    queryKey: ["portfolio", "performance", performanceRange],
    queryFn: () => services.portfolio.performance(performanceRange),
    enabled: isAuthenticated,
  });
  const previousTab = useRef(tab);
  useEffect(() => {
    if (previousTab.current === tab) return;
    previousTab.current = tab;
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [tab]);
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
        {tab === "holdings" ? (
          <HoldingsKpis query={summary} />
        ) : tab === "overview" ? (
          <PortfolioKpis query={summary} />
        ) : null}
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
          <PortfolioOrdersExperience
            query={orders}
            executions={executions}
            holdings={holdingsForOrders}
            assets={assets.data?.items ?? []}
            onRefresh={() => {
              void queryClient.invalidateQueries({ queryKey: queryKeys.trading.orders });
              void queryClient.invalidateQueries({ queryKey: queryKeys.trading.executions() });
            }}
          />
        ) : (
          <PortfolioActivityExperience
            accountActivity={accountActivity}
            transactions={activityTransactions}
            orders={orders}
            executions={executions}
            assets={assets.data?.items ?? []}
            holdings={holdingsForOrders}
          />
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
          search={
            tab === "activity"
              ? { tab }
              : {
                  tab,
                  activityType: undefined,
                  activityRange: undefined,
                  activityPage: undefined,
                  activityPageSize: undefined,
                }
          }
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

function PortfolioOrdersExperience({
  query,
  executions,
  holdings,
  assets,
  onRefresh,
}: {
  query: UseQueryResult<TradingOrderPage>;
  executions: UseQueryResult<{ items: TradingExecution[] }>;
  holdings: PortfolioHolding[];
  assets: Asset[];
  onRefresh: () => void;
}) {
  const services = useAppServices();
  const [tab, setTab] = useState<OrderTab>("ALL");
  const [side, setSide] = useState<OrderSideFilter>("ALL");
  const [status, setStatus] = useState("ALL");
  const [assetClass, setAssetClass] = useState("ALL");
  const [dateRange, setDateRange] = useState<"7" | "30" | "90" | "all">("30");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(5);
  const [selectedOrder, setSelectedOrder] = useState<TradingOrderView | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const cancellation = useMutation({
    mutationFn: services.trading.cancelOrder,
    onSuccess: () => {
      setConfirmCancel(false);
      setSelectedOrder(null);
      onRefresh();
    },
  });
  const allOrders = useMemo(() => query.data?.items ?? [], [query.data?.items]);
  const holdingByAsset = useMemo(
    () => new Map(holdings.map((holding) => [holding.assetId, holding])),
    [holdings],
  );
  const assetById = useMemo(
    () => new Map(assets.map((asset) => [String(asset.id), asset])),
    [assets],
  );
  const assetBySlug = useMemo(
    () => new Map(assets.flatMap((asset) => (asset.slug ? [[asset.slug, asset] as const] : []))),
    [assets],
  );
  const filteredOrders = useMemo(() => {
    const normalized = search.trim().toLowerCase();
    const cutoff = dateRange === "all" ? null : Date.now() - Number(dateRange) * 86_400_000;
    return ordersForSide(ordersForTab(allOrders, tab), side).filter((order) => {
      const asset = resolveOrderAsset(order, assetById, assetBySlug);
      const holding = holdingByAsset.get(order.assetId);
      const haystack = [
        asset?.details.title,
        asset?.details.card?.playerOrCharacter,
        asset?.details.card?.set,
        asset?.details.card?.cardNumber,
        holding?.title,
        holding?.category,
        holding?.grade,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return (
        (!normalized || haystack.includes(normalized)) &&
        (status === "ALL" || (status === "OPEN" ? isOpenOrder(order) : order.status === status)) &&
        (assetClass === "ALL" ||
          resolveOrderCategory(order, holdingByAsset, assetById, assetBySlug) === assetClass) &&
        (!cutoff || new Date(order.createdAt).getTime() >= cutoff)
      );
    });
  }, [
    allOrders,
    assetClass,
    assetById,
    assetBySlug,
    dateRange,
    holdingByAsset,
    search,
    side,
    status,
    tab,
  ]);
  const pageCount = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const visibleOrders = filteredOrders.slice((page - 1) * pageSize, page * pageSize);
  const categories = Array.from(
    new Set(
      allOrders
        .map((order) => resolveOrderCategory(order, holdingByAsset, assetById, assetBySlug))
        .filter(Boolean),
    ),
  ) as string[];
  const counts = {
    all: allOrders.length,
    open: allOrders.filter(isOpenOrder).length,
    filled: allOrders.filter((order) => order.status === "FILLED").length,
    cancelled: allOrders.filter((order) => order.status === "CANCELLED").length,
  };
  const openOrders = allOrders.filter(isOpenOrder);
  const filledOrders = allOrders.filter((order) => order.status === "FILLED");
  const cancelledOrders = allOrders.filter((order) => order.status === "CANCELLED");
  const filledUnits = allOrders.reduce((total, order) => total + BigInt(order.filledUnits), 0n);
  const requestedUnits = allOrders
    .filter((order) => order.filledUnits !== "0")
    .reduce((total, order) => total + BigInt(order.originalUnits), 0n);
  const fillRate =
    requestedUnits > 0n
      ? `${(Number((filledUnits * 10_000n) / requestedUnits) / 100).toFixed(1)}%`
      : "Unavailable";
  const resetFilters = () => {
    setSearch("");
    setSide("ALL");
    setStatus("ALL");
    setAssetClass("ALL");
    setDateRange("30");
    setPage(1);
  };
  const emptyMessage =
    search || status !== "ALL" || side !== "ALL" || assetClass !== "ALL"
      ? "No orders match these filters."
      : tab === "OPEN"
        ? "You don't have any open orders."
        : tab === "FILLED"
          ? "You don't have any filled orders yet."
          : tab === "CANCELLED"
            ? "You don't have any cancelled orders."
            : "You haven't placed any orders yet.";
  return (
    <>
      <OrdersKpis
        open={openOrders}
        filled={filledOrders}
        cancelled={cancelledOrders}
        fillRate={fillRate}
        executions={executions.data?.items ?? []}
      />
      <nav className="portfolio-order-tabs" aria-label="Order status">
        {(
          [
            ["ALL", "All Orders", counts.all],
            ["OPEN", "Open", counts.open],
            ["FILLED", "Filled", counts.filled],
            ["CANCELLED", "Cancelled", counts.cancelled],
          ] as const
        ).map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            className={tab === value ? "is-active" : ""}
            onClick={() => {
              setTab(value);
              setStatus("ALL");
              setPage(1);
            }}
          >
            {label}
            <strong>{count}</strong>
          </button>
        ))}
      </nav>
      <PortfolioPanel
        title="Orders"
        className="portfolio-orders-page"
        header={<span className="portfolio-panel__status">Newest first</span>}
      >
        <div className="portfolio-orders-filters">
          <label>
            <span className="sr-only">Search orders</span>
            <input
              type="search"
              placeholder="Search orders..."
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label>
            <span className="sr-only">Order side</span>
            <select
              value={side}
              onChange={(event) => {
                setSide(event.target.value as OrderSideFilter);
                setPage(1);
              }}
            >
              <option value="ALL">All Sides</option>
              <option value="BUY">Buy</option>
              <option value="SELL">Sell</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Order status</span>
            <select
              value={status}
              onChange={(event) => {
                setStatus(event.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Statuses</option>
              <option value="OPEN">Open</option>
              <option value="PARTIALLY_FILLED">Partially Filled</option>
              <option value="FILLED">Filled</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Asset class</span>
            <select
              value={assetClass}
              onChange={(event) => {
                setAssetClass(event.target.value);
                setPage(1);
              }}
            >
              <option value="ALL">All Asset Classes</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Date range</span>
            <select
              value={dateRange}
              onChange={(event) => {
                setDateRange(event.target.value as typeof dateRange);
                setPage(1);
              }}
            >
              <option value="7">Last 7 days</option>
              <option value="30">Last 30 days</option>
              <option value="90">Last 90 days</option>
              <option value="all">All time</option>
            </select>
          </label>
        </div>
        {query.isLoading ? (
          <RowsSkeleton rows={5} />
        ) : query.isError ? (
          <PanelError
            message="Your orders are temporarily unavailable."
            retry={() => void query.refetch()}
          />
        ) : !visibleOrders.length ? (
          <div className="portfolio-orders-empty">
            <PanelEmpty message={emptyMessage} />
            {emptyMessage === "No orders match these filters." ? (
              <button type="button" onClick={resetFilters}>
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <>
            <div className="portfolio-orders-table-wrap">
              <table className="portfolio-orders-table portfolio-orders-table--approved">
                <thead>
                  <tr>
                    <th>Asset</th>
                    <th>Side</th>
                    <th>Type</th>
                    <th>Ownership</th>
                    <th>Units</th>
                    <th>Price per Slice</th>
                    <th>Limit Price</th>
                    <th>Filled</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {visibleOrders.map((order) => (
                    <OrderTableRow
                      key={order.id}
                      order={order}
                      holding={holdingByAsset.get(order.assetId)}
                      asset={resolveOrderAsset(order, assetById, assetBySlug)}
                      onSelect={setSelectedOrder}
                    />
                  ))}
                </tbody>
              </table>
            </div>
            <div className="portfolio-orders-mobile">
              {visibleOrders.map((order) => (
                <OrderMobileCard
                  key={order.id}
                  order={order}
                  holding={holdingByAsset.get(order.assetId)}
                  asset={resolveOrderAsset(order, assetById, assetBySlug)}
                  onSelect={setSelectedOrder}
                />
              ))}
            </div>
            <OrdersPagination
              page={page}
              pageCount={pageCount}
              pageSize={pageSize}
              total={filteredOrders.length}
              onPageChange={setPage}
              onPageSizeChange={(value) => {
                setPageSize(value);
                setPage(1);
              }}
            />
          </>
        )}
      </PortfolioPanel>
      {selectedOrder ? (
        <OrderDetailDialog
          order={selectedOrder}
          holding={holdingByAsset.get(selectedOrder.assetId)}
          asset={resolveOrderAsset(selectedOrder, assetById, assetBySlug)}
          executions={executions.data?.items ?? []}
          confirming={confirmCancel}
          cancellation={cancellation}
          onClose={() => {
            setSelectedOrder(null);
            setConfirmCancel(false);
          }}
          onConfirm={() => cancellation.mutate(selectedOrder.id)}
          onConfirmCancel={() => setConfirmCancel(true)}
        />
      ) : null}
    </>
  );
}

function OrdersKpis({
  open,
  filled,
  cancelled,
  fillRate,
  executions,
}: {
  open: TradingOrderView[];
  filled: TradingOrderView[];
  cancelled: TradingOrderView[];
  fillRate: string;
  executions: TradingExecution[];
}) {
  const openValue = open
    .reduce((total, order) => total + BigInt(orderNotionalMinor(order, order.remainingUnits)), 0n)
    .toString();
  const filledValue = executions
    .reduce(
      (total, execution) => total + BigInt(execution.priceMinor) * BigInt(execution.units),
      0n,
    )
    .toString();
  const cancelledValue = cancelled
    .reduce((total, order) => total + BigInt(orderNotionalMinor(order, order.remainingUnits)), 0n)
    .toString();
  return (
    <section className="portfolio-order-kpis" aria-label="Orders summary">
      <PortfolioKpi
        label="Open orders"
        value={String(open.length)}
        detail={`${formatPortfolioMoney(openValue)} order value`}
        icon={Clock3}
      />
      <PortfolioKpi
        label="Filled orders"
        value={String(filled.length)}
        detail={`${formatPortfolioMoney(filledValue)} executed value`}
        icon={ChartNoAxesCombined}
      />
      <PortfolioKpi
        label="Cancelled orders"
        value={String(cancelled.length)}
        detail={`${formatPortfolioMoney(cancelledValue)} remaining value`}
        icon={CircleGauge}
      />
      <PortfolioKpi
        label="Avg. fill rate"
        value={fillRate}
        detail="Across filled and partially filled orders"
        icon={ArrowUpRight}
      />
    </section>
  );
}

function OrderTableRow({
  order,
  holding,
  asset,
  onSelect,
}: {
  order: TradingOrderView;
  holding?: PortfolioHolding;
  asset?: Asset;
  onSelect: (order: TradingOrderView) => void;
}) {
  return (
    <tr>
      <td>
        <OrderAssetIdentity order={order} holding={holding} asset={asset} />
      </td>
      <td>
        <span className={`portfolio-order-side is-${order.side.toLowerCase()}`}>{order.side}</span>
      </td>
      <td>{order.type}</td>
      <td>
        {order.requestedOwnershipPercent ? (
          <>
            <strong>{order.requestedOwnershipPercent}%</strong>
            <small>of total</small>
          </>
        ) : (
          "Unavailable"
        )}
      </td>
      <td>
        <strong>{order.originalUnits}</strong>
        <small>units</small>
      </td>
      <td>
        <strong>
          {holdingSlicePrice(holding)
            ? formatPortfolioMoney(holdingSlicePrice(holding) as string)
            : "Market unavailable"}
        </strong>
      </td>
      <td>
        <strong>{formatPortfolioMoney(order.limitPriceMinor)}</strong>
        <small>per Slice</small>
      </td>
      <td>
        <strong>
          {order.filledUnits} / {order.originalUnits}
        </strong>
        <small>{fillPercent(order)}%</small>
      </td>
      <td>
        <span className={`portfolio-order-status is-${order.status.toLowerCase()}`}>
          {formatOrderStatus(order.status)}
        </span>
      </td>
      <td>{formatDateTime(order.createdAt)}</td>
      <td>
        <button
          type="button"
          className="portfolio-order-view"
          aria-label={`View order for ${holdingDisplayLabel(holding ?? ({ title: asset?.details.title } as PortfolioHolding))}`}
          onClick={() => onSelect(order)}
        >
          <ArrowRight aria-hidden="true" />
        </button>
      </td>
    </tr>
  );
}

function OrderMobileCard({
  order,
  holding,
  asset,
  onSelect,
}: {
  order: TradingOrderView;
  holding?: PortfolioHolding;
  asset?: Asset;
  onSelect: (order: TradingOrderView) => void;
}) {
  return (
    <article className="portfolio-order-mobile-card">
      <OrderAssetIdentity order={order} holding={holding} asset={asset} />
      <div className="portfolio-order-mobile-card__badges">
        <span className={`portfolio-order-side is-${order.side.toLowerCase()}`}>{order.side}</span>
        <span className={`portfolio-order-status is-${order.status.toLowerCase()}`}>
          {formatOrderStatus(order.status)}
        </span>
      </div>
      <dl>
        <div>
          <dt>Ownership</dt>
          <dd>
            {order.requestedOwnershipPercent
              ? `${order.requestedOwnershipPercent}%`
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Units</dt>
          <dd>{order.originalUnits}</dd>
        </div>
        <div>
          <dt>Market price</dt>
          <dd>
            {holdingSlicePrice(holding)
              ? formatPortfolioMoney(holdingSlicePrice(holding) as string)
              : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Limit price</dt>
          <dd>{formatPortfolioMoney(order.limitPriceMinor)}</dd>
        </div>
        <div>
          <dt>Filled</dt>
          <dd>{fillPercent(order)}%</dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatDateTime(order.createdAt)}</dd>
        </div>
      </dl>
      <button type="button" onClick={() => onSelect(order)}>
        View order <ArrowRight aria-hidden="true" />
      </button>
    </article>
  );
}

function OrdersPagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (value: number) => void;
}) {
  const start = total ? (page - 1) * pageSize + 1 : 0;
  return (
    <footer className="portfolio-orders-pagination">
      <span>
        Showing {start} to {Math.min(page * pageSize, total)} of {total} orders
      </span>
      <label>
        Show{" "}
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          <option value={5}>5</option>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>{" "}
        per page
      </label>
      <div>
        <button type="button" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          ‹
        </button>
        <strong>{page}</strong>
        <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
          ›
        </button>
      </div>
    </footer>
  );
}

function OrderDetailDialog({
  order,
  holding,
  asset,
  executions,
  confirming,
  cancellation,
  onClose,
  onConfirm,
  onConfirmCancel,
}: {
  order: TradingOrderView;
  holding?: PortfolioHolding;
  asset?: Asset;
  executions: TradingExecution[];
  confirming: boolean;
  cancellation: ReturnType<typeof useMutation<TradingOrderView, Error, string>>;
  onClose: () => void;
  onConfirm: () => void;
  onConfirmCancel: () => void;
}) {
  const matchingExecutions = executions.filter(
    (execution) =>
      execution.assetSlug && execution.assetSlug === (holding?.slug ?? order.assetSlug),
  );
  return (
    <div
      className="portfolio-order-dialog-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        className="portfolio-order-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="portfolio-order-dialog-title"
      >
        <button
          type="button"
          className="portfolio-order-dialog__close"
          onClick={onClose}
          aria-label="Close order details"
        >
          ×
        </button>
        <p className="page-kicker">Order details</p>
        <h2 id="portfolio-order-dialog-title">
          {holdingDisplayLabel(holding ?? ({ title: asset?.details.title } as PortfolioHolding))}
        </h2>
        <OrderAssetIdentity order={order} holding={holding} asset={asset} />
        <dl className="portfolio-order-detail-grid">
          <div>
            <dt>Side / type</dt>
            <dd>
              {order.side} · {order.type}
            </dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{formatOrderStatus(order.status)}</dd>
          </div>
          <div>
            <dt>Requested ownership</dt>
            <dd>
              {order.requestedOwnershipPercent
                ? `${order.requestedOwnershipPercent}%`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Filled ownership</dt>
            <dd>{order.filledOwnershipPercent ? `${order.filledOwnershipPercent}%` : "0%"}</dd>
          </div>
          <div>
            <dt>Remaining ownership</dt>
            <dd>
              {order.remainingOwnershipPercent ? `${order.remainingOwnershipPercent}%` : "0%"}
            </dd>
          </div>
          <div>
            <dt>Units</dt>
            <dd>
              {order.filledUnits} filled · {order.remainingUnits} remaining of {order.originalUnits}
            </dd>
          </div>
          <div>
            <dt>Limit price</dt>
            <dd>{formatPortfolioMoney(order.limitPriceMinor)} per Slice</dd>
          </div>
          <div>
            <dt>Average fill</dt>
            <dd>
              {order.averageFillPriceMinor
                ? formatPortfolioMoney(order.averageFillPriceMinor)
                : "Not filled"}
            </dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDateTime(order.createdAt)}</dd>
          </div>
        </dl>
        {matchingExecutions.length ? (
          <div className="portfolio-order-executions">
            <h3>Executions</h3>
            {matchingExecutions.map((execution) => (
              <p key={execution.executionId}>
                {formatDateTime(execution.executedAt)} · {execution.units} units ·{" "}
                {formatPortfolioMoney(execution.priceMinor)} per Slice
              </p>
            ))}
          </div>
        ) : null}
        {isCancellable(order) ? (
          confirming ? (
            <div className="portfolio-order-confirm">
              <strong>Cancel this order?</strong>
              <p>
                Filled portions remain completed. Only the remaining open quantity will be
                cancelled.
              </p>
              <button type="button" onClick={onConfirm} disabled={cancellation.isPending}>
                {cancellation.isPending ? "Cancelling…" : "Confirm cancellation"}
              </button>
              <button type="button" onClick={() => onConfirmCancel()}>
                Keep order
              </button>
            </div>
          ) : (
            <button type="button" className="portfolio-order-cancel" onClick={onConfirmCancel}>
              Cancel order
            </button>
          )
        ) : null}
      </section>
    </div>
  );
}

function OrderAssetIdentity({
  order,
  holding,
  asset,
}: {
  order: TradingOrderView;
  holding?: PortfolioHolding;
  asset?: Asset;
}) {
  const slug = holding?.slug ?? order.assetSlug;
  const media = slug ? assetShowcaseMedia(slug) : undefined;
  const title = asset?.details.title ?? holding?.title ?? "Collectible";
  const content = (
    <>
      <span className="portfolio-order-asset__icon" aria-hidden="true">
        {media ? <img src={media.src} alt="" /> : <Landmark />}
      </span>
      <span className="portfolio-order-asset__copy">
        <strong>{title}</strong>
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

function fillPercent(order: TradingOrderView) {
  if (BigInt(order.originalUnits) <= 0n) return "0.00";
  return (
    Number((BigInt(order.filledUnits) * 10_000n) / BigInt(order.originalUnits)) / 100
  ).toFixed(2);
}

function holdingSlicePrice(holding?: PortfolioHolding) {
  if (!holding?.estimatedValueMinor || BigInt(holding.ownedUnits) <= 0n) return null;
  return (BigInt(holding.estimatedValueMinor) / BigInt(holding.ownedUnits)).toString();
}

function friendlyAssetCategory(category?: string) {
  if (!category) return undefined;
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function resolveOrderAsset(
  order: TradingOrderView,
  assetById: Map<string, Asset>,
  assetBySlug: Map<string, Asset>,
) {
  return (
    assetById.get(order.assetId) ?? (order.assetSlug ? assetBySlug.get(order.assetSlug) : undefined)
  );
}

function resolveOrderCategory(
  order: TradingOrderView,
  holdingByAsset: Map<string, PortfolioHolding>,
  assetById: Map<string, Asset>,
  assetBySlug: Map<string, Asset>,
) {
  return (
    holdingByAsset.get(order.assetId)?.category ??
    friendlyAssetCategory(resolveOrderAsset(order, assetById, assetBySlug)?.details.category)
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
  const isOrders = tab === "orders";
  const isActivity = tab === "activity";
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
              : isOrders
                ? "Orders"
                : isActivity
                  ? "Activity"
                  : "Portfolio"}
          </span>
        </h1>
        <p>
          {isHoldings
            ? "A detailed view of the collectibles you own."
            : isOrders
              ? "Track and manage your active, filled and cancelled orders."
              : isActivity
                ? "A timeline of all activity in your account."
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
      ) : isOrders || isActivity ? (
        <span className="portfolio-heading__orders-spacer" aria-hidden="true" />
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
  const unrealisedPercent =
    summary.unrealisedPnlPercent ??
    (valuation ? percentageOf(valuation.unrealisedValueMinor, valuation.investedCostMinor) : null);
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
  const unrealisedPercent =
    query.data.unrealisedPnlPercent ??
    (valuation ? percentageOf(valuation.unrealisedValueMinor, valuation.investedCostMinor) : null);
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
                {query.data.estimatedHoldingsValueMinor
                  ? formatPortfolioMoney(query.data.estimatedHoldingsValueMinor)
                  : "Unavailable"}
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
  if (query.isError) {
    return (
      <PanelError
        message="We couldn't load performance history right now."
        retry={() => void query.refetch()}
      />
    );
  }
  if (points.length < 2) {
    return (
      <div className="portfolio-performance-limited">
        <ChartNoAxesCombined aria-hidden="true" />
        <div>
          <strong>
            {points.length
              ? "More history is needed to draw your performance chart."
              : "No portfolio performance history is available for this period."}
          </strong>
          <p>
            {points.length
              ? "A second legitimate snapshot is needed."
              : "History will appear after the snapshot engine records a portfolio point."}
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
                <th>Available to sell</th>
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
                ? `${holding.userOwnershipPercent ?? ownershipPercent(holding.ownedUnits, holding.totalUnits)}%`
                : "Unavailable"}
            </dd>
          </div>
          <div>
            <dt>Available to sell</dt>
            <dd>
              {holding.totalUnits
                ? `${holding.availableToSellPercent ?? ownershipPercent(holding.availableToSellUnits ?? holding.availableUnits, holding.totalUnits)}%`
                : "Unavailable"}
              {holding.availableToBuyPercent !== null &&
              holding.availableToBuyPercent !== undefined ? (
                <small>Market: {holding.availableToBuyPercent}% available to buy</small>
              ) : null}
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
                <th>Available to sell</th>
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
                      detail="Holdings appear here after a collectible is issued or acquired."
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
              ? `${holding.userOwnershipPercent ?? ownershipPercent(holding.ownedUnits, holding.totalUnits)}%`
              : "Ownership unavailable"}
          </strong>
          <small>{holding.ownedUnits} units owned</small>
        </span>
      </td>
      <td data-label="Available to sell">
        <span className="portfolio-table__quantity">
          <strong>
            {holding.totalUnits
              ? `${holding.availableToSellPercent ?? ownershipPercent(holding.availableToSellUnits ?? holding.availableUnits, holding.totalUnits)}%`
              : "Unavailable"}
          </strong>
          <small>
            {holding.availableToSellUnits ?? holding.availableUnits} units sellable
            {holding.availableToBuyPercent !== null && holding.availableToBuyPercent !== undefined
              ? ` · ${holding.availableToBuyPercent}% available to buy`
              : ""}
          </small>
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
              {holding.unrealisedPnlPercent
                ? `${holding.unrealisedPnlPercent}%`
                : (percentageOf(valuation.unrealisedValueMinor, holding.costBasisMinor as string) ??
                  "—")}
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

type ActivityEventCategory = "TRADING" | "CASH" | "OWNERSHIP" | "DISTRIBUTIONS" | "ACCOUNT";
type ActivityEvent = {
  id: string;
  category: ActivityEventCategory;
  title: string;
  description: string;
  occurredAt: string;
  typeLabel: string;
  tone: "credit" | "debit" | "neutral" | "ownership";
  primary: string;
  secondary: string[];
  moneyMinor?: string;
  asset?: {
    slug: string | null;
    title: string;
    category: string;
    grade: string | null;
    mediaUrl: string | null;
  };
  details: Array<{ label: string; value: string }>;
  reference?: string | null;
  target: "orders" | "asset" | "none";
};

type ActivityAccountItem = {
  reference: string;
  type: string;
  title: string;
  description: string;
  createdAt: string;
};

function PortfolioActivityExperience({
  accountActivity,
  transactions,
  orders,
  executions,
  assets,
  holdings,
}: {
  accountActivity: UseQueryResult<
    { items: ActivityAccountItem[]; nextCursor: string | null },
    unknown
  >;
  transactions: UseQueryResult<
    { items: PortfolioTransaction[]; nextCursor?: string | null },
    unknown
  >;
  orders: UseQueryResult<TradingOrderPage, unknown>;
  executions: UseQueryResult<TradingExecutionPage, unknown>;
  assets: Asset[];
  holdings: PortfolioHolding[];
}) {
  const navigate = useNavigate({ from: Route.fullPath });
  const search = Route.useSearch();
  const filter = search.activityType ?? "all";
  const range = search.activityRange ?? "30d";
  const page = Math.max(1, search.activityPage ?? 1);
  const pageSize = search.activityPageSize ?? 10;
  const [selected, setSelected] = useState<ActivityEvent | null>(null);
  const allEvents = useMemo(
    () =>
      buildPortfolioActivityEvents(
        accountActivity.data?.items ?? [],
        transactions.data?.items ?? [],
        orders.data?.items ?? [],
        executions.data?.items ?? [],
        assets,
        holdings,
      ),
    [
      accountActivity.data?.items,
      assets,
      executions.data?.items,
      holdings,
      orders.data?.items,
      transactions.data?.items,
    ],
  );
  const filteredEvents = useMemo(() => {
    const cutoff = range === "all" ? null : Date.now() - Number(range.slice(0, -1)) * 86_400_000;
    return allEvents.filter((event) => {
      const inCategory =
        filter === "all" ||
        (filter === "trading" && event.category === "TRADING") ||
        (filter === "cash" && event.category === "CASH") ||
        (filter === "ownership" && event.category === "OWNERSHIP") ||
        (filter === "distributions" && event.category === "DISTRIBUTIONS");
      return inCategory && (cutoff === null || new Date(event.occurredAt).getTime() >= cutoff);
    });
  }, [allEvents, filter, range]);
  const pageCount = Math.max(1, Math.ceil(filteredEvents.length / pageSize));
  const visibleEvents = filteredEvents.slice((page - 1) * pageSize, page * pageSize);
  const hasDistributionEvents = allEvents.some((event) => event.category === "DISTRIBUTIONS");
  const failed = accountActivity.isError || transactions.isError || executions.isError;
  // Disabled queries have an idle fetch status even though TanStack Query may
  // report them as pending. Only an active request should keep the skeleton up.
  const loading =
    !failed && (accountActivity.isFetching || transactions.isFetching || executions.isFetching);
  const updateSearch = (patch: Partial<PortfolioSearch>) => {
    void navigate({
      search: (current) => ({ ...current, tab: "activity", ...patch }),
      replace: true,
    });
  };
  const emptyMessage =
    filter === "trading"
      ? "You don't have any trading activity yet."
      : filter === "cash"
        ? "You don't have any cash activity in this period."
        : filter === "ownership"
          ? "You don't have any ownership changes in this period."
          : filter === "distributions"
            ? "You don't have any distributions in this period."
            : "Your account activity will appear here.";

  return (
    <PortfolioPanel
      title="Account activity"
      className="portfolio-panel--activity-dedicated"
      header={
        <div className="portfolio-activity-header">
          <div className="portfolio-activity-filters" role="tablist" aria-label="Activity type">
            {(
              [
                ["all", "All Activity"],
                ["trading", "Trading"],
                ["cash", "Cash"],
                ["ownership", "Ownership"],
                ...(hasDistributionEvents ? [["distributions", "Distributions"]] : []),
              ] as Array<[ActivityFilter, string]>
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={filter === value}
                className={filter === value ? "is-active" : ""}
                aria-pressed={filter === value}
                onClick={() => updateSearch({ activityType: value, activityPage: 1 })}
              >
                {label}
              </button>
            ))}
          </div>
          <label className="portfolio-activity-date-filter">
            <CalendarDays aria-hidden="true" />
            <span className="sr-only">Activity date range</span>
            <select
              value={range}
              onChange={(event) =>
                updateSearch({
                  activityRange: event.target.value as ActivityRange,
                  activityPage: 1,
                })
              }
            >
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
              <option value="90d">Last 90 days</option>
              <option value="all">All time</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
        </div>
      }
    >
      {loading ? (
        <div className="portfolio-activity-loading">
          <RowsSkeleton rows={5} />
        </div>
      ) : failed ? (
        <PanelError
          message="We couldn't load your activity right now."
          retry={() => {
            void accountActivity.refetch();
            void transactions.refetch();
            void executions.refetch();
          }}
        />
      ) : !visibleEvents.length ? (
        <PortfolioEmptyState
          className="portfolio-empty-state--activity-page"
          icon={<Clock3 aria-hidden="true" />}
          message={emptyMessage}
          detail={
            filter === "trading"
              ? "Explore Markets to find a collectible to own."
              : "Try another date range or activity filter."
          }
        />
      ) : (
        <>
          <div className="portfolio-activity-table" role="table" aria-label="Account activity">
            <div className="portfolio-activity-table__head" role="row">
              <span>Activity</span>
              <span>Asset / details</span>
              <span>Type</span>
              <span>Amount</span>
              <span>Date &amp; time</span>
              <span aria-hidden="true" />
            </div>
            {visibleEvents.map((event) => (
              <ActivityEventRow key={event.id} event={event} onOpen={() => setSelected(event)} />
            ))}
          </div>
          <PortfolioActivityPagination
            page={page}
            pageCount={pageCount}
            pageSize={pageSize}
            total={filteredEvents.length}
            onPageChange={(next) => updateSearch({ activityPage: next })}
            onPageSizeChange={(next) => updateSearch({ activityPageSize: next, activityPage: 1 })}
          />
        </>
      )}
      {selected ? (
        <ActivityDetailDialog event={selected} onClose={() => setSelected(null)} />
      ) : null}
    </PortfolioPanel>
  );
}

function ActivityEventRow({ event, onOpen }: { event: ActivityEvent; onOpen: () => void }) {
  const Icon = activityIcon(event);
  return (
    <button type="button" className="portfolio-activity-event" role="row" onClick={onOpen}>
      <span className="portfolio-activity-event__activity">
        <span className={`portfolio-activity-event__icon is-${event.tone}`} aria-hidden="true">
          <Icon />
        </span>
        <span className="portfolio-activity-event__summary">
          <strong>{event.title}</strong>
          <small>{event.description}</small>
        </span>
      </span>
      <span className="portfolio-activity-event__asset">
        {event.asset ? (
          <>
            <span className="portfolio-activity-event__thumb">
              {event.asset.mediaUrl ? (
                <img src={event.asset.mediaUrl} alt="" />
              ) : (
                <Landmark aria-hidden="true" />
              )}
            </span>
            <span>
              <strong>{event.asset.title}</strong>
              <small>
                {[event.asset.category, event.asset.grade].filter(Boolean).join(" · ") ||
                  "Collectible"}
              </small>
            </span>
          </>
        ) : (
          <span className="portfolio-activity-event__cash-detail">
            <strong>{event.secondary[0] ?? "Account activity"}</strong>
            <small>
              {event.reference ? `Reference: ${event.reference}` : "Customer account event"}
            </small>
          </span>
        )}
      </span>
      <span className={`portfolio-activity-event__badge is-${event.category.toLowerCase()}`}>
        {event.typeLabel}
      </span>
      <span className={`portfolio-activity-event__amount is-${event.tone}`}>
        <strong>{event.primary}</strong>
        <small>{event.secondary.slice(event.asset ? 0 : 1).join(" · ")}</small>
      </span>
      <span className="portfolio-activity-event__date">
        <strong>{formatActivityDate(event.occurredAt)}</strong>
        <small>{formatActivityTime(event.occurredAt)}</small>
      </span>
      <ChevronRight className="portfolio-activity-event__chevron" aria-hidden="true" />
    </button>
  );
}

function PortfolioActivityPagination({
  page,
  pageCount,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageCount: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
}) {
  const start = total ? (page - 1) * pageSize + 1 : 0;
  return (
    <footer className="portfolio-activity-pagination">
      <span>
        Showing {start} to {Math.min(page * pageSize, total)} of {total} activity items
      </span>
      <label>
        Show{" "}
        <select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>{" "}
        per page
      </label>
      <div>
        <button
          type="button"
          aria-label="Previous activity page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft />
        </button>
        <strong>{page}</strong>
        <button
          type="button"
          aria-label="Next activity page"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        >
          <ChevronRight />
        </button>
      </div>
    </footer>
  );
}

function ActivityDetailDialog({ event, onClose }: { event: ActivityEvent; onClose: () => void }) {
  return (
    <div
      className="portfolio-activity-dialog-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        className="portfolio-activity-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="activity-detail-title"
      >
        <header>
          <div>
            <p className="page-kicker">Activity detail</p>
            <h2 id="activity-detail-title">{event.title}</h2>
          </div>
          <button type="button" aria-label="Close activity detail" onClick={onClose}>
            <X />
          </button>
        </header>
        <p className="portfolio-activity-dialog__description">{event.description}</p>
        <dl>
          {event.details.map((detail) => (
            <div key={detail.label}>
              <dt>{detail.label}</dt>
              <dd>{detail.value}</dd>
            </div>
          ))}
        </dl>
        <footer>
          {event.target === "orders" ? (
            <Link to="/portfolio" search={{ tab: "orders" }} onClick={onClose}>
              View orders <ArrowRight aria-hidden="true" />
            </Link>
          ) : event.target === "asset" && event.asset?.slug ? (
            <Link to="/asset/$id" params={{ id: event.asset.slug }} onClick={onClose}>
              View collectible <ArrowRight aria-hidden="true" />
            </Link>
          ) : (
            <span />
          )}
          <button type="button" onClick={onClose}>
            Done
          </button>
        </footer>
      </section>
    </div>
  );
}

function buildPortfolioActivityEvents(
  accountItems: ActivityAccountItem[],
  transactions: PortfolioTransaction[],
  orders: TradingOrderView[],
  executions: TradingExecution[],
  assets: Asset[],
  holdings: PortfolioHolding[],
): ActivityEvent[] {
  const assetBySlug = new Map(
    assets.filter((asset) => asset.slug).map((asset) => [asset.slug!, asset]),
  );
  const holdingBySlug = new Map(
    holdings.filter((holding) => holding.slug).map((holding) => [holding.slug!, holding]),
  );
  const events: ActivityEvent[] = [];
  for (const execution of executions) {
    const order =
      orders.find(
        (candidate) =>
          candidate.assetSlug === execution.assetSlug &&
          candidate.side === execution.side &&
          new Date(candidate.createdAt).getTime() <= new Date(execution.executedAt).getTime() &&
          (!candidate.closedAt ||
            new Date(candidate.closedAt).getTime() >= new Date(execution.executedAt).getTime()),
      ) ?? null;
    const asset = activityAsset(
      assetBySlug.get(execution.assetSlug),
      holdingBySlug.get(execution.assetSlug),
    );
    const totalUnits = holdingBySlug.get(execution.assetSlug)?.totalUnits ?? null;
    const ownership = totalUnits ? ownershipPercent(execution.units, totalUnits) : null;
    const gross = (
      BigInt(execution.priceMinor) * BigInt(execution.units) +
      BigInt(execution.feeMinor)
    ).toString();
    const isBuy = execution.side === "BUY";
    const partial = order?.status === "PARTIALLY_FILLED";
    const title = `${isBuy ? "Buy" : "Sell"} order ${partial ? "partially filled" : "filled"}`;
    events.push({
      id: `execution:${execution.executionId}`,
      category: "TRADING",
      title,
      description: partial
        ? `Part of your ${isBuy ? "buy" : "sell"} order has been executed.`
        : `Your ${isBuy ? "buy" : "sell"} order was fully executed.`,
      occurredAt: execution.executedAt,
      typeLabel: "Trading",
      tone: isBuy ? "credit" : "debit",
      primary: ownership ? `${isBuy ? "+" : "-"}${ownership}%` : `${execution.units} units`,
      secondary: [
        `${execution.units} ownership units ${isBuy ? "acquired" : "sold"}`,
        formatPortfolioMoney(gross),
      ],
      moneyMinor: gross,
      asset,
      details: [
        ...(asset ? [{ label: "Asset", value: asset.title }] : []),
        { label: "Side", value: isBuy ? "Buy" : "Sell" },
        {
          label: "Ownership change",
          value: ownership ? `${isBuy ? "+" : "-"}${ownership}%` : "Unavailable",
        },
        { label: "Units", value: execution.units },
        { label: "Execution value", value: formatPortfolioMoney(gross) },
        { label: "Execution date", value: formatActivityDateTime(execution.executedAt) },
        { label: "Execution reference", value: execution.executionId.slice(0, 12) },
      ],
      target: asset?.slug ? "asset" : "orders",
    });
  }
  for (const order of orders.filter((item) => item.status === "CANCELLED")) {
    const asset = activityAsset(
      assetBySlug.get(order.assetSlug ?? ""),
      holdingBySlug.get(order.assetSlug ?? ""),
    );
    const totalUnits = holdingBySlug.get(order.assetSlug ?? "")?.totalUnits ?? null;
    const ownership = totalUnits ? ownershipPercent(order.originalUnits, totalUnits) : null;
    events.push({
      id: `order:${order.id}:cancelled`,
      category: "TRADING",
      title: `${order.side === "BUY" ? "Buy" : "Sell"} order cancelled`,
      description: "Your order was cancelled before execution.",
      occurredAt: order.closedAt ?? order.createdAt,
      typeLabel: "Trading",
      tone: "neutral",
      primary: ownership ? `${ownership}% order cancelled` : "Order cancelled",
      secondary: [
        `${order.originalUnits} ownership units`,
        `${formatPortfolioMoney(order.limitPriceMinor)} limit per Slice`,
      ],
      asset,
      details: [
        ...(asset ? [{ label: "Asset", value: asset.title }] : []),
        { label: "Side", value: order.side === "BUY" ? "Buy" : "Sell" },
        { label: "Requested ownership", value: ownership ? `${ownership}%` : "Unavailable" },
        { label: "Units cancelled", value: order.originalUnits },
        { label: "Limit price", value: formatPortfolioMoney(order.limitPriceMinor) },
        { label: "Date", value: formatActivityDateTime(order.closedAt ?? order.createdAt) },
      ],
      target: "orders",
    });
  }
  for (const item of transactions) {
    const type = item.type.toUpperCase();
    const isDeposit = type === "EXTERNAL_DEPOSIT" || type === "DEMO_FUNDING";
    const isWithdrawal = type === "EXTERNAL_WITHDRAWAL";
    const isDistribution = type === "DISTRIBUTION";
    if (!isDeposit && !isWithdrawal && !isDistribution) continue;
    const title = isDistribution
      ? "Distribution received"
      : isDeposit
        ? "Funds added"
        : "Cash withdrawal";
    const direction = isWithdrawal ? "-" : "+";
    events.push({
      id: `cash:${item.reference ?? item.effectiveAt}:${item.type}:${item.amountMinor}`,
      category: isDistribution ? "DISTRIBUTIONS" : "CASH",
      title,
      description: isDistribution
        ? "A distribution was credited to your account."
        : isDeposit
          ? "Money was added to your Slice wallet."
          : "Money was withdrawn from your Slice wallet.",
      occurredAt: item.effectiveAt,
      typeLabel: isDistribution ? "Distribution" : "Cash",
      tone: isWithdrawal ? "debit" : "credit",
      primary: `${direction}${formatPortfolioMoney(item.amountMinor).replace(/^-/, "")}`,
      secondary: [
        isDistribution
          ? "Distribution credited"
          : isDeposit
            ? "Added to wallet"
            : "Withdrawn from wallet",
        ...(item.reference ? [`Reference: ${item.reference}`] : []),
      ],
      moneyMinor: item.amountMinor,
      reference: item.reference,
      details: [
        {
          label: "Amount",
          value: `${direction}${formatPortfolioMoney(item.amountMinor).replace(/^-/, "")}`,
        },
        { label: "Status", value: item.status ?? "Posted" },
        { label: "Date", value: formatActivityDateTime(item.effectiveAt) },
        ...(item.reference ? [{ label: "Reference", value: item.reference }] : []),
      ],
      target: "none",
    });
  }
  for (const item of accountItems) {
    events.push({
      id: `account:${item.reference}`,
      category: "ACCOUNT",
      title: item.title,
      description: item.description,
      occurredAt: item.createdAt,
      typeLabel: "Account",
      tone: "neutral",
      primary: "—",
      secondary: ["Account event"],
      reference: item.reference,
      details: [
        { label: "Event", value: item.title },
        { label: "Date", value: formatActivityDateTime(item.createdAt) },
        { label: "Reference", value: item.reference },
      ],
      target: "none",
    });
  }
  return events.sort((a, b) => {
    const time = new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime();
    return time || b.id.localeCompare(a.id);
  });
}

function activityAsset(
  asset: Asset | undefined,
  holding: PortfolioHolding | undefined,
): ActivityEvent["asset"] {
  if (!asset && !holding) return undefined;
  const slug = asset?.slug ?? holding?.slug ?? null;
  const media =
    asset?.media.find((item) => item.kind === "image")?.url ??
    (slug ? assetShowcaseMedia(slug)?.src : undefined) ??
    null;
  return {
    slug,
    title: asset?.details.title ?? holding?.title ?? "Collectible",
    category: friendlyActivityCategory(asset?.details.category ?? holding?.category),
    grade: asset?.grade ? `${asset.grade.company} ${asset.grade.label}` : (holding?.grade ?? null),
    mediaUrl: media,
  };
}

function friendlyActivityCategory(category: string | undefined | null) {
  if (!category) return "Collectible";
  const labels: Record<string, string> = {
    pokemon: "Pokémon",
    football: "Football cards",
    basketball: "Basketball cards",
    baseball: "Baseball cards",
    "formula-1": "Formula 1 cards",
    magic: "Magic: The Gathering",
    yugioh: "Yu-Gi-Oh!",
  };
  return labels[category.toLowerCase()] ?? category;
}

function activityIcon(event: ActivityEvent): LucideIcon {
  if (event.category === "CASH") return event.tone === "debit" ? ArrowDownRight : Wallet;
  if (event.category === "OWNERSHIP") return PieChart;
  if (event.category === "TRADING") return event.tone === "neutral" ? XCircle : ShoppingCart;
  if (event.category === "DISTRIBUTIONS") return CheckCircle2;
  return CheckCircle2;
}

function formatActivityDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function formatActivityTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" }).format(
    new Date(value),
  );
}
function formatActivityDateTime(value: string) {
  return `${formatActivityDate(value)} ${formatActivityTime(value)}`;
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
