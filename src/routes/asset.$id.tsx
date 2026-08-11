import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Star,
} from "lucide-react";
import { useState } from "react";
import { useSession } from "@/auth/use-session";
import { PriceChart } from "@/components/Chart";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/asset/$id")({
  head: () => ({ meta: [{ title: "Asset | Slice" }] }),
  component: AssetPage,
});

const PERIODS = ["24H", "7D", "30D", "90D", "1Y", "ALL"] as const;
const currentUser = "current" as never;

function AssetPage() {
  const { id } = Route.useParams();
  const services = useAppServices();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
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
  const watchlistQuery = useQuery({
    queryKey: ["watchlist", "current"],
    enabled: isAuthenticated,
    queryFn: () => services.ownership.watchlist(currentUser),
  });
  const toggleWatchlist = useMutation({
    mutationFn: (assetId: string) =>
      services.ownership.toggleWatchlist(currentUser, assetId as never),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["watchlist", "current"] }),
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
  const media = assetShowcaseMedia(asset.slug);
  const history = historyQuery.data ?? [];
  const currentValue = asset.estimatedMarketValueMinor;
  const watched = watchlistQuery.data?.assetIds.includes(asset.id as never) ?? false;

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
            <AssetShowcase
              title={asset.title}
              category={asset.category}
              grade={asset.grade}
              media={media}
              watched={watched}
              canWatch={isAuthenticated}
              isUpdatingWatch={toggleWatchlist.isPending}
              onToggleWatch={() => toggleWatchlist.mutate(asset.id)}
            />
            <div className="asset-summary">
              <div className="asset-summary-top">
                <section className="asset-description">
                  <div className="asset-identity-row">
                    <span>Published asset</span>
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
                    Authenticated catalogue identity, valuation history and public market activity.
                    Trading status is always confirmed by the Slice API.
                  </p>
                </section>
                <section className="asset-trade-summary" aria-label="Asset trade summary">
                  <span>Estimated market value</span>
                  <strong>
                    {currentValue === undefined ? "Unavailable" : formatCurrency(currentValue)}
                  </strong>
                  <em>
                    {asset.change24hBps === undefined
                      ? "Change unavailable"
                      : `${formatPercent(asset.change24hBps / 100)} (24h)`}
                  </em>
                  <Link to="/buy/$id" params={{ id }} className="asset-buy-action">
                    Buy units
                  </Link>
                  <Link to="/sell/$id" params={{ id }} className="asset-sell-action">
                    Sell units
                  </Link>
                  <div className="asset-owned-summary">
                    <span>Market availability</span>
                    <strong>
                      {asset.availabilityBps === undefined
                        ? "Unavailable"
                        : `${(asset.availabilityBps / 100).toFixed(1)}% available`}
                    </strong>
                    <div aria-hidden="true">
                      <i
                        style={{
                          width: `${Math.min(Math.max(asset.availabilityBps ?? 0, 0), 10000) / 100}%`,
                        }}
                      />
                    </div>
                    <small>Aggregate published market availability</small>
                  </div>
                </section>
              </div>
              <AssetRanking asset={asset} historyCount={history.length} />
            </div>
          </section>

          <section className="asset-market-stats" aria-label="Market statistics">
            <h2>Market snapshot</h2>
            <div>
              <Stat
                label="Market value"
                value={currentValue === undefined ? "Unavailable" : formatCurrency(currentValue)}
              />
              <Stat
                label="24 hour move"
                value={
                  asset.change24hBps === undefined
                    ? "Unavailable"
                    : formatPercent(asset.change24hBps / 100)
                }
                accent
              />
              <Stat
                label="Availability"
                value={
                  asset.availabilityBps === undefined
                    ? "Unavailable"
                    : `${(asset.availabilityBps / 100).toFixed(1)}%`
                }
              />
              <Stat
                label="Confidence"
                value={asset.confidence === undefined ? "Unavailable" : `${asset.confidence}/100`}
              />
              <Stat label="Market source" value={asset.source ?? "Unavailable"} />
              <Stat
                label="Last valuation"
                value={asset.asOf ? formatDate(asset.asOf) : "Unavailable"}
              />
              <Stat label="Data status" value={asset.dataStatus ?? "Unavailable"} accent />
            </div>
          </section>

          <section className="asset-price-panel">
            <header>
              <h2>Market value history</h2>
              <div aria-label="History range">
                {PERIODS.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={period === value}
                    onClick={() => setPeriod(value)}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </header>
            <div className="asset-chart-stage">
              {historyQuery.isLoading ? (
                <p>Loading historical valuations…</p>
              ) : historyQuery.isError ? (
                <button type="button" onClick={() => void historyQuery.refetch()}>
                  Retry history
                </button>
              ) : history.length >= 2 ? (
                <PriceChart
                  className="asset-price-chart"
                  data={history.map((point) => point.value.amount / 100)}
                  height={74}
                  showAxis
                  label={`Estimated value history for ${asset.title}`}
                />
              ) : (
                <p>No valuation history is available.</p>
              )}
              <div className="asset-chart-dates" aria-hidden="true">
                <span>{period === "ALL" ? "All time" : period}</span>
                <span>Latest</span>
              </div>
            </div>
            <div className="asset-chart-stats">
              <Stat
                label="Starting value"
                value={history[0] ? formatCurrency(history[0].value.amount) : "Unavailable"}
              />
              <Stat
                label="Latest value"
                value={
                  history.at(-1) ? formatCurrency(history.at(-1)!.value.amount) : "Unavailable"
                }
              />
              <Stat
                label="History points"
                value={history.length ? String(history.length) : "Unavailable"}
              />
              <Stat
                label="24 hour move"
                value={
                  asset.change24hBps === undefined
                    ? "Unavailable"
                    : formatPercent(asset.change24hBps / 100)
                }
              />
            </div>
          </section>

          <section className="asset-insight-grid">
            <section className="asset-ownership-panel">
              <h2>Ownership availability</h2>
              <div className="asset-ownership-content">
                <div className="asset-donut">
                  <span>
                    <strong>
                      {asset.availabilityBps === undefined
                        ? "—"
                        : `${(asset.availabilityBps / 100).toFixed(1)}%`}
                    </strong>
                    available
                  </span>
                </div>
                <ul>
                  <li>
                    <i className="is-emerald" />
                    <span>Published availability</span>
                    <strong>
                      {asset.availabilityBps === undefined
                        ? "Unavailable"
                        : `${(asset.availabilityBps / 100).toFixed(1)}%`}
                    </strong>
                  </li>
                  <li>
                    <i className="is-violet" />
                    <span>Owners</span>
                    <strong>
                      {asset.ownersCount === undefined ? "Unavailable" : asset.ownersCount}
                    </strong>
                  </li>
                  <li>
                    <i className="is-amber" />
                    <span>Reserved / unavailable</span>
                    <strong>
                      {asset.availabilityBps === undefined
                        ? "Unavailable"
                        : `${((10000 - asset.availabilityBps) / 100).toFixed(1)}%`}
                    </strong>
                  </li>
                </ul>
              </div>
            </section>
            <section className="asset-details-panel">
              <h2>Collectible record</h2>
              <div>
                <span>Category</span>
                <strong>{asset.category}</strong>
              </div>
              <div>
                <span>Set</span>
                <strong>{asset.setName ?? "Unavailable"}</strong>
              </div>
              <div>
                <span>Grade</span>
                <strong>{asset.grade ?? "Unavailable"}</strong>
              </div>
              <div>
                <span>Catalogue state</span>
                <strong>Published</strong>
              </div>
              <div>
                <span>Public reference</span>
                <strong>{asset.slug}</strong>
              </div>
            </section>
            <section className="asset-details-panel">
              <h2>Market integrity</h2>
              <div>
                <span>Publication</span>
                <strong>Published</strong>
              </div>
              <div>
                <span>Source</span>
                <strong>{asset.source ?? "Unavailable"}</strong>
              </div>
              <div>
                <span>Confidence</span>
                <strong>
                  {asset.confidence === undefined ? "Unavailable" : `${asset.confidence}/100`}
                </strong>
              </div>
              <div>
                <span>Data status</span>
                <strong>{asset.dataStatus ?? "Unavailable"}</strong>
              </div>
              <div>
                <span>Recorded</span>
                <strong>{asset.asOf ? formatDate(asset.asOf) : "Unavailable"}</strong>
              </div>
            </section>
          </section>

          <SimilarAssets
            items={(similarQuery.data?.items ?? []).map(toMarketplaceAsset)}
            currentId={asset.id}
            isLoading={similarQuery.isLoading}
            isError={similarQuery.isError}
            retry={() => void similarQuery.refetch()}
          />
        </main>

        <aside className="asset-sidebar">
          <div className="asset-trading-sidebar">
            <OrderBook
              book={orderBookQuery.data}
              isLoading={orderBookQuery.isLoading}
              isError={orderBookQuery.isError}
              retry={() => void orderBookQuery.refetch()}
              id={id}
            />
            <RecentTrades
              trades={tradesQuery.data ?? []}
              isLoading={tradesQuery.isLoading}
              isError={tradesQuery.isError}
              retry={() => void tradesQuery.refetch()}
            />
            <section className="asset-sidebar-card">
              <ShieldCheck aria-hidden="true" />
              <h2>Public asset record</h2>
              <p>Only published catalogue and aggregate market data are shown here.</p>
              <Link to="/marketplace" className="asset-sidebar-link">
                <ChevronLeft aria-hidden="true" />
                Back to markets
              </Link>
            </section>
          </div>
        </aside>
      </div>
    </div>
  );
}

function AssetShowcase({
  title,
  category,
  grade,
  media,
  watched,
  canWatch,
  isUpdatingWatch,
  onToggleWatch,
}: {
  title: string;
  category: string;
  grade?: string;
  media?: { src: string; alt: string };
  watched: boolean;
  canWatch: boolean;
  isUpdatingWatch: boolean;
  onToggleWatch: () => void;
}) {
  return (
    <div className="asset-showcase">
      <span className="asset-slab-light" aria-hidden="true" />
      <span className="asset-pedestal" aria-hidden="true" />
      <span className="asset-particles" aria-hidden="true">
        {Array.from({ length: 11 }, (_, index) => (
          <i key={index} />
        ))}
      </span>
      <span className="asset-live-badge">Published</span>
      {grade && (
        <span className="asset-grade-badge">
          <small>Grade</small>
          <strong>{grade.replace(/^[A-Z]+\s+/, "")}</strong>
          <em>verified</em>
        </span>
      )}
      <button
        type="button"
        className="asset-watch-button"
        aria-pressed={watched}
        disabled={!canWatch || isUpdatingWatch}
        title={canWatch ? "Add or remove from watchlist" : "Sign in to use watchlist"}
        onClick={onToggleWatch}
      >
        <Bookmark aria-hidden="true" fill={watched ? "currentColor" : "none"} />
        {watched ? "Watching" : "Watch"}
      </button>
      <span className="asset-category-pill">
        <i aria-hidden="true" />
        {category}
      </span>
      {media ? (
        <img src={media.src} alt={media.alt} />
      ) : (
        <div className="asset-showcase-image">Approved media unavailable</div>
      )}
      <span className="sr-only">{title}</span>
    </div>
  );
}

function AssetRanking({
  asset,
  historyCount,
}: {
  asset: ReturnType<typeof toMarketplaceAsset>;
  historyCount: number;
}) {
  return (
    <div className="asset-ranking-strip">
      <div>
        <span>Market data</span>
        <strong>
          <Star aria-hidden="true" />
          {asset.dataStatus ?? "Unavailable"}
        </strong>
        <small>{asset.source ?? "No market source"}</small>
      </div>
      <div>
        <span>Availability</span>
        <strong>
          {asset.availabilityBps === undefined
            ? "Unavailable"
            : `${(asset.availabilityBps / 100).toFixed(1)}%`}
        </strong>
        <small>aggregate public supply</small>
      </div>
      <div>
        <span>Market confidence</span>
        <strong>
          {asset.confidence === undefined ? "Unavailable" : `${asset.confidence}/100`}
        </strong>
        <small>latest valuation snapshot</small>
      </div>
      <div>
        <span>Historical points</span>
        <strong>{historyCount || "Unavailable"}</strong>
        <small>authoritative valuation history</small>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <dl className={accent ? "is-highlight" : undefined}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </dl>
  );
}

function OrderBook({
  book,
  isLoading,
  isError,
  retry,
  id,
}: {
  book: Awaited<ReturnType<ReturnType<typeof useAppServices>["market"]["orderBook"]>> | undefined;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  id: string;
}) {
  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  return (
    <section className="asset-order-book">
      <header>
        <h2>Order book</h2>
        <strong>Live API</strong>
      </header>
      {isLoading ? (
        <p>Loading order book…</p>
      ) : isError ? (
        <button type="button" onClick={retry}>
          Retry order book
        </button>
      ) : (
        <>
          <div className="asset-order-head">
            <span>Side</span>
            <span>Units</span>
            <span>Price</span>
            <span>Orders</span>
          </div>
          <OrderRows rows={asks} kind="ask" />
          <div className="asset-spread-row">
            <span>Spread</span>
            <strong>
              {bids[0] && asks[0]
                ? formatCurrency(
                    Math.max(asks[0].pricePerUnit.amount - bids[0].pricePerUnit.amount, 0),
                  )
                : "Unavailable"}
            </strong>
          </div>
          <OrderRows rows={bids} kind="bid" />
        </>
      )}
      <div className="asset-order-actions">
        <Link to="/buy/$id" params={{ id }}>
          Buy
        </Link>
        <Link to="/sell/$id" params={{ id }}>
          Sell
        </Link>
      </div>
    </section>
  );
}

function OrderRows({
  rows,
  kind,
}: {
  rows: Array<{ pricePerUnit: { amount: number }; units: number; orderCount: number }>;
  kind: "ask" | "bid";
}) {
  return (
    <ul className={`asset-order-rows is-${kind}`}>
      {rows.length ? (
        rows.slice(0, 5).map((row) => (
          <li key={`${kind}-${row.pricePerUnit.amount}-${row.units}`}>
            <span>{kind === "ask" ? "Ask" : "Bid"}</span>
            <strong>{row.units}</strong>
            <em>{formatCurrency(row.pricePerUnit.amount)}</em>
          </li>
        ))
      ) : (
        <li>
          <span>No open {kind === "ask" ? "asks" : "bids"}</span>
          <strong>—</strong>
          <em>—</em>
        </li>
      )}
    </ul>
  );
}

function RecentTrades({
  trades,
  isLoading,
  isError,
  retry,
}: {
  trades: Awaited<ReturnType<ReturnType<typeof useAppServices>["market"]["recentTrades"]>>;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}) {
  return (
    <section className="asset-recent-trades">
      <header>
        <h2>Recent executions</h2>
        <span>Public only</span>
      </header>
      {isLoading ? (
        <p>Loading executions…</p>
      ) : isError ? (
        <button type="button" onClick={retry}>
          Retry executions
        </button>
      ) : (
        <ul>
          {trades.length ? (
            trades.slice(0, 7).map((trade) => (
              <li key={trade.id}>
                <span>{formatDate(trade.executedAt)}</span>
                <strong>{trade.units} units</strong>
                <em className="is-up">{formatCurrency(trade.pricePerUnit.amount)}</em>
              </li>
            ))
          ) : (
            <li>
              <span>No public executions yet.</span>
              <strong>—</strong>
              <em>—</em>
            </li>
          )}
        </ul>
      )}
    </section>
  );
}

function SimilarAssets({
  items,
  currentId,
  isLoading,
  isError,
  retry,
}: {
  items: Array<ReturnType<typeof toMarketplaceAsset>>;
  currentId: string;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}) {
  const similar = items.filter((item) => item.id !== currentId).slice(0, 6);
  return (
    <section className="asset-similar-section">
      <header>
        <h2>Similar assets</h2>
        <div>
          <Link to="/marketplace">View market</Link>
          <button type="button" aria-label="Previous similar assets">
            <ArrowLeft />
          </button>
          <button type="button" aria-label="Next similar assets">
            <ChevronRight />
          </button>
        </div>
      </header>
      {isLoading ? (
        <p>Loading related catalogue…</p>
      ) : isError ? (
        <button type="button" onClick={retry}>
          Retry similar assets
        </button>
      ) : similar.length ? (
        <div className="asset-similar-grid">
          {similar.map((item) => {
            const media = assetShowcaseMedia(item.slug);
            return (
              <Link
                key={item.id}
                to="/asset/$id"
                params={{ id: item.slug }}
                className="asset-similar-card"
              >
                <div>{media ? <img src={media.src} alt="" /> : <span>Media unavailable</span>}</div>
                <section>
                  <h3>{item.title}</h3>
                  <p>{item.grade ?? item.category}</p>
                  <strong>
                    {item.estimatedMarketValueMinor === undefined
                      ? "Unavailable"
                      : formatCurrency(item.estimatedMarketValueMinor)}
                  </strong>
                  {item.change24hBps !== undefined && (
                    <em>{formatPercent(item.change24hBps / 100)}</em>
                  )}
                </section>
              </Link>
            );
          })}
        </div>
      ) : (
        <p>No similar public assets are available.</p>
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
        <section className="asset-price-panel">
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
