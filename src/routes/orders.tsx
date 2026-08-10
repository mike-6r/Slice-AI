import { useMutation, useQuery, useQueryClient, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  CircleHelp,
  Clock3,
  Funnel,
  Landmark,
  ListOrdered,
  RefreshCw,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import type { Asset, OrderBook, TradingExecution, TradingOrderView } from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import {
  formatOrderMoney,
  formatOrderStatus,
  isCancellable,
  isOpenOrder,
  ORDER_EMPTY_STATES,
  ORDER_ERROR_STATES,
  orderBookSummary,
  orderNotionalMinor,
  ordersForSide,
  ordersForTab,
  type OrderSideFilter,
  type OrderTab,
  sumOrderNotionalMinor,
} from "./-orders-presentation";

export const Route = createFileRoute("/orders")({
  head: () => ({ meta: [{ title: "Orders | Slice" }] }),
  component: Orders,
});

export function Orders() {
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
    queryFn: () => services.assets.list({ limit: 100 }),
    enabled: isAuthenticated,
    staleTime: 30_000,
  });
  const activeBookAssetId =
    orders.data?.items.find(isOpenOrder)?.assetId ?? orders.data?.items[0]?.assetId;
  const orderBook = useQuery({
    queryKey: queryKeys.market.orderBook(activeBookAssetId ?? "none"),
    queryFn: () => services.market.orderBook(activeBookAssetId as never),
    enabled: isAuthenticated && Boolean(activeBookAssetId),
    staleTime: 15_000,
  });
  const cancellation = useMutation({
    mutationFn: services.trading.cancelOrder,
    onSuccess: async () => {
      setConfirmingOrderId(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.trading.orders }),
        queryClient.invalidateQueries({ queryKey: queryKeys.trading.executions() }),
        queryClient.invalidateQueries({ queryKey: queryKeys.portfolio.summary }),
      ]);
    },
  });

  const authRequired =
    (!isAuthenticated && !orders.data) ||
    (orders.error instanceof ApiError && orders.error.status === 401);
  if (authRequired) return <OrdersAccessRequired />;

  const allOrders = orders.data?.items ?? [];
  const orderedItems = sortOrders(ordersForSide(ordersForTab(allOrders, tab), side), sort);
  const assetsById = new Map((assets.data?.items ?? []).map((asset) => [asset.id, asset]));
  return (
    <main className="orders-page">
      <div className="page-shell orders-shell">
        <OrdersHeading />
        <section className="orders-layout" aria-label="Orders workspace">
          <div className="orders-layout__main">
            <OrderKpis query={orders} executions={executions} onTabChange={setTab} />
            <OrdersTable
              query={orders}
              items={orderedItems}
              tab={tab}
              setTab={setTab}
              side={side}
              setSide={setSide}
              sort={sort}
              setSort={setSort}
              assets={assetsById}
              confirmingOrderId={confirmingOrderId}
              setConfirmingOrderId={setConfirmingOrderId}
              cancellation={cancellation}
            />
            <FilledOrdersPanel query={executions} assets={assetsById} />
          </div>
          <aside className="orders-layout__side" aria-label="Order book and recent order activity">
            <OrderBookPanel
              query={orderBook}
              asset={activeBookAssetId ? assetsById.get(activeBookAssetId as never) : undefined}
            />
            <ActivityPanel query={orders} assets={assetsById} />
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
  onTabChange,
}: {
  query: UseQueryResult<{ items: TradingOrderView[] }>;
  executions: UseQueryResult<{ items: TradingExecution[] }>;
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
  const filled = query.data.items.filter((order) => order.status === "FILLED");
  const cancelled = query.data.items.filter((order) => order.status === "CANCELLED");
  return (
    <section className="orders-kpis" aria-label="Order summary">
      <OrderKpi
        icon={<ListOrdered />}
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
        icon={<Clock3 />}
        label="Filled orders"
        value={String(filled.length)}
        detail={
          executions.data
            ? `${executions.data.items.length} recorded executions`
            : "Execution history loading"
        }
        onClick={() => onTabChange("FILLED")}
        action="View filled orders"
      />
      <OrderKpi
        icon={<XCircle />}
        label="Cancelled orders"
        value={String(cancelled.length)}
        detail={cancelled.length ? "Cancelled order history" : "No cancelled orders."}
        onClick={() => onTabChange("CANCELLED")}
        action="View cancelled orders"
      />
      <OrderKpi
        icon={<Clock3 />}
        label="Avg. fill time"
        value="Unavailable"
        detail="No fill-time data"
        action="No fill-time metric"
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
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
  action: string;
  onClick?: () => void;
}) {
  return (
    <article className="orders-kpi">
      <span className="orders-kpi__icon" aria-hidden="true">
        {icon}
      </span>
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
  assets,
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
  assets: Map<string, Asset>;
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
                  <th>Type</th>
                  <th>Units</th>
                  <th>Limit price</th>
                  <th>Total value</th>
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
                      asset={assets.get(order.assetId)}
                      confirming={confirmingOrderId === order.id}
                      setConfirming={() => setConfirmingOrderId(order.id)}
                      clearConfirming={() => setConfirmingOrderId(null)}
                      cancellation={cancellation}
                    />
                  ))
                ) : (
                  <tr className="orders-table__empty-row">
                    <td colSpan={9}>
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
  confirming,
  setConfirming,
  clearConfirming,
  cancellation,
}: {
  order: TradingOrderView;
  asset?: Asset;
  confirming: boolean;
  setConfirming: () => void;
  clearConfirming: () => void;
  cancellation: ReturnType<typeof useMutation<TradingOrderView, Error, string>>;
}) {
  const cancellable = isCancellable(order);
  return (
    <tr>
      <td>
        <AssetLabel asset={asset} fallback={order.assetId} />
      </td>
      <td>
        <SidePill side={order.side} />
      </td>
      <td>Limit · {order.timeInForce}</td>
      <td>
        {order.filledUnits !== "0"
          ? `${order.filledUnits} / ${order.originalUnits}`
          : order.originalUnits}
      </td>
      <td>{formatOrderMoney(order.limitPriceMinor)}</td>
      <td>{formatOrderMoney(orderNotionalMinor(order))}</td>
      <td>
        <StatusPill status={order.status} />
      </td>
      <td>{formatOrderDate(order.createdAt)}</td>
      <td>
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
              Cancel
            </button>
          )
        ) : (
          <span className="orders-no-action">—</span>
        )}
        {cancellation.isError && confirming ? (
          <p className="orders-cancel-error">
            Cancellation was not completed. Refresh to see the current order state.
          </p>
        ) : null}
      </td>
    </tr>
  );
}

function FilledOrdersPanel({
  query,
  assets,
}: {
  query: UseQueryResult<{ items: TradingExecution[] }>;
  assets: Map<string, Asset>;
}) {
  return (
    <OrdersPanel
      title="Recent filled orders"
      action="View all filled orders"
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
                  <th>Units</th>
                  <th>Fill price</th>
                  <th>Total value</th>
                  <th>Filled</th>
                  <th>Status</th>
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
                          fallback={execution.assetSlug}
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
                      <strong>No filled orders yet.</strong>
                      <span>Completed executions will appear here.</span>
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

function OrderBookPanel({ query, asset }: { query: UseQueryResult<OrderBook>; asset?: Asset }) {
  return (
    <OrdersPanel title="Order book depth" className="orders-panel--book" action="Current">
      <div className="orders-panel__body">
        {query.isLoading ? (
          <BookSkeleton />
        ) : query.isError ? (
          <PanelError message={ORDER_ERROR_STATES.book} retry={() => void query.refetch()} />
        ) : query.data && (query.data.bids.length || query.data.asks.length) ? (
          <BookVisual book={query.data} asset={asset} />
        ) : (
          <OrderBookEmpty />
        )}
      </div>
    </OrdersPanel>
  );
}

function BookVisual({ book, asset }: { book: OrderBook; asset?: Asset }) {
  const summary = orderBookSummary(book);
  const allLevels = [...book.bids, ...book.asks];
  const maximum = Math.max(...allLevels.map((level) => level.units), 1);
  return (
    <>
      <p className="orders-book-asset">{asset?.details.title ?? "Current asset book"}</p>
      <div className="orders-depth" role="img" aria-label="Aggregate current order-book depth">
        <div className="orders-depth__side is-bids">
          {book.bids.slice(0, 8).map((level) => (
            <span
              key={`bid-${level.pricePerUnit.amount}-${level.units}`}
              style={{ width: `${(level.units / maximum) * 100}%` }}
              title={`${formatOrderMoney(String(level.pricePerUnit.amount))}: ${level.units} units`}
            />
          ))}
        </div>
        <div className="orders-depth__mid">
          <span>Current</span>
          <strong>
            {summary.spread === null ? "Unavailable" : formatOrderMoney(summary.spread)}
          </strong>
          <small>spread</small>
        </div>
        <div className="orders-depth__side is-asks">
          {book.asks.slice(0, 8).map((level) => (
            <span
              key={`ask-${level.pricePerUnit.amount}-${level.units}`}
              style={{ width: `${(level.units / maximum) * 100}%` }}
              title={`${formatOrderMoney(String(level.pricePerUnit.amount))}: ${level.units} units`}
            />
          ))}
        </div>
      </div>
      <div className="orders-book-summary">
        <div>
          <span>Bids</span>
          <strong>{formatOrderMoney(summary.bidNotional)}</strong>
          <small>
            {summary.bestBid ? `Best ${formatOrderMoney(summary.bestBid)}` : "Unavailable"}
          </small>
        </div>
        <div>
          <span>Spread</span>
          <strong>
            {summary.spread === null ? "Unavailable" : formatOrderMoney(summary.spread)}
          </strong>
          <small>Aggregate current book</small>
        </div>
        <div>
          <span>Asks</span>
          <strong>{formatOrderMoney(summary.askNotional)}</strong>
          <small>
            {summary.bestAsk ? `Best ${formatOrderMoney(summary.bestAsk)}` : "Unavailable"}
          </small>
        </div>
      </div>
    </>
  );
}

function ActivityPanel({
  query,
  assets,
}: {
  query: UseQueryResult<{ items: TradingOrderView[] }>;
  assets: Map<string, Asset>;
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
                  <p>{assets.get(order.assetId)?.details.title ?? "Marketplace order"}</p>
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
function AssetLabel({ asset, fallback }: { asset?: Asset; fallback: string }) {
  const media = asset?.media.find((item) => item.kind === "image");
  return (
    <div className="orders-asset">
      {media ? (
        <img src={media.url} alt="" />
      ) : (
        <span aria-hidden="true">
          <Landmark />
        </span>
      )}
      <div>
        <strong>{asset?.details.title ?? "Asset"}</strong>
        <small>
          {asset?.details.card?.set ??
            asset?.details.category ??
            (asset ? "Collectible" : "Asset reference unavailable")}
        </small>
      </div>
    </div>
  );
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
function OrderBookEmpty() {
  return (
    <div className="orders-book-empty" aria-label="No order book data available">
      <div className="orders-book-empty__grid" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="orders-book-empty__mid">
        <strong>No order book data available.</strong>
        <span>New public orders will form the current book.</span>
      </div>
      <div className="orders-book-empty__labels">
        <span>Bids</span>
        <span>Current</span>
        <span>Asks</span>
      </div>
    </div>
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
function BookSkeleton() {
  return (
    <div className="orders-book-skeleton" aria-label="Loading order book depth">
      <div className="customer-skeleton h-36" />
      <div className="customer-skeleton h-10" />
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
function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}
