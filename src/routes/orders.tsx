import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleCheckBig,
  CircleHelp,
  Funnel,
  Landmark,
  ListOrdered,
  LockKeyhole,
  PoundSterling,
  RefreshCw,
  ShoppingCart,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { KpiIconTile } from "@/components/ui/KpiIconTile";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import type { Asset, PortfolioSummary, TradingExecution, TradingOrderView } from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { queryKeys } from "@/queries/keys";
import {
  formatOrderMoney,
  formatOrderStatus,
  isCancellable,
  isOpenOrder,
  ORDER_EMPTY_STATES,
  ORDER_ERROR_STATES,
  orderNotionalMinor,
  ordersForSide,
  ordersForTab,
  type OrderSideFilter,
  type OrderTab,
  sumOrderNotionalMinor,
} from "./-orders-presentation";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders | Slice" }] }),
  component: OrdersRedirect,
});

function OrdersRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/portfolio", search: { tab: "orders" }, replace: true });
  }, [navigate]);
  return (
    <main className="page-shell py-20 text-center">
      <p className="text-sm text-subtle">Opening Orders in your Portfolio…</p>
    </main>
  );
}

export function Orders() {
  useCurrency();
  const services = useAppServices();
  const { isAuthenticated } = useSession();
  const [tab, setTab] = useState<OrderTab>("OPEN");
  const [side, setSide] = useState<OrderSideFilter>("ALL");
  const [sort, setSort] = useState<"newest" | "oldest">("newest");
  const [confirmingOrderId, setConfirmingOrderId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const orders = useQuery({
    queryKey: queryKeys.trading.orders,
    queryFn: () => services.trading.orders({ limit: 100 }),
    enabled: isAuthenticated,
  });
  const executions = useQuery({
    queryKey: queryKeys.trading.executions(),
    queryFn: () => services.trading.executions({ limit: 100 }),
    enabled: isAuthenticated,
  });
  const assets = useQuery({
    queryKey: [...queryKeys.assets.all, "orders"],
    // The public market endpoint intentionally caps a single page at 48.
    queryFn: () => services.assets.list({ limit: 48 }),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const portfolio = useQuery({
    queryKey: queryKeys.portfolio.summary,
    queryFn: services.portfolio.portfolio,
    enabled: isAuthenticated,
    staleTime: 15_000,
  });
  const cancellation = useMutation({
    mutationFn: services.trading.cancelOrder,
    onSuccess: async () => {
      setConfirmingOrderId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.assets.all }),
        queryClient.invalidateQueries({ queryKey: queryKeys.market.summary }),
        queryClient.invalidateQueries({ queryKey: ["marketplace", "public-catalogue"] }),
        queryClient.invalidateQueries({ queryKey: ["market", "order-book"] }),
        queryClient.invalidateQueries({ queryKey: ["market", "recent-trades"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trading.orders }),
        queryClient.invalidateQueries({ queryKey: ["trading", "executions"] }),
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.summary }),
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.holdings }),
        queryClient.invalidateQueries({ queryKey: ["portfolio", "transactions"] }),
        queryClient.invalidateQueries({ queryKey: ["ownership", "position"] }),
      ]);
    },
  });

  const authRequired =
    (!isAuthenticated && !orders.data) ||
    (orders.error instanceof ApiError && orders.error.status === 401);
  if (authRequired) return <OrdersAccessRequired />;

  const allOrders = orders.data?.items ?? [];
  const orderedItems = sortOrders(ordersForSide(ordersForTab(allOrders, tab), side), sort);
  const assetsById = new Map(
    (assets.data?.items ?? []).map((asset) => [String(asset.id), asset] as const),
  );
  const assetsBySlug = new Map(
    (assets.data?.items ?? []).flatMap((asset) =>
      asset.slug ? [[asset.slug, asset] as const] : [],
    ),
  );
  const resolveAsset = (order: TradingOrderView) =>
    (order.assetSlug ? assetsBySlug.get(order.assetSlug) : undefined) ??
    assetsById.get(order.assetId);
  return (
    <main className="orders-page">
      <div className="page-shell orders-shell">
        <OrdersHeading />
        <section className="orders-layout" aria-label="Orders workspace">
          <div className="orders-layout__main">
            <OrderKpis
              query={orders}
              executions={executions}
              portfolio={portfolio}
              onTabChange={setTab}
            />
            <OrdersTable
              query={orders}
              items={orderedItems}
              tab={tab}
              setTab={setTab}
              side={side}
              setSide={setSide}
              sort={sort}
              setSort={setSort}
              resolveAsset={resolveAsset}
              confirmingOrderId={confirmingOrderId}
              setConfirmingOrderId={setConfirmingOrderId}
              cancellation={cancellation}
            />
            <RecentExecutionsPanel query={executions} assets={assetsBySlug} />
          </div>
          <aside
            className="orders-layout__side"
            aria-label="Reservations and recent order activity"
          >
            <ReservationContextPanel query={portfolio} />
            <ActivityPanel query={orders} resolveAsset={resolveAsset} />
            <HelpPanel />
          </aside>
        </section>
      </div>
    </main>
  );
}

function OrdersHeading() {
  return (
    <header className="orders-heading">
      <p className="page-kicker">Orders</p>
      <h1>Your Orders</h1>
      <p>Track, manage and view all your buy and sell orders across the marketplace.</p>
    </header>
  );
}

function OrderKpis({
  query,
  executions,
  portfolio,
  onTabChange,
}: {
  query: UseQueryResult<{ items: TradingOrderView[] }>;
  executions: UseQueryResult<{ items: TradingExecution[] }>;
  portfolio: UseQueryResult<PortfolioSummary>;
  onTabChange: (tab: OrderTab) => void;
}) {
  if (query.isLoading) return <OrdersKpiSkeletons />;
  if (query.isError || !query.data)
    return (
      <OrdersPanel className="orders-kpis__error">
        <PanelError message={ORDER_ERROR_STATES.orders} retry={() => void query.refetch()} />
      </OrdersPanel>
    );
  const open = query.data.items.filter(isOpenOrder);
  const executionItems = executions.data?.items ?? [];
  const tradedMinor = executionItems.reduce(
    (sum, execution) => sum + BigInt(execution.priceMinor) * BigInt(execution.units),
    0n,
  );
  const reservedShareHoldings =
    portfolio.data?.holdings.filter((holding) => BigInt(holding.reservedUnits) > 0n) ?? [];
  const reservedShares = reservedShareHoldings.reduce(
    (sum, holding) => sum + BigInt(holding.reservedUnits),
    0n,
  );
  return (
    <section className="orders-kpis" aria-label="Order summary">
      <OrderKpi
        icon={ListOrdered}
        label="Open orders"
        value={String(open.length)}
        detail={
          open.length
            ? `${formatOrderMoney(sumOrderNotionalMinor(open, true))} open notional`
            : "No open orders."
        }
        onClick={() => onTabChange("OPEN")}
        action="View open orders"
      />
      <OrderKpi
        icon={CircleCheckBig}
        label="Executions"
        value={String(executionItems.length)}
        detail={`${query.data.items.filter((order) => order.status === "FILLED").length} filled orders`}
        onClick={() => onTabChange("FILLED")}
        action="View filled orders"
      />
      <OrderKpi
        icon={PoundSterling}
        label="Total traded"
        value={formatOrderMoney(tradedMinor.toString())}
        detail="Gross value across executions"
        action="Execution history"
      />
      <OrderKpi
        icon={LockKeyhole}
        label="Reserved resources"
        value={portfolio.data ? formatOrderMoney(portfolio.data.cash.reservedMinor) : "Unavailable"}
        detail={
          portfolio.data
            ? `${reservedShares} shares across ${reservedShareHoldings.length} holdings`
            : "Reservation summary unavailable"
        }
        action="Excluded from available balances"
      />
    </section>
  );
}

function OrderKpi({
  icon,
  label,
  value,
  detail,
  action,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  detail: string;
  action: string;
  onClick?: () => void;
}) {
  return (
    <article className="orders-kpi">
      <KpiIconTile icon={icon} />
      <div>
        <p>{label}</p>
        <strong>{value}</strong>
        <span>{detail}</span>
        <button type="button" onClick={onClick} disabled={!onClick}>
          {action}
          <ArrowRight aria-hidden="true" />
        </button>
      </div>
    </article>
  );
}

function OrdersKpiSkeletons() {
  return (
    <section className="orders-kpis" aria-label="Loading order summary">
      {[0, 1, 2, 3].map((item) => (
        <article key={item} className="orders-kpi orders-kpi--loading">
          <div className="customer-skeleton size-11" />
          <div className="flex-1">
            <div className="customer-skeleton h-3 w-24" />
            <div className="customer-skeleton mt-4 h-7 w-16" />
            <div className="customer-skeleton mt-4 h-3 w-28" />
          </div>
        </article>
      ))}
    </section>
  );
}

function OrdersTable({
  query,
  items,
  tab,
  setTab,
  side,
  setSide,
  sort,
  setSort,
  resolveAsset,
  confirmingOrderId,
  setConfirmingOrderId,
  cancellation,
}: {
  query: UseQueryResult<{ items: TradingOrderView[] }>;
  items: TradingOrderView[];
  tab: OrderTab;
  setTab: (tab: OrderTab) => void;
  side: OrderSideFilter;
  setSide: (side: OrderSideFilter) => void;
  sort: "newest" | "oldest";
  setSort: (sort: "newest" | "oldest") => void;
  resolveAsset: (order: TradingOrderView) => Asset | undefined;
  confirmingOrderId: string | null;
  setConfirmingOrderId: (id: string | null) => void;
  cancellation: ReturnType<typeof useMutation<TradingOrderView, Error, string>>;
}) {
  return (
    <OrdersPanel className="orders-panel--table">
      <div className="orders-tabs" role="tablist" aria-label="Order history filter">
        {(["OPEN", "FILLED", "CANCELLED", "ALL"] as OrderTab[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? "is-active" : ""}
            onClick={() => setTab(item)}
          >
            {tabLabel(item)}
          </button>
        ))}
        <label className="orders-filter">
          <Funnel aria-hidden="true" />
          <span>Filter</span>
          <select
            value={side}
            onChange={(event) => setSide(event.target.value as OrderSideFilter)}
            aria-label="Filter orders by side"
          >
            <option value="ALL">All sides</option>
            <option value="BUY">Buy orders</option>
            <option value="SELL">Sell orders</option>
          </select>
        </label>
        <label className="orders-sort">
          Sort{" "}
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as "newest" | "oldest")}
            aria-label="Sort orders"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
          </select>
        </label>
      </div>
      <div className="orders-panel__body">
        {query.isLoading ? (
          <RowsSkeleton rows={4} />
        ) : query.isError ? (
          <PanelError message={ORDER_ERROR_STATES.orders} retry={() => void query.refetch()} />
        ) : (
          <div
            className="orders-table-wrap"
            tabIndex={0}
            aria-label="Orders table; scroll horizontally on smaller screens"
          >
            <table className="orders-table">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Side</th>
                  <th>Shares</th>
                  <th>Filled</th>
                  <th>Remaining</th>
                  <th>Limit price</th>
                  <th>Total value</th>
                  <th>TIF</th>
                  <th>Status</th>
                  <th>Placed</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.length ? (
                  items.map((order) => (
                    <OrderRow
                      key={order.id}
                      order={order}
                      asset={resolveAsset(order)}
                      assetSlug={order.assetSlug}
                      confirming={confirmingOrderId === order.id}
                      setConfirming={() => setConfirmingOrderId(order.id)}
                      clearConfirming={() => setConfirmingOrderId(null)}
                      cancellation={cancellation}
                    />
                  ))
                ) : (
                  <tr className="orders-table__empty-row">
                    <td colSpan={11}>
                      <strong>{emptyOrdersMessage(tab)}</strong>
                      <span>Orders you place will appear here.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </OrdersPanel>
  );
}

function OrderRow({
  order,
  asset,
  assetSlug,
  confirming,
  setConfirming,
  clearConfirming,
  cancellation,
}: {
  order: TradingOrderView;
  asset?: Asset;
  assetSlug: string | null;
  confirming: boolean;
  setConfirming: () => void;
  clearConfirming: () => void;
  cancellation: ReturnType<typeof useMutation<TradingOrderView, Error, string>>;
}) {
  const cancellable = isCancellable(order);
  return (
    <tr>
      <td>
        <AssetLabel asset={asset} assetSlug={assetSlug} />
      </td>
      <td>
        <SidePill side={order.side} />
      </td>
      <td>{order.originalUnits}</td>
      <td>
        <OrderFillProgress order={order} />
      </td>
      <td>{order.remainingUnits}</td>
      <td>{formatOrderMoney(order.limitPriceMinor)}</td>
      <td>{formatOrderMoney(orderNotionalMinor(order))}</td>
      <td>{order.timeInForce}</td>
      <td>
        <StatusPill status={order.status} />
      </td>
      <td>{formatOrderDate(order.createdAt)}</td>
      <td>
        <div className="orders-actions">
          {assetSlug ? (
            <Link to="/asset/$id" params={{ id: assetSlug }} className="orders-view-action">
              {order.status === "FILLED" ? "View asset" : "View"}
            </Link>
          ) : null}
          {cancellable ? (
            confirming ? (
              <span className="orders-confirm">
                <button
                  type="button"
                  disabled={cancellation.isPending}
                  onClick={() => cancellation.mutate(order.id)}
                >
                  Confirm
                </button>
                <button type="button" disabled={cancellation.isPending} onClick={clearConfirming}>
                  Keep
                </button>
              </span>
            ) : (
              <button type="button" className="orders-cancel" onClick={setConfirming}>
                {order.status === "PARTIALLY_FILLED" ? "Cancel remainder" : "Cancel"}
              </button>
            )
          ) : !assetSlug ? (
            <span className="orders-no-action">—</span>
          ) : null}
        </div>
        {cancellation.isError && confirming ? (
          <p className="orders-cancel-error">
            Cancellation was not completed. Refresh to see the current order state.
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function OrderFillProgress({ order }: { order: TradingOrderView }) {
  const original = BigInt(order.originalUnits);
  const filled = BigInt(order.filledUnits);
  const percentage = original > 0n ? Number((filled * 10_000n) / original) / 100 : 0;

  return (
    <div
      className="orders-fill-progress"
      aria-label={`${order.filledUnits} of ${order.originalUnits} shares filled`}
    >
      <span>
        {order.filledUnits} / {order.originalUnits}
      </span>
      <span className="orders-fill-progress__track" aria-hidden="true">
        <span style={{ width: `${Math.min(100, percentage)}%` }} />
      </span>
    </div>
  );
}

function RecentExecutionsPanel({
  query,
  assets,
}: {
  query: UseQueryResult<{ items: TradingExecution[] }>;
  assets: Map<string, Asset>;
}) {
  return (
    <OrdersPanel
      title="Recent executions"
      action="Authoritative execution history"
      className="orders-panel--filled"
    >
      <div className="orders-panel__body">
        {query.isLoading ? (
          <RowsSkeleton rows={3} />
        ) : query.isError ? (
          <PanelError message={ORDER_ERROR_STATES.executions} retry={() => void query.refetch()} />
        ) : (
          <div
            className="orders-table-wrap"
            tabIndex={0}
            aria-label="Filled orders table; scroll horizontally on smaller screens"
          >
            <table className="orders-table orders-table--filled">
              <thead>
                <tr>
                  <th>Asset</th>
                  <th>Side</th>
                  <th>Shares</th>
                  <th>Price / share</th>
                  <th>Gross value</th>
                  <th>Executed</th>
                  <th>Settlement</th>
                </tr>
              </thead>
              <tbody>
                {query.data?.items.length ? (
                  query.data.items.slice(0, 5).map((execution) => (
                    <tr key={execution.executionId}>
                      <td>
                        <AssetLabel
                          asset={[...assets.values()].find(
                            (asset) => asset.slug === execution.assetSlug,
                          )}
                          assetSlug={execution.assetSlug}
                        />
                      </td>
                      <td>
                        <SidePill side={execution.side} />
                      </td>
                      <td>{execution.units}</td>
                      <td>{formatOrderMoney(execution.priceMinor)}</td>
                      <td>
                        {formatOrderMoney(
                          (BigInt(execution.priceMinor) * BigInt(execution.units)).toString(),
                        )}
                      </td>
                      <td>{formatOrderDate(execution.executedAt)}</td>
                      <td>
                        <StatusPill status={execution.settlementStatus} />
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr className="orders-table__empty-row">
                    <td colSpan={7}>
                      <strong>No executions yet.</strong>
                      <span>Authoritative fills will appear here.</span>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </OrdersPanel>
  );
}

function ReservationContextPanel({ query }: { query: UseQueryResult<PortfolioSummary> }) {
  const reservedHoldings =
    query.data?.holdings.filter((holding) => BigInt(holding.reservedUnits) > 0n) ?? [];
  const reservedShares = reservedHoldings.reduce(
    (total, holding) => total + BigInt(holding.reservedUnits),
    0n,
  );

  return (
    <OrdersPanel
      title="Reservation context"
      action="Authoritative balances"
      className="orders-panel--reservation"
    >
      <div className="orders-panel__body">
        {query.isLoading ? (
          <RowsSkeleton rows={3} />
        ) : query.isError || !query.data ? (
          <PanelError
            message="Reservation balances are temporarily unavailable."
            retry={() => void query.refetch()}
          />
        ) : (
          <>
            <div className="orders-reservation-summary">
              <div>
                <span>Reserved cash</span>
                <strong>{formatOrderMoney(query.data.cash.reservedMinor)}</strong>
              </div>
              <div>
                <span>Reserved shares</span>
                <strong>{reservedShares.toString()}</strong>
              </div>
              <div>
                <span>Affected holdings</span>
                <strong>{reservedHoldings.length}</strong>
              </div>
            </div>
            {reservedHoldings.length ? (
              <ul className="orders-reservation-holdings">
                {reservedHoldings.slice(0, 4).map((holding) => (
                  <li key={holding.assetId}>
                    <span>{holding.title ?? "Collectible position"}</span>
                    <strong>{holding.reservedUnits} shares</strong>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="orders-reservation-empty">No ownership shares are reserved.</p>
            )}
            <p className="orders-reservation-note">
              Reserved resources remain unavailable until the related order fills or is cancelled.
              <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>
                View affected orders <ArrowRight aria-hidden="true" />
              </button>
            </p>
          </>
        )}
      </div>
    </OrdersPanel>
  );
}

function ActivityPanel({
  query,
  resolveAsset,
}: {
  query: UseQueryResult<{ items: TradingOrderView[] }>;
  resolveAsset: (order: TradingOrderView) => Asset | undefined;
}) {
  const items = useMemo(
    () => (query.data ? sortOrders(query.data.items, "newest").slice(0, 5) : []),
    [query.data],
  );
  return (
    <OrdersPanel
      title="Recent order activity"
      action="Current history"
      className="orders-panel--activity"
    >
      <div className="orders-panel__body">
        {query.isLoading ? (
          <RowsSkeleton rows={4} />
        ) : query.isError ? (
          <PanelError message={ORDER_ERROR_STATES.activity} retry={() => void query.refetch()} />
        ) : items.length ? (
          <ul className="orders-activity">
            {items.map((order) => (
              <li key={order.id}>
                <span className={order.side === "BUY" ? "is-buy" : "is-sell"}>
                  {order.side === "BUY" ? (
                    <ShoppingCart aria-hidden="true" />
                  ) : (
                    <XCircle aria-hidden="true" />
                  )}
                </span>
                <div>
                  <strong>{activityLabel(order)}</strong>
                  <p>{activityDetail(order, resolveAsset(order))}</p>
                </div>
                <time>{formatOrderDate(order.closedAt ?? order.createdAt)}</time>
              </li>
            ))}
          </ul>
        ) : (
          <ActivityEmpty />
        )}
      </div>
    </OrdersPanel>
  );
}

function HelpPanel() {
  return (
    <OrdersPanel className="orders-panel--help">
      <div className="orders-help">
        <span>
          <CircleHelp aria-hidden="true" />
        </span>
        <div>
          <h2>Need help with orders?</h2>
          <p>Orders use real market availability and can change as matching occurs.</p>
          <Link to="/help" className="orders-help__link">
            Visit help centre <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </OrdersPanel>
  );
}

function OrdersPanel({
  title,
  action,
  className = "",
  children,
}: {
  title?: string;
  action?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`orders-panel ${className}`}>
      <div className="orders-panel__head">
        {title ? <h2>{title}</h2> : null}
        {action ? <span>{action}</span> : null}
      </div>
      {children}
    </section>
  );
}
function AssetLabel({ asset, assetSlug }: { asset?: Asset; assetSlug?: string | null }) {
  const showcaseMedia = assetShowcaseMedia(asset?.slug ?? assetSlug ?? "");
  const media = asset?.media.find((item) => item.kind === "image");
  const grade = asset?.grade ? `${asset.grade.company} ${asset.grade.label}` : null;
  const content = (
    <>
      {showcaseMedia || media ? (
        <img src={showcaseMedia?.src ?? media!.url} alt="" />
      ) : (
        <span aria-hidden="true">
          <Landmark />
        </span>
      )}
      <div>
        <strong>{asset?.details.title ?? "Asset reference unavailable"}</strong>
        <small>
          {grade ?? asset?.details.card?.set ?? asset?.details.category ?? "Public asset"}
        </small>
      </div>
    </>
  );

  if (asset?.slug) {
    return (
      <Link to="/asset/$id" params={{ id: asset.slug }} className="orders-asset">
        {content}
      </Link>
    );
  }

  return <div className="orders-asset">{content}</div>;
}
function SidePill({ side }: { side: "BUY" | "SELL" }) {
  return <span className={`orders-side is-${side.toLowerCase()}`}>{side}</span>;
}
function StatusPill({ status }: { status: string }) {
  return (
    <span className={`orders-status is-${status.toLowerCase().replaceAll("_", "-")}`}>
      {formatOrderStatus(status as TradingOrderView["status"])}
    </span>
  );
}
function ActivityEmpty() {
  return (
    <div className="orders-activity-empty">
      <span>
        <ListOrdered aria-hidden="true" />
      </span>
      <div>
        <strong>No recent order activity.</strong>
        <p>Your order updates will appear here.</p>
      </div>
    </div>
  );
}
function PanelError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="orders-panel__error">
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
        <div key={index} className="customer-skeleton h-12" />
      ))}
    </div>
  );
}
function OrdersAccessRequired() {
  return (
    <main className="page-shell py-16">
      <section className="customer-state text-center">
        <ListOrdered className="mx-auto size-8 text-accent" aria-hidden="true" />
        <p className="page-kicker mt-5">Orders</p>
        <h1 className="page-title mt-3">Sign in to view your orders</h1>
        <p className="mx-auto mt-4 max-w-xl text-subtle">
          Your private order history and execution data are available only to your authenticated
          session.
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
function sortOrders(items: TradingOrderView[], direction: "newest" | "oldest") {
  return [...items].sort((left, right) =>
    direction === "newest"
      ? Date.parse(right.createdAt) - Date.parse(left.createdAt)
      : Date.parse(left.createdAt) - Date.parse(right.createdAt),
  );
}
function tabLabel(tab: OrderTab) {
  return tab === "ALL" ? "All orders" : `${tab[0]}${tab.slice(1).toLowerCase()} orders`;
}
function emptyOrdersMessage(tab: OrderTab) {
  return tab === "OPEN"
    ? ORDER_EMPTY_STATES.open
    : tab === "FILLED"
      ? ORDER_EMPTY_STATES.filled
      : tab === "CANCELLED"
        ? ORDER_EMPTY_STATES.cancelled
        : ORDER_EMPTY_STATES.all;
}
function activityLabel(order: TradingOrderView) {
  if (order.status === "OPEN") return `${order.side === "BUY" ? "Buy" : "Sell"} order placed`;
  if (order.status === "PARTIALLY_FILLED") return "Order partially filled";
  return `Order ${formatOrderStatus(order.status).toLowerCase()}`;
}
function activityDetail(order: TradingOrderView, asset?: Asset) {
  const title = asset?.details.title ?? "Asset reference unavailable";
  return `${order.originalUnits} shares · ${title} · ${formatOrderMoney(order.limitPriceMinor)}/share`;
}
function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}
