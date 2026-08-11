import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bookmark, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/auth/use-session";
import { formatCurrency, formatOwnership, formatPercent } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
import { assetShowcaseMedia } from "./demo-asset-media";
import type { MarketplaceAsset } from "./market-api-presentation";
import { marketCategoryPresentation, marketplaceEditorialTag } from "./marketplace-presentation";

function gradePresentation(grade?: string) {
  if (!grade) return undefined;
  const [company, score, ...label] = grade.split(/\s+/);
  return { company, score: score ?? "", label: label.join(" ") };
}

function AssetVisual({ asset }: { asset: MarketplaceAsset }) {
  const media = assetShowcaseMedia(asset.slug);
  const category = marketCategoryPresentation(asset.category);
  const CategoryIcon = category.icon;
  const editorial = marketplaceEditorialTag(asset);
  const EditorialIcon = editorial.icon;
  const grade = gradePresentation(asset.grade);
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
      <div className={`market-status-badge is-${editorial.tone}`}>
        <EditorialIcon aria-hidden="true" />
        {editorial.label}
      </div>
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
  const change = asset.change24hBps === undefined ? undefined : asset.change24hBps / 100;
  const TrendIcon = (change ?? 0) >= 0 ? TrendingUp : TrendingDown;
  return (
    <div className="market-card-value">
      <strong>
        {asset.estimatedMarketValueMinor === undefined
          ? "Unavailable"
          : formatCurrency(asset.estimatedMarketValueMinor)}
      </strong>
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
          {asset.grade ?? "Grading pending"}
          {asset.setName ? <> &middot; {asset.setName}</> : null}
        </p>
        <MarketValue asset={asset} />
        {!compact && (
          <>
            <p className="market-card-value-helper">
              {asset.dataStatus === "LIVE" ? "Current public valuation" : "Estimated valuation"}
            </p>
            <dl className="market-card-metrics">
              <div>
                <dt>Available</dt>
                <dd>
                  {availability === undefined ? "Unavailable" : formatOwnership(availability / 100)}
                </dd>
              </div>
              <div>
                <dt>Owners</dt>
                <dd>{asset.ownersCount?.toLocaleString("en-GB") ?? "Unavailable"}</dd>
              </div>
              <div>
                <dt>Set / Edition</dt>
                <dd>{asset.setName ?? "Not specified"}</dd>
              </div>
            </dl>
            <div className="market-ownership" aria-label="Available ownership">
              <span>
                <span style={{ width: `${availabilityWidth}%` }} />
              </span>
              <small>
                {availability === undefined
                  ? "Availability not published"
                  : `${formatOwnership(availability / 100)} of ownership available`}
              </small>
            </div>
          </>
        )}
        <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
          View Asset <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function MarketDetailedRow({ asset }: { asset: MarketplaceAsset }) {
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
          <dt>Asset value</dt>
          <dd>
            {asset.estimatedMarketValueMinor === undefined
              ? "Unavailable"
              : formatCurrency(asset.estimatedMarketValueMinor)}
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
