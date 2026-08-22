import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  Bookmark,
  CheckCircle2,
  ChevronRight,
  Info,
  RotateCw,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useSession } from "@/auth/use-session";
import { PriceChart } from "@/components/Chart";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import { marketCategoryPresentation } from "@/components/marketplace/marketplace-presentation";
import {
  effectiveCardFlipState,
  resolveMarketplaceMedia,
} from "@/components/marketplace/marketplace-layout";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { formatAvailability, formatPricePerUnit } from "@/lib/market-presentation";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { queryKeys } from "@/queries/keys";
import { customerTerms } from "@/lib/customer-terminology";
import type { MarketLifecycleProjection, SliceGrade } from "@/domain";

export const Route = createFileRoute("/asset/$id")({
  head: () => ({ meta: [{ title: "Asset | Slice" }] }),
  component: AssetPage,
});

const PERIODS = ["24H", "7D", "30D", "90D", "1Y", "ALL"] as const;
const currentUser = "current" as never;

function LifecycleReadinessPanel({ lifecycle }: { lifecycle?: MarketLifecycleProjection }) {
  if (!lifecycle) {
    return <p className="asset-detail-muted">Market status is being prepared.</p>;
  }
  return (
    <>
      <div className="asset-readiness-heading">
        <div>
          <h2 id="market-status-title">{lifecycle.headline}</h2>
          <p>{lifecycle.explanation}</p>
        </div>
        <span className="asset-status-badge asset-status-badge--pending">
          {lifecycle.statusPill}
        </span>
      </div>
      {lifecycle.tradeabilityMessage ? (
        <div className="asset-readiness-callout">
          <strong>
            {lifecycle.phase === "SUSPENDED" ? "Why is trading paused?" : "Why can’t I buy it?"}
          </strong>
          <p>{lifecycle.tradeabilityMessage}</p>
          <InfoTip
            label="How the process works"
            text="These steps protect the link between the physical collectible and the digital ownership units."
          />
        </div>
      ) : null}
      <ol className="asset-readiness-steps" aria-label="Market readiness">
        {lifecycle.steps.map((step, index) => (
          <li className={`is-${step.state}`} key={step.key}>
            <b>{index + 1}</b>
            <span>
              <strong>{step.label}</strong>
              <small>{step.subtitle}</small>
            </span>
            {step.state === "complete" ? (
              <CheckCircle2 aria-hidden="true" />
            ) : (
              <span className="asset-step-state">
                {step.state === "current" ? "Next" : step.state === "blocked" ? "Blocked" : "Later"}
              </span>
            )}
          </li>
        ))}
      </ol>
      <div className="asset-readiness-actions" aria-label="Trading availability">
        <div>
          <strong>Buy a Slice</strong>
          <span>
            {lifecycle.canBuy
              ? "Choose a position on the live market."
              : "Choose a position when trading is live."}
          </span>
        </div>
        <div>
          <strong>Sell a Slice</strong>
          <span>
            {lifecycle.canSell
              ? "Sell settled units from your portfolio."
              : "Sell settled units once trading is live."}
          </span>
        </div>
      </div>
    </>
  );
}

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
  const imageMedia = asset.media?.filter((item) => !item.alt.toLowerCase().includes("video")) ?? [];
  const approvedMedia =
    imageMedia.find((item) => item.alt.toLowerCase().includes("front")) ?? imageMedia[0];
  const reverseMedia =
    imageMedia.find((item) => item.alt.toLowerCase().includes("back")) ??
    imageMedia.find(
      (item) => item !== approvedMedia && !item.alt.toLowerCase().includes("front"),
    ) ??
    imageMedia[1];
  const media = resolveMarketplaceMedia(asset);
  const backMedia = reverseMedia ? { src: reverseMedia.url, alt: reverseMedia.alt } : undefined;
  const lifecycle = asset.marketLifecycle;
  const initialOffering = asset.initialOffering;
  const initialOfferingOpen = Boolean(
    initialOffering &&
    ["OPEN", "PARTIALLY_FILLED"].includes(initialOffering.status) &&
    initialOffering.inventory,
  );
  const history = historyQuery.data ?? [];
  const currentValue = asset.sliceValuationAmountMinor ?? asset.estimatedMarketValueMinor;
  const currentValueCurrency = asset.sliceValuationCurrency ?? asset.estimatedMarketValueCurrency;
  const sliceValuationAt = asset.sliceValuationApprovedAt ?? asset.asOf;
  const marketReferenceAt =
    assetQuery.data.market?.reference?.currentListing?.observedAt ??
    assetQuery.data.market?.reference?.recentCompletedSale?.observedAt;
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
  const notYetTradeable = lifecycle
    ? lifecycle.phase !== "LIVE"
    : !issuanceQuery.isLoading && issuanceQuery.data === null;
  const liveWithoutListings = lifecycle?.phase === "LIVE" && availableSlices === 0;
  const availableOwnershipLabel = notYetTradeable
    ? (lifecycle?.statusPill ?? "Not yet available")
    : liveWithoutListings
      ? "No listings"
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
  const hasTradingHistory = (tradesQuery.data?.length ?? 0) > 0;
  const marketMoveLabel = notYetTradeable
    ? "Not available yet"
    : hasTradingHistory && asset.change24hBps !== undefined
      ? formatPercent(asset.change24hBps / 100)
      : "No trading history yet";
  const watched = watchlistQuery.data?.assetIds.includes(asset.id as never) ?? false;
  const category = marketCategoryPresentation(asset.category);
  const displayCurrency = ownershipSummaryQuery.data?.currency ?? currentValueCurrency ?? "GBP";
  const condition = asset.conditionLabel ?? asset.grade ?? "Raw / Ungraded";
  const handleWatch = () => {
    if (!isAuthenticated) {
      window.location.assign(`/login?returnTo=${encodeURIComponent(`/asset/${id}`)}`);
      return;
    }
    toggleWatchlist.mutate(asset.id);
  };

  return (
    <div className="asset-detail-page">
      <nav className="asset-detail-shell asset-breadcrumbs" aria-label="Breadcrumb">
        <Link to="/">Home</Link>
        <span aria-hidden="true">›</span>
        <Link to="/marketplace">Markets</Link>
        <span aria-hidden="true">›</span>
        <span aria-current="page">{asset.title}</span>
      </nav>
      <main
        className="asset-detail-shell asset-workspace asset-redesign"
        aria-labelledby="asset-title"
      >
        <section className="asset-redesign-hero">
          <div className="asset-redesign-media">
            <AssetShowcase
              title={asset.title}
              grader={asset.grader}
              gradeScore={asset.gradeScore}
              gradeLabel={asset.gradeLabel}
              certificationNumber={asset.certificationNumber}
              media={media}
              backMedia={backMedia}
            />
            <p className="asset-media-caption">
              <span>{backMedia ? "Front & back verified" : "Approved media"}</span>
              <span className="asset-media-caption__hint">
                {backMedia ? "Hover or tap to flip the card" : "Public catalogue image"}
              </span>
            </p>
          </div>

          <section className="asset-reference-identity" aria-labelledby="asset-title">
            <div className="asset-reference-identity__topline">
              <p className="asset-kicker">Collectible</p>
              <WatchlistControl
                watched={watched}
                isAuthenticated={isAuthenticated}
                isUpdating={toggleWatchlist.isPending}
                onClick={handleWatch}
              />
            </div>
            <h1 id="asset-title">{asset.title}</h1>
            <p className="asset-page-subtitle">
              {[category.label, asset.setName, asset.cardNumber, condition, asset.year]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
            <div className="asset-reference-identity__status" aria-label="Asset status">
              <span className="asset-status-badge asset-status-badge--live">
                <i aria-hidden="true" /> {lifecycle?.badge ?? "Published"}
              </span>
              {initialOffering ? (
                <span className="asset-status-badge asset-status-badge--gold">
                  Initial offering
                </span>
              ) : null}
              <InfoTip
                label="About this collectible"
                text="Slice keeps the physical collectible, valuation, ownership supply, and trading state as separate records so each part remains clear."
              />
            </div>
            <div className="asset-reference-identity__valuation">
              <div>
                <span className="asset-section-label">Slice valuation</span>
                <strong>
                  {currentValue === undefined
                    ? "Unavailable"
                    : formatCurrency(currentValue, { currency: currentValueCurrency })}
                </strong>
                <small>
                  {sliceValuationAt
                    ? `Approved ${formatDate(sliceValuationAt)}`
                    : "Authoritative Slice value"}
                </small>
              </div>
              <div>
                <span className="asset-section-label">External reference</span>
                <strong>
                  {asset.marketReference
                    ? formatCurrency(asset.marketReference.amountMinor, {
                        currency: asset.marketReference.currency,
                      })
                    : "Unavailable"}
                </strong>
                <small>{asset.marketReference?.source ?? "No external reference"}</small>
              </div>
            </div>
          </section>

          <section className="asset-readiness-card" aria-labelledby="market-status-title">
            {notYetTradeable ? (
              <LifecycleReadinessPanel lifecycle={lifecycle} />
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
                trades={tradesQuery.data ?? []}
                tradesLoading={tradesQuery.isLoading}
                tradesError={tradesQuery.isError}
                retryTrades={() => void tradesQuery.refetch()}
                currency={displayCurrency}
              />
            )}
          </section>
        </section>

        {initialOfferingOpen && initialOffering?.inventory ? (
          <section className="asset-initial-offering" aria-labelledby="initial-offering-title">
            <div>
              <p className="asset-section-label">Initial offering</p>
              <h2 id="initial-offering-title">Own a portion of this collectible</h2>
              <p>
                The collector is offering a defined portion of this real collectible. Slice keeps
                the ownership record clear from your first purchase.
              </p>
            </div>
            <dl>
              <div>
                <dt>Starting price</dt>
                <dd>
                  {formatPricePerUnit(
                    Number(initialOffering.pricePerUnitMinor),
                    initialOffering.currency,
                  )}
                </dd>
                <small>per Slice</small>
              </div>
              <div>
                <dt>Available ownership</dt>
                <dd>{formatAvailability(initialOfferingAvailabilityBps(initialOffering) / 100)}</dd>
              </div>
              <div>
                <dt>Collector retained</dt>
                <dd>
                  {formatOfferingPercentage(
                    initialOffering.retainedUnits,
                    initialOffering.totalUnits,
                  )}
                </dd>
                <small>remains in their portfolio</small>
              </div>
            </dl>
          </section>
        ) : null}

        <section className="asset-value-overview" aria-labelledby="asset-overview-title">
          <div className="asset-section-heading">
            <div>
              <p className="asset-section-label">At a glance</p>
              <h2 id="asset-overview-title">What this asset is worth today</h2>
            </div>
            <InfoTip
              label="About these values"
              text="The Slice valuation is staff-approved and remains separate from external market references. A Slice price appears after supply is approved and ownership units are issued."
            />
          </div>
          <div className="asset-value-grid">
            <Stat
              label="Whole collectible value"
              value={
                currentValue === undefined
                  ? "Unavailable"
                  : formatCurrency(currentValue, { currency: currentValueCurrency })
              }
            />
            <Stat label="Price per Slice" value={slicePriceLabel} />
            <Stat label="Ownership availability" value={availableOwnershipLabel} />
            <Stat
              label="Last valuation"
              value={sliceValuationAt ? formatDate(sliceValuationAt) : "Unavailable"}
            />
          </div>
        </section>

        <section className="asset-how-it-works" aria-labelledby="how-it-works-title">
          <div className="asset-section-heading">
            <div>
              <p className="asset-section-label">New to Slice?</p>
              <h2 id="how-it-works-title">Ownership, in plain English</h2>
            </div>
            <InfoTip
              label="What is a Slice?"
              text="A Slice is a digital ownership unit linked to a real collectible held through Slice’s custody process."
            />
          </div>
          <p className="asset-section-intro">
            You do not need to buy the whole card. When this market is ready, you will be able to
            buy a small, clearly defined portion.
          </p>
          <div className="asset-how-it-works__grid">
            <div>
              <b>1</b>
              <h3>Slice secures the collectible</h3>
              <p>The physical item is checked and placed into the required custody process.</p>
            </div>
            <div>
              <b>2</b>
              <h3>Ownership units are issued</h3>
              <p>The whole collectible is divided into units with a clear supply and price.</p>
            </div>
            <div>
              <b>3</b>
              <h3>Buy your position</h3>
              <p>Choose the number of ownership units that fits you.</p>
            </div>
            <div>
              <b>4</b>
              <h3>Track &amp; sell later</h3>
              <p>Follow your position in Portfolio and sell when the market is live.</p>
            </div>
          </div>
        </section>

        <section className="asset-redesign-grid">
          <section className="asset-price-panel" aria-labelledby="history-title">
            <header>
              <div>
                <p className="asset-section-label">Reference value</p>
                <h2 id="history-title">Value history</h2>
              </div>
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
            <div
              className={`asset-chart-stage${history.length < 2 && !historyQuery.isLoading && !historyQuery.isError ? " is-empty" : ""}`}
            >
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
                  height={150}
                  showAxis
                  label={`Estimated value history for ${asset.title}`}
                />
              ) : (
                <div className="asset-empty-history">
                  <span>—</span>
                  <strong>No market history yet</strong>
                  <p>History will appear as real market snapshots are collected.</p>
                </div>
              )}
            </div>
            <div className="asset-chart-stats">
              <Stat
                label="Starting value"
                value={history[0] ? formatCurrency(history[0].value.amount) : "Not available"}
              />
              <Stat
                label="Latest value"
                value={
                  history.at(-1) ? formatCurrency(history.at(-1)!.value.amount) : "Not available"
                }
              />
              <Stat
                label="History points"
                value={history.length ? String(history.length) : "Not available"}
              />
              <Stat label="24 hour move" value={marketMoveLabel} />
            </div>
          </section>

          <section
            className="asset-details-panel asset-details-panel--compact"
            aria-labelledby="collectible-details-title"
          >
            <div className="asset-section-label">The item</div>
            <h2 id="collectible-details-title">Collectible details</h2>
            <div>
              <span>Category</span>
              <strong>{category.label}</strong>
            </div>
            <div>
              <span>Set</span>
              <strong>{asset.setName ?? "Unavailable"}</strong>
            </div>
            <div>
              <span>Year</span>
              <strong>{asset.year ?? "Unavailable"}</strong>
            </div>
            <div>
              <span>Card number</span>
              <strong>{assetQuery.data.details.card?.cardNumber ?? "Unavailable"}</strong>
            </div>
            <div>
              <span>Condition</span>
              <strong>{condition}</strong>
            </div>
            <div>
              <span>Catalogue state</span>
              <strong className="is-positive">Published</strong>
            </div>
          </section>
        </section>

        {!asset.grade ? (
          asset.sliceGrade ? (
            <SliceGradePanel grade={asset.sliceGrade} />
          ) : (
            <SliceGradeEmptyPanel />
          )
        ) : null}

        <section className="asset-redesign-grid asset-redesign-grid--lower">
          <section
            className="asset-ownership-panel asset-ownership-panel--simple"
            aria-labelledby="availability-title"
          >
            <div className="asset-section-label">Ownership status</div>
            <h2 id="availability-title">When can I own a Slice?</h2>
            <div className="asset-availability-box">
              <span className="asset-availability-icon">○</span>
              <div>
                <strong>
                  {notYetTradeable
                    ? "Not yet available"
                    : (availableSlices ?? 0) > 0
                      ? "Available to trade"
                      : "Market open · awaiting listings"}
                </strong>
                <p>
                  {notYetTradeable
                    ? "There are no ownership units to buy today. This is different from sold out—the market has not opened."
                    : (availableSlices ?? 0) > 0
                      ? "Ownership units are available through the live market."
                      : "The market is open, but no ownership units are currently listed. Place a limit order or check back when a collector lists units."}
                </p>
              </div>
            </div>
            <div className="asset-ownership-facts">
              <Stat label="Total issuance" value={issuanceLabel} />
              <Stat label="Available ownership" value={availableOwnershipLabel} />
              <Stat
                label="Current owners"
                value={asset.ownersCount === undefined ? "Unavailable" : String(asset.ownersCount)}
              />
            </div>
          </section>
          <section className="asset-details-panel" aria-labelledby="reference-data-title">
            <div className="asset-section-label">Reference only</div>
            <h2 id="reference-data-title">Market data explained</h2>
            <p className="asset-panel-helper">
              Third-party sales and listings help explain the collectible’s reference value. They do
              not set an executable Slice order price.
            </p>
            <div>
              <span>Publication</span>
              <strong>Published</strong>
            </div>
            <div>
              <span>Slice valuation</span>
              <strong>
                {currentValue === undefined
                  ? "Unavailable"
                  : formatCurrency(currentValue, { currency: currentValueCurrency })}
              </strong>
            </div>
            <ExternalReference
              label="Current listing (asking price)"
              observation={assetQuery.data.market?.reference?.currentListing}
            />
            <ExternalReference
              label="Recent completed sale"
              observation={assetQuery.data.market?.reference?.recentCompletedSale}
            />
            <div>
              <span>Updated</span>
              <strong>{marketReferenceAt ? formatDate(marketReferenceAt) : "Unavailable"}</strong>
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
          <strong>
            {notYetTradeable
              ? "Not yet available"
              : (availableSlices?.toLocaleString() ?? "Unavailable")}
          </strong>
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

function SliceGradePanel({ grade }: { grade: SliceGrade }) {
  const [selectedEvidence, setSelectedEvidence] = useState<number | null>(null);
  const score = (value: number | null) =>
    value === null ? "—" : Number(value.toFixed(1)).toString();
  const evidence = grade.visualizations.filter((item) => item.url);
  const estimate = grade.overallEstimate === null ? "—" : score(grade.overallEstimate);
  const range =
    grade.overallMin !== null && grade.overallMax !== null
      ? `${score(grade.overallMin)}–${score(grade.overallMax)}`
      : "—";
  const selected = selectedEvidence === null ? null : evidence[selectedEvidence];

  useEffect(() => {
    if (selectedEvidence === null) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedEvidence(null);
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [selectedEvidence]);

  return (
    <section className="asset-slice-grade-panel" aria-labelledby="slice-grade-title">
      <header className="asset-slice-grade-panel__header">
        <div>
          <p className="asset-section-label">Slice Grade</p>
          <h2 id="slice-grade-title">AI-assisted condition insight</h2>
          <p>
            A supporting estimate from the card images. It is separate from the collector&apos;s
            condition and is not an official grading result.
          </p>
        </div>
        <span className="asset-slice-grade-panel__badge">Supporting evidence</span>
      </header>
      <div className="asset-slice-grade-panel__summary">
        <div className="asset-slice-grade-panel__score">
          <span>Estimated grade</span>
          <strong>{estimate}</strong>
          <small>{grade.conditionLabel ?? "AI estimate"}</small>
        </div>
        <div className="asset-slice-grade-panel__facts">
          <div>
            <span>Estimate range</span>
            <strong>{range}</strong>
          </div>
          <div>
            <span>Centering</span>
            <strong>{score(grade.centeringScore)}</strong>
          </div>
          <div>
            <span>Corners</span>
            <strong>{score(grade.cornerScore)}</strong>
          </div>
          <div>
            <span>Edges</span>
            <strong>{score(grade.edgeScore)}</strong>
          </div>
          <div>
            <span>Surface</span>
            <strong>{score(grade.surfaceScore)}</strong>
          </div>
        </div>
      </div>
      <div className="asset-slice-grade-panel__evidence">
        <div className="asset-slice-grade-panel__evidence-heading">
          <div>
            <strong>Image evidence</strong>
            <span>Areas used to form the estimate</span>
          </div>
          {grade.analyzedAt ? <small>Analyzed {formatDate(grade.analyzedAt)}</small> : null}
        </div>
        {evidence.length ? (
          <div className="asset-slice-grade-panel__images">
            {evidence.map((item, index) => (
              <figure key={`${item.side}-${item.type}-${index}`}>
                <button
                  type="button"
                  className="asset-slice-grade-panel__image-button"
                  aria-label={`View ${item.side === "FRONT" ? "front" : "back"} card ${item.type} evidence larger`}
                  onClick={() => setSelectedEvidence(index)}
                >
                  <img
                    src={item.url ?? undefined}
                    alt={`${item.side === "FRONT" ? "Front" : "Back"} card ${item.type} evidence`}
                  />
                  <span aria-hidden="true">View larger</span>
                </button>
                <figcaption>
                  {item.side === "FRONT" ? "Front" : "Back"} ·{" "}
                  {item.type === "centering" ? "Centering" : "Overview"}
                </figcaption>
              </figure>
            ))}
          </div>
        ) : (
          <p className="asset-slice-grade-panel__empty">
            Image evidence is not available for this estimate.
          </p>
        )}
      </div>
      {grade.warnings.length ? (
        <p className="asset-slice-grade-panel__note">Review note: {grade.warnings[0]}</p>
      ) : null}
      {selected?.url ? (
        <div
          className="asset-slice-grade-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label="Expanded Slice Grade evidence"
          onClick={() => setSelectedEvidence(null)}
        >
          <div
            className="asset-slice-grade-lightbox__content"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="asset-slice-grade-lightbox__header">
              <div>
                <p className="asset-section-label">Slice Grade evidence</p>
                <strong>
                  {selected.side === "FRONT" ? "Front" : "Back"} ·{" "}
                  {selected.type === "centering" ? "Centering" : "Overview"}
                </strong>
              </div>
              <button
                type="button"
                className="asset-slice-grade-lightbox__close"
                aria-label="Close enlarged evidence image"
                onClick={() => setSelectedEvidence(null)}
              >
                ×
              </button>
            </div>
            <div className="asset-slice-grade-lightbox__image-wrap">
              <img
                src={selected.url}
                alt={`${selected.side === "FRONT" ? "Front" : "Back"} card evidence enlarged`}
              />
            </div>
            <p className="asset-slice-grade-lightbox__hint">
              Click outside the image or press Escape to close.
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SliceGradeEmptyPanel() {
  return (
    <section
      className="asset-slice-grade-panel asset-slice-grade-panel--empty"
      aria-labelledby="slice-grade-title"
    >
      <header className="asset-slice-grade-panel__header">
        <div>
          <p className="asset-section-label">Slice Grade</p>
          <h2 id="slice-grade-title">AI-assisted condition insight</h2>
          <p>No AI-assisted condition insight is available for this collectible yet.</p>
        </div>
        <span className="asset-slice-grade-panel__badge">Not available</span>
      </header>
    </section>
  );
}

function AssetShowcase({
  title,
  grader,
  gradeScore,
  gradeLabel,
  certificationNumber,
  media,
  backMedia,
}: {
  title: string;
  grader?: string;
  gradeScore?: number;
  gradeLabel?: string;
  certificationNumber?: string;
  media?: { src: string; alt: string };
  backMedia?: { src: string; alt: string };
}) {
  const [manualFlip, setManualFlip] = useState<boolean | null>(null);
  const [hoverFlip, setHoverFlip] = useState(false);
  const flipped = effectiveCardFlipState(manualFlip, hoverFlip);

  return (
    <div className="asset-showcase">
      <span className="asset-slab-light" aria-hidden="true" />
      <span className="asset-pedestal" aria-hidden="true" />
      <span className="asset-particles" aria-hidden="true">
        {Array.from({ length: 11 }, (_, index) => (
          <i key={index} />
        ))}
      </span>
      {grader && (
        <span className="asset-grade-badge">
          <small>{grader}</small>
          <strong>{gradeScore === undefined ? "—" : Number(gradeScore.toFixed(2))}</strong>
          <span>{gradeLabel ?? "Grade published"}</span>
          <em>{certificationNumber ? `Cert. ${certificationNumber}` : "Public record"}</em>
        </span>
      )}
      <div
        className={`asset-card-stage${backMedia ? " has-back" : ""}${flipped ? " is-flipped" : ""}`}
        onMouseEnter={() => {
          if (backMedia) setHoverFlip(true);
        }}
        onMouseLeave={() => {
          setHoverFlip(false);
          setManualFlip(null);
        }}
      >
        <div className="asset-card-flip__inner">
          <div className="asset-card-face asset-card-face--front" aria-hidden={flipped}>
            {media ? (
              <img src={media.src} alt={media.alt} />
            ) : (
              <div className="asset-showcase-image">Approved media unavailable</div>
            )}
            <span>Front</span>
          </div>
          <div className="asset-card-face asset-card-face--back" aria-hidden={!flipped}>
            {backMedia ? (
              <img src={backMedia.src} alt={backMedia.alt} />
            ) : (
              <div className="asset-showcase-image">Back image unavailable</div>
            )}
            <span>Back</span>
          </div>
        </div>
        {backMedia && (
          <button
            type="button"
            className="asset-card-flip-button"
            aria-pressed={flipped}
            aria-label={flipped ? "Show front of card" : "Show back of card"}
            onClick={() => setManualFlip((current) => !effectiveCardFlipState(current, hoverFlip))}
          >
            <RotateCw aria-hidden="true" />
            {flipped ? "Show front" : "Flip card"}
          </button>
        )}
      </div>
      <span className="sr-only">{title}</span>
    </div>
  );
}

function WatchlistControl({
  watched,
  isAuthenticated,
  isUpdating,
  onClick,
}: {
  watched: boolean;
  isAuthenticated: boolean;
  isUpdating: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className="asset-watch-button asset-watch-button--identity"
      aria-pressed={watched}
      disabled={isUpdating}
      title={isAuthenticated ? "Add or remove from watchlist" : "Sign in to use watchlist"}
      onClick={onClick}
    >
      <Bookmark aria-hidden="true" fill={watched ? "currentColor" : "none"} />
      {watched ? "Watching" : "Watchlist"}
    </button>
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
      <div role="tooltip">
        <strong>{label}</strong>
        <span>{text}</span>
      </div>
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
        <span>
          Slice will show the supply, price per Slice, and live availability after issuance and
          market readiness are complete.
        </span>
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
  trades,
  tradesLoading,
  tradesError,
  retryTrades,
  currency,
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
  trades: Awaited<ReturnType<ReturnType<typeof useAppServices>["market"]["recentTrades"]>>;
  tradesLoading: boolean;
  tradesError: boolean;
  retryTrades: () => void;
  currency: "GBP" | "USD" | "CAD" | "EUR";
}) {
  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  const canSell = isAuthenticated && ownShares !== undefined && ownShares > 0;
  const marketOpen = ownershipSummary?.marketStatus === "OPEN";
  const hasAvailable = (availableShares ?? 0) > 0;
  const breakdown = ownershipSummary?.ownershipBreakdown;
  const slicePrice =
    ownershipSummary?.slicePriceMinor ??
    (sharePriceMinor === undefined ? null : String(sharePriceMinor));
  return (
    <section className="asset-order-book">
      <header className="asset-trading-panel__header">
        <div>
          <p className="asset-section-label">Ownership &amp; trading</p>
          <h2 id="market-status-title">Make it yours</h2>
        </div>
        <span className={`asset-market-status${marketOpen ? " is-open" : ""}`}>
          <i aria-hidden="true" /> {marketOpen ? "Market open" : "Market preparing"}
        </span>
      </header>
      <div className="asset-trading-summary">
        <Stat
          label="Price per Slice"
          value={slicePrice === null ? "Unavailable" : formatPricePerUnit(slicePrice, currency)}
        />
        <Stat
          label="Slices available"
          value={
            availableShares === undefined
              ? "Unavailable"
              : `${availableShares.toLocaleString()} Slices`
          }
        />
        <Stat
          label="Total supply"
          value={
            issuedShares === undefined ? "Unavailable" : `${issuedShares.toLocaleString()} Slices`
          }
        />
      </div>
      <p className="asset-trading-availability">
        {ownershipSummary?.availableOwnershipPercent &&
        ownershipSummary.availableOwnershipPercent !== "Not yet available"
          ? `${formatAvailability(ownershipSummary.availableOwnershipPercent)} of the issued supply is currently listed.`
          : "Availability will appear after ownership is issued."}
      </p>
      {breakdown ? (
        <div className="asset-ownership-breakdown" aria-label="Ownership breakdown">
          <div className="asset-ownership-breakdown__bar" aria-hidden="true">
            <span
              className="is-retained"
              style={{
                flexBasis: `${percentOf(breakdown.collectorRetainedSlices, issuedShares)}%`,
              }}
            />
            <span
              className="is-owned"
              style={{ flexBasis: `${percentOf(breakdown.investorOwnedSlices, issuedShares)}%` }}
            />
            <span
              className="is-available"
              style={{ flexBasis: `${percentOf(availableShares, issuedShares)}%` }}
            />
          </div>
          <div className="asset-ownership-breakdown__legend">
            <span>
              <i className="is-retained" /> Collector retained{" "}
              <strong>{breakdown.collectorRetainedSlices}</strong>
            </span>
            <span>
              <i className="is-owned" /> Investor owned{" "}
              <strong>{breakdown.investorOwnedSlices}</strong>
            </span>
            <span>
              <i className="is-available" /> Available{" "}
              <strong>{availableShares?.toLocaleString() ?? "—"}</strong>
            </span>
          </div>
        </div>
      ) : null}
      <div className="asset-current-position">
        <div>
          <span className="asset-section-label">Your position</span>
          <strong>
            {isAuthenticated && ownShares !== undefined
              ? `${ownShares.toLocaleString()} Slices`
              : "Sign in to see your position"}
          </strong>
        </div>
        <small>
          {isAuthenticated && ownShares !== undefined && issuedShares
            ? formatOwnershipPercent(ownShares, issuedShares)
            : "Ownership appears here after settlement."}
        </small>
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
        {marketOpen && hasAvailable ? (
          <Link to="/buy/$id" params={{ id }} className="is-buy">
            <span>
              <strong>Buy Slices</strong>
              <small>Choose how many you want</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <div className="is-buy is-disabled" aria-disabled="true">
            <span>
              <strong>Buying unavailable</strong>
              <small>
                {marketOpen ? "No Slices are currently listed" : "The market is not open yet"}
              </small>
            </span>
          </div>
        )}
        {canSell ? (
          <Link to="/sell/$id" params={{ id }} className="is-sell">
            <span>
              <strong>Sell a Slice</strong>
              <small>Manage settled units</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <div className="is-sell is-disabled" aria-disabled="true">
            <span>
              <strong>Sell a Slice</strong>
              <small>
                {isAuthenticated
                  ? "Available after you own settled units"
                  : "Sign in to manage settled units"}
              </small>
            </span>
          </div>
        )}
      </div>
      <RecentTrades
        trades={trades}
        isLoading={tradesLoading}
        isError={tradesError}
        retry={retryTrades}
        currency={currency}
      />
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
  currency,
}: {
  trades: Awaited<ReturnType<ReturnType<typeof useAppServices>["market"]["recentTrades"]>>;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  currency: "GBP" | "USD" | "CAD" | "EUR";
}) {
  return (
    <section className="asset-recent-trades">
      <header>
        <h3>Recent trades</h3>
        <span>Public executions</span>
      </header>
      {isLoading ? (
        <p>Loading executions…</p>
      ) : isError ? (
        <button type="button" onClick={retry}>
          Retry executions
        </button>
      ) : (
        <ul className="asset-recent-trades__table" aria-label="Recent trades">
          {trades.length ? (
            trades.slice(0, 7).map((trade) => (
              <li key={trade.id}>
                <span>{formatDate(trade.executedAt)}</span>
                <strong>{trade.units.toLocaleString()} Slices</strong>
                <em className="is-up">{formatPricePerUnit(trade.pricePerUnit.amount, currency)}</em>
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
  const similarKey = similar.map((item) => item.id).join("|");
  const [start, setStart] = useState(0);
  useEffect(() => setStart(0), [currentId, similarKey]);
  const pageSize = 3;
  const visibleSimilar = similar.slice(start, start + pageSize);
  const canGoBack = start > 0;
  const canGoForward = start + pageSize < similar.length;
  return (
    <section className="asset-similar-section">
      <header>
        <h2>Similar assets</h2>
        <div>
          <Link to="/marketplace">View market</Link>
          <button
            type="button"
            aria-label="Previous similar assets"
            disabled={!canGoBack}
            onClick={() => setStart((current) => Math.max(0, current - pageSize))}
          >
            <ArrowLeft aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label="Next similar assets"
            disabled={!canGoForward}
            onClick={() => setStart((current) => Math.min(current + pageSize, similar.length - 1))}
          >
            <ChevronRight aria-hidden="true" />
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
        <div className={`asset-similar-grid${visibleSimilar.length === 1 ? " is-single" : ""}`}>
          {visibleSimilar.map((item) => {
            const media = resolveMarketplaceMedia(item);
            return (
              <Link
                key={item.id}
                to="/asset/$id"
                params={{ id: item.slug }}
                className="asset-similar-card"
              >
                <div className="asset-similar-card__media">
                  {media ? (
                    <img src={media.src} alt={media.alt} />
                  ) : (
                    <span className="asset-similar-card__placeholder">Image unavailable</span>
                  )}
                </div>
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

function initialOfferingAvailabilityBps(
  offering: NonNullable<ReturnType<typeof toMarketplaceAsset>["initialOffering"]>,
) {
  if (!offering.inventory) return 0;
  try {
    const total = BigInt(offering.totalUnits);
    return total > 0n
      ? Number(
          ((BigInt(offering.inventory.availableUnits) + BigInt(offering.inventory.reservedUnits)) *
            10_000n) /
            total,
        )
      : 0;
  } catch {
    return 0;
  }
}

function formatOfferingPercentage(units: string, totalUnits: string) {
  try {
    const total = BigInt(totalUnits);
    return total > 0n ? `${Number((BigInt(units) * 10_000n) / total) / 100}%` : "—";
  } catch {
    return "—";
  }
}

function formatOwnershipPercent(ownedShares: number, issuedShares: number) {
  if (issuedShares <= 0) return "Your settled share position";
  const percentageBasisPoints = (BigInt(ownedShares) * 10_000n) / BigInt(issuedShares);
  const wholePercent = percentageBasisPoints / 100n;
  const fractionalPercent = (percentageBasisPoints % 100n).toString().padStart(2, "0");
  return `${wholePercent}.${fractionalPercent}% ownership`;
}

function percentOf(value: string | number | undefined, total: number | undefined) {
  if (total === undefined || total <= 0 || value === undefined) return 0;
  const numeric = typeof value === "string" ? Number(value) : value;
  if (!Number.isFinite(numeric) || numeric < 0) return 0;
  return Math.min(100, (numeric / total) * 100);
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
