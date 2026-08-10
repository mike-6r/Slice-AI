import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  Eye,
  LockKeyhole,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UsersRound,
  Vault,
  Zap,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useSession } from "@/auth/use-session";
import { FeaturedMarketHero } from "@/components/home/FeaturedMarketHero";
import {
  HOMEPAGE_ALLOCATION,
  HOMEPAGE_MARKET_METRICS,
  HOMEPAGE_MARKET_MOVERS,
  HOMEPAGE_TRENDING_ASSETS,
  showcaseDestination,
  type HomepageShowcaseAsset,
} from "@/data/homepage-showcase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Slice — Invest in authenticated collectibles" },
      {
        name: "description",
        content:
          "Explore authenticated collectible markets and follow the assets collectors care about.",
      },
    ],
  }),
  component: HomePage,
});

const metricIcons = [CircleDollarSign, ChartNoAxesCombined, Boxes, BadgeCheck, UsersRound] as const;

function HomePage() {
  const { isAuthenticated } = useSession();

  return (
    <div className="approved-home">
      <section className="page-shell approved-home__hero" aria-labelledby="home-heading">
        <div className="approved-home__copy">
          <p className="page-kicker">Slice · The collectible investment platform</p>
          <h1 id="home-heading">
            <span>Invest.</span>
            <span>Collect.</span>
            <span>Grow.</span>
          </h1>
          <p className="approved-home__lead">
            Own a slice of authenticated collectibles. Track market context and follow the assets
            collectors care about.
          </p>
          <div className="approved-home__actions">
            <Link to="/marketplace" className="primary-action approved-home__primary-cta">
              Explore Markets <ArrowRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={isAuthenticated} className="approved-home__secondary-cta">
              List an Asset
            </ListAssetLink>
          </div>
          <div className="approved-home__community" aria-label="Slice community">
            <div className="approved-home__avatars" aria-hidden="true">
              {["SC", "MM", "AR", "JT"].map((initials) => (
                <span key={initials}>{initials}</span>
              ))}
            </div>
            <div>
              <strong>10K+ collectors investing on Slice</strong>
              <small>Across cards, culture & rare assets</small>
            </div>
          </div>
        </div>

        <FeaturedMarketHero />
      </section>

      <section
        className="page-shell approved-home__metrics"
        aria-label="Illustrative market snapshot"
      >
        {HOMEPAGE_MARKET_METRICS.map((metric, index) => {
          const Icon = metricIcons[index];
          return (
            <article key={metric.label} className="approved-home__metric">
              <div className="approved-home__metric-label">
                {Icon ? <Icon aria-hidden="true" /> : null}
                <span>{metric.label}</span>
              </div>
              <strong>{metric.value}</strong>
              <small className={`is-${metric.tone}`}>{metric.detail}</small>
              <MiniSparkline tone={metric.tone} />
            </article>
          );
        })}
      </section>

      <section className="page-shell approved-home__section" aria-labelledby="trending-heading">
        <SectionHeading
          eyebrow="Trending opportunities"
          title="The market is moving."
          action="View all markets"
          to="/marketplace"
          headingId="trending-heading"
        />
        <div className="approved-home__trending" data-testid="homepage-trending-assets">
          {HOMEPAGE_TRENDING_ASSETS.map((asset) => (
            <ShowcaseAssetLink
              key={asset.showcaseKey}
              asset={asset}
              className="approved-home__asset-card"
            >
              <div className="approved-home__asset-media">
                <img src={asset.image} alt="" loading="lazy" />
                <span className="approved-home__asset-category">{asset.category}</span>
                <span className="approved-home__asset-grade">{asset.grade.split(" · ")[0]}</span>
                <Bookmark aria-hidden="true" />
              </div>
              <div className="approved-home__asset-body">
                <strong>{asset.title}</strong>
                <small>{asset.grade}</small>
                <div className="approved-home__asset-price">
                  <b>{asset.displayPrice}</b>
                  <span className={`is-${asset.movementTone}`}>{asset.displayMovement}</span>
                </div>
                <div className="approved-home__availability">
                  <span>
                    <i style={{ width: asset.displayAvailability }} />
                  </span>
                  <small>Available {asset.displayAvailability}</small>
                </div>
              </div>
            </ShowcaseAssetLink>
          ))}
        </div>
      </section>

      <section
        className="page-shell approved-home__intelligence"
        aria-label="Slice market intelligence"
      >
        <MarketMovers />

        <article className="approved-home__panel approved-home__portfolio-preview">
          <header>
            <div>
              <h2>Portfolio preview</h2>
              <p>Illustrative account overview</p>
            </div>
            <PortfolioLink authenticated={isAuthenticated}>View portfolio</PortfolioLink>
          </header>
          <div className="approved-home__portfolio-value">
            <strong>£8,942.18</strong>
            <span>
              +4.81% <small>(24H)</small>
            </span>
          </div>
          <div className="approved-home__portfolio-chart" aria-hidden="true">
            <svg viewBox="0 0 360 112" preserveAspectRatio="none">
              <defs>
                <linearGradient id="portfolio-preview-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3a5" stopOpacity=".24" />
                  <stop offset="100%" stopColor="#22d3a5" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 99 C44 96 62 88 91 86 C122 84 138 72 167 69 C198 65 225 56 251 48 C286 37 314 31 360 20 L360 112 L0 112 Z"
                fill="url(#portfolio-preview-fill)"
              />
              <path
                d="M0 99 C44 96 62 88 91 86 C122 84 138 72 167 69 C198 65 225 56 251 48 C286 37 314 31 360 20"
                fill="none"
                stroke="#22d3a5"
                strokeWidth="2"
              />
            </svg>
          </div>
          <dl className="approved-home__portfolio-facts">
            <div>
              <dt>Collectibles</dt>
              <dd>14 assets</dd>
            </div>
            <div>
              <dt>Cash available</dt>
              <dd>£1,245.32</dd>
            </div>
            <div>
              <dt>30D movement</dt>
              <dd className="is-positive">+£412.08</dd>
            </div>
          </dl>
        </article>

        <article className="approved-home__panel approved-home__allocation">
          <header>
            <div>
              <h2>Asset allocation</h2>
              <p>Sample portfolio distribution</p>
            </div>
          </header>
          <div className="approved-home__allocation-body">
            <div className="approved-home__donut" aria-hidden="true">
              <span>
                <strong>£8.9K</strong>
                <small>Total value</small>
              </span>
            </div>
            <ul>
              {HOMEPAGE_ALLOCATION.map((item) => (
                <li key={item.label}>
                  <i className={`is-${item.tone}`} />
                  <span>{item.label}</span>
                  <strong>{item.value}</strong>
                </li>
              ))}
            </ul>
          </div>
          <Link to="/marketplace" className="approved-home__text-link">
            Explore asset classes <ArrowRight aria-hidden="true" />
          </Link>
        </article>
      </section>

      <section className="page-shell approved-home__section" aria-labelledby="why-slice-heading">
        <SectionHeading
          eyebrow="Why Slice"
          title="Built for serious collectors."
          headingId="why-slice-heading"
        />
        <div className="approved-home__features">
          <FeatureCard
            icon={<Sparkles />}
            title="Access"
            detail="Discover collectible markets with transparent public records."
            to="/marketplace"
          />
          <FeatureCard
            icon={<Eye />}
            title="Transparency"
            detail="Follow published market, ownership and asset information."
            to="/marketplace"
          />
          <FeatureCard
            icon={<Zap />}
            title="Liquidity"
            detail="Move from discovery into the real Slice order experience."
            to="/marketplace"
          />
          <FeatureCard
            icon={<Vault />}
            title="Custody"
            detail="Explore the vault record and custody activity surface."
            to="/vault-live"
          />
          <FeatureCard
            icon={<UsersRound />}
            title="Community"
            detail="Meet collectors and follow their public specialist profiles."
            to="/collectors"
          />
        </div>
      </section>

      <section className="page-shell approved-home__final-cta">
        <div>
          <p className="page-kicker">Start your collection</p>
          <h2>
            Invest in what you love.
            <br />
            <span>Grow with confidence.</span>
          </h2>
          <p>Explore authenticated collectible markets and build your Slice account.</p>
        </div>
        <div className="approved-home__actions">
          <Link to="/marketplace" className="primary-action approved-home__primary-cta">
            Explore Markets <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            to={isAuthenticated ? "/dashboard" : "/signup"}
            className="approved-home__secondary-cta"
          >
            {isAuthenticated ? "View dashboard" : "Create your account"}
          </Link>
        </div>
      </section>
    </div>
  );
}

function MarketMovers() {
  type MoverTab = keyof typeof HOMEPAGE_MARKET_MOVERS;
  const [tab, setTab] = useState<MoverTab>("Top Gainers");
  return (
    <article className="approved-home__panel approved-home__movers">
      <header>
        <div>
          <h2>Market movers</h2>
          <p>Illustrative market snapshot</p>
        </div>
      </header>
      <div className="approved-home__mover-tabs" role="tablist" aria-label="Market mover group">
        {(Object.keys(HOMEPAGE_MARKET_MOVERS) as MoverTab[]).map((name) => (
          <button
            key={name}
            type="button"
            role="tab"
            aria-selected={tab === name}
            className={tab === name ? "is-active" : undefined}
            onClick={() => setTab(name)}
          >
            {name}
          </button>
        ))}
      </div>
      <div className="approved-home__mover-list">
        {HOMEPAGE_MARKET_MOVERS[tab].map((asset) => (
          <ShowcaseAssetLink
            key={`${tab}-${asset.showcaseKey}`}
            asset={asset}
            className="approved-home__mover-row"
          >
            <img src={asset.image} alt="" loading="lazy" />
            <span>
              <strong>{asset.title}</strong>
              <small>{asset.displayPrice}</small>
            </span>
            <b className={`is-${asset.movementTone}`}>{asset.displayMovement}</b>
          </ShowcaseAssetLink>
        ))}
      </div>
      <Link to="/marketplace" className="approved-home__text-link">
        View all movers <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}

function ShowcaseAssetLink({
  asset,
  className,
  children,
}: {
  asset: HomepageShowcaseAsset;
  className: string;
  children: ReactNode;
}) {
  const destination = showcaseDestination(asset);
  return destination.kind === "asset" ? (
    <Link to="/asset/$id" params={{ id: destination.id }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to={destination.to} className={className}>
      {children}
    </Link>
  );
}

function ListAssetLink({
  authenticated,
  className,
  children,
}: {
  authenticated: boolean;
  className: string;
  children: ReactNode;
}) {
  return authenticated ? (
    <Link to="/list" className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/login" search={{ returnTo: "/list" }} className={className}>
      {children}
    </Link>
  );
}

function PortfolioLink({
  authenticated,
  children,
}: {
  authenticated: boolean;
  children: ReactNode;
}) {
  const className = "approved-home__text-link";
  return authenticated ? (
    <Link to="/portfolio" className={className}>
      {children} <ArrowRight aria-hidden="true" />
    </Link>
  ) : (
    <Link to="/login" search={{ returnTo: "/portfolio" }} className={className}>
      {children} <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function SectionHeading({
  eyebrow,
  title,
  action,
  to,
  headingId,
}: {
  eyebrow: string;
  title: string;
  action?: string;
  to?: "/marketplace";
  headingId: string;
}) {
  return (
    <header className="approved-home__section-heading">
      <div>
        <p className="page-kicker">{eyebrow}</p>
        <h2 id={headingId}>{title}</h2>
      </div>
      {action && to ? (
        <Link to={to} className="approved-home__text-link">
          {action} <ArrowRight aria-hidden="true" />
        </Link>
      ) : null}
    </header>
  );
}

function FeatureCard({
  icon,
  title,
  detail,
  to,
}: {
  icon: ReactNode;
  title: string;
  detail: string;
  to: "/marketplace" | "/vault-live" | "/collectors";
}) {
  return (
    <Link to={to} className="approved-home__feature">
      <span>{icon}</span>
      <p className="page-kicker">{title}</p>
      <strong>{detail}</strong>
      <ArrowRight aria-hidden="true" />
    </Link>
  );
}

function MiniSparkline({ tone }: { tone: "positive" | "negative" }) {
  return (
    <svg
      className={`approved-home__metric-spark is-${tone}`}
      viewBox="0 0 72 28"
      aria-hidden="true"
    >
      <path
        d={
          tone === "positive"
            ? "M1 25 L10 22 L18 24 L27 17 L36 18 L45 11 L54 13 L62 6 L71 3"
            : "M1 5 L10 8 L18 7 L27 13 L36 11 L45 18 L54 17 L62 23 L71 25"
        }
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}
