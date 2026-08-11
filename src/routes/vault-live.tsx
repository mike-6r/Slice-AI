import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Box,
  ChartNoAxesCombined,
  CheckCircle2,
  CircleDot,
  Clock3,
  Eye,
  Landmark,
  Layers3,
  PackageCheck,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Vault,
} from "lucide-react";
import { useMemo, type ReactNode } from "react";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import { type MarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import { vaultLiveShowcase } from "@/data/vault-live-showcase";
import type { VaultLiveAsset } from "@/data/repositories";
import { formatCurrency, formatDate } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/vault-live")({
  head: () => ({
    meta: [
      { title: "Vault Live | Slice" },
      {
        name: "description",
        content:
          "A public window into collectible review, readiness and marketplace activity on Slice.",
      },
    ],
  }),
  component: VaultLive,
});

type PublicEvent = {
  id: string;
  publicLabel: string;
  occurredAt: string;
  publicSummary: string;
  asset: VaultLiveAsset;
};

const statusIcon = {
  reviewed: BadgeCheck,
  valued: ChartNoAxesCombined,
  vault: Vault,
  market: TrendingUp,
  ownership: Layers3,
};

function eventIcon(label: string) {
  const normalized = label.toLowerCase();
  if (normalized.includes("valu")) return statusIcon.valued;
  if (normalized.includes("vault") || normalized.includes("custody")) return statusIcon.vault;
  if (normalized.includes("market") || normalized.includes("publish")) return statusIcon.market;
  if (normalized.includes("ownership")) return statusIcon.ownership;
  return statusIcon.reviewed;
}

function AssetRoute({
  asset,
  fallback = "/marketplace",
  className,
  children,
}: {
  asset?: MarketplaceAsset;
  fallback?: "/marketplace";
  className?: string;
  children: ReactNode;
}) {
  if (asset) {
    return (
      <Link className={className} to="/asset/$id" params={{ id: asset.slug }}>
        {children}
      </Link>
    );
  }

  return (
    <Link className={className} to={fallback}>
      {children}
    </Link>
  );
}

function VaultLive() {
  const services = useAppServices();
  const live = useQuery({
    queryKey: ["vault", "live-public-projection"],
    queryFn: () => services.repositories.vault.getPublicLive(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });
  const assets = useMemo(
    () => (live.data?.publishedAssets ?? []).map(toMarketplaceVaultAsset),
    [live.data],
  );
  const eventItems = live.data?.recentEvents ?? [];
  const featuredAsset = live.data?.featuredAsset
    ? toMarketplaceVaultAsset(live.data.featuredAsset)
    : undefined;
  const reviewedAssets = (live.data?.recentlyReviewed ?? []).map(toMarketplaceVaultAsset);
  const readinessAssets = (live.data?.readiness ?? []).map(toMarketplaceVaultAsset);
  const publishedAssets = assets.slice(0, 4);
  const hasRealEvents = eventItems.length > 0;
  const metrics = live.data?.metrics;

  return (
    <main className="vault-live-page">
      <section className="page-shell vault-live-shell vault-live-hero">
        <div className="vault-live-hero__copy">
          <p className="page-kicker">Vault Live</p>
          <h1 className="vault-live-hero__title">See what’s moving through Slice.</h1>
          <p className="vault-live-hero__lede">
            Follow public collectible activity as assets move through review, valuation, custody and
            the marketplace.
          </p>
          <p className="vault-live-hero__privacy">
            Public Vault Live activity is limited to information intentionally published through
            Slice. Private custody records and operational details remain protected.
          </p>
          <div className="vault-live-hero__actions">
            <Link className="vault-live-button vault-live-button--primary" to="/marketplace">
              Explore markets <ArrowRight aria-hidden="true" />
            </Link>
            <Link className="vault-live-button vault-live-button--secondary" to="/collectors">
              Discover collectors
            </Link>
          </div>
        </div>

        <div className="vault-live-visual" aria-label="Featured public asset journey">
          <div className="vault-live-visual__asset">
            {featuredAsset && assetShowcaseMedia(featuredAsset.slug) ? (
              <img
                src={assetShowcaseMedia(featuredAsset.slug)!.src}
                alt={assetShowcaseMedia(featuredAsset.slug)!.alt}
              />
            ) : (
              <Box aria-hidden="true" />
            )}
            <span className="vault-live-visual__ring" aria-hidden="true" />
          </div>
          <div className="vault-live-visual__track" aria-hidden="true">
            {[
              ["Reviewed", CheckCircle2],
              ["Valued", ChartNoAxesCombined],
              ["Vault ready", ShieldCheck],
              ["Market live", TrendingUp],
            ].map(([label, Icon], index) => {
              const StepIcon = Icon as typeof CheckCircle2;
              return (
                <div className="vault-live-visual__step" key={label as string}>
                  <span className="vault-live-visual__node">
                    <StepIcon />
                  </span>
                  <span>{label as string}</span>
                  {index < 3 ? <i /> : null}
                </div>
              );
            })}
          </div>
          <div className="vault-live-visual__detail">
            <span>{featuredAsset ? "Featured public path" : "Public asset journey"}</span>
            <strong>{featuredAsset?.title ?? "No featured public asset"}</strong>
            <p>
              {featuredAsset
                ? `${featuredAsset.grade ?? "Publicly listed"} / Public journey view`
                : "A featured asset appears only after it is intentionally published to Slice."}
            </p>
            {featuredAsset ? (
              <AssetRoute asset={featuredAsset} className="text-link">
                View asset <ArrowRight aria-hidden="true" />
              </AssetRoute>
            ) : (
              <Link className="text-link" to="/marketplace">
                Explore markets <ArrowRight aria-hidden="true" />
              </Link>
            )}
          </div>
        </div>
      </section>

      <section
        className="page-shell vault-live-shell vault-live-metrics"
        aria-label="Vault Live metrics"
      >
        {[
          ["Public vault events", metrics?.publicVaultEvents ?? 0, "in the last 24 hours"],
          ["Newly published", metrics?.newlyPublished ?? 0, "assets in the last 24 hours"],
          ["Valuations updated", metrics?.valuationsUpdated ?? 0, "in the last 24 hours"],
          ["Market activity", metrics?.marketActivity ?? "0", "shares traded in the last 24 hours"],
        ].map(([label, value, detail], index) => {
          const Icon = [Eye, PackageCheck, ChartNoAxesCombined, Layers3][index]!;
          return (
            <article className="vault-live-metric" key={label as string}>
              <span className="vault-live-metric__icon">
                <Icon aria-hidden="true" />
              </span>
              <div>
                <p>{label as string}</p>
                <strong>{String(value)}</strong>
                <span>{detail as string}</span>
              </div>
            </article>
          );
        })}
      </section>

      <section className="page-shell vault-live-shell vault-live-grid vault-live-grid--activity">
        <div className="vault-live-panel vault-live-feed">
          <div className="vault-live-panel__header">
            <div>
              <p className="section-kicker">Live activity</p>
              <h2>What’s happening now.</h2>
            </div>
            {hasRealEvents ? (
              <span className="vault-live-live">
                <i /> Live public activity
              </span>
            ) : null}
          </div>
          {hasRealEvents ? (
            <div className="vault-live-feed__rows">
              {eventItems.slice(0, 5).map((event) => (
                <PublicEventRow
                  event={event}
                  asset={toMarketplaceVaultAsset(event.asset)}
                  key={event.id}
                />
              ))}
            </div>
          ) : (
            <>
              <p className="vault-live-feed__notice">
                No recent public Vault Live events. Events appear here only after an eligible
                lifecycle milestone is intentionally published.
              </p>
            </>
          )}
        </div>

        <aside className="vault-live-panel vault-live-readiness">
          <div className="vault-live-panel__header">
            <div>
              <p className="section-kicker">Readiness activity</p>
              <h2>Public readiness milestones.</h2>
            </div>
          </div>
          <div className="vault-live-readiness__cards">
            {readinessAssets.length ? (
              readinessAssets.slice(0, 3).map((asset, index) => {
                const Icon = [PackageCheck, Landmark, ShieldCheck][index]!;
                return (
                  <article key={asset.slug}>
                    <span>
                      <Icon aria-hidden="true" />
                    </span>
                    <div>
                      <strong>{asset.title}</strong>
                      <p>
                        {asset.category}
                        {asset.grade ? ` / ${asset.grade}` : ""}
                      </p>
                    </div>
                  </article>
                );
              })
            ) : (
              <p className="vault-live-feed__notice">
                No public readiness milestones have been published.
              </p>
            )}
          </div>
        </aside>
      </section>

      <section className="page-shell vault-live-shell vault-live-section">
        <div className="vault-live-panel__header">
          <div>
            <p className="section-kicker">Recently reviewed</p>
            <h2>Collectibles in public focus.</h2>
          </div>
          <Link className="text-link" to="/marketplace">
            Explore markets <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        {reviewedAssets.length ? (
          <div className="vault-live-asset-rail">
            {reviewedAssets.map((asset) => (
              <VaultAssetCard key={asset.slug} asset={asset} label="Recently reviewed" />
            ))}
          </div>
        ) : (
          <div className="vault-live-empty">
            <PackageCheck aria-hidden="true" />
            <div>
              <strong>No publicly reviewed collectibles yet.</strong>
              <p>Only review milestones intentionally published by Slice appear here.</p>
            </div>
          </div>
        )}
      </section>

      <section className="page-shell vault-live-shell vault-live-grid vault-live-grid--market">
        <div className="vault-live-panel vault-live-published">
          <div className="vault-live-panel__header">
            <div>
              <p className="section-kicker">Now on the market</p>
              <h2>From Vault Live to Marketplace.</h2>
            </div>
            <Link className="text-link" to="/marketplace">
              Browse all assets <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          {publishedAssets.length ? (
            <div className="vault-live-published__grid">
              {publishedAssets.map((asset) => (
                <VaultAssetCard key={asset.slug} asset={asset} label="Published" compact />
              ))}
            </div>
          ) : (
            <div className="vault-live-empty">
              <PackageCheck aria-hidden="true" />
              <div>
                <strong>Published catalogue items will appear here.</strong>
                <p>Explore the public marketplace while new assets become available.</p>
              </div>
              <Link className="vault-live-button vault-live-button--secondary" to="/marketplace">
                Explore markets
              </Link>
            </div>
          )}
        </div>

        <aside className="vault-live-panel vault-live-market-activity">
          <div className="vault-live-panel__header">
            <div>
              <p className="section-kicker">Market activity</p>
              <h2>Public market signals.</h2>
            </div>
          </div>
          {(live.data?.marketActivity.length ?? 0) > 0 ? (
            <div className="vault-live-market-activity__rows">
              {live.data!.marketActivity.map((item) => (
                <div key={item.asset.publicId}>
                  <span>
                    <TrendingUp aria-hidden="true" />
                  </span>
                  <p>
                    <strong>{item.asset.title}</strong>
                    <small>Public executed share activity</small>
                  </p>
                  <b>{item.units} shares</b>
                </div>
              ))}
            </div>
          ) : (
            <p className="vault-live-feed__notice">
              No public share executions in the last 24 hours.
            </p>
          )}
        </aside>
      </section>

      <section className="page-shell vault-live-shell vault-live-journey">
        <div className="vault-live-panel__header">
          <div>
            <p className="section-kicker">From collectible to market</p>
            <h2>How Vault Live fits into the Slice journey.</h2>
          </div>
        </div>
        <div className="vault-live-journey__steps">
          {vaultLiveShowcase.journey.map(([number, title, detail]) => (
            <article key={number}>
              <span>{number}</span>
              <strong>{title}</strong>
              <p>{detail}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="page-shell vault-live-shell vault-live-featured">
        <div className="vault-live-featured__image">
          {featuredAsset && assetShowcaseMedia(featuredAsset.slug) ? (
            <img
              src={assetShowcaseMedia(featuredAsset.slug)!.src}
              alt={assetShowcaseMedia(featuredAsset.slug)!.alt}
            />
          ) : (
            <Vault aria-hidden="true" />
          )}
        </div>
        <div className="vault-live-featured__copy">
          <p className="section-kicker">Featured Vault asset</p>
          <span className="vault-live-status">
            <CircleDot aria-hidden="true" />{" "}
            {featuredAsset ? "Market live" : "Awaiting public asset"}
          </span>
          <h2>{featuredAsset?.title ?? "No featured public asset"}</h2>
          <p>
            {featuredAsset
              ? `${featuredAsset.grade ?? "Publicly listed"} / ${featuredAsset.setName ?? featuredAsset.category}`
              : "Featured details will appear once a public catalogue asset is available."}
          </p>
          <div className="vault-live-featured__numbers">
            <div>
              <small>Public valuation</small>
              <strong>
                {featuredAsset?.estimatedMarketValueMinor
                  ? formatCurrency(featuredAsset.estimatedMarketValueMinor)
                  : "Unavailable"}
              </strong>
            </div>
            <div>
              <small>Ownership available</small>
              <strong>
                {featuredAsset?.availabilityBps
                  ? `${featuredAsset.availabilityBps / 100}% available`
                  : "Unavailable"}
              </strong>
            </div>
          </div>
          {featuredAsset ? (
            <AssetRoute
              asset={featuredAsset}
              className="vault-live-button vault-live-button--primary"
            >
              View asset <ArrowRight aria-hidden="true" />
            </AssetRoute>
          ) : (
            <Link className="vault-live-button vault-live-button--primary" to="/marketplace">
              Explore markets <ArrowRight aria-hidden="true" />
            </Link>
          )}
        </div>
      </section>

      <section className="page-shell vault-live-shell vault-live-categories">
        <div className="vault-live-panel__header">
          <div>
            <p className="section-kicker">Category activity</p>
            <h2>Explore public collectible markets.</h2>
          </div>
        </div>
        <div>
          {(live.data?.categories ?? []).map((category) => (
            <Link
              key={category.slug}
              to="/marketplace"
              search={{ category: category.slug }}
              className="vault-live-category"
            >
              <Sparkles aria-hidden="true" />
              <span>{category.name}</span>
              <ArrowRight aria-hidden="true" />
            </Link>
          ))}
        </div>
      </section>

      <section className="page-shell vault-live-shell vault-live-cta">
        <div>
          <p className="section-kicker">Collect with confidence</p>
          <h2>Explore the public side of Slice.</h2>
          <p>
            Discover published assets, meet collectors and see how eligible collectibles become
            market-ready.
          </p>
        </div>
        <div>
          <Link className="vault-live-button vault-live-button--primary" to="/marketplace">
            Explore markets <ArrowRight aria-hidden="true" />
          </Link>
          <Link className="vault-live-button vault-live-button--secondary" to="/list">
            List an asset
          </Link>
        </div>
      </section>
    </main>
  );
}

function PublicEventRow({ event, asset }: { event: PublicEvent; asset?: MarketplaceAsset }) {
  const Icon = eventIcon(event.publicLabel);
  return (
    <article className="vault-live-event">
      <span className="vault-live-event__icon">
        <Icon aria-hidden="true" />
      </span>
      <div className="vault-live-event__copy">
        <p>{event.publicLabel}</p>
        <strong>{asset?.title}</strong>
        <span>{event.publicSummary}</span>
      </div>
      <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
      <AssetRoute asset={asset} className="text-link">
        View asset <ArrowRight aria-hidden="true" />
      </AssetRoute>
    </article>
  );
}

function VaultAssetCard({
  asset,
  label,
  compact = false,
}: {
  asset: MarketplaceAsset;
  label: string;
  compact?: boolean;
}) {
  const media = assetShowcaseMedia(asset.slug);
  return (
    <article className={`vault-live-asset-card${compact ? " vault-live-asset-card--compact" : ""}`}>
      <div className="vault-live-asset-card__media">
        {media ? <img src={media.src} alt={media.alt} /> : <Box aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <div className="vault-live-asset-card__copy">
        <strong>{asset.title}</strong>
        <p>
          {asset?.grade ?? "Public catalogue"} · {asset?.category ?? "Collectible"}
        </p>
        {asset.estimatedMarketValueMinor ? (
          <b>{formatCurrency(asset.estimatedMarketValueMinor)}</b>
        ) : (
          <small>Explore public listing</small>
        )}
        <AssetRoute asset={asset} className="text-link">
          View asset <ArrowRight aria-hidden="true" />
        </AssetRoute>
      </div>
    </article>
  );
}

function toMarketplaceVaultAsset(asset: VaultLiveAsset): MarketplaceAsset {
  return {
    id: asset.publicId,
    slug: asset.slug,
    title: asset.title,
    category: asset.category.name,
    setName: asset.collectibleSet?.name,
    grade: asset.grading ? `${asset.grading.companyCode} ${asset.grading.label}` : undefined,
    estimatedMarketValueMinor: asset.market ? Number(asset.market.estimatedValueMinor) : undefined,
    source: asset.market?.dataStatus,
    asOf: asset.market?.asOf,
    confidence: asset.market?.confidence ?? undefined,
    availabilityBps: asset.market?.availableBps ?? undefined,
    ownersCount: asset.market?.ownersCount ?? undefined,
    dataStatus: asset.market?.dataStatus === "LIVE" ? "LIVE" : "DEMO",
    change24hBps: asset.market?.change24hBps ?? undefined,
  };
}
