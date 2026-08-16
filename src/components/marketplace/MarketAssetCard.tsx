import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bookmark, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/auth/use-session";
import { formatOwnership, formatPercent } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";
import { assetShowcaseMedia } from "./demo-asset-media";
import type { MarketplaceAsset } from "./market-api-presentation";
import { marketCategoryPresentation, marketplaceEditorialTag } from "./marketplace-presentation";

function gradePresentation(grade?: string) {
  if (!grade) return undefined;
  const [company, score, ...label] = grade.split(/\s+/);
  return { company, score: score ?? "", label: label.join(" ") };
}

function formatReferenceMoney(
  amountMinor: number,
  currency: NonNullable<MarketplaceAsset["marketReference"]>["currency"],
) {
  const locale =
    currency === "GBP"
      ? "en-GB"
      : currency === "CAD"
        ? "en-CA"
        : currency === "EUR"
          ? "en-IE"
          : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amountMinor / 100);
}

function AssetVisual({ asset }: { asset: MarketplaceAsset }) {
  const approvedMedia = asset.media?.find((item) => item.alt.toLowerCase().includes("front"));
  const media = approvedMedia
    ? { src: approvedMedia.url, alt: approvedMedia.alt }
    : assetShowcaseMedia(asset.slug);
  const category = marketCategoryPresentation(asset.category);
  const CategoryIcon = category.icon;
  const grade = gradePresentation(asset.grade);
  const preMarket = asset.ownershipStatus
    ? asset.ownershipStatus !== "ACTIVE" ||
      asset.tradingStatus !== "OPEN" ||
      asset.tradingEnabled === false
    : asset.availabilityBps === undefined;
  return (
    <div
      className="market-card-media profile-raw-card lighting-graphite"
      aria-label={media ? `${asset.title} media` : `${asset.title} media unavailable`}
    >
      <span className="market-card-glow" aria-hidden="true" />
      {media ? (
        <img className="market-card-media-image" src={media.src} alt={media.alt} />
      ) : (
        <span className="market-card-media-placeholder">Media unavailable</span>
      )}
      <span className="market-card-sheen" aria-hidden="true" />
      {preMarket ? <span className="market-state-badge">Pre-market</span> : null}
      <span className="market-category-chip">
        <CategoryIcon aria-hidden="true" />
        <span>{category.label}</span>
      </span>
      {grade && (
        <span className="market-grade-badge" title={asset.grade}>
          <span>{grade.company}</span>
          <strong>{grade.score}</strong>
        </span>
      )}
    </div>
  );
}

function MarketValue({ asset }: { asset: MarketplaceAsset }) {
  const { formatMoney } = useCurrency();
  const change =
    !asset.tradingHasExecutionHistory || asset.change24hBps === undefined
      ? undefined
      : asset.change24hBps / 100;
  const TrendIcon = (change ?? 0) >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="market-card-value">
      <div>
        <span className="market-card-value-label">Slice valuation</span>
        <strong>
          {asset.estimatedMarketValueMinor === undefined
            ? "Unavailable"
            : formatMoney(asset.estimatedMarketValueMinor, asset.estimatedMarketValueCurrency)}
        </strong>
      </div>
      {change !== undefined && (
        <span className={change >= 0 ? "is-positive" : "is-negative"}>
          <TrendIcon aria-hidden="true" />
          {formatPercent(change)} <small>(24h)</small>
        </span>
      )}
    </div>
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
  const { isAuthenticated } = useSession();
  const [saved, setSaved] = useState(false);
  const bookmark = useMutation({
    mutationFn: () => services.ownership.toggleWatchlist("current" as never, asset.id as never),
    onSuccess: (watchlist) => {
      setSaved(watchlist.assetIds.includes(asset.id as never));
      void client.invalidateQueries({ queryKey: ["watchlist", "current"] });
    },
  });
  const editorial = marketplaceEditorialTag(asset);
  const availability = asset.availabilityBps;
  const preMarket = asset.ownershipStatus
    ? asset.ownershipStatus !== "ACTIVE" ||
      asset.tradingStatus !== "OPEN" ||
      asset.tradingEnabled === false
    : availability === undefined;
  const availabilityWidth = Math.min(100, Math.max(0, (availability ?? 0) / 100));
  return (
    <article
      className={`market-investment-card market-investment-card--${editorial.tone} ${compact ? "is-compact" : ""}`}
    >
      <Link to="/asset/$id" params={{ id: asset.slug }} tabIndex={-1}>
        <AssetVisual asset={asset} />
      </Link>
      <div className="market-card-body">
        <div className="market-card-heading">
          <h2>
            <Link to="/asset/$id" params={{ id: asset.slug }}>
              {asset.title}
            </Link>
          </h2>
          <button
            type="button"
            className="market-bookmark"
            aria-label={
              isAuthenticated
                ? `${saved ? "Remove" : "Add"} ${asset.title} ${saved ? "from" : "to"} watchlist`
                : `Sign in to add ${asset.title} to your watchlist`
            }
            aria-pressed={saved}
            disabled={!isAuthenticated || bookmark.isPending}
            onClick={() => bookmark.mutate()}
          >
            <Bookmark aria-hidden="true" />
          </button>
        </div>
        <p className="market-card-grade">
          {asset.setName ?? "Collectible"}
          {asset.cardNumber ? <> &middot; {asset.cardNumber}</> : null}
        </p>
        <div className="market-card-condition">
          <span>{asset.grade ?? "Raw / Ungraded"}</span>
          {asset.conditionLabel ? <span>Condition: {asset.conditionLabel}</span> : null}
        </div>
        <MarketValue asset={asset} />
        {asset.marketReference ? (
          <p className="market-card-reference">
            Market reference: {formatReferenceMoney(
              asset.marketReference.amountMinor,
              asset.marketReference.currency,
            )} {asset.marketReference.currency}
          </p>
        ) : null}
        {!compact && (
          <>
            <dl className="market-card-metrics">
              <div>
                <dt>Availability</dt>
                <dd>
                  {preMarket
                    ? "Not yet issued"
                    : availability === undefined || availability === 0
                      ? "No listings"
                      : formatOwnership((availability ?? 0) / 100)}
                </dd>
              </div>
              <div>
                <dt>Owners</dt>
                <dd>{asset.ownersCount?.toLocaleString("en-GB") ?? "—"}</dd>
              </div>
              <div>
                <dt>Trading</dt>
                  <dd>
                    {preMarket
                      ? "Not yet available"
                      : availability === 0
                        ? "Awaiting listings"
                        : "Available"}
                  </dd>
              </div>
            </dl>
            <div
              className={`market-ownership${preMarket ? " is-pending" : ""}`}
              aria-label="Market availability"
            >
              {preMarket ? (
                <div className="market-availability-note">
                  <span aria-hidden="true" />
                  <small>Ownership is being prepared. Trading will open once issuance is complete.</small>
                </div>
              ) : (
                <>
                  <span>
                    <span style={{ width: `${availabilityWidth}%` }} />
                  </span>
                  <small>
                    {availability === undefined || availability === 0
                      ? "Market open · awaiting listings"
                      : `${formatOwnership((availability ?? 0) / 100)} available to own`}
                  </small>
                </>
              )}
            </div>
          </>
        )}
        <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
          View details <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function MarketDetailedRow({ asset }: { asset: MarketplaceAsset }) {
  const { formatMoney } = useCurrency();
  const editorial = marketplaceEditorialTag(asset);
  return (
    <article className="market-detailed-row">
      <Link to="/asset/$id" params={{ id: asset.slug }}>
        <AssetVisual asset={asset} />
      </Link>
      <div className="market-detailed-identity">
        <span className={`market-status-badge is-${editorial.tone}`}>{editorial.label}</span>
        <h2>
          <Link to="/asset/$id" params={{ id: asset.slug }}>
            {asset.title}
          </Link>
        </h2>
        <p>{asset.grade ?? "Grading pending"}</p>
      </div>
      <dl>
        <div>
          <dt>{asset.dataStatus === "DEMO" ? "Illustrative basis" : "Asset value"}</dt>
          <dd>
            {asset.estimatedMarketValueMinor === undefined
              ? "Unavailable"
              : formatMoney(asset.estimatedMarketValueMinor, asset.estimatedMarketValueCurrency)}
          </dd>
        </div>
        <div>
          <dt>24h</dt>
          <dd>
            {asset.change24hBps === undefined
              ? "Unavailable"
              : formatPercent(asset.change24hBps / 100)}
          </dd>
        </div>
        <div>
          <dt>Available</dt>
          <dd>
            {asset.availabilityBps === undefined
              ? "Unavailable"
              : formatOwnership(asset.availabilityBps / 100)}
          </dd>
        </div>
        <div>
          <dt>Owners</dt>
          <dd>{asset.ownersCount?.toLocaleString("en-GB") ?? "Unavailable"}</dd>
        </div>
      </dl>
      <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
        View Asset <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}
