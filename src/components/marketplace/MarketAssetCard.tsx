import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bookmark,
  CheckCircle2,
  Coins,
  Info,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { useState } from "react";
import { useSession } from "@/auth/use-session";
import { formatDate, formatPercent } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import type { MarketplaceAsset } from "./market-api-presentation";
import { resolveMarketplaceMedia, resolveMarketplaceMediaGallery } from "./marketplace-layout";
import { formatPreSaleCountdown } from "./PreSaleDisclosure";

function marketStatusPresentation(asset: MarketplaceAsset) {
  if (asset.preSale) {
    return {
      label: "Pre-Sale",
      detail: "Conditional reservations open",
      isOpen: true,
    };
  }
  if (asset.marketLifecycle) {
    return {
      label: asset.marketLifecycle.phase === "LIVE" ? "Market Open" : asset.marketLifecycle.badge,
      detail:
        asset.marketLifecycle.phase === "LIVE"
          ? "Trading enabled"
          : asset.marketLifecycle.statusPill,
      isOpen: asset.marketLifecycle.phase === "LIVE",
    };
  }
  if (asset.tradingStatus === "OPEN" && asset.tradingEnabled !== false) {
    return { label: "Market Open", detail: "Trading enabled", isOpen: true };
  }
  if (asset.tradingStatus === "HALTED") {
    return { label: "Market Halted", detail: "Trading paused", isOpen: false };
  }
  if (asset.tradingStatus === "CLOSED") {
    return { label: "Market Closed", detail: "Trading unavailable", isOpen: false };
  }
  return { label: "Unavailable", detail: "Market state unavailable", isOpen: false };
}

function officialGradeLabel(asset: MarketplaceAsset) {
  if (!asset.grade) return "Raw / Ungraded";
  return asset.grade.replaceAll(" · ", " ");
}

function categoryLabel(category: string) {
  const labels: Record<string, string> = {
    "pokemon-tcg": "Pokémon TCG",
    "sports-cards": "Sports Cards",
    "trading-card-games": "Trading Card Games",
    "one-piece": "One Piece",
    "magic-the-gathering": "Magic: The Gathering",
    "yu-gi-oh": "Yu-Gi-Oh!",
  };
  return labels[category] ?? category.replaceAll(/[-_]+/g, " ");
}

function cleanCardTitle(asset: MarketplaceAsset) {
  const title = asset.title.trim();
  const cardNumber = asset.cardNumber?.replace(/^#/, "").trim();
  if (!cardNumber) return title;
  const escapedCardNumber = cardNumber.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return title.replace(new RegExp(`\\s+#?${escapedCardNumber}$`, "i"), "").trim() || title;
}

function cardIdentity(asset: MarketplaceAsset) {
  const collection = asset.setName ?? (asset.category ? categoryLabel(asset.category) : null);
  const identity = [
    asset.year,
    collection,
    asset.cardNumber ? `#${asset.cardNumber.replace(/^#/, "")}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    identity || (asset.category ? categoryLabel(asset.category) : "Collectible details unavailable")
  );
}

function listingHandle(listing: MarketplaceAsset["listing"]) {
  const listedBy = listing?.listedBy;
  if (!listedBy) return null;
  const value = listedBy.username ?? listedBy.slug ?? listedBy.displayName;
  if (!value) return null;
  return `@${value.replace(/^@/, "").trim()}`;
}

function ListingAttribution({ asset }: { asset: MarketplaceAsset }) {
  const listing = asset.listing;
  const listedBy = listing?.listedBy;
  const handle = listingHandle(listing);
  if (!listedBy || !handle) return null;

  return (
    <div className="market-card-listing-meta">
      <span className="market-card-listing-meta__byline" title={listedBy.displayName ?? undefined}>
        <UserRound aria-hidden="true" />
        <span>
          Listed by <strong>{handle}</strong>
        </span>
      </span>
      {listing.listedAt ? (
        <time dateTime={listing.listedAt}>Listed {formatDate(listing.listedAt)}</time>
      ) : null}
    </div>
  );
}

function formatActiveListingLabel(count: number) {
  if (count <= 0) return "No active listings";
  return `${count} active ${count === 1 ? "listing" : "listings"}`;
}

function formatAvailableUnits(units: string) {
  return units === "1" ? "1 Slice currently offered" : `${units} Slices currently offered`;
}

function formatIssuedOwnership(issuedUnits: string | undefined) {
  if (!issuedUnits || !/^\d+$/.test(issuedUnits)) return null;
  const units = BigInt(issuedUnits);
  if (units <= 0n) return null;
  const percentage = 100 / Number(units);
  if (!Number.isFinite(percentage)) return null;
  return `${percentage >= 1 ? percentage.toFixed(1) : percentage.toFixed(2)}% ownership`;
}

function formatMovementBps(movementBps: number | undefined) {
  if (movementBps === undefined) return null;
  const value = movementBps / 100;
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function AssetVisual({ asset }: { asset: MarketplaceAsset }) {
  const gallery = resolveMarketplaceMediaGallery(asset);
  const [activeIndex, setActiveIndex] = useState(0);
  const media = gallery[activeIndex] ?? gallery[0] ?? resolveMarketplaceMedia(asset);
  const status = marketStatusPresentation(asset);
  const stageLabel = asset.preSale ? "CONDITIONAL MARKET" : "LIVE MARKET";

  return (
    <div className="market-card-hero">
      <div className="market-card-media">
        <span className="market-card-glow" aria-hidden="true" />
        <span className="market-card-media-beam" aria-hidden="true" />
        <div className="market-card-media-topline" aria-hidden="true">
          <span>
            <i />
            {stageLabel}
          </span>
          <span>{asset.cardNumber ? `NO. ${asset.cardNumber.replace(/^#/, "")}` : "ASSET 01"}</span>
        </div>
        <Link
          to="/asset/$id"
          params={{ id: asset.slug }}
          className="market-card-media-link"
          aria-label={`View ${cleanCardTitle(asset)}`}
        >
          {media ? (
            <img className="market-card-media-image" src={media.src} alt={media.alt} />
          ) : (
            <span className="market-card-media-placeholder">Image unavailable</span>
          )}
        </Link>
        {!asset.preSale ? (
          <>
            <span
              className="market-card-live-wordmark market-card-live-wordmark--left"
              aria-hidden="true"
            >
              ICONIC
              <br />
              PLAYERS
              <br />
              REAL
              <br />
              OWNERSHIP
            </span>
            <span
              className="market-card-live-wordmark market-card-live-wordmark--right"
              aria-hidden="true"
            >
              COLLECT
              <br />
              INVEST
              <br />
              BELONG
            </span>
          </>
        ) : null}
        <span className="market-card-vignette" aria-hidden="true" />
      </div>
      <span className={`market-card-status${status.isOpen ? " is-open" : ""}`}>
        <span aria-hidden="true" />
        {status.label}
      </span>
      {gallery.length > 1 ? (
        <div className="market-card-gallery-dots" aria-label={`${asset.title} image gallery`}>
          {gallery.map((item, index) => (
            <button
              key={`${item.src}-${index}`}
              type="button"
              className={index === activeIndex ? "is-active" : ""}
              aria-label={`Show ${item.alt}`}
              aria-current={index === activeIndex ? "true" : undefined}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}

function ValuationBlock({ asset }: { asset: MarketplaceAsset }) {
  const {
    currency: displayCurrency,
    ratesAvailable,
    formatMoney,
    formatSourceMoney,
  } = useCurrency();
  const valuation = asset.preSale
    ? Number(asset.preSale.pricePerUnitMinor)
    : (asset.sliceValuationAmountMinor ?? asset.estimatedMarketValueMinor);
  const valuationCurrency = asset.preSale
    ? asset.preSale.currency
    : (asset.sliceValuationCurrency ?? asset.estimatedMarketValueCurrency);
  const valuationLabel = asset.preSale
    ? "Price per Slice"
    : asset.sliceValuationAmountMinor !== undefined
      ? "Slice valuation"
      : "Estimated value";

  return (
    <section className="market-card-valuation" aria-label="Valuation">
      <div className="market-card-valuation-primary">
        <span className="market-card-label">{valuationLabel}</span>
        <strong>
          {valuation !== undefined && valuationCurrency
            ? formatMoney(valuation, valuationCurrency)
            : "Unavailable"}
        </strong>
        {asset.preSale ? (
          <small className="market-card-value-context">Conditional Pre-Sale price</small>
        ) : null}
        {asset.preSale && asset.preSaleBasisMinor !== undefined ? (
          <small className="market-card-value-context">
            Pre-Sale basis{" "}
            {formatMoney(
              asset.preSaleBasisMinor,
              asset.preSaleBasisCurrency ?? asset.preSale.currency,
            )}
          </small>
        ) : null}
      </div>
      <div className="market-card-reference">
        <span className="market-card-label">Market reference</span>
        {asset.marketReference ? (
          <>
            <strong>
              {formatMoney(asset.marketReference.amountMinor, asset.marketReference.currency)}
              <span
                className="market-card-info"
                tabIndex={0}
                role="img"
                aria-label="External market reference, informational only"
                title="External market reference, informational only"
              >
                <Info aria-hidden="true" />
              </span>
            </strong>
            <small>
              {asset.marketReference.source ?? "External reference"}
              {displayCurrency !== asset.marketReference.currency && ratesAvailable
                ? ` · source ${formatSourceMoney(asset.marketReference.amountMinor, asset.marketReference.currency)} ${asset.marketReference.currency}`
                : ""}
              {asset.marketReference.context ? ` · ${asset.marketReference.context}` : ""}
            </small>
            {asset.marketReference.movement30dBps !== undefined ? (
              <small className="market-card-reference-movement">
                30D {formatPercent(asset.marketReference.movement30dBps / 100)}
              </small>
            ) : null}
          </>
        ) : (
          <>
            <strong className="market-card-reference-unavailable">
              {asset.marketReferenceLink ? "Linked · check pending" : "Not linked"}
            </strong>
            <small>
              {asset.marketReferenceLink
                ? `${asset.marketReferenceLink.provider} · ${asset.marketReferenceLink.status.replaceAll("_", " ")}`
                : "External reference data"}
            </small>
          </>
        )}
      </div>
    </section>
  );
}

function PreSaleCardSummary({ asset }: { asset: MarketplaceAsset }) {
  const { formatMoney } = useCurrency();
  const preSale = asset.preSale;
  if (!preSale) return null;
  const offered = BigInt(preSale.offeredUnits);
  const reserved = BigInt(preSale.reservedUnits);
  const progress = offered > 0n ? Math.min(100, Number((reserved * 10_000n) / offered) / 100) : 0;
  return (
    <section className="market-card-presale-summary" aria-label="Pre-Sale availability">
      <div className="market-card-presale-summary__heading">
        <span>Pre-Sale availability</span>
        <strong>{formatPreSaleCountdown(preSale.deadlineAt)} left</strong>
      </div>
      <div className="market-card-presale-summary__facts">
        {asset.preSaleBasisMinor !== undefined ? (
          <span>
            <b>
              {formatMoney(asset.preSaleBasisMinor, asset.preSaleBasisCurrency ?? preSale.currency)}
            </b>{" "}
            basis
          </span>
        ) : null}
        <span>
          <b>{preSale.availableUnits}</b> available
        </span>
        <span>
          <b>{preSale.reservedUnits}</b> reserved
        </span>
        <span>
          <b>{preSale.offeredUnits}</b> total Slices
        </span>
      </div>
      <div className="market-card-presale-summary__progress" aria-hidden="true">
        <span style={{ width: `${progress}%` }} />
      </div>
      <div className="market-card-presale-summary__foot">
        <small>{homepagePhysicalStatus(preSale.physicalStatus)} · conditional reservation</small>
        <small>{preSale.currency} settlement</small>
      </div>
    </section>
  );
}

function homepageIdentity(asset: MarketplaceAsset) {
  return cardIdentity(asset);
}

function homepagePhysicalStatus(status: string) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase())
    .replace("Physical ", "");
}

function formatHomepageOwnership(percentageBps: number | undefined) {
  if (percentageBps === undefined) return null;
  return `${(percentageBps / 100).toFixed(2)}% ownership`;
}

function HomepageAssetBody({ asset }: { asset: MarketplaceAsset }) {
  const { formatMoney } = useCurrency();
  const preSale = asset.preSale;
  const priceMinor = preSale
    ? Number(preSale.pricePerUnitMinor)
    : (asset.sliceValuationAmountMinor ?? asset.estimatedMarketValueMinor);
  const priceCurrency = preSale
    ? preSale.currency
    : (asset.sliceValuationCurrency ?? asset.estimatedMarketValueCurrency);
  const ownership = formatHomepageOwnership(preSale?.sliceOwnershipPercentageBps);

  return (
    <div className="market-card-home-body">
      <div className="market-card-home-heading">
        <span className={`market-card-home-status${preSale ? " is-presale" : " is-live"}`}>
          <span aria-hidden="true" />
          {preSale ? "PRE-SALE" : "LIVE"}
        </span>
        <h2>
          <Link to="/asset/$id" params={{ id: asset.slug }}>
            {cleanCardTitle(asset)}
          </Link>
        </h2>
        <p>{homepageIdentity(asset)}</p>
        <ListingAttribution asset={asset} />
        <span className="market-card-home-grade">{officialGradeLabel(asset)}</span>
      </div>

      <div className="market-card-home-metrics">
        <div>
          <span className="market-card-label">{preSale ? "Price per Slice" : "Market value"}</span>
          <strong>
            {priceMinor !== undefined && priceCurrency
              ? formatMoney(priceMinor, priceCurrency)
              : "Unavailable"}
            {preSale ? <small> / Slice</small> : null}
          </strong>
        </div>
        {ownership ? (
          <div>
            <span className="market-card-label">Ownership per Slice</span>
            <strong>{ownership}</strong>
          </div>
        ) : null}
      </div>

      {preSale ? (
        <div className="market-card-home-availability">
          <strong>
            {preSale.availableUnits} available · {preSale.reservedUnits} reserved
          </strong>
          <span>
            {homepagePhysicalStatus(preSale.physicalStatus)} ·{" "}
            {formatPreSaleCountdown(preSale.deadlineAt)}
          </span>
        </div>
      ) : (
        <div className="market-card-home-availability">
          <strong>{marketStatusPresentation(asset).detail}</strong>
          <span>{asset.activeListingsCount ?? 0} active listings</span>
        </div>
      )}

      <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
        View collectible <ArrowRight aria-hidden="true" />
      </Link>
    </div>
  );
}

function LiveMarketTrend({ asset }: { asset: MarketplaceAsset }) {
  const movement = formatMovementBps(asset.marketReference?.movement30dBps);
  const hasMovement = movement !== null;
  return (
    <section className="market-card-live-trend" aria-label="30 day market reference">
      <div className="market-card-live-trend__heading">
        <span>30D MARKET REFERENCE</span>
        <strong className={hasMovement && movement.startsWith("+") ? "is-positive" : ""}>
          {movement ?? "Awaiting history"}
        </strong>
      </div>
      <svg viewBox="0 0 600 96" role="img" aria-label="Market reference graph">
        <defs>
          <linearGradient id={`market-trend-fill-${asset.id}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.24" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path className="market-card-live-trend__grid" d="M0 22H600M0 54H600M0 86H600" />
        <path
          className={`market-card-live-trend__area${hasMovement ? " has-data" : ""}`}
          fill={`url(#market-trend-fill-${asset.id})`}
          d="M0 62 H600 V96 H0 Z"
        />
        <path
          className={`market-card-live-trend__line${hasMovement ? " has-data" : ""}`}
          pathLength="1"
          d="M0 62 H600"
        />
        <circle className="market-card-live-trend__dot" cx="600" cy="62" r="4" />
      </svg>
      <div className="market-card-live-trend__scale" aria-hidden="true">
        <span>
          {hasMovement ? "Movement reported · history unavailable" : "History unavailable"}
        </span>
        <span>{asset.marketReference?.currency ?? "—"}</span>
      </div>
    </section>
  );
}

function LiveMarketBody({ asset }: { asset: MarketplaceAsset }) {
  const { formatMoney } = useCurrency();
  const price = asset.sliceValuationAmountMinor ?? asset.estimatedMarketValueMinor;
  const priceCurrency = asset.sliceValuationCurrency ?? asset.estimatedMarketValueCurrency;
  const reference = asset.marketReference;
  const ownershipPerSlice = formatIssuedOwnership(asset.issuedUnits);
  const hasListings = (asset.activeListingsCount ?? 0) > 0;
  const movement = formatMovementBps(asset.change24hBps);
  const available =
    asset.availableListingUnits && asset.availableListingUnits !== "0"
      ? asset.availableListingUnits
      : null;

  return (
    <div className="market-card-live-body">
      <div className="market-card-live-heading">
        <div>
          <h2>
            <Link to="/asset/$id" params={{ id: asset.slug }}>
              {cleanCardTitle(asset)}
            </Link>
          </h2>
          <p>{cardIdentity(asset)}</p>
        </div>
        <span className="market-card-live-heading__verified">
          <CheckCircle2 aria-hidden="true" />
          Trading enabled
        </span>
      </div>

      <div className="market-card-live-grade-row">
        <span>
          <Coins aria-hidden="true" />
          {officialGradeLabel(asset)}
        </span>
        {asset.conditionLabel ? <span>Condition: {asset.conditionLabel}</span> : null}
      </div>

      <ListingAttribution asset={asset} />

      <section className="market-card-live-valuation" aria-label="Live valuation">
        <div>
          <span className="market-card-label">Price per Slice</span>
          <strong>
            {price !== undefined && priceCurrency
              ? formatMoney(price, priceCurrency)
              : "Unavailable"}
          </strong>
          <small>
            {ownershipPerSlice ? `1 Slice = ${ownershipPerSlice}` : "Fractional ownership"}
          </small>
        </div>
        <div>
          <span className="market-card-label">Market reference</span>
          <strong>
            {reference ? formatMoney(reference.amountMinor, reference.currency) : "Not linked"}
          </strong>
          <small>
            {reference?.source ??
              asset.marketReferenceLink?.provider ??
              "External reference pending"}
            {reference?.freshness ? ` · ${reference.freshness.toLowerCase()}` : ""}
          </small>
        </div>
      </section>

      <LiveMarketTrend asset={asset} />

      <section className="market-card-live-stats" aria-label="Live market statistics">
        <div>
          <span>ACTIVE LISTINGS</span>
          <strong>{asset.activeListingsCount?.toLocaleString("en-GB") ?? "—"}</strong>
          <small>{available ? `${available} Slices available` : "No current supply"}</small>
        </div>
        <div>
          <span>AVAILABLE UNITS</span>
          <strong>{available ?? "—"}</strong>
          <small>{hasListings ? "Ready to trade" : "No active listings"}</small>
        </div>
        <div>
          <span>24H MOVE</span>
          <strong className={movement?.startsWith("+") ? "is-positive" : ""}>
            {movement ?? "—"}
          </strong>
          <small>
            {asset.tradingHasExecutionHistory ? "Trading history" : "No executions yet"}
          </small>
        </div>
      </section>

      <div className="market-card-live-ownership">
        <span className="market-card-live-ownership__icon">
          <Coins aria-hidden="true" />
        </span>
        <span>
          <strong>Own a fractional position</strong>
          <small>
            {ownershipPerSlice ? `${ownershipPerSlice} per Slice` : "Defined Slice ownership"} ·
            build your collection over time
          </small>
        </span>
        <ArrowRight aria-hidden="true" />
      </div>

      <div className="market-card-live-marketline">
        <TrendingUp aria-hidden="true" />
        <span>
          <strong>Live Market</strong>
          <small>
            {hasListings
              ? "Active trading is enabled for this collectible."
              : "Trading is enabled when inventory is available."}
          </small>
        </span>
        <span className="market-card-live-marketline__dot" aria-hidden="true" />
      </div>

      <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-live-buy">
        {hasListings ? "Buy Slices" : "View market"} <ArrowRight aria-hidden="true" />
      </Link>
      <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-live-view">
        View collectible
      </Link>
    </div>
  );
}

function MarketAvailability({ asset }: { asset: MarketplaceAsset }) {
  const status = marketStatusPresentation(asset);
  const listings = asset.activeListingsCount ?? 0;
  const units = asset.availableListingUnits ?? "0";
  const hasUnits = units !== "0";

  return (
    <section className="market-card-market-grid" aria-label="Market availability">
      <div>
        <span className="market-card-label">Market status</span>
        <strong>{status.label}</strong>
        <small>{status.detail}</small>
      </div>
      <div>
        <span className="market-card-label">Active listings</span>
        <strong>{formatActiveListingLabel(listings)}</strong>
        <small>{hasUnits ? formatAvailableUnits(units) : "Nothing currently offered"}</small>
      </div>
    </section>
  );
}

function OwnershipPrompt({ asset }: { asset: MarketplaceAsset }) {
  const hasListings = (asset.activeListingsCount ?? 0) > 0;
  return (
    <div className="market-card-ownership">
      <span className="market-card-ownership-icon" aria-hidden="true">
        ◇
      </span>
      <span>
        <strong>{hasListings ? "Own available Slices" : "Own in Slices"}</strong>
        <small>Fractional ownership of this collectible</small>
      </span>
    </div>
  );
}

export function MarketAssetCardSkeleton({ compact = false }: { compact?: boolean }) {
  return (
    <article
      className={`market-investment-card market-investment-card--skeleton${compact ? " is-compact" : ""}`}
      aria-label="Loading collectible"
      aria-busy="true"
    >
      <div className="market-card-skeleton-media" />
      <div className="market-card-body">
        <span className="market-card-skeleton-line is-title" />
        <span className="market-card-skeleton-line is-identity" />
        <div className="market-card-skeleton-pills">
          <span />
          <span />
        </div>
        <div className="market-card-skeleton-value" />
        <div className="market-card-skeleton-market" />
        {!compact ? <div className="market-card-skeleton-ownership" /> : null}
        <div className="market-card-skeleton-cta" />
      </div>
    </article>
  );
}

export function MarketAssetCard({
  asset,
  compact = false,
  homepageCompact = false,
}: {
  asset: MarketplaceAsset;
  compact?: boolean;
  homepageCompact?: boolean;
}) {
  const services = useAppServices();
  const client = useQueryClient();
  const navigate = useNavigate();
  const { isAuthenticated } = useSession();
  const watchlist = useQuery({
    queryKey: ["watchlist", "current"],
    queryFn: () => services.ownership.watchlist("current" as never),
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
  const saved = watchlist.data?.assetIds.includes(asset.id as never) ?? false;
  const bookmark = useMutation({
    mutationFn: () => services.ownership.toggleWatchlist("current" as never, asset.id as never),
    onMutate: async () => {
      await client.cancelQueries({ queryKey: ["watchlist", "current"] });
      const previous = client.getQueryData<typeof watchlist.data>(["watchlist", "current"]);
      if (previous) {
        client.setQueryData(["watchlist", "current"], {
          ...previous,
          assetIds: saved
            ? previous.assetIds.filter((id) => id !== asset.id)
            : [...previous.assetIds, asset.id],
        });
      }
      return { previous };
    },
    onError: (_error, _variables, context) => {
      if (context?.previous) client.setQueryData(["watchlist", "current"], context.previous);
    },
    onSuccess: (next) => client.setQueryData(["watchlist", "current"], next),
    onSettled: () => void client.invalidateQueries({ queryKey: ["watchlist", "current"] }),
  });
  return (
    <article
      className={`market-investment-card${asset.preSale ? " is-pre-sale" : " is-live"}${compact ? " is-compact" : ""}${homepageCompact ? " is-home-compact" : ""}`}
    >
      <div className="market-card-visual-wrap">
        <AssetVisual asset={asset} />
        <button
          type="button"
          className={`market-bookmark${saved ? " is-saved" : ""}`}
          aria-label={
            isAuthenticated
              ? `${saved ? "Remove" : "Add"} ${asset.title} ${saved ? "from" : "to"} watchlist`
              : `Sign in to add ${asset.title} to your watchlist`
          }
          aria-pressed={saved}
          disabled={bookmark.isPending}
          onClick={() => {
            if (!isAuthenticated) {
              void navigate({ to: "/login", search: { returnTo: `/asset/${asset.slug}` } });
              return;
            }
            bookmark.mutate();
          }}
        >
          <Bookmark aria-hidden="true" />
        </button>
      </div>
      <div className="market-card-body">
        {homepageCompact ? (
          <HomepageAssetBody asset={asset} />
        ) : !asset.preSale && !compact && marketStatusPresentation(asset).isOpen ? (
          <LiveMarketBody asset={asset} />
        ) : (
          <>
            <div className="market-card-heading">
              <div className="market-card-heading-copy">
                <span className="market-card-kicker">
                  {asset.preSale ? "CONDITIONAL ACCESS" : "MARKET LIVE"}
                </span>
                <h2>
                  <Link to="/asset/$id" params={{ id: asset.slug }}>
                    {cleanCardTitle(asset)}
                  </Link>
                </h2>
                <p className="market-card-identity-line">{cardIdentity(asset)}</p>
                <ListingAttribution asset={asset} />
              </div>
            </div>
            <div className="market-card-condition" aria-label="Condition and grading">
              <span>{officialGradeLabel(asset)}</span>
              {asset.conditionLabel ? (
                <span aria-label={`Condition: ${asset.conditionLabel}`}>
                  Condition: {asset.conditionLabel}
                </span>
              ) : null}
            </div>
            <ValuationBlock asset={asset} />
            <PreSaleCardSummary asset={asset} />
            {!compact ? <MarketAvailability asset={asset} /> : null}
            {!compact ? <OwnershipPrompt asset={asset} /> : null}
            <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
              View collectible <ArrowRight aria-hidden="true" />
            </Link>
          </>
        )}
      </div>
    </article>
  );
}

export function MarketDetailedRow({ asset }: { asset: MarketplaceAsset }) {
  const { formatMoney } = useCurrency();
  const lifecycle = asset.marketLifecycle;
  const hasLifecycleMovement = asset.tradingHasExecutionHistory && asset.change24hBps !== undefined;
  return (
    <article className="market-detailed-row">
      <AssetVisual asset={asset} />
      <div className="market-detailed-identity">
        <span className="market-status-badge">
          {asset.preSale ? "Pre-Sale" : (lifecycle?.badge ?? "Market status")}
        </span>
        <h2>
          <Link to="/asset/$id" params={{ id: asset.slug }}>
            {asset.title}
          </Link>
        </h2>
        <p>{officialGradeLabel(asset)}</p>
      </div>
      <dl>
        <div>
          <dt>Slice valuation</dt>
          <dd>
            {asset.sliceValuationAmountMinor !== undefined && asset.sliceValuationCurrency
              ? formatMoney(asset.sliceValuationAmountMinor, asset.sliceValuationCurrency)
              : asset.estimatedMarketValueMinor !== undefined && asset.estimatedMarketValueCurrency
                ? formatMoney(asset.estimatedMarketValueMinor, asset.estimatedMarketValueCurrency)
                : "Unavailable"}
          </dd>
        </div>
        <div>
          <dt>Market movement</dt>
          <dd>
            {!hasLifecycleMovement
              ? "No trading history"
              : formatPercent((asset.change24hBps ?? 0) / 100)}
          </dd>
        </div>
        <div>
          <dt>Active listings</dt>
          <dd>{asset.activeListingsCount ?? 0}</dd>
        </div>
        <div>
          <dt>Owners</dt>
          <dd>{asset.ownersCount?.toLocaleString("en-GB") ?? "Unavailable"}</dd>
        </div>
      </dl>
      <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
        View collectible <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}
