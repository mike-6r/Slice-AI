import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Box,
  CheckCircle2,
  Landmark,
  ShieldCheck,
  Sparkles,
  Vault,
} from "lucide-react";

import { useSession } from "@/auth/use-session";
import { editorial } from "@/config/editorial";
import type { Asset } from "@/domain";
import { formatCurrency } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
import { FeaturedMarketHero } from "@/components/home/FeaturedMarketHero";
import { selectFeaturedAsset } from "@/components/home/featured-asset-selection";
import { useFeaturedAssets, useTrendingAssets } from "@/queries/hooks";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Slice — Collectible ownership, backed by real records" },
      {
        name: "description",
        content:
          "Explore published collectible assets, public collector profiles and vault activity.",
      },
    ],
  }),
  component: HomePage,
});

export function HomePage() {
  const services = useAppServices();
  const { isAuthenticated } = useSession();
  const assets = useTrendingAssets();
  const featuredAssets = useFeaturedAssets();
  const collectors = useQuery({
    queryKey: ["home", "collectors"],
    queryFn: () => services.repositories.collectors.listPublicCollectors({ limit: 3 }),
    staleTime: 30_000,
  });
  const vault = useQuery({
    queryKey: ["home", "vault-events"],
    queryFn: () => services.repositories.vault.getPublicEvents({ limit: 3 }),
    staleTime: 30_000,
  });
  const featuredAsset = useQuery({
    queryKey: ["home", "editorial-featured-asset", editorial.featuredAssetId],
    queryFn: () => services.repositories.assets.getAssetById(editorial.featuredAssetId as never),
    enabled: Boolean(editorial.featuredAssetId),
    staleTime: 30_000,
  });
  const featured = selectFeaturedAsset(featuredAsset.data, featuredAssets.data);
  const featuredLoading =
    (Boolean(editorial.featuredAssetId) && featuredAsset.isLoading) || featuredAssets.isLoading;

  return (
    <main className="home-hero">
      <section className="page-shell home-hero__inner py-10 sm:py-14">
        <div className="hero-copy">
          <p className="page-kicker">Collect with confidence</p>
          <h1 className="hero-copy__headline max-w-xl font-display text-5xl font-bold tracking-[-0.065em] text-foreground sm:text-6xl xl:text-7xl">
            <span>Invest.</span> <span>Collect.</span> <span className="text-accent">Grow.</span>
          </h1>
          <p className="mt-6 max-w-lg text-base leading-7 text-subtle sm:text-lg">
            Discover authenticated collectibles, public market context and custody records built for
            serious collectors.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              to="/marketplace"
              className="primary-action rounded-lg px-5 py-3 text-sm font-semibold text-background"
            >
              Explore markets <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
            <Link
              to={isAuthenticated ? "/dashboard" : "/signup"}
              className="rounded-lg border border-border-strong px-5 py-3 text-sm font-semibold text-foreground transition hover:border-accent/60"
            >
              {isAuthenticated ? "View your dashboard" : "Create an account"}
            </Link>
          </div>
          <div className="mt-9 flex flex-wrap gap-x-5 gap-y-2 text-sm text-subtle">
            <span className="inline-flex items-center gap-2">
              <ShieldCheck className="size-4 text-accent" /> Public records
            </span>
            <span className="inline-flex items-center gap-2">
              <Vault className="size-4 text-accent" /> Vault-aware assets
            </span>
          </div>
        </div>

        <FeaturedMarketHero asset={featured} loading={featuredLoading} />
      </section>

      <section
        className="market-overview-section page-shell pb-4"
        aria-label="Public market overview"
      >
        <div className="market-strip grid overflow-hidden rounded-xl border border-border sm:grid-cols-2 xl:grid-cols-4">
          <MarketMetric
            label="Published assets"
            value={assets.isLoading ? "…" : String(assets.data?.length ?? 0)}
          />
          <MarketMetric
            label="Public collectors"
            value={collectors.isLoading ? "…" : String(collectors.data?.items.length ?? 0)}
          />
          <MarketMetric
            label="Vault activity"
            value={vault.isLoading ? "…" : String(vault.data?.items.length ?? 0)}
          />
          <MarketMetric
            label="Market performance"
            value="Unavailable"
            detail="Historical public metric not projected"
          />
        </div>
      </section>

      <section className="trending-section page-shell py-12" aria-labelledby="home-market-heading">
        <SectionHeading
          eyebrow="Explore the marketplace"
          title="Trending opportunities"
          action="Browse all assets"
          to="/marketplace"
        />
        {assets.isLoading ? (
          <div
            className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            aria-label="Loading published assets"
          >
            {[0, 1, 2].map((item) => (
              <div key={item} className="customer-skeleton h-64" />
            ))}
          </div>
        ) : assets.data?.length ? (
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {assets.data.slice(0, 6).map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </ul>
        ) : (
          <EmptyMarketPanel
            title="No trending assets available"
            detail="Published opportunities will appear here when the public catalogue is ready."
          />
        )}
      </section>

      <section className="page-shell home-intelligence-grid grid gap-5 pb-12 xl:grid-cols-3">
        <PublicListPanel
          title="Public collectors"
          action="Discover collectors"
          to="/collectors"
          icon={<Landmark />}
        >
          {collectors.data?.items.length ? (
            collectors.data.items.map((collector) => (
              <Link
                key={collector.userId}
                to="/collector/$id"
                params={{ id: collector.handle }}
                className="mover-row block rounded-lg border border-border p-3 transition hover:border-accent/50"
              >
                <strong>{collector.displayName}</strong>
                <span className="mt-1 block text-sm text-subtle">{collector.focus}</span>
              </Link>
            ))
          ) : (
            <CompactEmpty label="No public collector profiles are available." />
          )}
        </PublicListPanel>
        <PublicListPanel
          title="Vault live"
          action="See public events"
          to="/vault-live"
          icon={<Vault />}
        >
          {vault.data?.items.length ? (
            vault.data.items.map((event) => (
              <div key={event.id} className="mover-row rounded-lg border border-border p-3">
                <span className="text-xs font-semibold uppercase tracking-[0.12em] text-accent">
                  {event.type}
                </span>
                <p className="mt-1 text-sm text-subtle">{event.publicSummary}</p>
              </div>
            ))
          ) : (
            <CompactEmpty label="No public vault activity is available." />
          )}
        </PublicListPanel>
        <section className="home-cta relative overflow-hidden rounded-2xl border border-border p-6">
          <Sparkles className="size-7 text-accent" aria-hidden="true" />
          <h2 className="mt-5 text-xl font-semibold">Start building your collection.</h2>
          <p className="mt-3 max-w-sm text-sm leading-6 text-subtle">
            Create an account to access your private portfolio, wallet and order tools.
          </p>
          <Link
            to={isAuthenticated ? "/dashboard" : "/signup"}
            className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
          >
            {isAuthenticated ? "Open dashboard" : "Get started"}{" "}
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </section>
    </main>
  );
}

function FeaturedAsset({ asset, loading }: { asset?: Asset; loading: boolean }) {
  return (
    <article className="showcase" aria-label="Featured collectible preview">
      <div className="showcase__surface">
        {loading ? (
          <div className="customer-skeleton h-52 w-36" />
        ) : asset?.media[0]?.url ? (
          <img className="showcase__slab" src={asset.media[0].url} alt={asset.media[0].alt} />
        ) : (
          <div className="showcase__placeholder">
            <Box className="size-9 text-muted" aria-hidden="true" />
          </div>
        )}
        <div className="showcase__pedestal" aria-hidden="true" />
        <div className="showcase__badge" aria-hidden="true">
          <span className="showcase__badge-service">
            <span className="showcase__badge-label">SLICE</span>
            <span className="showcase__badge-certification">public</span>
          </span>
          <span className="showcase__badge-result">
            <span className="showcase__badge-grade">{asset?.grade?.label ?? "—"}</span>
            <span className="showcase__badge-description">status</span>
          </span>
        </div>
      </div>
    </article>
  );
}

function AssetCard({ asset }: { asset: Asset }) {
  const media = asset.media.find((item) => item.kind === "image");
  return (
    <li>
      <Link
        to="/asset/$id"
        params={{ id: asset.slug ?? asset.id }}
        className="asset-card asset-card--compact flex h-full flex-col"
      >
        <div className="asset-card__image aspect-[1.45/1]">
          {media ? (
            <img className="h-full w-full object-cover" src={media.url} alt={media.alt} />
          ) : (
            <div className="grid h-full place-items-center">
              <Box className="size-8 text-muted" aria-hidden="true" />
            </div>
          )}
        </div>
        <div className="p-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.13em] text-muted">
            {asset.symbol}
          </p>
          <h3 className="asset-card__title mt-1 text-base font-semibold">{asset.details.title}</h3>
          <div className="mt-3 flex items-center justify-between gap-3 text-sm">
            <span className="text-subtle">{humaniseCategory(asset.details.category)}</span>
            <strong>{assetValue(asset)}</strong>
          </div>
        </div>
      </Link>
    </li>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
  to,
}: {
  eyebrow: string;
  title: string;
  action: string;
  to: "/marketplace" | "/collectors" | "/vault-live";
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="page-kicker">{eyebrow}</p>
        <h2
          id="home-market-heading"
          className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl"
        >
          {title}
        </h2>
      </div>
      <Link
        to={to}
        className="inline-flex items-center gap-2 text-sm font-semibold text-accent hover:underline"
      >
        {action}
        <ArrowRight className="size-4" aria-hidden="true" />
      </Link>
    </div>
  );
}
function PublicListPanel({
  title,
  action,
  to,
  icon,
  children,
}: {
  title: string;
  action: string;
  to: "/collectors" | "/vault-live";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="panel rounded-2xl border border-border p-5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <span className="feature-card__icon grid size-8 place-items-center rounded-lg text-accent">
            {icon}
          </span>
          {title}
        </h2>
        <Link to={to} className="text-sm font-semibold text-accent hover:underline">
          {action}
        </Link>
      </div>
      <div className="mt-5 space-y-3">{children}</div>
    </section>
  );
}
function CompactEmpty({ label }: { label: string }) {
  return (
    <p className="rounded-lg border border-dashed border-border p-4 text-sm text-subtle">{label}</p>
  );
}
function EmptyMarketPanel({ title, detail }: { title: string; detail: string }) {
  return (
    <div className="mt-6 grid min-h-64 place-items-center rounded-2xl border border-dashed border-border bg-elevated/60 p-8 text-center">
      <div>
        <Box className="mx-auto size-8 text-muted" aria-hidden="true" />
        <h3 className="mt-4 font-semibold">{title}</h3>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-subtle">{detail}</p>
      </div>
    </div>
  );
}
function MarketMetric({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <article className="market-strip__cell market-strip__cell--divided">
      <p className="text-xs font-medium text-muted">{label}</p>
      <strong className="mt-1 block text-xl">{value}</strong>
      {detail ? (
        <small className="mt-1 block text-xs text-subtle">{detail}</small>
      ) : (
        <small className="mt-1 block text-xs text-subtle">Live public projection</small>
      )}
    </article>
  );
}
function assetValue(asset: Asset) {
  return asset.market?.estimatedMarketValue
    ? formatCurrency(asset.market.estimatedMarketValue.amount)
    : "Unavailable";
}
function humaniseCategory(value: string) {
  return value.replaceAll("-", " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
