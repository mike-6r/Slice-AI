import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  ChartNoAxesCombined,
  Eye,
  Landmark,
  Layers3,
  LockKeyhole,
  PieChart,
  RefreshCw,
  ShoppingCart,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";

import { ApiError } from "@/api/http-client";
import { useSession } from "@/auth/use-session";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import type {
  Asset,
  PortfolioHolding,
  PortfolioSummary,
  PortfolioTransaction,
  TradingOrderView,
} from "@/domain";
import { useAppServices } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import {
  DASHBOARD_EMPTY_STATES,
  DASHBOARD_ERROR_STATES,
  dashboardPortfolioValue,
  dashboardValuationCopy,
  formatDashboardMoney,
} from "./-dashboard-presentation";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard | Slice" }] }),
  component: Dashboard,
});

const isOpenOrder = (order: TradingOrderView) =>
  order.status === "OPEN" || order.status === "PARTIALLY_FILLED";

export function Dashboard() {
  const services = useAppServices();
  const { isAuthenticated } = useSession();
  const portfolio = useQuery({
    queryKey: queryKeys.portfolio.summary,
    queryFn: services.portfolio.portfolio,
    enabled: isAuthenticated,
  });
  const transactions = useQuery({
    queryKey: queryKeys.portfolio.transactions(),
    queryFn: () => services.portfolio.transactions({ limit: 4 }),
    enabled: isAuthenticated,
  });
  const orders = useQuery({
    queryKey: queryKeys.trading.orders,
    queryFn: () => services.trading.orders({ limit: 4 }),
    enabled: isAuthenticated,
  });
  const market = useQuery({
    queryKey: queryKeys.assets.trending,
    queryFn: services.assets.trending,
    staleTime: 30_000,
  });

  const authRequired =
    !isAuthenticated || (portfolio.error instanceof ApiError && portfolio.error.status === 401);
  if (authRequired) return <DashboardAuthRequired />;

  return (
    <main className="dashboard-page">
      <div className="page-shell dashboard-shell">
        <DashboardHeading />
        <DashboardKpis portfolio={portfolio} />
        <section
          className="dashboard-row dashboard-row--three"
          aria-label="Account and market activity"
        >
          <OpenOrdersPanel query={orders} />
          <RecentActivityPanel query={transactions} />
          <MarketWatchPanel query={market} />
        </section>
        <section className="dashboard-row dashboard-row--lower" aria-label="Portfolio detail">
          <AllocationPanel portfolio={portfolio} />
          <HoldingsPanel portfolio={portfolio} />
          <TransactionsPanel query={transactions} />
        </section>
      </div>
    </main>
  );
}

function DashboardHeading() {
  return (
    <header className="dashboard-heading">
      <div>
        <p className="page-kicker">Dashboard</p>
        <h1 className="dashboard-heading__title">Your Slice Overview</h1>
        <p className="dashboard-heading__copy">
          Balances, holdings and activity from your authenticated account.
        </p>
      </div>
      <div className="dashboard-heading__waves" aria-hidden="true" />
    </header>
  );
}

function DashboardKpis({ portfolio }: { portfolio: UseQueryResult<PortfolioSummary> }) {
  if (portfolio.isLoading) return <DashboardKpiSkeletons />;
  if (portfolio.isError || !portfolio.data)
    return (
      <section className="dashboard-kpis" aria-label="Account summary unavailable">
        <DashboardPanel className="dashboard-panel--unavailable dashboard-kpis__error">
          <PanelError
            message={DASHBOARD_ERROR_STATES.summary}
            retry={() => void portfolio.refetch()}
          />
        </DashboardPanel>
      </section>
    );

  const summary = portfolio.data;
  return (
    <section className="dashboard-kpis" aria-label="Account summary">
      <KpiCard
        label="Available cash"
        value={formatDashboardMoney(summary.cash.availableMinor)}
        icon={<Wallet aria-hidden="true" />}
        detail="Authoritative cash balance"
      />
      <KpiCard
        label="Reserved cash"
        value={formatDashboardMoney(summary.cash.reservedMinor)}
        icon={<LockKeyhole aria-hidden="true" />}
        detail="Reserved for active activity"
      />
      <KpiCard
        label="Portfolio value"
        value={dashboardPortfolioValue(summary)}
        icon={<PieChart aria-hidden="true" />}
        detail={dashboardValuationCopy(summary.valuationStatus)}
      />
      <KpiCard
        label="Holdings"
        value={String(summary.holdings.length)}
        icon={<Layers3 aria-hidden="true" />}
        detail="Authoritative holding records"
      />
    </section>
  );
}

function DashboardKpiSkeletons() {
  return (
    <section className="dashboard-kpis" aria-label="Loading account summary">
      {["available", "reserved", "value", "holdings"].map((item) => (
        <article key={item} className="dashboard-kpi dashboard-kpi--loading">
          <div className="customer-skeleton size-11" />
          <div className="min-w-0 flex-1">
            <div className="customer-skeleton h-3 w-24" />
            <div className="customer-skeleton mt-4 h-8 w-36" />
            <div className="customer-skeleton mt-4 h-3 w-32" />
          </div>
        </article>
      ))}
    </section>
  );
}

function KpiCard({
  label,
  value,
  icon,
  detail,
}: {
  label: string;
  value: string;
  icon: ReactNode;
  detail: string;
}) {
  return (
    <article className="dashboard-kpi">
      <span className="dashboard-icon-box">{icon}</span>
      <div className="min-w-0">
        <p className="dashboard-kpi__label">{label}</p>
        <strong className="dashboard-kpi__value">{value}</strong>
        <p className="dashboard-kpi__detail">{detail}</p>
      </div>
    </article>
  );
}

function OpenOrdersPanel({ query }: { query: UseQueryResult<{ items: TradingOrderView[] }> }) {
  const openOrders = query.data?.items.filter(isOpenOrder) ?? [];
  return (
    <DashboardPanel
      title="Open Orders"
      icon={<ShoppingCart aria-hidden="true" />}
      action={{ to: "/portfolio", label: "View all" }}
    >
      {query.isLoading ? (
        <PanelSkeleton rows={3} />
      ) : query.isError ? (
        <PanelError message={DASHBOARD_ERROR_STATES.orders} retry={() => void query.refetch()} />
      ) : openOrders.length === 0 ? (
        <PanelEmpty message={DASHBOARD_EMPTY_STATES.orders} />
      ) : (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Type</th>
                <th>Units</th>
                <th>Price</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {openOrders.map((order) => (
                <tr key={order.id}>
                  <td>{order.assetId}</td>
                  <td>
                    <OrderSide side={order.side} />
                  </td>
                  <td>{order.remainingUnits}</td>
                  <td>{formatDashboardMoney(order.limitPriceMinor)}</td>
                  <td>
                    <OrderStatus status={order.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <PanelFooter to="/portfolio" label="View all orders" />
    </DashboardPanel>
  );
}

function RecentActivityPanel({
  query,
}: {
  query: UseQueryResult<{ items: PortfolioTransaction[] }>;
}) {
  return (
    <DashboardPanel
      title="Recent Activity"
      icon={<Activity aria-hidden="true" />}
      action={{ to: "/portfolio", label: "View all" }}
    >
      {query.isLoading ? (
        <PanelSkeleton rows={3} />
      ) : query.isError ? (
        <PanelError message={DASHBOARD_ERROR_STATES.activity} retry={() => void query.refetch()} />
      ) : query.data?.items.length ? (
        <ul className="dashboard-activity-list">
          {query.data.items.map((item, index) => (
            <li key={`${item.reference ?? item.type}-${item.effectiveAt}-${index}`}>
              <span
                className={`dashboard-activity-icon ${item.side === "CREDIT" ? "is-credit" : "is-debit"}`}
              >
                {item.side === "CREDIT" ? (
                  <ArrowUpRight aria-hidden="true" />
                ) : (
                  <ArrowDownRight aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <strong>{humanise(item.type)}</strong>
                <span>{item.status ? humanise(item.status) : "Recorded account activity"}</span>
              </div>
              <div className="text-right">
                <strong>{formatDashboardMoney(item.amountMinor)}</strong>
                <span>{formatDashboardDate(item.effectiveAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <PanelEmpty message={DASHBOARD_EMPTY_STATES.activity} />
      )}
    </DashboardPanel>
  );
}

function MarketWatchPanel({ query }: { query: UseQueryResult<Asset[]> }) {
  return (
    <DashboardPanel
      title="Market Watch"
      icon={<Eye aria-hidden="true" />}
      action={{ to: "/marketplace", label: "View all" }}
    >
      <p className="dashboard-panel__subheading">Trending</p>
      {query.isLoading ? (
        <PanelSkeleton rows={3} />
      ) : query.isError ? (
        <PanelError message={DASHBOARD_ERROR_STATES.market} retry={() => void query.refetch()} />
      ) : query.data?.length ? (
        <ul className="dashboard-market-list">
          {query.data.slice(0, 3).map((asset) => {
            const media = asset.slug ? assetShowcaseMedia(asset.slug) : undefined;
            return (
            <li key={asset.id}>
              <span className="dashboard-asset-placeholder" aria-hidden="true">
                {media ? <img src={media.src} alt="" /> : <Landmark />}
              </span>
              <div className="min-w-0 flex-1">
                <strong>{asset.details.title}</strong>
                <span>{asset.details.card?.set ?? asset.details.category}</span>
              </div>
              <div className="text-right">
                <strong>
                  {asset.market?.estimatedMarketValue
                    ? formatDashboardMoney(String(asset.market.estimatedMarketValue.amount))
                    : "Unavailable"}
                </strong>
                <span>
                  {asset.market?.asOf
                    ? `As of ${formatDashboardDate(asset.market.asOf)}`
                    : "No trend data"}
                </span>
              </div>
            </li>
            );
          })}
        </ul>
      ) : (
        <PanelEmpty message={DASHBOARD_EMPTY_STATES.market} />
      )}
      <PanelFooter to="/marketplace" label="Go to Marketplace" />
    </DashboardPanel>
  );
}

function AllocationPanel({ portfolio }: { portfolio: UseQueryResult<PortfolioSummary> }) {
  return (
    <DashboardPanel title="Portfolio Allocation" className="dashboard-panel--allocation">
      {portfolio.isLoading ? (
        <div className="dashboard-allocation-empty" aria-label="Loading allocation">
          <div className="customer-skeleton dashboard-allocation-ring" />
          <div className="customer-skeleton h-3 w-32" />
        </div>
      ) : portfolio.isError ? (
        <PanelError
          message={DASHBOARD_ERROR_STATES.allocation}
          retry={() => void portfolio.refetch()}
        />
      ) : (
        <div className="dashboard-allocation-empty">
          <div className="dashboard-allocation-ring" aria-hidden="true">
            <PieChart />
          </div>
          <div>
            <strong>{DASHBOARD_EMPTY_STATES.allocation}</strong>
            <p>Slice does not have an authoritative allocation breakdown for this account.</p>
          </div>
        </div>
      )}
      <PanelFooter to="/portfolio" label="View full portfolio" />
    </DashboardPanel>
  );
}

function HoldingsPanel({ portfolio }: { portfolio: UseQueryResult<PortfolioSummary> }) {
  return (
    <DashboardPanel
      title={portfolio.data ? `Holdings (${portfolio.data.holdings.length})` : "Holdings"}
      action={{ to: "/portfolio", label: "View all" }}
    >
      {portfolio.isLoading ? (
        <PanelSkeleton rows={3} />
      ) : portfolio.isError || !portfolio.data ? (
        <PanelError
          message={DASHBOARD_ERROR_STATES.holdings}
          retry={() => void portfolio.refetch()}
        />
      ) : portfolio.data.holdings.length ? (
        <div className="dashboard-table-wrap">
          <table className="dashboard-table dashboard-table--holdings">
            <thead>
              <tr>
                <th>Asset</th>
                <th>Units</th>
                <th>Cost basis</th>
                <th>Current value</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.data.holdings.slice(0, 3).map((holding) => (
                <HoldingRow key={holding.assetId} holding={holding} />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <PanelEmpty message={DASHBOARD_EMPTY_STATES.holdings} />
      )}
      <PanelFooter to="/portfolio" label="View all holdings" />
    </DashboardPanel>
  );
}

function HoldingRow({ holding }: { holding: PortfolioHolding }) {
  const media = holding.slug ? assetShowcaseMedia(holding.slug) : undefined;
  return (
    <tr>
      <td>
        <div className="flex min-w-[12rem] items-center gap-2">
          <span
            className="dashboard-asset-placeholder dashboard-asset-placeholder--small"
            aria-hidden="true"
          >
            {media ? <img src={media.src} alt="" /> : <Landmark />}
          </span>
          <span>{holding.title ?? holding.slug ?? "Asset"}</span>
        </div>
      </td>
      <td>{holding.ownedUnits}</td>
      <td>
        {holding.costBasisMinor === null
          ? "Unavailable"
          : formatDashboardMoney(holding.costBasisMinor)}
      </td>
      <td>
        {holding.estimatedValueMinor === null
          ? "Unavailable"
          : formatDashboardMoney(holding.estimatedValueMinor)}
      </td>
    </tr>
  );
}

function TransactionsPanel({
  query,
}: {
  query: UseQueryResult<{ items: PortfolioTransaction[] }>;
}) {
  return (
    <DashboardPanel title="Recent Transactions" action={{ to: "/portfolio", label: "View all" }}>
      {query.isLoading ? (
        <PanelSkeleton rows={3} />
      ) : query.isError ? (
        <PanelError
          message={DASHBOARD_ERROR_STATES.transactions}
          retry={() => void query.refetch()}
        />
      ) : query.data?.items.length ? (
        <ul className="dashboard-transaction-list">
          {query.data.items.slice(0, 3).map((item, index) => (
            <li key={`${item.reference ?? item.type}-${item.effectiveAt}-${index}`}>
              <span
                className={`dashboard-activity-icon ${item.side === "CREDIT" ? "is-credit" : "is-debit"}`}
              >
                {item.side === "CREDIT" ? (
                  <ArrowUpRight aria-hidden="true" />
                ) : (
                  <ArrowDownRight aria-hidden="true" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <strong>{humanise(item.type)}</strong>
                <span>{item.reference ?? "Recorded financial activity"}</span>
              </div>
              <div className="text-right">
                <strong>{formatDashboardMoney(item.amountMinor)}</strong>
                <span>{formatDashboardDate(item.effectiveAt)}</span>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <PanelEmpty message={DASHBOARD_EMPTY_STATES.transactions} />
      )}
      <PanelFooter to="/portfolio" label="View all transactions" />
    </DashboardPanel>
  );
}

function DashboardPanel({
  title,
  icon,
  action,
  className = "",
  children,
}: {
  title?: string;
  icon?: ReactNode;
  action?: { to: "/portfolio" | "/marketplace"; label: string };
  className?: string;
  children: ReactNode;
}) {
  return (
    <section className={`dashboard-panel ${className}`}>
      {title ? (
        <div className="dashboard-panel__head">
          <h2>
            {icon ? <span className="dashboard-panel__title-icon">{icon}</span> : null}
            {title}
          </h2>
          {action ? (
            <Link to={action.to} className="dashboard-panel__action">
              {action.label}
            </Link>
          ) : null}
        </div>
      ) : null}
      <div className="dashboard-panel__body">{children}</div>
    </section>
  );
}

function PanelFooter({ to, label }: { to: "/portfolio" | "/marketplace"; label: string }) {
  return (
    <Link to={to} className="dashboard-panel__footer">
      {label}
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function PanelEmpty({ message }: { message: string }) {
  return <p className="dashboard-panel__empty">{message}</p>;
}

function PanelError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="dashboard-panel__error">
      <p>{message}</p>
      <button type="button" onClick={retry}>
        <RefreshCw aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}

function PanelSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-3" aria-label="Loading panel data">
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="customer-skeleton h-12" />
      ))}
    </div>
  );
}

function OrderSide({ side }: { side: TradingOrderView["side"] }) {
  return (
    <span className={`dashboard-order-side ${side === "BUY" ? "is-buy" : "is-sell"}`}>{side}</span>
  );
}

function OrderStatus({ status }: { status: TradingOrderView["status"] }) {
  return <span className="dashboard-order-status">{humanise(status)}</span>;
}

function DashboardAuthRequired() {
  return (
    <main className="page-shell py-16">
      <section className="customer-state text-center">
        <ChartNoAxesCombined className="mx-auto size-8 text-accent" aria-hidden="true" />
        <p className="page-kicker mt-5">Dashboard</p>
        <h1 className="page-title mt-3">Sign in to see your Slice overview.</h1>
        <p className="mx-auto mt-4 max-w-xl text-subtle">
          Your cash, holdings, orders and durable activity are available only to your account.
        </p>
        <Link
          to="/login"
          className="primary-action mt-6 inline-flex rounded-lg px-5 py-3 text-sm font-semibold text-background"
        >
          Log in
        </Link>
      </section>
    </main>
  );
}

function humanise(value: string) {
  return value
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function formatDashboardDate(value: string) {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
    new Date(value),
  );
}
