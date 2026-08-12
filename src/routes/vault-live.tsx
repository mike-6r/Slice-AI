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
import type { ReactNode } from "react";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
import {
  resolveVaultLiveContent,
  vaultLiveShowcase,
  type VaultLivePresentedAsset,
  type VaultLivePresentedEvent,
} from "@/data/vault-live-showcase";
import { formatDate } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
import { useCurrency } from "@/currency/CurrencyProvider";

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
  className,
  children,
}: {
  asset: VaultLivePresentedAsset;
  className?: string;
  children: ReactNode;
}) {
  if (asset.source === "real") {
    return (
      <Link className={className} to="/asset/$id" params={{ id: asset.asset.slug }}>
        {children}
      </Link>
    );
  }

  return (
    <Link className={className} to="/marketplace">
      {children}
    </Link>
  );
}

function VaultLiveLoading() {
  return (
    <main className="vault-live-page">
      <section
        className="page-shell vault-live-shell vault-live-loading"
        aria-busy="true"
        aria-live="polite"
      >
        <span className="vault-live-loading__eyebrow">Vault Live</span>
        <strong>Loading public Vault Live activity…</strong>
        <div className="vault-live-loading__bars" aria-hidden="true">
          <i />
          <i />
          <i />
        </div>
      </section>
    </main>
  );
}

function VaultLiveUnavailable() {
  return (
    <main className="vault-live-page">
      <section className="page-shell vault-live-shell vault-live-unavailable" role="alert">
        <div>
          <p className="section-kicker">Vault Live unavailable</p>
          <h1>Public Vault Live activity could not be loaded.</h1>
          <p>
            Try again shortly. We do not substitute illustrative examples when the public service is
            unavailable.
          </p>
        </div>
        <Link className="vault-live-button vault-live-button--secondary" to="/vault-live">
          Try again
        </Link>
      </section>
    </main>
  );
}

function VaultLive() {
  const services = useAppServices();
  const { formatMoney } = useCurrency();
  const live = useQuery({
    queryKey: ["vault", "live-public-projection"],
    queryFn: () => services.repositories.vault.getPublicLive(),
    staleTime: 15_000,
    refetchInterval: 30_000,
  });

  if (live.isPending) return <VaultLiveLoading />;
  if (live.isError || !live.data) return <VaultLiveUnavailable />;

  const content = resolveVaultLiveContent(live.data);
  const isShowcase = content.mode === "showcase";
  const featuredAsset = content.featuredAsset;

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
          <p className="vault-live-data-status" role="status">
            <i aria-hidden="true" />{" "}
            {isShowcase ? vaultLiveShowcase.statusLabel : "Public activity"}
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
            {assetShowcaseMedia(featuredAsset.asset.slug) ? (
              <img
                src={assetShowcaseMedia(featuredAsset.asset.slug)!.src}
                alt={assetShowcaseMedia(featuredAsset.asset.slug)!.alt}
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
            <span>
              {featuredAsset.source === "real"
                ? "Featured public path"
                : "Illustrative public journey"}
            </span>
            <strong>{featuredAsset.asset.title}</strong>
            <p>
              {featuredAsset.asset.grade ?? "Public journey view"} ·{" "}
              {featuredAsset.asset.setName ?? featuredAsset.asset.category}
            </p>
            <AssetRoute asset={featuredAsset} className="text-link">
              {featuredAsset.source === "real" ? "View asset" : "Explore markets"}{" "}
              <ArrowRight aria-hidden="true" />
            </AssetRoute>
          </div>
        </div>
      </section>

      <section
        className="page-shell vault-live-shell vault-live-metrics"
        aria-label="Vault Live metrics"
      >
        {[
          ["Public vault events", content.metrics.publicVaultEvents, "in the last 24 hours"],
          ["Newly published", content.metrics.newlyPublished, "assets in the last 24 hours"],
          ["Valuations updated", content.metrics.valuationsUpdated, "in the last 24 hours"],
          ["Market activity", content.metrics.marketActivity, "shares traded in the last 24 hours"],
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
        {isShowcase ? (
          <span className="vault-live-showcase-label">Illustrative activity examples</span>
        ) : null}
      </section>

      <section className="page-shell vault-live-shell vault-live-grid vault-live-grid--activity">
        <div className="vault-live-panel vault-live-feed">
          <div className="vault-live-panel__header">
            <div>
              <p className="section-kicker">Live activity</p>
              <h2>What’s happening now.</h2>
            </div>
            {content.recentEvents[0]?.source === "real" ? (
              <span className="vault-live-live">
                <i /> Live public activity
              </span>
            ) : (
              <span className="vault-live-live vault-live-live--illustrative">
                Illustrative examples
              </span>
            )}
          </div>
          <div className="vault-live-feed__rows">
            {content.recentEvents.slice(0, 5).map((event) => (
              <PublicEventRow event={event} key={event.id} />
            ))}
          </div>
        </div>

        <aside className="vault-live-panel vault-live-readiness">
          <div className="vault-live-panel__header">
            <div>
              <p className="section-kicker">Readiness activity</p>
              <h2>Public readiness milestones.</h2>
            </div>
          </div>
          <div className="vault-live-readiness__cards">
            {content.readiness.slice(0, 3).map((item, index) => {
              const Icon = [PackageCheck, Landmark, ShieldCheck][index]!;
              return (
                <article key={item.asset.slug}>
                  <span>
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <strong>{item.asset.title}</strong>
                    <p>
                      {item.asset.category}
                      {item.asset.grade ? ` / ${item.asset.grade}` : ""}
                    </p>
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
          {content.recentlyReviewed.map((asset) => (
            <VaultAssetCard
              key={asset.asset.slug}
              asset={asset}
              label={asset.source === "real" ? "Recently reviewed" : "Illustrative review"}
              formatMoney={formatMoney}
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
          <div className="vault-live-published__grid">
            {content.publishedAssets.slice(0, 4).map((asset) => (
              <VaultAssetCard
                key={asset.asset.slug}
                asset={asset}
                label={asset.source === "real" ? "Published" : "Illustrative market"}
                compact
                formatMoney={formatMoney}
              />
            ))}
          </div>
        </div>

        <aside className="vault-live-panel vault-live-market-activity">
          <div className="vault-live-panel__header">
            <div>
              <p className="section-kicker">Market activity</p>
              <h2>Public market signals.</h2>
            </div>
          </div>
          <div className="vault-live-market-activity__rows">
            {content.marketActivity.map((item) => (
              <div key={item.asset.asset.slug}>
                <span>
                  <TrendingUp aria-hidden="true" />
                </span>
                <p>
                  <strong>{item.asset.asset.title}</strong>
                  <small>
                    {item.source === "real"
                      ? "Public executed share activity"
                      : "Illustrative market activity"}
                  </small>
                </p>
                <b>{item.units}</b>
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
          {assetShowcaseMedia(featuredAsset.asset.slug) ? (
            <img
              src={assetShowcaseMedia(featuredAsset.asset.slug)!.src}
              alt={assetShowcaseMedia(featuredAsset.asset.slug)!.alt}
            />
          ) : (
            <Vault aria-hidden="true" />
          )}
        </div>
        <div className="vault-live-featured__copy">
          <p className="section-kicker">Featured Vault asset</p>
          <span className="vault-live-status">
            <CircleDot aria-hidden="true" />{" "}
            {featuredAsset.source === "real" ? "Market live" : "Illustrative example"}
          </span>
          <h2>{featuredAsset.asset.title}</h2>
          <p>
            {featuredAsset.asset.grade ?? "Publicly listed"} ·{" "}
            {featuredAsset.asset.setName ?? featuredAsset.asset.category}
          </p>
          <div className="vault-live-featured__numbers">
            <div>
              <small>
                {featuredAsset.source === "real" ? "Public valuation" : "Illustrative asset value"}
              </small>
              <strong>
                {featuredAsset.asset.estimatedMarketValueMinor
                  ? formatMoney(featuredAsset.asset.estimatedMarketValueMinor)
                  : "Unavailable"}
              </strong>
            </div>
            <div>
              <small>
                {featuredAsset.source === "real"
                  ? "Ownership available"
                  : "Illustrative share price"}
              </small>
              <strong>
                {featuredAsset.source === "showcase"
                  ? "£10.00"
                  : featuredAsset.asset.availabilityBps
                    ? `${featuredAsset.asset.availabilityBps / 100}% available`
                    : "Unavailable"}
              </strong>
            </div>
            <div>
              <small>Ownership available</small>
              <strong>
                {featuredAsset.asset.availabilityBps
                  ? `${featuredAsset.asset.availabilityBps / 100}% available`
                  : "Unavailable"}
              </strong>
            </div>
          </div>
          <AssetRoute
            asset={featuredAsset}
            className="vault-live-button vault-live-button--primary"
          >
            {featuredAsset.source === "real" ? "View asset" : "Explore markets"}{" "}
            <ArrowRight aria-hidden="true" />
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
          {content.categories.map((category) => (
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

function PublicEventRow({ event }: { event: VaultLivePresentedEvent }) {
  const Icon = eventIcon(event.publicLabel);
  return (
    <article className="vault-live-event">
      <span className="vault-live-event__icon">
        <Icon aria-hidden="true" />
      </span>
      <div className="vault-live-event__copy">
        <p>{event.publicLabel}</p>
        <strong>{event.asset.asset.title}</strong>
        <span>{event.publicSummary}</span>
      </div>
      {event.occurredAt ? (
        <time dateTime={event.occurredAt}>{formatDate(event.occurredAt)}</time>
      ) : (
        <span className="vault-live-event__illustrative">Example</span>
      )}
      <AssetRoute asset={event.asset} className="text-link">
        {event.source === "real" ? "View asset" : "Explore markets"}{" "}
        <ArrowRight aria-hidden="true" />
      </AssetRoute>
    </article>
  );
}

function VaultAssetCard({
  asset,
  label,
  compact = false,
  formatMoney,
}: {
  asset: VaultLivePresentedAsset;
  label: string;
  compact?: boolean;
  formatMoney: (value: number | string | bigint) => string;
}) {
  const media = assetShowcaseMedia(asset.asset.slug);
  return (
    <article className={`vault-live-asset-card${compact ? " vault-live-asset-card--compact" : ""}`}>
      <div className="vault-live-asset-card__media">
        {media ? <img src={media.src} alt={media.alt} /> : <Box aria-hidden="true" />}
        <span>{label}</span>
      </div>
      <div className="vault-live-asset-card__copy">
        <strong>{asset.asset.title}</strong>
        <p>
          {asset.asset.grade ?? "Public catalogue"} · {asset.asset.category ?? "Collectible"}
        </p>
        {asset.asset.estimatedMarketValueMinor ? (
          <b>{formatMoney(asset.asset.estimatedMarketValueMinor)}</b>
        ) : (
          <small>Explore public listing</small>
        )}
        <AssetRoute asset={asset} className="text-link">
          {asset.source === "real" ? "View asset" : "Explore markets"}{" "}
          <ArrowRight aria-hidden="true" />
        </AssetRoute>
      </div>
    </article>
  );
}
