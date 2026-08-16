import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, Bookmark, CheckCircle2, ChevronRight, Info } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/auth/use-session";
import { PriceChart } from "@/components/Chart";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import { marketCategoryPresentation } from "@/components/marketplace/marketplace-presentation";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { formatAvailability, formatPricePerUnit } from "@/lib/market-presentation";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { queryKeys } from "@/queries/keys";
import { customerTerms } from "@/lib/customer-terminology";

export const Route = createFileRoute("/asset/$id")({
  head: () => ({ meta: [{ title: "Asset | Slice" }] }),
  component: AssetPage,
});

const PERIODS = ["24H", "7D", "30D", "90D", "1Y", "ALL"] as const;
const currentUser = "current" as never;

function AssetPage() {
  useCurrency();
  const { id } = Route.useParams();
  const services = useAppServices();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const assetQuery = useQuery({
    queryKey: queryKeys.assets.detail(id),
    queryFn: () => services.assets.get(id as never),
  });
  const historyQuery = useQuery({
    queryKey: queryKeys.market.history(id, period),
    enabled: Boolean(assetQuery.data),
    queryFn: () => services.market.priceHistory(id as never, period),
  });
  const issuanceQuery = useQuery({
    queryKey: ["ownership", "issuance", id],
    enabled: Boolean(assetQuery.data),
    queryFn: () => services.ownership.publicIssuance(id),
  });
  const ownPositionQuery = useQuery({
    queryKey: ["ownership", "position", id],
    enabled: isAuthenticated && Boolean(assetQuery.data),
    queryFn: () => services.ownership.ownMarketPosition(id),
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
    queryKey: queryKeys.market.orderBook(id),
    enabled: Boolean(assetQuery.data),
    queryFn: () => services.market.orderBook(id as never),
  });
  const ownershipSummaryQuery = useQuery({
    queryKey: ["ownership", "market-summary", id],
    enabled: Boolean(assetQuery.data),
    queryFn: () => services.trading.ownershipMarketSummary(id),
  });
  const tradesQuery = useQuery({
    queryKey: queryKeys.market.recentTrades(id),
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
  const approvedMedia =
    asset.media?.find((item) => item.alt.toLowerCase().includes("front")) ?? asset.media?.[0];
  const media = approvedMedia
    ? { src: approvedMedia.url, alt: approvedMedia.alt }
    : assetShowcaseMedia(asset.slug);
  const history = historyQuery.data ?? [];
  const currentValue = asset.estimatedMarketValueMinor;
  const shares = sharePresentation({
    issuedUnits: issuanceQuery.data?.issuedUnits,
    valueMinor: currentValue,
    availabilityBps: asset.availabilityBps,
    ownUnits: ownPositionQuery.data?.settledUnits,
  });
  const slicePriceMinor = ownershipSummaryQuery.data?.slicePriceMinor
    ? Number(ownershipSummaryQuery.data.slicePriceMinor)
    : shares.sharePriceMinor;
  const issuedSlices = ownershipSummaryQuery.data?.totalSlices
    ? Number(ownershipSummaryQuery.data.totalSlices)
    : shares.issuedShares;
  const availableSlices = ownershipSummaryQuery.data?.availableSlices
    ? Number(ownershipSummaryQuery.data.availableSlices)
    : shares.availableShares;
  const notYetTradeable = !issuanceQuery.isLoading && issuanceQuery.data === null;
  const availableOwnershipLabel = notYetTradeable
    ? "Not yet available"
    : !ownershipSummaryQuery.data
      ? formatAvailability(null)
      : formatAvailability(ownershipSummaryQuery.data.availableOwnershipPercent);
  const slicePriceLabel = notYetTradeable
    ? "Not yet available"
    : slicePriceMinor === undefined
      ? "Not available"
      : formatPricePerUnit(slicePriceMinor, "GBP");
  const issuanceLabel = notYetTradeable
    ? "Not issued yet"
    : issuedSlices === undefined
      ? "Unavailable"
      : issuedSlices.toLocaleString();
  const marketMoveLabel =
    notYetTradeable || asset.change24hBps === undefined
      ? "Not available yet"
      : formatPercent(asset.change24hBps / 100);
  const watched = watchlistQuery.data?.assetIds.includes(asset.id as never) ?? false;
  const category = marketCategoryPresentation(asset.category);

  return (
    <div className="asset-detail-page">
      <nav className="asset-detail-shell asset-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">›</span>
        <Link to="/marketplace">Markets</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{asset.title}</span>
      </nav>
      <main className="asset-detail-shell asset-workspace asset-redesign" aria-labelledby="asset-title">
        <header className="asset-page-heading">
          <div>
            <p className="asset-kicker">Published collectible</p>
            <h1 id="asset-title">{asset.title}</h1>
            <p className="asset-page-subtitle">
              {asset.setName ?? "Collectible"} · {assetQuery.data.details.card?.cardNumber ?? "Card number unavailable"} · {asset.grade ?? "Raw / ungraded"}
            </p>
          </div>
          <div className="asset-page-heading__actions">
            <span className="asset-status-badge"><CheckCircle2 aria-hidden="true" /> Published</span>
            <InfoTip label="What does published mean?" text="Slice has reviewed this public record. Trading still depends on custody, supply approval, and issuance." />
          </div>
        </header>

        <section className="asset-redesign-hero">
          <div className="asset-redesign-media">
            <AssetShowcase
              title={asset.title}
              category={category.label}
              grader={asset.grader}
              gradeScore={asset.gradeScore}
              gradeLabel={asset.gradeLabel}
              certificationNumber={asset.certificationNumber}
              media={media}
              watched={watched}
              canWatch={isAuthenticated}
              isUpdatingWatch={toggleWatchlist.isPending}
              onToggleWatch={() => toggleWatchlist.mutate(asset.id)}
            />
            <p className="asset-media-caption"><span>{category.label}</span> Approved front image · public record</p>
          </div>

          <section className="asset-readiness-card" aria-labelledby="market-status-title">
            <div className="asset-section-label">Market status</div>
            {notYetTradeable ? (
              <>
                <div className="asset-readiness-heading">
                  <div>
                    <h2 id="market-status-title">Market opening soon</h2>
                    <p>This collectible is published, but it is not ready to trade yet.</p>
                  </div>
                  <span className="asset-status-badge asset-status-badge--pending">Not yet available</span>
                </div>
                <div className="asset-readiness-callout">
                  <strong>Why can’t I buy it?</strong>
                  <p>Slice must complete custody, approve the ownership supply, and issue units before orders can be placed.</p>
                  <InfoTip label="How the process works" text="These steps protect the link between the physical collectible and the digital ownership units. No price or availability is shown until the market is ready." />
                </div>
                <ol className="asset-readiness-steps" aria-label="Market readiness">
                  <li className="is-complete"><b>1</b><span><strong>Published</strong><small>Public record is live</small></span><CheckCircle2 aria-hidden="true" /></li>
                  <li><b>2</b><span><strong>Custody &amp; supply</strong><small>Being prepared by Slice</small></span><span className="asset-step-state">Next</span></li>
                  <li><b>3</b><span><strong>Market live</strong><small>Buy and sell ownership</small></span><span className="asset-step-state">Later</span></li>
                </ol>
              </>
            ) : (
              <TradingPanel
                book={orderBookQuery.data}
                isLoading={orderBookQuery.isLoading}
                isError={orderBookQuery.isError}
                retry={() => void orderBookQuery.refetch()}
                id={id}
                sharePriceMinor={slicePriceMinor}
                issuedShares={issuedSlices}
                availableShares={availableSlices}
                ownShares={shares.ownShares}
                isAuthenticated={isAuthenticated}
                ownershipSummary={ownershipSummaryQuery.data}
              />
            )}
          </section>
        </section>

        <section className="asset-value-overview" aria-labelledby="asset-overview-title">
          <div className="asset-section-heading">
            <div><p className="asset-section-label">At a glance</p><h2 id="asset-overview-title">What this asset is worth today</h2></div>
            <InfoTip label="About these values" text="The whole collectible value is reference data. A Slice price appears only after supply is approved and ownership units are issued." />
          </div>
          <div className="asset-value-grid">
            <Stat label="Whole collectible value" value={currentValue === undefined ? "Unavailable" : formatCurrency(currentValue, { currency: asset.estimatedMarketValueCurrency })} />
            <Stat label="Price per Slice" value={slicePriceLabel} />
            <Stat label="Ownership availability" value={availableOwnershipLabel} />
            <Stat label="Last valuation" value={asset.asOf ? formatDate(asset.asOf) : "Unavailable"} />
          </div>
        </section>

        <section className="asset-how-it-works" aria-labelledby="how-it-works-title">
          <div className="asset-section-heading">
            <div><p className="asset-section-label">New to Slice?</p><h2 id="how-it-works-title">Ownership, in plain English</h2></div>
            <InfoTip label="What is a Slice?" text="A Slice is a digital ownership unit linked to a real collectible held through Slice’s custody process." />
          </div>
          <p className="asset-section-intro">You do not need to buy the whole card. When this market is ready, you will be able to buy a small, clearly defined portion.</p>
          <div className="asset-how-it-works__grid">
            <div><b>1</b><h3>Slice secures the collectible</h3><p>The physical item is checked and placed into the required custody process.</p></div>
            <div><b>2</b><h3>Ownership units are issued</h3><p>The whole collectible is divided into units with a clear supply and price.</p></div>
            <div><b>3</b><h3>You choose your position</h3><p>Buy, follow, and manage your ownership from one simple portfolio.</p></div>
          </div>
        </section>

        <section className="asset-redesign-grid">
          <section className="asset-price-panel" aria-labelledby="history-title">
            <header><div><p className="asset-section-label">Reference value</p><h2 id="history-title">Value history</h2></div><div aria-label="History range">{PERIODS.map((value) => <button key={value} type="button" aria-pressed={period === value} onClick={() => setPeriod(value)}>{value}</button>)}</div></header>
            <div className={`asset-chart-stage${history.length < 2 && !historyQuery.isLoading && !historyQuery.isError ? " is-empty" : ""}`}>
              {historyQuery.isLoading ? <p>Loading historical valuations…</p> : historyQuery.isError ? <button type="button" onClick={() => void historyQuery.refetch()}>Retry history</button> : history.length >= 2 ? <PriceChart className="asset-price-chart" data={history.map((point) => point.value.amount / 100)} height={150} showAxis label={`Estimated value history for ${asset.title}`} /> : <div className="asset-empty-history"><span>—</span><strong>No market history yet</strong><p>History will appear as real market snapshots are collected.</p></div>}
            </div>
            <div className="asset-chart-stats"><Stat label="Starting value" value={history[0] ? formatCurrency(history[0].value.amount) : "Not available"} /><Stat label="Latest value" value={history.at(-1) ? formatCurrency(history.at(-1)!.value.amount) : "Not available"} /><Stat label="History points" value={history.length ? String(history.length) : "Not available"} /><Stat label="24 hour move" value={marketMoveLabel} /></div>
          </section>

          <section className="asset-details-panel asset-details-panel--compact" aria-labelledby="collectible-details-title">
            <div className="asset-section-label">The item</div><h2 id="collectible-details-title">Collectible details</h2>
            <div><span>Category</span><strong>{category.label}</strong></div>
            <div><span>Set</span><strong>{asset.setName ?? "Unavailable"}</strong></div>
            <div><span>Year</span><strong>{asset.year ?? "Unavailable"}</strong></div>
            <div><span>Card number</span><strong>{assetQuery.data.details.card?.cardNumber ?? "Unavailable"}</strong></div>
            <div><span>Condition</span><strong>{asset.grade ?? "Raw / ungraded"}</strong></div>
            <div><span>Catalogue state</span><strong className="is-positive">Published</strong></div>
          </section>
        </section>

        <section className="asset-redesign-grid asset-redesign-grid--lower">
          <section className="asset-ownership-panel asset-ownership-panel--simple" aria-labelledby="availability-title">
            <div className="asset-section-label">Ownership status</div><h2 id="availability-title">When can I own a Slice?</h2>
            <div className="asset-availability-box"><span className="asset-availability-icon">○</span><div><strong>{notYetTradeable ? "Not yet available" : "Available to trade"}</strong><p>{notYetTradeable ? "There are no ownership units to buy today. This is different from sold out—the market has not opened." : "Ownership units are available through the live market."}</p></div></div>
            <div className="asset-ownership-facts"><Stat label="Total issuance" value={issuanceLabel} /><Stat label="Available ownership" value={availableOwnershipLabel} /><Stat label="Current owners" value={asset.ownersCount === undefined ? "Unavailable" : String(asset.ownersCount)} /></div>
          </section>
          <section className="asset-details-panel" aria-labelledby="reference-data-title">
            <div className="asset-section-label">Reference only</div><h2 id="reference-data-title">Market data explained</h2>
            <p className="asset-panel-helper">Third-party sales and listings help explain the collectible’s reference value. They do not set an executable Slice order price.</p>
            <div><span>Publication</span><strong>Published</strong></div>
            <div><span>Whole collectible reference</span><strong>{currentValue === undefined ? "Unavailable" : formatCurrency(currentValue, { currency: asset.estimatedMarketValueCurrency })}</strong></div>
            <ExternalReference label="Current listing (asking price)" observation={assetQuery.data.market?.reference?.currentListing} />
            <ExternalReference label="Recent completed sale" observation={assetQuery.data.market?.reference?.recentCompletedSale} />
            <div><span>Updated</span><strong>{asset.asOf ? formatDate(asset.asOf) : "Unavailable"}</strong></div>
          </section>
        </section>

        <SimilarAssets items={(similarQuery.data?.items ?? []).map(toMarketplaceAsset)} currentId={asset.id} isLoading={similarQuery.isLoading} isError={similarQuery.isError} retry={() => void similarQuery.refetch()} />
      </main>
    </div>
  );
}

function AssetOwnershipGuide({
  title,
  issuedSlices,
  availableSlices,
  ownSlices,
  sharePriceMinor,
  owners,
  isAuthenticated,
  status,
  verification,
  vaultStatus,
  notYetTradeable,
}: {
  title: string;
  issuedSlices?: number;
  availableSlices?: number;
  ownSlices?: number;
  sharePriceMinor?: number;
  owners?: number;
  isAuthenticated: boolean;
  status: string;
  verification?: string;
  vaultStatus?: string;
  notYetTradeable: boolean;
}) {
  const ownership =
    ownSlices !== undefined && issuedSlices && issuedSlices > 0
      ? formatOwnershipPercent(ownSlices, issuedSlices)
      : null;
  const marketValue =
    ownSlices !== undefined && sharePriceMinor !== undefined
      ? formatCurrency(ownSlices * sharePriceMinor)
      : "Unavailable";
  const stages = [
    { label: "Physical collectible", complete: status !== "draft" },
    { label: "Verified", complete: verification === "verified" },
    { label: "Vault / custody ready", complete: vaultStatus === "stored" },
    { label: "Market live", complete: status === "listed" },
  ];
  return (
    <section className="asset-ownership-guide" aria-labelledby="ownership-guide-title">
      <div className="asset-ownership-guide__heading">
        <div>
          <p className="asset-kicker">How ownership works</p>
          <h2 id="ownership-guide-title">Own a portion of the real collectible.</h2>
          <p>
            A Slice represents a portion of ownership linked to <strong>{title}</strong>. The
            physical collectible remains held through Slice&apos;s custody process.
          </p>
        </div>
        <Info aria-hidden="true" />
      </div>
      <div className="asset-ownership-guide__facts">
        <div>
          <span>Total issuance</span>
          <strong>{issuedSlices?.toLocaleString() ?? "Unavailable"}</strong>
        </div>
        <div>
          <span>Available ownership</span>
          <strong>{notYetTradeable ? "Not yet available" : availableSlices?.toLocaleString() ?? "Unavailable"}</strong>
        </div>
        <div>
          <span>Owners</span>
          <strong>{owners ?? "Unavailable"}</strong>
        </div>
        <div>
          <span>Price per Slice</span>
          <strong>
            {notYetTradeable
              ? "Not yet available"
              : sharePriceMinor === undefined
                ? "Unavailable"
                : formatCurrency(sharePriceMinor)}
          </strong>
        </div>
      </div>
      <div className="asset-ownership-guide__position">
        <div>
          <p className="asset-kicker">
            {isAuthenticated && ownSlices !== undefined ? "Your ownership" : "Example ownership"}
          </p>
          <strong>
            {isAuthenticated && ownSlices !== undefined
              ? `${ownSlices.toLocaleString()} ownership units`
              : "Choose your ownership percentage or amount in the trade panel"}
          </strong>
          <span>
            {isAuthenticated && ownSlices !== undefined
              ? ownSlices > 0
                ? `${ownership ?? "Ownership unavailable"} · current value ${marketValue}`
                : `You don't currently own any ownership units in this collectible.`
              : "Your order may remain open until it matches. Once filled, your ownership units appear in Portfolio."}
          </span>
        </div>
        <ol className="asset-ownership-guide__steps" aria-label="How buying works">
          <li>
            <b>1</b> Choose the percentage or amount you want
          </li>
          <li>
            <b>2</b> Review the total and place your order
          </li>
          <li>
            <b>3</b> Monitor or sell later where trading is available
          </li>
        </ol>
      </div>
      <div className="asset-status-strip" aria-label="Asset journey">
        {stages.map((stage) => (
          <span key={stage.label} className={stage.complete ? "is-complete" : "is-pending"}>
            <CheckCircle2 aria-hidden="true" /> {stage.label}
          </span>
        ))}
        <details>
          <summary>View asset journey</summary>
          <p>Submitted → Received → Verified → Valued → Vault ready → Market live</p>
        </details>
      </div>
    </section>
  );
}

function ExternalReference({
  label,
  observation,
}: {
  label: string;
  observation?: import("@/domain").ExternalMarketObservation;
}) {
  if (!observation) return null;
  return (
    <div>
      <span>{label}</span>
      <strong>
        <a href={observation.listingUrl} target="_blank" rel="noreferrer">
          {formatCurrency(observation.amount.amount, { currency: observation.amount.currency })}
        </a>
      </strong>
      <small>
        {observation.source} · {formatDate(observation.observedAt)}
      </small>
    </div>
  );
}

function AssetShowcase({
  title,
  category,
  grader,
  gradeScore,
  gradeLabel,
  certificationNumber,
  media,
  watched,
  canWatch,
  isUpdatingWatch,
  onToggleWatch,
}: {
  title: string;
  category: string;
  grader?: string;
  gradeScore?: number;
  gradeLabel?: string;
  certificationNumber?: string;
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
      {grader && (
        <span className="asset-grade-badge">
          <small>{grader}</small>
          <strong>{gradeScore === undefined ? "—" : Number(gradeScore.toFixed(2))}</strong>
          <span>{gradeLabel ?? "Grade published"}</span>
          <em>{certificationNumber ? `Cert. ${certificationNumber}` : "Public record"}</em>
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

function InfoTip({ label, text }: { label: string; text: string }) {
  return (
    <details className="asset-info-tip">
      <summary aria-label={label} title={label}>
        <Info aria-hidden="true" />
      </summary>
      <div role="tooltip"><strong>{label}</strong><span>{text}</span></div>
    </details>
  );
}

function NotYetTradeablePanel() {
  return (
    <section className="asset-order-book asset-not-yet-tradeable" aria-live="polite">
      <header>
        <h2>Ownership &amp; trading</h2>
        <strong>Market opening soon</strong>
      </header>
      <p className="asset-trade-helper">
        This collectible is published, but Slice has not approved its ownership supply yet.
      </p>
      <div className="asset-ownership-callout">
        <strong>Not yet available for trading</strong>
        <span>Slice will show the supply, price per Slice, and live availability after issuance and market readiness are complete.</span>
      </div>
    </section>
  );
}

function TradingPanel({
  book,
  isLoading,
  isError,
  retry,
  id,
  sharePriceMinor,
  issuedShares,
  availableShares,
  ownShares,
  isAuthenticated,
  ownershipSummary,
}: {
  book: Awaited<ReturnType<ReturnType<typeof useAppServices>["market"]["orderBook"]>> | undefined;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  id: string;
  sharePriceMinor?: number;
  issuedShares?: number;
  availableShares?: number;
  ownShares?: number;
  isAuthenticated: boolean;
  ownershipSummary:
    | Awaited<ReturnType<ReturnType<typeof useAppServices>["trading"]["ownershipMarketSummary"]>>
    | undefined;
}) {
  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  return (
    <section className="asset-order-book">
      <header>
        <h2>{customerTerms.own}</h2>
        <strong>Ownership &amp; trading</strong>
      </header>
      <p className="asset-trade-helper">
        Choose what percentage of the whole collectible you want to own. Slice converts it into
        whole ownership units, checks live liquidity, and takes you to a protected review step.
      </p>
      <div className="asset-trading-summary">
        <Stat
          label="Whole collectible market value"
          value={
            ownershipSummary?.impliedWholeValueMinor
              ? formatCurrency(Number(ownershipSummary.impliedWholeValueMinor))
              : "Unavailable"
          }
        />
        <Stat
          label="Available ownership"
          value={
            formatAvailability(ownershipSummary?.availableOwnershipPercent)
          }
        />
        <Stat
          label="Value of 1%"
          value={
            ownershipSummary?.onePercentValueMinor
              ? formatCurrency(Number(ownershipSummary.onePercentValueMinor))
              : "Unavailable"
          }
        />
      </div>
      <p className="asset-panel-helper">
        Available ownership is the percentage currently offered through the Slice market. Value of
        1% is an approximate Slice-market calculation, not a third-party listing.
      </p>
      <p className="asset-position-copy">
        {isAuthenticated && ownShares !== undefined && issuedShares !== undefined
          ? `You currently own ${formatOwnershipPercent(ownShares, issuedShares)}. Choose another percentage to see the resulting Slice quantity.`
          : "The collectible is divided into whole ownership units. External reference values are shown separately from executable Slice pricing."}
      </p>
      <div className="asset-ownership-callout">
        <strong>Percentage-first buying</strong>
        <span>
          {ownershipSummary?.onePercentSlices
            ? `1% equals ${ownershipSummary.onePercentSlices} ownership units at the current issuance.`
            : "Slice will show the valid ownership increment for this issuance."}
        </span>
        {!ownershipSummary?.hasImmediateLiquidity && (
          <small>
            No ownership is currently offered at the market price, but you can place a limit order.
          </small>
        )}
      </div>
      {isLoading ? (
        <p>Loading order book…</p>
      ) : isError ? (
        <button type="button" onClick={retry}>
          Retry order book
        </button>
      ) : (
        <>
          <details className="asset-advanced-market-details">
            <summary>View order book</summary>
            <div className="asset-order-head">
              <span>Side</span>
              <span>Ownership units</span>
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
          </details>
        </>
      )}
      <div className="asset-order-actions">
        <Link to="/buy/$id" params={{ id }}>
          Review buy order
        </Link>
        <Link to="/sell/$id" params={{ id }}>
          Review sell order
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
            <small>{row.orderCount}</small>
          </li>
        ))
      ) : (
        <li>
          <span>
            {kind === "ask"
              ? "No ownership is currently offered at the market price."
              : "No open bids"}
          </span>
          <strong>—</strong>
          <em>—</em>
          <small>—</small>
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
                <strong>{trade.units} ownership units</strong>
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
        <div className={`asset-similar-grid${similar.length === 1 ? " is-single" : ""}`}>
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
                  <p>{item.grade ?? marketCategoryPresentation(item.category).label}</p>
                  <strong>
                    {item.estimatedMarketValueMinor === undefined
                      ? "Unavailable"
                      : formatCurrency(item.estimatedMarketValueMinor, {
                          currency: item.estimatedMarketValueCurrency,
                        })}
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

/**
 * Public market data arrives as integer strings.  Keep this calculation in
 * whole shares/minor units so the detail page never manufactures fractional
 * ownership or a floating-point price.  The UI only converts the final,
 * bounded display amount after the integer division is complete.
 */
function sharePresentation(input: {
  issuedUnits?: string;
  valueMinor?: number;
  availabilityBps?: number;
  ownUnits?: string;
}) {
  const issued = positiveSafeInteger(input.issuedUnits);
  const value =
    input.valueMinor !== undefined &&
    Number.isSafeInteger(input.valueMinor) &&
    input.valueMinor >= 0
      ? BigInt(input.valueMinor)
      : undefined;
  const issuedBigInt = issued === undefined ? undefined : BigInt(issued);
  const availability =
    input.availabilityBps !== undefined &&
    Number.isInteger(input.availabilityBps) &&
    input.availabilityBps >= 0 &&
    input.availabilityBps <= 10_000
      ? BigInt(input.availabilityBps)
      : undefined;
  const available =
    issuedBigInt !== undefined && availability !== undefined
      ? (issuedBigInt * availability) / 10_000n
      : undefined;
  const own = positiveSafeInteger(input.ownUnits, true);
  const sharePrice = issuedBigInt && value !== undefined ? value / issuedBigInt : undefined;
  return {
    issuedShares: issued,
    availableShares: safeDisplayInteger(available),
    ownShares: own,
    sharePriceMinor: safeDisplayInteger(sharePrice),
  };
}

function positiveSafeInteger(value: string | undefined, allowZero = false) {
  if (!value || !/^\d+$/.test(value)) return undefined;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || (!allowZero && parsed <= 0) || (allowZero && parsed < 0))
    return undefined;
  return parsed;
}

function safeDisplayInteger(value: bigint | undefined) {
  if (value === undefined || value > BigInt(Number.MAX_SAFE_INTEGER)) return undefined;
  return Number(value);
}

function formatOwnershipPercent(ownedShares: number, issuedShares: number) {
  if (issuedShares <= 0) return "Your settled share position";
  const percentageBasisPoints = (BigInt(ownedShares) * 10_000n) / BigInt(issuedShares);
  const wholePercent = percentageBasisPoints / 100n;
  const fractionalPercent = (percentageBasisPoints % 100n).toString().padStart(2, "0");
  return `${wholePercent}.${fractionalPercent}% ownership`;
}

function formatPublicGrade(score?: number, label?: string) {
  const formattedScore = score === undefined ? undefined : Number(score.toFixed(2)).toString();
  return [formattedScore, label].filter(Boolean).join(" · ") || "Unavailable";
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
