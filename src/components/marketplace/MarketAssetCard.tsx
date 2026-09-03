import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bookmark, Info } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/auth/use-session";
import { formatPercent } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import type { MarketplaceAsset } from "./market-api-presentation";
import { resolveMarketplaceMedia, resolveMarketplaceMediaGallery } from "./marketplace-layout";
import { PreSaleDisclosure } from "./PreSaleDisclosure";

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

function formatActiveListingLabel(count: number) {
  if (count <= 0) return "No active listings";
  return `${count} active ${count === 1 ? "listing" : "listings"}`;
}

function formatAvailableUnits(units: string) {
  return units === "1" ? "1 Slice currently offered" : `${units} Slices currently offered`;
}

function AssetVisual({ asset }: { asset: MarketplaceAsset }) {
  const gallery = resolveMarketplaceMediaGallery(asset);
  const [activeIndex, setActiveIndex] = useState(0);
  const media = gallery[activeIndex] ?? gallery[0] ?? resolveMarketplaceMedia(asset);
  const status = marketStatusPresentation(asset);

  return (
    <div className="market-card-hero">
      <div className="market-card-media">
        <span className="market-card-glow" aria-hidden="true" />
        <Link
          to="/asset/$id"
          params={{ id: asset.slug }}
          className="market-card-media-link"
          aria-label={`View ${asset.title}`}
        >
          {media ? (
            <img className="market-card-media-image" src={media.src} alt={media.alt} />
          ) : (
            <span className="market-card-media-placeholder">Image unavailable</span>
          )}
        </Link>
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
  const valuation = asset.sliceValuationAmountMinor ?? asset.estimatedMarketValueMinor;
  const valuationCurrency = asset.sliceValuationCurrency ?? asset.estimatedMarketValueCurrency;
  const valuationLabel =
    asset.sliceValuationAmountMinor !== undefined ? "Slice valuation" : "Estimated value";

  return (
    <section className="market-card-valuation" aria-label="Valuation">
      <div className="market-card-valuation-primary">
        <span className="market-card-label">{valuationLabel}</span>
        <strong>
          {valuation !== undefined && valuationCurrency
            ? formatMoney(valuation, valuationCurrency)
            : "Unavailable"}
        </strong>
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
          <strong className="market-card-reference-unavailable">Unavailable</strong>
        )}
      </div>
    </section>
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
}: {
  asset: MarketplaceAsset;
  compact?: boolean;
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
    <article className={`market-investment-card${compact ? " is-compact" : ""}`}>
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
        <div className="market-card-heading">
          <h2>
            <Link to="/asset/$id" params={{ id: asset.slug }}>
              {asset.title}
            </Link>
          </h2>
          <p className="market-card-identity-line">
            {[asset.setName, asset.cardNumber].filter(Boolean).join(" · ") ||
              "Set and card number unavailable"}
          </p>
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
        {asset.preSale ? <PreSaleDisclosure preSale={asset.preSale} compact={compact} /> : null}
        {!compact ? <MarketAvailability asset={asset} /> : null}
        {!compact ? <OwnershipPrompt asset={asset} /> : null}
        <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
          View collectible <ArrowRight aria-hidden="true" />
        </Link>
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
