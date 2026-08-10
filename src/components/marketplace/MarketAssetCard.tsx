import { Link } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Bookmark, TrendingDown, TrendingUp } from "lucide-react";
import { useState } from "react";
import { useSession } from "@/auth/use-session";
import { formatCurrency, formatDate, formatPercent } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
import { marketStatus } from "./marketplace-helpers";
import type { MarketplaceAsset } from "./market-api-presentation";

function AssetVisual({ asset }: { asset: MarketplaceAsset }) {
  return (
    <div
      className="market-card-media profile-raw-card lighting-graphite"
      aria-label={`${asset.title} media unavailable`}
    >
      <span className="market-card-glow" aria-hidden="true" />
      <span className="market-card-media-placeholder">Media unavailable</span>
      <div className={`market-status-badge is-${marketStatus(asset).tone}`}>
        {marketStatus(asset).label}
      </div>
      <span className="market-category-chip">{asset.category}</span>
      {asset.grade && <span className="market-grade-badge">{asset.grade}</span>}
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
  index,
  compact = false,
}: {
  asset: MarketplaceAsset;
  index: number;
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
  return (
    <article
      className={`market-investment-card market-investment-card--${marketStatus(asset).tone} ${compact ? "is-compact" : ""}`}
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
        <p className="market-card-grade">{asset.grade ?? "Grade unavailable"}</p>
        <MarketValue asset={asset} />
        {!compact && (
          <dl className="market-card-metrics">
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
              <dd>{asset.confidence === undefined ? "Unavailable" : `${asset.confidence}/100`}</dd>
            </div>
          </dl>
        )}
        <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
          View Asset <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function MarketDetailedRow({ asset }: { asset: MarketplaceAsset }) {
  return (
    <article className="market-detailed-row">
      <Link to="/asset/$id" params={{ id: asset.slug }}>
        <AssetVisual asset={asset} />
      </Link>
      <div className="market-detailed-identity">
        <span className={`market-status-badge is-${marketStatus(asset).tone}`}>
          {marketStatus(asset).label}
        </span>
        <h2>
          <Link to="/asset/$id" params={{ id: asset.slug }}>
            {asset.title}
          </Link>
        </h2>
        <p>{asset.grade ?? "Grade unavailable"}</p>
      </div>
      <dl>
        <div>
          <dt>Estimated market value</dt>
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
          <dt>Source</dt>
          <dd>{asset.source ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Confidence</dt>
          <dd>{asset.confidence === undefined ? "Unavailable" : `${asset.confidence}/100`}</dd>
        </div>
      </dl>
      <Link to="/asset/$id" params={{ id: asset.slug }} className="market-card-cta">
        View Asset <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}
