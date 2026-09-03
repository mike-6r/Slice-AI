import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowLeftRight,
  ArrowRight,
  Bookmark,
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Info,
  Layers3,
  LockKeyhole,
  PieChart,
  RotateCw,
  ShoppingBag,
  ShieldCheck,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/auth/use-session";
import { PriceChart } from "@/components/Chart";
import {
  toMarketplaceAsset,
  toMarketplaceSimilarAsset,
  type MarketplaceSimilarAsset,
  type MarketplaceAsset,
} from "@/components/marketplace/market-api-presentation";
import { marketCategoryPresentation } from "@/components/marketplace/marketplace-presentation";
import { resolveMarketplaceMedia } from "@/components/marketplace/marketplace-layout";
import { asSupportedCurrency, convertMinorForDisplay } from "@/currency/currency-presentation";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { formatRelativeTime } from "@/lib/finance";
import { formatAvailability } from "@/lib/market-presentation";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { queryKeys } from "@/queries/keys";
import { customerTerms } from "@/lib/customer-terminology";
import {
  PreSaleDisclosure,
  formatPreSaleCountdown,
} from "@/components/marketplace/PreSaleDisclosure";
import type { Asset, MarketLifecycleProjection, SliceGrade } from "@/domain";

export const Route = createFileRoute("/asset/$id")({
  head: () => ({ meta: [{ title: "Asset | Slice" }] }),
  component: AssetPage,
});

const PERIODS = ["24H", "7D", "30D", "90D", "1Y", "ALL"] as const;
const currentUser = "current" as never;

const HOW_IT_WORKS_STEPS = [
  {
    number: "01",
    title: "Slice secures the collectible",
    copy: "The physical item is checked and placed into the required custody process.",
    icon: ShieldCheck,
  },
  {
    number: "02",
    title: "Ownership units are issued",
    copy: "The collectible is divided into units with a clear supply and price.",
    icon: Layers3,
  },
  {
    number: "03",
    title: "Buy your position",
    copy: "Choose the number of ownership units that fits you.",
    icon: ShoppingBag,
  },
  {
    number: "04",
    title: "Track & sell later",
    copy: "Follow your position in Portfolio and sell when the market is live.",
    icon: PieChart,
  },
] as const;

type ExternalReferenceProjection = {
  movement24hBps?: number | null;
  movement7dBps?: number | null;
  movement30dBps?: number | null;
  lastRefreshedAt?: string | null;
  historyStartedAt?: string | null;
  freshness?: string;
};

function ReferenceMovementGrid({ reference }: { reference?: ExternalReferenceProjection }) {
  if (!reference) return null;
  const rows = [
    ["24H", reference.movement24hBps],
    ["7D", reference.movement7dBps],
    ["30D", reference.movement30dBps],
  ] as const;
  return (
    <div className="asset-reference-movement" aria-label="PriceCharting reference movement">
      <div className="asset-reference-movement__heading">
        <span>Reference movement</span>
        <small>
          {reference.lastRefreshedAt
            ? `Refreshed ${formatRelativeTime(reference.lastRefreshedAt)}`
            : "Refresh not available"}
        </small>
      </div>
      <div className="asset-reference-movement__grid">
        {rows.map(([label, value]) => (
          <div key={label}>
            <span>{label}</span>
            <strong
              className={value === null || value === undefined ? "is-unavailable" : undefined}
            >
              {value === null || value === undefined ? "Unavailable" : formatPercent(value / 100)}
            </strong>
          </div>
        ))}
      </div>
      {reference.historyStartedAt ? (
        <small className="asset-reference-movement__started">
          History collected from {formatDate(reference.historyStartedAt)}
        </small>
      ) : null}
    </div>
  );
}

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

function PreSaleReadinessPanel({ preSale }: { preSale: NonNullable<Asset["preSale"]> }) {
  return (
    <div className="asset-presale-readiness">
      <div className="asset-readiness-heading">
        <div>
          <h2 id="market-status-title">Pre-Sale reservations are open</h2>
          <p>
            Reserve a conditional position now. Slice will receive, verify, and secure the
            collectible before any reservation becomes final ownership.
          </p>
        </div>
        <span className="asset-status-badge asset-status-badge--pending">Pre-Sale</span>
      </div>
      <div className="asset-readiness-callout">
        <strong>{preSale.physicalStatus.replaceAll("_", " ")}</strong>
        <p>Physical intake and final verification are still outstanding.</p>
      </div>
    </div>
  );
}

function AssetPage() {
  const { currency: selectedCurrency, rates, formatMoney, formatSourceMoney } = useCurrency();
  const { id } = Route.useParams();
  const services = useAppServices();
  const queryClient = useQueryClient();
  const { isAuthenticated } = useSession();
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>("30D");
  const [reservationUnits, setReservationUnits] = useState("1");
  const [reservationMessage, setReservationMessage] = useState<string | null>(null);
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
    // A published asset can exist before ownership is issued. Avoid asking
    // the account-position endpoint for that pre-issuance state; there is no
    // position to read yet and the public issuance projection is authoritative.
    enabled: isAuthenticated && Boolean(assetQuery.data) && Boolean(issuanceQuery.data),
    queryFn: () => services.ownership.ownMarketPosition(id),
  });
  const similarQuery = useQuery({
    queryKey: ["asset", id, "similar"],
    enabled: Boolean(assetQuery.data),
    queryFn: async () =>
      (await services.market.similar(id as never, 8)).map(toMarketplaceSimilarAsset),
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
  const preSale = useMutation({
    mutationFn: (units: string) => services.preSale.reserve(id, units),
    onSuccess: (reservation) => {
      setReservationMessage(
        `Reservation ${reservation.id.slice(0, 8)} confirmed. Your funds remain reserved until physical completion.`,
      );
      setReservationUnits("1");
      void queryClient.invalidateQueries({ queryKey: queryKeys.assets.detail(id) });
    },
    onError: () =>
      setReservationMessage(
        "The reservation could not be created. Please check availability and try again.",
      ),
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
  const history = historyQuery.data ?? [];
  const currentValue = asset.sliceValuationAmountMinor;
  const currentValueCurrency = asset.sliceValuationCurrency;
  const sliceValuationAt = asset.sliceValuationApprovedAt;
  const marketReferenceAt =
    assetQuery.data.market?.reference?.lastRefreshedAt ??
    assetQuery.data.market?.reference?.currentListing?.observedAt ??
    assetQuery.data.market?.reference?.recentCompletedSale?.observedAt;
  const externalReference = assetQuery.data.market?.reference;
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
  const hasReferenceHistory =
    history.source === "PRICECHARTING" ||
    (history.source === undefined && Boolean(externalReference));
  const referenceHistory = hasReferenceHistory ? history : [];
  const historySourceCurrency =
    asSupportedCurrency(
      history.currency ??
        referenceHistory[0]?.value.currency ??
        asset.marketReference?.currency ??
        currentValueCurrency,
    ) ?? "GBP";
  const historyCurrency =
    convertMinorForDisplay(1, historySourceCurrency, selectedCurrency, rates) === null
      ? historySourceCurrency
      : selectedCurrency;
  const referenceMoveLabel =
    hasReferenceHistory &&
    history.percentageChangeBps !== null &&
    history.percentageChangeBps !== undefined
      ? `${formatPercent(history.percentageChangeBps / 100, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}${history.absoluteChange ? ` (${formatMoney(history.absoluteChange.amount, history.absoluteChange.currency)})` : ""}`
      : "Not available";
  const historyStartingValue = history.startingValue ?? referenceHistory[0]?.value ?? null;
  const historyLatestValue = history.latestValue ?? referenceHistory.at(-1)?.value ?? null;
  const historyPointCount = history.historyPointCount ?? referenceHistory.length;
  const historyCoverageLabel = formatHistoryCoverage(history.actualCoverageSeconds);
  const historyMovementReason =
    history.movementUnavailableReason ??
    (historyPointCount < 2 ? "Need at least two observations" : "Not enough history yet");
  const watched = watchlistQuery.data?.assetIds.includes(asset.id as never) ?? false;
  const watchlistError = toggleWatchlist.isError;
  const category = marketCategoryPresentation(asset.category);
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
              categoryLabel={category.label}
              grader={asset.grader}
              gradeScore={asset.gradeScore}
              gradeLabel={asset.gradeLabel}
              certificationNumber={asset.certificationNumber}
              media={media}
              backMedia={backMedia}
            />
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
            {watchlistError ? (
              <p className="asset-watch-error" role="status">
                Watchlist could not be updated. Please try again.
              </p>
            ) : null}
            <h1 id="asset-title">{asset.title}</h1>
            <p className="asset-page-subtitle">
              {[category.label, asset.setName, asset.cardNumber, condition, asset.year]
                .filter(Boolean)
                .join("  ·  ")}
            </p>
            <div className="asset-reference-identity__status" aria-label="Asset status">
              <span className="asset-status-badge asset-status-badge--live">
                <i aria-hidden="true" />{" "}
                {asset.preSale ? "Pre-Sale" : (lifecycle?.badge ?? "Published")}
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
                    : formatMoney(currentValue, currentValueCurrency ?? "GBP")}
                </strong>
                {sliceValuationAt ? <small>Approved {formatDate(sliceValuationAt)}</small> : null}
              </div>
              <div>
                <span className="asset-section-label">External reference</span>
                <strong>
                  {asset.marketReference
                    ? formatMoney(asset.marketReference.amountMinor, asset.marketReference.currency)
                    : "Unavailable"}
                </strong>
                <small>{asset.marketReference?.source ?? "No external reference"}</small>
                {asset.marketReference && selectedCurrency !== asset.marketReference.currency ? (
                  <small>
                    Source:{" "}
                    {formatSourceMoney(
                      asset.marketReference.amountMinor,
                      asset.marketReference.currency,
                    )}{" "}
                    {asset.marketReference.currency}
                  </small>
                ) : null}
                {assetQuery.data.market?.reference ? (
                  <small className="asset-reference-freshness">
                    {assetQuery.data.market.reference.lastRefreshedAt
                      ? `Refreshed ${formatRelativeTime(assetQuery.data.market.reference.lastRefreshedAt)}`
                      : "Refresh not available"}
                  </small>
                ) : null}
              </div>
            </div>
          </section>
        </section>

        {asset.preSale ? (
          <section className="asset-presale-section" aria-labelledby="pre-sale-title">
            <div className="asset-section-heading">
              <div>
                <p className="asset-section-label">Conditional access</p>
                <h2 id="pre-sale-title">Pre-Sale reservation</h2>
              </div>
              <strong className="asset-presale-countdown">
                {formatPreSaleCountdown(asset.preSale.deadlineAt)}
              </strong>
            </div>
            <PreSaleDisclosure
              preSale={asset.preSale}
              formatMoney={(minor, currency) =>
                formatMoney(minor, currency as "GBP" | "USD" | "EUR" | "CAD")
              }
            />
            <div className="asset-presale-action">
              <label>
                Slices to reserve
                <input
                  value={reservationUnits}
                  inputMode="numeric"
                  min="1"
                  max={asset.preSale.availableUnits}
                  onChange={(event) =>
                    setReservationUnits(event.target.value.replace(/[^0-9]/g, ""))
                  }
                />
              </label>
              <button
                type="button"
                className="primary-action"
                disabled={
                  preSale.isPending ||
                  asset.preSale.status !== "ACTIVE" ||
                  !/^\d+$/.test(reservationUnits) ||
                  Number(reservationUnits) < 1 ||
                  Number(reservationUnits) > Number(asset.preSale.availableUnits)
                }
                onClick={() => {
                  if (!isAuthenticated) {
                    window.location.assign(`/login?returnTo=${encodeURIComponent(`/asset/${id}`)}`);
                    return;
                  }
                  setReservationMessage(null);
                  preSale.mutate(reservationUnits);
                }}
              >
                {preSale.isPending
                  ? "Reserving…"
                  : isAuthenticated
                    ? "Reserve Slices"
                    : "Sign in to reserve"}
              </button>
            </div>
            {reservationMessage ? (
              <p className="asset-presale-message" role="status">
                {reservationMessage}
              </p>
            ) : null}
          </section>
        ) : null}

        <AssetTrustStrip asset={asset} lifecycle={lifecycle} />

        <section className="asset-readiness-card" aria-labelledby="market-status-title">
          {notYetTradeable ? (
            asset.preSale ? (
              <PreSaleReadinessPanel preSale={asset.preSale} />
            ) : (
              <LifecycleReadinessPanel lifecycle={lifecycle} />
            )
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
              ownPosition={ownPositionQuery.data}
              positionLoading={ownPositionQuery.isLoading}
              isAuthenticated={isAuthenticated}
              ownershipSummary={ownershipSummaryQuery.data}
              trades={tradesQuery.data ?? []}
              tradesLoading={tradesQuery.isLoading}
              tradesError={tradesQuery.isError}
              retryTrades={() => void tradesQuery.refetch()}
            />
          )}
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
            You do not need to buy the whole collectible. Slice lets you own a clearly defined
            portion and track it in your Portfolio.
          </p>
          <div className="asset-how-it-works__grid">
            {HOW_IT_WORKS_STEPS.map(({ number, title, copy, icon: Icon }) => (
              <div key={number} className="asset-how-it-works__step">
                <div className="asset-how-it-works__step-top">
                  <span className="asset-how-it-works__icon" aria-hidden="true">
                    <Icon />
                  </span>
                  <b aria-label={`Step ${Number(number)}`}>{number}</b>
                </div>
                <h3>{title}</h3>
                <p>{copy}</p>
              </div>
            ))}
          </div>
          <Link className="asset-how-it-works__link" to="/how-it-works">
            Learn how Slice works <ArrowRight aria-hidden="true" />
          </Link>
        </section>

        <section className="asset-detail-lower-grid">
          <section className="asset-price-panel" aria-labelledby="history-title">
            <header className="asset-reference-history__header">
              <div className="asset-history-heading">
                <div className="asset-history-title">
                  <span>Reference value</span>
                  <h2 id="history-title">Value history</h2>
                </div>
                <small>PriceCharting reference history</small>
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
              className={`asset-chart-stage${referenceHistory.length < 2 && !historyQuery.isLoading && !historyQuery.isError ? " is-empty" : ""}`}
            >
              {historyQuery.isLoading ? (
                <p>Loading historical valuations…</p>
              ) : historyQuery.isError ? (
                <button type="button" onClick={() => void historyQuery.refetch()}>
                  Retry history
                </button>
              ) : referenceHistory.length >= 2 ? (
                <PriceChart
                  className="asset-price-chart"
                  data={referenceHistory.map((point) => ({
                    value:
                      Number(
                        convertMinorForDisplay(
                          point.value.amount,
                          asSupportedCurrency(point.value.currency) ?? historySourceCurrency,
                          selectedCurrency,
                          rates,
                        ) ?? BigInt(point.value.amount),
                      ) / 100,
                    timestamp: point.timestamp,
                    source: point.source,
                    previousChange:
                      point.changeFromPrevious === undefined
                        ? undefined
                        : point.changeFromPrevious === null
                          ? null
                          : Number(
                              convertMinorForDisplay(
                                point.changeFromPrevious.amount,
                                asSupportedCurrency(point.changeFromPrevious.currency) ??
                                  historySourceCurrency,
                                selectedCurrency,
                                rates,
                              ) ?? BigInt(point.changeFromPrevious.amount),
                            ) / 100,
                    previousChangeBps: point.changeFromPreviousBps,
                    rangeChange:
                      point.changeFromRangeStart === undefined
                        ? undefined
                        : point.changeFromRangeStart === null
                          ? null
                          : Number(
                              convertMinorForDisplay(
                                point.changeFromRangeStart.amount,
                                asSupportedCurrency(point.changeFromRangeStart.currency) ??
                                  historySourceCurrency,
                                selectedCurrency,
                                rates,
                              ) ?? BigInt(point.changeFromRangeStart.amount),
                            ) / 100,
                    rangeChangeBps: point.changeFromRangeStartBps,
                    refreshedAt: history.lastRefreshedAt,
                  }))}
                  height={190}
                  showAxis
                  currency={historyCurrency}
                  timeRange={period}
                  label={`External reference value history for ${asset.title}`}
                />
              ) : referenceHistory.length === 1 ? (
                <div className="asset-single-history">
                  <strong>
                    {formatMoney(
                      referenceHistory[0]!.value.amount,
                      asSupportedCurrency(referenceHistory[0]!.value.currency) ??
                        historySourceCurrency,
                    )}
                  </strong>
                  <span>{formatDate(referenceHistory[0]!.timestamp)}</span>
                  <p>
                    One observation so far. Movement will appear after another real snapshot is
                    collected.
                  </p>
                </div>
              ) : (
                <div className="asset-empty-history">
                  <span>—</span>
                  <strong>History collection has just started</strong>
                  <p>
                    Real PriceCharting observations will appear here as the scheduled collection
                    runs.
                  </p>
                </div>
              )}
            </div>
            <div className="asset-chart-stats">
              <Stat
                label="Starting value"
                value={
                  historyStartingValue
                    ? formatMoney(
                        historyStartingValue.amount,
                        asSupportedCurrency(historyStartingValue.currency) ?? historySourceCurrency,
                      )
                    : "Not available"
                }
              />
              <Stat
                label="Latest value"
                value={
                  historyLatestValue
                    ? formatMoney(
                        historyLatestValue.amount,
                        asSupportedCurrency(historyLatestValue.currency) ?? historySourceCurrency,
                      )
                    : "Not available"
                }
              />
              <Stat label={`${period} move`} value={referenceMoveLabel} />
              <Stat
                label="Observations"
                value={historyPointCount ? `${historyPointCount}` : "Not available"}
              />
            </div>
            <div className="asset-chart-stats__secondary" aria-label="History context">
              <span>
                <b>High</b>
                {history.highValue
                  ? formatMoney(
                      history.highValue.amount,
                      asSupportedCurrency(history.highValue.currency) ?? historySourceCurrency,
                    )
                  : "Not available"}
              </span>
              <span>
                <b>Low</b>
                {history.lowValue
                  ? formatMoney(
                      history.lowValue.amount,
                      asSupportedCurrency(history.lowValue.currency) ?? historySourceCurrency,
                    )
                  : "Not available"}
              </span>
              <span>
                <b>Coverage</b>
                {historyCoverageLabel}
              </span>
              <span>
                <b>Refreshed</b>
                {history.lastRefreshedAt
                  ? formatRelativeTime(history.lastRefreshedAt)
                  : "Not available"}
              </span>
            </div>
            {history.movementAvailability !== "AVAILABLE" ? (
              <p className="asset-history-note">
                {period} movement unavailable: {historyMovementReason}.
              </p>
            ) : null}
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
              <strong>{asset.setName ?? "—"}</strong>
            </div>
            <div>
              <span>Year</span>
              <strong>{asset.year ?? "—"}</strong>
            </div>
            <div>
              <span>Card number</span>
              <strong>{assetQuery.data.details.card?.cardNumber ?? "—"}</strong>
            </div>
            <div>
              <span>Condition</span>
              <strong>{condition || "—"}</strong>
            </div>
            {asset.listing ? (
              <>
                <div>
                  <span>Listed by</span>
                  <strong>
                    {asset.listing.listedBy ? (
                      <Link
                        to="/collector/$id/assets"
                        params={{ id: asset.listing.listedBy.slug }}
                        className="asset-listing-link"
                      >
                        {asset.listing.listedBy.displayName}
                      </Link>
                    ) : (
                      "Slice collector"
                    )}
                  </strong>
                </div>
                <div>
                  <span>Listed on</span>
                  <strong>
                    {asset.listing.listedAt ? formatDate(asset.listing.listedAt) : "—"}
                  </strong>
                </div>
              </>
            ) : null}
          </section>

          {!asset.grade ? (
            asset.sliceGrade ? (
              <SliceGradePanel grade={asset.sliceGrade} />
            ) : (
              <SliceGradeEmptyPanel />
            )
          ) : null}

          <section className="asset-external-panel" aria-labelledby="reference-data-title">
            <div className="asset-section-label">External reference</div>
            <h2 id="reference-data-title">Market reference</h2>
            <p className="asset-panel-helper">
              Informational only. This reference does not represent an executable Slice order.
            </p>
            {asset.marketReference ? (
              <div className="asset-external-panel__value">
                <span>{asset.marketReference.source ?? "External market"}</span>
                <strong>
                  {formatMoney(asset.marketReference.amountMinor, asset.marketReference.currency)}
                  {selectedCurrency !== asset.marketReference.currency ? (
                    <small>
                      Source:{" "}
                      {formatSourceMoney(
                        asset.marketReference.amountMinor,
                        asset.marketReference.currency,
                      )}{" "}
                      {asset.marketReference.currency}
                    </small>
                  ) : null}
                </strong>
                <small>{asset.marketReference.context ?? "Observed reference"}</small>
              </div>
            ) : (
              <div className="asset-external-panel__empty">
                <strong>Unavailable</strong>
                <span>No external reference</span>
              </div>
            )}
            <ReferenceMovementGrid reference={assetQuery.data.market?.reference} />
            <dl className="asset-external-panel__meta">
              <div>
                <dt>Updated</dt>
                <dd>{marketReferenceAt ? formatDate(marketReferenceAt) : "—"}</dd>
              </div>
              <div>
                <dt>Slice valuation</dt>
                <dd>
                  {currentValue === undefined
                    ? "—"
                    : formatMoney(currentValue, currentValueCurrency ?? "GBP")}
                </dd>
              </div>
            </dl>
          </section>
        </section>

        <SimilarAssets
          items={similarQuery.data ?? []}
          currentId={asset.id}
          currentSlug={asset.slug}
          isLoading={similarQuery.isLoading}
          isError={similarQuery.isError}
          retry={() => void similarQuery.refetch()}
        />
      </main>
    </div>
  );
}

function AssetTrustStrip({
  asset,
  lifecycle,
}: {
  asset: MarketplaceAsset;
  lifecycle?: MarketLifecycleProjection;
}) {
  const issuedUnits =
    asset.issuedUnits && /^\d+$/.test(asset.issuedUnits) ? Number(asset.issuedUnits) : null;
  const issuedLabel =
    issuedUnits !== null && Number.isSafeInteger(issuedUnits) ? issuedUnits.toLocaleString() : null;
  const verified = asset.publicVerificationStatus === "VERIFIED";
  const secured = asset.custodyStatus === "SECURED";
  const marketOpen = lifecycle?.phase === "LIVE" && lifecycle.canBuy && lifecycle.canSell;

  return (
    <section className="asset-trust-strip" aria-label="Collectible information">
      <TrustItem
        icon={<ShieldCheck aria-hidden="true" />}
        title={verified ? "Collector Verified" : "Verification in progress"}
        copy={
          verified
            ? "This collectible has been verified and authenticated by Slice."
            : "Slice is completing the collectible review before this claim is shown."
        }
      />
      <TrustItem
        icon={<LockKeyhole aria-hidden="true" />}
        title={secured ? "Custodial Security" : "Custody preparation"}
        copy={
          secured
            ? "Held through Slice’s approved custody process."
            : "Custody details will appear when the collectible is secured."
        }
      />
      <TrustItem
        icon={<PieChart aria-hidden="true" />}
        title="Fractional Ownership"
        copy={
          issuedLabel
            ? `${issuedLabel} Slices issued. Own a verifiable portion of this collectible.`
            : "Ownership units will be issued after the collectible is prepared."
        }
      />
      <TrustItem
        icon={<ArrowLeftRight aria-hidden="true" />}
        title={marketOpen ? "Trade Freely" : "Marketplace access"}
        copy={
          marketOpen
            ? "Buy and sell eligible Slices through the Slice marketplace."
            : "Trading opens when the market is ready for this collectible."
        }
      />
    </section>
  );
}

function TrustItem({ icon, title, copy }: { icon: ReactNode; title: string; copy: string }) {
  return (
    <article className="asset-trust-item">
      <span className="asset-trust-item__icon">{icon}</span>
      <div
        className="asset-trust-item__content"
        tabIndex={0}
        aria-label={`${title}: ${copy}`}
        data-tooltip={copy}
      >
        <h2>{title}</h2>
        <p>{copy}</p>
      </div>
    </article>
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
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const score = (value: number | null) =>
    value === null ? "—" : Number(value.toFixed(1)).toString();
  const evidence = grade.visualizations.filter((item) => item.url);
  const estimate = grade.overallEstimate === null ? "—" : score(grade.overallEstimate);

  useEffect(() => {
    if (!evidenceOpen) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const getFocusable = () =>
      Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter((element) => !element.hasAttribute("disabled"));

    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setEvidenceOpen(false);
        return;
      }
      if (event.key !== "Tab") return;
      const focusable = getFocusable();
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };

    document.addEventListener("keydown", keepFocusInside);
    requestAnimationFrame(() => closeRef.current?.focus());
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keepFocusInside);
      previouslyFocused?.focus();
    };
  }, [evidenceOpen]);

  const closeEvidence = () => setEvidenceOpen(false);

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
        {evidence.length ? (
          <span className="asset-slice-grade-panel__badge">Supporting evidence</span>
        ) : null}
      </header>
      <div className="asset-slice-grade-panel__summary">
        <div className="asset-slice-grade-panel__score">
          <span>Estimated grade</span>
          <div
            className="asset-slice-grade-panel__emblem"
            aria-label={`Estimated Slice Grade ${estimate}`}
          >
            <strong>{estimate}</strong>
          </div>
          <small>{grade.conditionLabel ?? "AI estimate"}</small>
        </div>
        <div className="asset-slice-grade-panel__facts">
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
      <button
        type="button"
        className="asset-slice-grade-panel__evidence-toggle"
        aria-haspopup="dialog"
        aria-expanded={evidenceOpen}
        onClick={() => setEvidenceOpen(true)}
      >
        <span>
          <strong>View grading evidence</strong>
          <small>
            {grade.analyzedAt ? `Analysed ${formatDate(grade.analyzedAt)}` : "Supporting images"}
          </small>
        </span>
        <ArrowRight aria-hidden="true" />
      </button>
      {!evidence.length ? (
        <p className="asset-slice-grade-panel__empty">
          No supporting evidence is available for this grade.
        </p>
      ) : null}
      {grade.warnings.length ? (
        <p className="asset-slice-grade-panel__note">Review note: {grade.warnings[0]}</p>
      ) : null}
      {evidenceOpen ? (
        <div
          className="asset-slice-grade-modal"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) closeEvidence();
          }}
        >
          <div
            ref={dialogRef}
            className="asset-slice-grade-modal__dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="slice-grade-evidence-title"
            aria-describedby="slice-grade-evidence-description"
          >
            <header className="asset-slice-grade-modal__header">
              <div>
                <p className="asset-section-label">Slice Grade Evidence</p>
                <h3 id="slice-grade-evidence-title">Supporting evidence for this insight</h3>
              </div>
              <button
                ref={closeRef}
                type="button"
                className="asset-slice-grade-modal__close"
                aria-label="Close grading evidence"
                onClick={closeEvidence}
              >
                ×
              </button>
            </header>
            <p id="slice-grade-evidence-description" className="asset-slice-grade-modal__intro">
              Supporting evidence used for this AI-assisted condition insight. Slice Grade is an
              AI-assisted condition insight and is not an official third-party grading result.
            </p>
            <div className="asset-slice-grade-modal__summary">
              <div>
                <span>Estimated grade</span>
                <strong>{estimate}</strong>
                <small>{grade.conditionLabel ?? "AI estimate"}</small>
              </div>
              <div>
                <span>Analysed</span>
                <strong>{grade.analyzedAt ? formatDate(grade.analyzedAt) : "Not available"}</strong>
                <small>Persisted Slice Grade result</small>
              </div>
            </div>
            <div className="asset-slice-grade-modal__scores" aria-label="Grade component scores">
              {[
                ["Centering", grade.centeringScore],
                ["Corners", grade.cornerScore],
                ["Edges", grade.edgeScore],
                ["Surface", grade.surfaceScore],
              ].map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{score(value as number | null)}</strong>
                </div>
              ))}
            </div>
            {evidence.length ? (
              <section
                className="asset-slice-grade-modal__evidence"
                aria-labelledby="evidence-images-title"
              >
                <div className="asset-slice-grade-modal__section-heading">
                  <div>
                    <h4 id="evidence-images-title">Image evidence</h4>
                    <span>Public-safe views used to form the estimate.</span>
                  </div>
                  <span>
                    {evidence.length} {evidence.length === 1 ? "image" : "images"}
                  </span>
                </div>
                <div className="asset-slice-grade-modal__images">
                  {evidence.map((item, index) => (
                    <figure key={`${item.side}-${item.type}-${index}`}>
                      <img
                        src={item.url ?? undefined}
                        alt={`${item.side === "FRONT" ? "Front" : "Back"} card ${item.type} evidence`}
                      />
                      <figcaption>
                        {item.side === "FRONT" ? "Front" : "Back"} ·{" "}
                        {item.type === "centering" ? "Centering" : "Overview"}
                      </figcaption>
                    </figure>
                  ))}
                </div>
              </section>
            ) : (
              <div className="asset-slice-grade-modal__empty">
                No supporting evidence is available for this grade.
              </div>
            )}
            {grade.warnings.length ? (
              <p className="asset-slice-grade-modal__warning">Review note: {grade.warnings[0]}</p>
            ) : null}
            <footer className="asset-slice-grade-modal__footer">
              <button type="button" onClick={closeEvidence}>
                Close
              </button>
            </footer>
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
  categoryLabel,
  grader,
  gradeScore,
  gradeLabel,
  certificationNumber,
  media,
  backMedia,
}: {
  title: string;
  categoryLabel: string;
  grader?: string;
  gradeScore?: number;
  gradeLabel?: string;
  certificationNumber?: string;
  media?: { src: string; alt: string };
  backMedia?: { src: string; alt: string };
}) {
  const [manualFlip, setManualFlip] = useState(false);
  const [failedSides, setFailedSides] = useState({ front: false, back: false });
  const hasBackMedia = Boolean(backMedia && !failedSides.back);
  const flipped = hasBackMedia && manualFlip;

  const mediaFallback = (side: "front" | "back") => (
    <div className="asset-showcase-image asset-showcase-image--fallback" role="status">
      <strong>{side === "front" ? "Front image" : "Back image"}</strong>
      <span>Approved media unavailable</span>
    </div>
  );

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
        className={`asset-card-stage${hasBackMedia ? " has-back" : ""}${flipped ? " is-flipped" : ""}`}
      >
        <div className="asset-card-flip__inner">
          <div className="asset-card-face asset-card-face--front" aria-hidden={flipped}>
            {media && !failedSides.front ? (
              <img
                src={media.src}
                alt={media.alt}
                onError={() => setFailedSides((current) => ({ ...current, front: true }))}
              />
            ) : (
              mediaFallback("front")
            )}
            <span>Front</span>
          </div>
          <div className="asset-card-face asset-card-face--back" aria-hidden={!flipped}>
            {backMedia && !failedSides.back ? (
              <img
                src={backMedia.src}
                alt={backMedia.alt}
                onError={() => setFailedSides((current) => ({ ...current, back: true }))}
              />
            ) : (
              mediaFallback("back")
            )}
            <span>Back</span>
          </div>
        </div>
        {hasBackMedia && (
          <button
            type="button"
            className="asset-card-flip-button"
            aria-pressed={flipped}
            aria-label={flipped ? "Show front of card" : "Show back of card"}
            onClick={() => setManualFlip((current) => !current)}
          >
            <RotateCw aria-hidden="true" />
            {flipped ? "Show front" : "Flip card"}
          </button>
        )}
      </div>
      <div className="asset-showcase-footer">
        <span className="asset-showcase-footer__category">{categoryLabel}</span>
        {hasBackMedia ? (
          <div className="asset-showcase-footer__dots" aria-label="Card side">
            <button
              type="button"
              className={!flipped ? "is-active" : undefined}
              aria-label="Show front of card"
              aria-pressed={!flipped}
              onClick={() => setManualFlip(false)}
            />
            <button
              type="button"
              className={flipped ? "is-active" : undefined}
              aria-label="Show back of card"
              aria-pressed={flipped}
              onClick={() => setManualFlip(true)}
            />
          </div>
        ) : (
          <span className="asset-showcase-footer__dots-placeholder" aria-hidden="true" />
        )}
        <span className="asset-showcase-footer__side">
          <span className="asset-showcase-footer__viewing-label">Viewing</span>{" "}
          <strong>{flipped ? "back" : "front"}</strong>
        </span>
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
  ownPosition,
  positionLoading,
  isAuthenticated,
  ownershipSummary,
  trades,
  tradesLoading,
  tradesError,
  retryTrades,
}: {
  book: Awaited<ReturnType<ReturnType<typeof useAppServices>["market"]["orderBook"]>> | undefined;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
  id: string;
  sharePriceMinor?: number;
  issuedShares?: number;
  availableShares?: number;
  ownPosition:
    { settledUnits: string; reservedUnits: string; availableUnits: string } | null | undefined;
  positionLoading: boolean;
  isAuthenticated: boolean;
  ownershipSummary:
    | Awaited<ReturnType<ReturnType<typeof useAppServices>["trading"]["ownershipMarketSummary"]>>
    | undefined;
  trades: Awaited<ReturnType<ReturnType<typeof useAppServices>["market"]["recentTrades"]>>;
  tradesLoading: boolean;
  tradesError: boolean;
  retryTrades: () => void;
}) {
  const bids = book?.bids ?? [];
  const asks = book?.asks ?? [];
  const ownSettledShares = positiveSafeInteger(ownPosition?.settledUnits, true) ?? 0;
  const ownAvailableShares = positiveSafeInteger(ownPosition?.availableUnits, true) ?? 0;
  const marketOpen = ownershipSummary?.marketStatus === "OPEN";
  const canSell = isAuthenticated && marketOpen && ownAvailableShares > 0;
  const hasAvailable = (availableShares ?? 0) > 0;
  const breakdown = ownershipSummary?.ownershipBreakdown;
  const slicePrice =
    ownershipSummary?.slicePriceMinor ??
    (sharePriceMinor === undefined ? null : String(sharePriceMinor));
  const categories = breakdown?.reconciles ? breakdown.categories : [];
  const listedPercentage =
    breakdown?.listedAvailability.percentage ?? ownershipSummary?.availableOwnershipPercent;
  const sellMessage = !isAuthenticated
    ? "Sign in to manage settled units"
    : !marketOpen
      ? "Available when the market is open"
      : ownSettledShares === 0
        ? "Available after you own settled units"
        : "All settled units are currently reserved";
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
          value={slicePrice === null ? "Unavailable" : formatCurrency(Number(slicePrice))}
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
        <Info aria-hidden="true" />
        <span>
          {listedPercentage && listedPercentage !== "Not yet available"
            ? `${formatAvailability(listedPercentage)} of the issued supply is currently listed.`
            : "Availability will appear after ownership is issued."}
        </span>
      </p>
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
              <strong>Sell Slices</strong>
              <small>Manage settled units</small>
            </span>
            <ArrowRight aria-hidden="true" />
          </Link>
        ) : (
          <div className="is-sell is-disabled" aria-disabled="true">
            <span>
              <strong>Sell Slices</strong>
              <small>{sellMessage}</small>
            </span>
          </div>
        )}
      </div>
      {breakdown ? (
        <div
          className={`asset-ownership-breakdown${breakdown.reconciles ? "" : " is-unavailable"}`}
          aria-label="Settled ownership breakdown"
        >
          {breakdown.reconciles ? (
            <>
              <div className="asset-ownership-breakdown__bar" aria-hidden="true">
                {categories.map((category) => (
                  <span
                    key={category.key}
                    className={`is-${category.tone}`}
                    style={{ flexBasis: `${percentOf(category.units, issuedShares)}%` }}
                  />
                ))}
              </div>
              <div className="asset-ownership-breakdown__legend">
                {categories.map((category) => (
                  <span key={category.key}>
                    <i className={`is-${category.tone}`} /> {category.label}
                    <strong>
                      {formatSliceCount(category.units)}{" "}
                      <small>{formatAllocationPercent(category.units, issuedShares)}</small>
                    </strong>
                  </span>
                ))}
              </div>
              <p className="asset-ownership-breakdown__note">
                {breakdown.listedAvailability.relationship === "SUBSET_OF_OWNERSHIP_BUCKET"
                  ? `${formatSliceCount(breakdown.listedAvailability.units)} listed for sale; included in the ownership totals above.`
                  : `${formatSliceCount(breakdown.listedAvailability.units)} available from the offering inventory.`}
              </p>
            </>
          ) : (
            <p className="asset-ownership-breakdown__unavailable">
              Supply ownership is being reconciled. No category totals are shown until they match
              issued supply.
            </p>
          )}
        </div>
      ) : null}
      <div className="asset-current-position">
        <div>
          <span className="asset-section-label">Your position</span>
          {!isAuthenticated ? (
            <strong>
              <Link to="/login" search={{ returnTo: `/asset/${id}` }}>
                Sign in to see your position
              </Link>
            </strong>
          ) : positionLoading ? (
            <strong>Loading your position…</strong>
          ) : ownSettledShares > 0 ? (
            <strong>{formatSliceCount(ownSettledShares)}</strong>
          ) : (
            <strong>0 Slices</strong>
          )}
        </div>
        {isAuthenticated && !positionLoading && ownSettledShares > 0 && issuedShares ? (
          <div className="asset-current-position__supporting">
            <small>{formatOwnershipPercent(ownSettledShares, issuedShares)}</small>
            <small>{formatSliceCount(ownAvailableShares)} available to sell</small>
            <Link to="/portfolio">View in Portfolio&nbsp;→</Link>
          </div>
        ) : (
          <small>
            {isAuthenticated
              ? "You do not currently own settled Slices of this collectible."
              : "Ownership appears here after settlement."}
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
            <summary>
              <span className="asset-order-book__summary-icon">
                <BookOpen aria-hidden="true" />
              </span>
              <span>
                <strong>View order book</strong>
                <small>See live bids and asks for this asset</small>
              </span>
              <ArrowRight aria-hidden="true" />
            </summary>
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
                      {},
                    )
                  : "Unavailable"}
              </strong>
            </div>
            <OrderRows rows={bids} kind="bid" />
          </details>
        </>
      )}
      <RecentTrades
        trades={trades}
        isLoading={tradesLoading}
        isError={tradesError}
        retry={retryTrades}
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
}: {
  trades: Awaited<ReturnType<ReturnType<typeof useAppServices>["market"]["recentTrades"]>>;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
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
      ) : trades.length ? (
        <div className="asset-recent-trades__table-wrap">
          <table className="asset-recent-trades__table">
            <thead>
              <tr>
                <th scope="col">Date</th>
                <th scope="col">Side</th>
                <th scope="col">Slices</th>
                <th scope="col">Price / Slice</th>
                <th scope="col">Total</th>
              </tr>
            </thead>
            <tbody>
              {trades.slice(0, 7).map((trade) => (
                <tr key={trade.id}>
                  <td>{formatDate(trade.executedAt)}</td>
                  <td
                    className="asset-recent-trades__side"
                    aria-label="Trade side is not shown in the public execution view"
                  >
                    —
                  </td>
                  <td>{formatSliceCount(trade.units)}</td>
                  <td className="is-up">{formatCurrency(trade.pricePerUnit.amount)}</td>
                  <td>{formatTradeTotal(trade.units, trade.pricePerUnit.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="asset-recent-trades__empty">No public trades yet.</p>
      )}
    </section>
  );
}

function SimilarAssets({
  items,
  currentId,
  currentSlug,
  isLoading,
  isError,
  retry,
}: {
  items: MarketplaceSimilarAsset[];
  currentId: string;
  currentSlug: string;
  isLoading: boolean;
  isError: boolean;
  retry: () => void;
}) {
  const similar = items
    .filter((item) => item.assetId !== currentId && item.slug !== currentSlug)
    .slice(0, 8);
  const similarKey = similar.map((item) => item.assetId).join("|");
  const railRef = useRef<HTMLDivElement>(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const updateControls = () => {
      const maxScroll = Math.max(0, rail.scrollWidth - rail.clientWidth);
      setCanGoBack(rail.scrollLeft > 2);
      setCanGoForward(maxScroll - rail.scrollLeft > 2);
    };
    updateControls();
    rail.addEventListener("scroll", updateControls, { passive: true });
    window.addEventListener("resize", updateControls);
    return () => {
      rail.removeEventListener("scroll", updateControls);
      window.removeEventListener("resize", updateControls);
    };
  }, [currentId, similarKey, isLoading]);
  const moveRail = (direction: -1 | 1) => {
    const rail = railRef.current;
    const firstCard = rail?.querySelector<HTMLElement>(".asset-similar-card");
    if (!rail || !firstCard) return;
    const gap = Number.parseFloat(getComputedStyle(rail).columnGap || "0") || 0;
    rail.scrollBy({
      left: direction * (firstCard.getBoundingClientRect().width + gap),
      behavior: "smooth",
    });
  };
  return (
    <section className="asset-similar-section">
      <header>
        <div>
          <p className="asset-section-label">Similar assets</p>
          <p className="asset-similar-section__subtitle">
            Discover other collectibles in the same category.
          </p>
        </div>
        <div>
          <Link className="asset-similar-section__market-link" to="/marketplace">
            View market <ArrowRight aria-hidden="true" />
          </Link>
          {similar.length > 1 && !isLoading && !isError ? (
            <>
              <button
                type="button"
                aria-label="Previous similar assets"
                disabled={!canGoBack}
                onClick={() => moveRail(-1)}
              >
                <ArrowLeft aria-hidden="true" />
              </button>
              <button
                type="button"
                aria-label="Next similar assets"
                disabled={!canGoForward}
                onClick={() => moveRail(1)}
              >
                <ChevronRight aria-hidden="true" />
              </button>
            </>
          ) : null}
        </div>
      </header>
      {isLoading ? (
        <div className="asset-similar-grid asset-similar-grid--loading" aria-hidden="true">
          {Array.from({ length: 3 }, (_, index) => (
            <div className="asset-similar-card asset-similar-card--skeleton" key={index} />
          ))}
        </div>
      ) : isError ? (
        <div className="asset-similar-error">
          <p>Similar collectibles are temporarily unavailable.</p>
          <button type="button" onClick={retry}>
            Retry
          </button>
        </div>
      ) : similar.length ? (
        <div className="asset-similar-grid" ref={railRef} aria-label="Similar assets">
          {similar.map((item) => {
            return (
              <Link
                key={item.assetId}
                to="/asset/$id"
                params={{ id: item.slug }}
                className="asset-similar-card"
              >
                <div className="asset-similar-card__media">
                  {item.thumbnail ? (
                    <img src={item.thumbnail.url} alt={item.thumbnail.alt} />
                  ) : (
                    <span className="asset-similar-card__placeholder">Image unavailable</span>
                  )}
                </div>
                <div className="asset-similar-card__body">
                  <h3>{item.title}</h3>
                  <p className="asset-similar-card__metadata">
                    {item.setName ?? marketCategoryPresentation(item.category).label}
                    {item.cardNumber ? ` · ${item.cardNumber}` : ""}
                  </p>
                  <div className="asset-similar-card__quote">
                    <span>{similarPriceLabel(item.displayPrice.type)}</span>
                    <strong>{formatSimilarPrice(item.displayPrice)}</strong>
                    {item.movement24hBps !== null && item.movement24hBps !== undefined ? (
                      <em className={item.movement24hBps < 0 ? "is-negative" : ""}>
                        {formatSimilarMovement(item.movement24hBps)}
                      </em>
                    ) : null}
                  </div>
                  <span
                    className={`asset-similar-card__state is-${item.marketState.toLowerCase()}`}
                  >
                    <span aria-hidden="true" />
                    {similarMarketStateLabel(item.marketState)}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="asset-similar-empty" role="status">
          <div className="asset-similar-empty__copy">
            <strong>No similar assets yet</strong>
            <p>Comparable collectibles will appear here as more are published on Slice.</p>
          </div>
        </div>
      )}
    </section>
  );
}

function similarPriceLabel(type: MarketplaceSimilarAsset["displayPrice"]["type"]) {
  return type === "LAST_EXECUTION"
    ? "Last sale"
    : type === "INITIAL_OFFERING"
      ? "Initial offering"
      : type === "VALUATION"
        ? "Slice valuation"
        : "Market price";
}

function formatSimilarPrice(price: MarketplaceSimilarAsset["displayPrice"]) {
  if (!price.amount) return "Unavailable";
  const amount = formatCurrency(price.amount.amount, { currency: price.amount.currency });
  return price.type === "LAST_EXECUTION" || price.type === "INITIAL_OFFERING"
    ? `${amount} / Slice`
    : amount;
}

function formatSimilarMovement(valueBps: number) {
  const value = valueBps / 100;
  return `${value > 0 ? "+" : ""}${new Intl.NumberFormat("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}% (24h)`;
}

function similarMarketStateLabel(state: MarketplaceSimilarAsset["marketState"]) {
  return state === "LIVE_MARKET"
    ? "Live market"
    : state === "INITIAL_OFFERING"
      ? "Initial offering"
      : state === "MARKET_CLOSED"
        ? "Market closed"
        : "Reference only";
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
  return `${formatBasisPointPercent(percentageBasisPoints)}% ownership`;
}

function formatAllocationPercent(value: string | number | undefined, total: number | undefined) {
  if (value === undefined || total === undefined || total <= 0) return "—";
  try {
    const amount = BigInt(value);
    const basisPoints = (amount * 10_000n) / BigInt(total);
    return `${formatBasisPointPercent(basisPoints)}%`;
  } catch {
    return "—";
  }
}

function formatBasisPointPercent(value: bigint) {
  const whole = value / 100n;
  const remainder = value % 100n;
  if (remainder === 0n) return whole.toString();
  return `${whole}.${remainder.toString().padStart(2, "0").replace(/0+$/, "")}`;
}

function formatTradeTotal(units: string | number, priceMinor: number) {
  try {
    const totalMinor = BigInt(units) * BigInt(priceMinor);
    return formatCurrency(totalMinor);
  } catch {
    return "Unavailable";
  }
}

function formatSliceCount(value: string | number | bigint) {
  try {
    const count = typeof value === "bigint" ? value : BigInt(value);
    return `${count.toLocaleString()} ${count === 1n ? "Slice" : "Slices"}`;
  } catch {
    return "Unavailable";
  }
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

function formatHistoryCoverage(seconds?: number) {
  if (!seconds || seconds < 60) return seconds ? "<1m" : "Not available";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ${minutes % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
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
