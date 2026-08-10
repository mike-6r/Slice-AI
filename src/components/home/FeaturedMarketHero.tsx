import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowRight, Box, ChartNoAxesCombined, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { PriceChart } from "@/components/Chart";
import type { Asset, TimeRange } from "@/domain";
import { formatCurrencyPrecise, formatOwnership, formatPercent } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";

const RANGES: readonly TimeRange[] = ["24H", "7D", "30D", "90D", "1Y", "ALL"];

export function FeaturedMarketHero({ asset, loading }: { asset?: Asset; loading: boolean }) {
  return (
    <div className="featured-market-hero">
      <FeaturedShowcase asset={asset} loading={loading} />
      <FeaturedMarketPanel asset={asset} loading={loading} />
    </div>
  );
}

function FeaturedShowcase({ asset, loading }: { asset?: Asset; loading: boolean }) {
  const image = asset?.media.find((item) => item.kind === "image");
  const [imageFailed, setImageFailed] = useState(false);

  useEffect(() => setImageFailed(false), [image?.url]);

  return (
    <article className="showcase" aria-label="Featured collectible preview">
      <div className="showcase__surface">
        {loading ? (
          <div className="customer-skeleton h-52 w-36 rounded-md" />
        ) : image && !imageFailed ? (
          <img
            className="showcase__slab"
            src={image.url}
            alt={image.alt}
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="showcase__placeholder" aria-label="Featured collectible coming soon">
            <Sparkles className="size-9 text-accent" aria-hidden="true" />
          </div>
        )}
        <div className="showcase__pedestal" aria-hidden="true" />
        <div className="showcase__badge" aria-hidden="true">
          <span className="showcase__badge-service">
            <span className="showcase__badge-label">SLICE</span>
            <span className="showcase__badge-certification">{asset ? "featured" : "market"}</span>
          </span>
          <span className="showcase__badge-result">
            <span className="showcase__badge-grade">{asset?.grade?.label ?? "â€”"}</span>
            <span className="showcase__badge-description">{asset ? "grade" : "pending"}</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function FeaturedMarketPanel({ asset, loading }: { asset?: Asset; loading: boolean }) {
  const services = useAppServices();
  const [range, setRange] = useState<TimeRange>("30D");
  const history = useQuery({
    queryKey: ["home", "featured-market-history", asset?.id ?? null, range],
    queryFn: () => services.repositories.market.getPriceHistory(asset!.id, range),
    enabled: Boolean(asset),
    staleTime: 30_000,
  });
  const chartValues = useMemo(
    () => (history.data ?? []).map((point) => point.value.amount / 100),
    [history.data],
  );
  const hasHistory = chartValues.length > 1;
  const assetDetail = asset ? assetDescriptor(asset) : undefined;
  const change = asset?.market?.change24hBps;
  const ownership = asset?.ownershipAvailableBps;
  const confidence = asset?.market?.confidence;

  return (
    <section
      className="hero-panel featured-market-panel p-5"
      aria-labelledby="home-featured-heading"
    >
      <div className="featured-market-panel__heading">
        <div>
          <p className="page-kicker">{asset ? "Featured asset" : "Featured market"}</p>
          <h2 id="home-featured-heading" className="mt-2 text-xl font-semibold">
            {loading
              ? "Loading featured asset"
              : (asset?.details.title ?? "Featured asset coming soon")}
          </h2>
          {assetDetail ? <p className="mt-1 text-sm text-subtle">{assetDetail}</p> : null}
        </div>
        {asset?.market?.dataStatus ? (
          <span className="featured-market-panel__status">{asset.market.dataStatus}</span>
        ) : null}
      </div>

      {loading ? (
        <div className="customer-skeleton mt-6 h-36 w-full" />
      ) : asset ? (
        <>
          <div className="featured-market-panel__value-row">
            <div>
              <span>Published value</span>
              <strong>{assetValue(asset)}</strong>
            </div>
            {change !== undefined ? (
              <span className={change >= 0 ? "is-positive" : "is-negative"}>
                {formatPercent(change / 100)} 24h
              </span>
            ) : null}
          </div>
          <div className="featured-market-panel__chart-header">
            <span>Market history</span>
            {hasHistory ? (
              <div className="featured-market-panel__ranges" aria-label="Market history period">
                {RANGES.map((period) => (
                  <button
                    key={period}
                    type="button"
                    aria-pressed={range === period}
                    className={range === period ? "is-active" : undefined}
                    onClick={() => setRange(period)}
                  >
                    {period}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          <div className="featured-market-panel__chart">
            {hasHistory ? (
              <PriceChart
                data={chartValues}
                height={118}
                showAxis={false}
                label={`${asset.details.title} ${range} market history`}
              />
            ) : (
              <div className="featured-market-panel__history-empty">
                <ChartNoAxesCombined aria-hidden="true" />
                <span>Price history will appear after market activity begins.</span>
              </div>
            )}
          </div>
          <dl className="featured-market-panel__facts">
            {ownership !== undefined ? (
              <div>
                <dt>Availability</dt>
                <dd>{formatOwnership(ownership / 100)}</dd>
              </div>
            ) : null}
            {confidence !== undefined ? (
              <div>
                <dt>Market confidence</dt>
                <dd>{formatOwnership(confidence)}</dd>
              </div>
            ) : null}
            {asset.market?.asOf ? (
              <div>
                <dt>Valued</dt>
                <dd>
                  {new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(
                    new Date(asset.market.asOf),
                  )}
                </dd>
              </div>
            ) : null}
          </dl>
          <Link
            to="/asset/$id"
            params={{ id: asset.slug ?? asset.id }}
            className="featured-market-panel__cta"
          >
            View asset <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </>
      ) : (
        <div className="featured-market-panel__empty">
          <Box className="size-7 text-accent" aria-hidden="true" />
          <p>Published collectibles will appear here once they are available on the marketplace.</p>
          <Link to="/marketplace" className="featured-market-panel__cta">
            Explore markets <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </div>
      )}
    </section>
  );
}

function assetDescriptor(asset: Asset) {
  return [
    asset.details.card?.set,
    asset.details.card?.year ? String(asset.details.card.year) : undefined,
    asset.grade ? `${asset.grade.company} ${asset.grade.label}` : undefined,
  ]
    .filter(Boolean)
    .join(" Â· ");
}

function assetValue(asset: Asset) {
  return asset.market?.estimatedMarketValue
    ? formatCurrencyPrecise(asset.market.estimatedMarketValue.amount)
    : "Unavailable";
}
