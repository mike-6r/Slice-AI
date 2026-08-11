import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
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
import {
  toMarketplaceAsset,
  type MarketplaceAsset,
} from "@/components/marketplace/market-api-presentation";
import { vaultLiveShowcase, VAULT_LIVE_SHOWCASE_LABEL } from "@/data/vault-live-showcase";
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
  type: string;
  occurredAt: string;
  publicSummary: string;
  assetSlug: string;
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
  const events = useInfiniteQuery({
    queryKey: ["vault", "events"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      services.repositories.vault.getPublicEvents({ cursor: pageParam, limit: 12, signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const summary = useQuery({
    queryKey: ["vault", "summary"],
    queryFn: () => services.repositories.vault.getPublicSummary(),
  });
  const assetsQuery = useQuery({
    queryKey: ["vault-live", "public-assets"],
    queryFn: () => services.assets.list({ limit: 12, sort: "title" }),
  });

  const assets = useMemo(
    () => (assetsQuery.data?.items ?? []).map(toMarketplaceAsset),
    [assetsQuery.data],
  );
  const findAsset = (slug?: string) => assets.find((asset) => asset.slug === slug);
  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];
  const featuredAsset = findAsset(vaultLiveShowcase.featured.realAssetSlug) ?? assets[0];
  const reviewedAssets = assets.length ? assets.slice(0, 5) : [];
  const publishedAssets = assets.slice(0, 4);
  const hasRealEvents = eventItems.length > 0;
  const eventCount = summary.data?.eventCount;

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

        <div className="vault-live-visual" aria-label="Illustrative public asset journey">
          <div className="vault-live-visual__asset">
            {assetShowcaseMedia(featuredAsset?.slug ?? vaultLiveShowcase.featured.realAssetSlug) ? (
              <img
                src={
                  assetShowcaseMedia(
                    featuredAsset?.slug ?? vaultLiveShowcase.featured.realAssetSlug,
                  )!.src
                }
                alt={
                  assetShowcaseMedia(
                    featuredAsset?.slug ?? vaultLiveShowcase.featured.realAssetSlug,
                  )!.alt
                }
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
            <span>Featured public path</span>
            <strong>{featuredAsset?.title ?? vaultLiveShowcase.featured.title}</strong>
            <p>{featuredAsset?.grade ?? vaultLiveShowcase.featured.grade} · Public journey view</p>
            <AssetRoute asset={featuredAsset} className="text-link">
              View asset <ArrowRight aria-hidden="true" />
            </AssetRoute>
          </div>
        </div>
      </section>

      <section
        className="page-shell vault-live-shell vault-live-metrics"
        aria-label="Vault Live metrics"
      >
        {vaultLiveShowcase.metrics.map((metric, index) => {
          const Icon = [Eye, PackageCheck, ChartNoAxesCombined, Layers3][index]!;
          const realValue =
            index === 0 && typeof eventCount === "number" ? eventCount.toString() : metric.value;
          return (
            <article className="vault-live-metric" key={metric.label}>
              <span className="vault-live-metric__icon">
                <Icon aria-hidden="true" />
              </span>
              <div>
                <p>{metric.label}</p>
                <strong>{realValue}</strong>
                <span>
                  {index === 0 && typeof eventCount === "number"
                    ? "published events"
                    : metric.detail}
                </span>
              </div>
            </article>
          );
        })}
        <p className="vault-live-showcase-label">{VAULT_LIVE_SHOWCASE_LABEL}</p>
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
                <PublicEventRow event={event} asset={findAsset(event.assetSlug)} key={event.id} />
              ))}
            </div>
          ) : (
            <>
              <p className="vault-live-feed__notice">
                Live public activity will appear here as eligible events are published. These
                examples explain the intentionally public milestones shown on Vault Live.
              </p>
              <div className="vault-live-feed__rows">
                {vaultLiveShowcase.activity.map((event) => (
                  <ShowcaseEventRow
                    event={event}
                    asset={findAsset(event.realAssetSlug)}
                    key={event.id}
                  />
                ))}
              </div>
            </>
          )}
          {events.hasNextPage ? (
            <button
              className="vault-live-more"
              disabled={events.isFetchingNextPage}
              onClick={() => void events.fetchNextPage()}
              type="button"
            >
              {events.isFetchingNextPage ? "Loading public activity…" : "Load more public activity"}
            </button>
          ) : null}
        </div>

        <aside className="vault-live-panel vault-live-readiness">
          <div className="vault-live-panel__header">
            <div>
              <p className="section-kicker">Entering the vault</p>
              <h2>Public readiness milestones.</h2>
            </div>
          </div>
          <div className="vault-live-readiness__cards">
            {vaultLiveShowcase.readiness.map((item, index) => {
              const Icon = [PackageCheck, Landmark, ShieldCheck][index]!;
              return (
                <article key={item.label}>
                  <span>
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{item.label}</strong>
                    <p>{item.detail}</p>
                  </div>
                </article>
              );
            })}
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
        <div className="vault-live-asset-rail">
          {(reviewedAssets.length
            ? reviewedAssets
            : vaultLiveShowcase.reviewRail.map((slug) => findAsset(slug))
          ).map((asset, index) => (
            <VaultAssetCard
              key={asset?.slug ?? vaultLiveShowcase.reviewRail[index]}
              asset={asset}
              fallbackSlug={vaultLiveShowcase.reviewRail[index]!}
              label="Recently reviewed"
            />
          ))}
        </div>
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
          <p className="vault-live-showcase-label">Illustrative market activity</p>
          <div className="vault-live-market-activity__rows">
            {vaultLiveShowcase.marketActivity.map((item) => (
              <div key={item.title}>
                <span>
                  <TrendingUp aria-hidden="true" />
                </span>
                <p>
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </p>
                <b>{item.value}</b>
              </div>
            ))}
          </div>
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
          {assetShowcaseMedia(featuredAsset?.slug ?? vaultLiveShowcase.featured.realAssetSlug) ? (
            <img
              src={
                assetShowcaseMedia(featuredAsset?.slug ?? vaultLiveShowcase.featured.realAssetSlug)!
                  .src
              }
              alt={
                assetShowcaseMedia(featuredAsset?.slug ?? vaultLiveShowcase.featured.realAssetSlug)!
                  .alt
              }
            />
          ) : (
            <Vault aria-hidden="true" />
          )}
        </div>
        <div className="vault-live-featured__copy">
          <p className="section-kicker">Featured Vault asset</p>
          <span className="vault-live-status">
            <CircleDot aria-hidden="true" /> {vaultLiveShowcase.featured.publicStatus}
          </span>
          <h2>{featuredAsset?.title ?? vaultLiveShowcase.featured.title}</h2>
          <p>
            {featuredAsset?.grade ?? vaultLiveShowcase.featured.grade} ·{" "}
            {featuredAsset?.setName ?? vaultLiveShowcase.featured.subtitle}
          </p>
          <div className="vault-live-featured__numbers">
            <div>
              <small>Public valuation</small>
              <strong>
                {featuredAsset?.estimatedMarketValueMinor
                  ? formatCurrency(featuredAsset.estimatedMarketValueMinor)
                  : vaultLiveShowcase.featured.value}
              </strong>
            </div>
            <div>
              <small>Ownership available</small>
              <strong>
                {featuredAsset?.availabilityBps
                  ? `${featuredAsset.availabilityBps / 100}% available`
                  : vaultLiveShowcase.featured.ownership}
              </strong>
            </div>
          </div>
          <AssetRoute
            asset={featuredAsset}
            className="vault-live-button vault-live-button--primary"
          >
            View asset <ArrowRight aria-hidden="true" />
          </AssetRoute>
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
          {vaultLiveShowcase.categories.map((category) => (
            <Link key={category} to="/marketplace" className="vault-live-category">
              <Sparkles aria-hidden="true" />
              <span>{category}</span>
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
  const Icon = eventIcon(event.type);
  return (
    <article className="vault-live-event">
      <span className="vault-live-event__icon">
        <Icon aria-hidden="true" />
      </span>
      <div className="vault-live-event__copy">
        <p>{event.type.replaceAll("_", " ")}</p>
        <strong>{asset?.title ?? "Public collectible activity"}</strong>
        <span>{event.publicSummary}</span>
      </div>
      <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
      <AssetRoute asset={asset} className="text-link">
        View asset <ArrowRight aria-hidden="true" />
      </AssetRoute>
    </article>
  );
}

function ShowcaseEventRow({
  event,
  asset,
}: {
  event: (typeof vaultLiveShowcase.activity)[number];
  asset?: MarketplaceAsset;
}) {
  const Icon = eventIcon(event.label);
  return (
    <article className="vault-live-event">
      <span className="vault-live-event__icon">
        <Icon aria-hidden="true" />
      </span>
      <div className="vault-live-event__copy">
        <p>{event.label}</p>
        <strong>{asset?.title ?? event.title}</strong>
        <span>{event.detail}</span>
      </div>
      <time>{event.time}</time>
      <AssetRoute asset={asset} className="text-link">
        View asset <ArrowRight aria-hidden="true" />
      </AssetRoute>
    </article>
  );
}

function VaultAssetCard({
  asset,
  fallbackSlug,
  label,
  compact = false,
}: {
  asset?: MarketplaceAsset;
  fallbackSlug?: string;
  label: string;
  compact?: boolean;
}) {
  const media = assetShowcaseMedia(asset?.slug ?? fallbackSlug ?? "");
  const title = asset?.title ?? "Public collectible";
  return (
    <article className={`vault-live-asset-card${compact ? " vault-live-asset-card--compact" : ""}`}>
      <div className="vault-live-asset-card__media">
        {media ? <img src={media.src} alt={media.alt} /> : <Box aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <div className="vault-live-asset-card__copy">
        <strong>{title}</strong>
        <p>
          {asset?.grade ?? "Public catalogue"} · {asset?.category ?? "Collectible"}
        </p>
        {asset?.estimatedMarketValueMinor ? (
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
