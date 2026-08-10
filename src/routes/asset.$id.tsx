import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, ChevronLeft, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { PriceChart } from "@/components/Chart";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/asset/$id")({
  head: () => ({ meta: [{ title: "Asset | Slice" }] }),
  component: AssetPage,
});
const PERIODS = ["24H", "7D", "30D", "90D", "1Y", "ALL"] as const;

function AssetPage() {
  const { id } = Route.useParams();
  const services = useAppServices();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const assetQuery = useQuery({
    queryKey: ["asset", id],
    queryFn: () => services.assets.get(id as never),
  });
  const historyQuery = useQuery({
    queryKey: ["asset", id, "history", period],
    enabled: Boolean(assetQuery.data),
    queryFn: () => services.market.priceHistory(id as never, period),
  });
  const similarQuery = useQuery({
    queryKey: ["asset", id, "similar"],
    enabled: Boolean(assetQuery.data),
    queryFn: () =>
      services.repositories.assets.listAssets({
        category: assetQuery.data?.details.category,
        limit: 6,
      }),
  });
  const orderBookQuery = useQuery({
    queryKey: ["asset", id, "order-book"],
    enabled: Boolean(assetQuery.data),
    queryFn: () => services.market.orderBook(id as never),
  });
  const tradesQuery = useQuery({
    queryKey: ["asset", id, "recent-trades"],
    enabled: Boolean(assetQuery.data),
    queryFn: () => services.market.recentTrades(id as never),
  });
  if (assetQuery.isLoading)
    return <PageState title="Loading asset" description="Fetching the published asset record." />;
  if (assetQuery.isError)
    return (
      <PageState
        title="Asset unavailable"
        description="We could not load this asset."
        retry={() => void assetQuery.refetch()}
      />
    );
  if (!assetQuery.data)
    return (
      <PageState title="Asset not found" description="This asset is not publicly available." />
    );
  const asset = toMarketplaceAsset(assetQuery.data);
  const history = historyQuery.data ?? [];
  return (
    <div className="asset-detail-page">
      <nav className="asset-detail-shell asset-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span>›</span>
        <Link to="/marketplace">Markets</Link>
        <span>›</span>
        <span>{asset.title}</span>
      </nav>
      <div className="asset-detail-shell asset-workspace">
        <main className="asset-primary-column">
          <section className="asset-hero" aria-labelledby="asset-title">
            <div className="asset-showcase">
              <div className="asset-showcase-image">Media unavailable</div>
            </div>
            <div className="asset-summary">
              <div className="asset-identity-row">
                <span>{asset.slug.toUpperCase()}</span>
                <i aria-hidden="true" />
                <strong>{asset.category}</strong>
                <em>{asset.dataStatus ?? "UNAVAILABLE"}</em>
              </div>
              <h1 id="asset-title">{asset.title}</h1>
              <p className="asset-grade-line">
                {asset.grade ?? "Grade unavailable"}
                {asset.setName ? ` · ${asset.setName}` : ""}
              </p>
              <p className="asset-description-copy">
                Public catalogue identity and estimated market-value data. Trading availability and
                execution are confirmed by the backend.
              </p>
              <dl className="asset-value-grid">
                <div>
                  <dt>Estimated Market Value</dt>
                  <dd>
                    {asset.estimatedMarketValueMinor === undefined
                      ? "Unavailable"
                      : formatCurrency(asset.estimatedMarketValueMinor)}
                  </dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>{asset.source ?? "Unavailable"}</dd>
                </div>
                <div>
                  <dt>As of</dt>
                  <dd>{asset.asOf ? formatDate(asset.asOf) : "Unavailable"}</dd>
                </div>
                <div>
                  <dt>Confidence</dt>
                  <dd>
                    {asset.confidence === undefined ? "Unavailable" : `${asset.confidence}/100`}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <section className="asset-chart-panel">
            <div className="asset-section-heading">
              <div>
                <p>Estimated market value history</p>
                <h2>Historical valuations</h2>
              </div>
              <span>
                {asset.change24hBps === undefined
                  ? "Change unavailable"
                  : formatPercent(asset.change24hBps / 100)}
              </span>
            </div>
            <div className="asset-periods">
              {PERIODS.map((value) => (
                <button
                  key={value}
                  type="button"
                  className={period === value ? "is-active" : ""}
                  onClick={() => setPeriod(value)}
                >
                  {value}
                </button>
              ))}
            </div>
            {historyQuery.isLoading ? (
              <p>Loading history…</p>
            ) : historyQuery.isError ? (
              <button type="button" onClick={() => void historyQuery.refetch()}>
                Retry history
              </button>
            ) : history.length ? (
              <PriceChart
                data={history.map((point) => point.value.amount / 100)}
                label="Estimated market value history"
              />
            ) : (
              <p>No valuation history is available.</p>
            )}
          </section>
          <section className="asset-chart-panel">
            <div className="asset-section-heading">
              <div>
                <p>Trading</p>
                <h2>Order book and recent trades</h2>
              </div>
            </div>
            <div className="mb-5 flex flex-wrap gap-3">
              <Link
                to="/buy/$id"
                params={{ id }}
                className="bg-accent px-4 py-2 text-sm font-semibold text-background"
              >
                Buy
              </Link>
              <Link
                to="/sell/$id"
                params={{ id }}
                className="border border-border px-4 py-2 text-sm font-semibold"
              >
                Sell
              </Link>
            </div>
            {orderBookQuery.isLoading ? (
              <p>Loading order book…</p>
            ) : orderBookQuery.isError ? (
              <button type="button" onClick={() => void orderBookQuery.refetch()}>
                Retry order book
              </button>
            ) : (
              <div className="grid gap-5 md:grid-cols-2">
                <BookSide title="Bids" rows={orderBookQuery.data?.bids ?? []} />
                <BookSide title="Asks" rows={orderBookQuery.data?.asks ?? []} />
              </div>
            )}
            <div className="mt-6">
              <h3 className="font-semibold">Recent executions</h3>
              {tradesQuery.isLoading ? (
                <p>Loading executions…</p>
              ) : tradesQuery.isError ? (
                <button type="button" onClick={() => void tradesQuery.refetch()}>
                  Retry executions
                </button>
              ) : tradesQuery.data?.length ? (
                <ul className="mt-3 space-y-2 text-sm">
                  {tradesQuery.data.map((trade) => (
                    <li key={trade.id} className="flex justify-between border-t border-border pt-2">
                      <span>{trade.units} units</span>
                      <span>{formatCurrency(trade.pricePerUnit.amount)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-2">No public executions yet.</p>
              )}
            </div>
          </section>
          <section className="asset-chart-panel">
            <div className="asset-section-heading">
              <div>
                <p>Related catalogue</p>
                <h2>Similar assets</h2>
              </div>
            </div>
            {similarQuery.isLoading ? (
              <p>Loading similar assets…</p>
            ) : similarQuery.isError ? (
              <button type="button" onClick={() => void similarQuery.refetch()}>
                Retry similar assets
              </button>
            ) : similarQuery.data?.items.filter((item) => item.id !== asset.id).length ? (
              <ul>
                {similarQuery.data.items
                  .filter((item) => item.id !== asset.id)
                  .map((item) => (
                    <li key={item.id}>
                      <Link to="/asset/$id" params={{ id: item.slug ?? item.id }}>
                        {item.details.title}
                        <ArrowRight aria-hidden="true" />
                      </Link>
                    </li>
                  ))}
              </ul>
            ) : (
              <p>No similar public assets are available.</p>
            )}
          </section>
        </main>
        <aside className="asset-sidebar">
          <section className="asset-sidebar-card">
            <ShieldCheck aria-hidden="true" />
            <h2>Public asset record</h2>
            <p>Only published catalogue and market data is shown here.</p>
            <Link to="/marketplace" className="asset-sidebar-link">
              <ChevronLeft aria-hidden="true" />
              Back to markets
            </Link>
          </section>
        </aside>
      </div>
    </div>
  );
}
function BookSide({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ pricePerUnit: { amount: number }; units: number }>;
}) {
  return (
    <section className="rounded border border-border p-4">
      <h3 className="font-semibold">{title}</h3>
      {rows.length ? (
        <ul className="mt-3 space-y-2 text-sm">
          {rows.map((row) => (
            <li key={`${row.pricePerUnit.amount}-${row.units}`} className="flex justify-between">
              <span>{formatCurrency(row.pricePerUnit.amount)}</span>
              <span>{row.units} units</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-subtle">No open {title.toLowerCase()}.</p>
      )}
    </section>
  );
}
function PageState({
  title,
  description,
  retry,
}: {
  title: string;
  description: string;
  retry?: () => void;
}) {
  return (
    <div className="asset-detail-shell asset-workspace">
      <main className="asset-primary-column">
        <section className="asset-chart-panel">
          <h1>{title}</h1>
          <p>{description}</p>
          {retry && (
            <button type="button" onClick={retry}>
              Retry
            </button>
          )}
        </section>
      </main>
    </div>
  );
}
