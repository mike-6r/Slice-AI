import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Bookmark,
  Boxes,
  ChartNoAxesCombined,
  CircleDollarSign,
  Sparkles,
  TrendingUp,
  UsersRound,
  Vault,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { useSession } from "@/auth/use-session";
import { FeaturedMarketHero } from "@/components/home/FeaturedMarketHero";
import {
  HOMEPAGE_ALLOCATION,
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_MARKET_METRICS,
  HOMEPAGE_MARKET_MOVERS,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
  HOMEPAGE_PORTFOLIO_EXAMPLE,
  HOMEPAGE_TRENDING_ASSETS,
  showcaseDestination,
  type HomepageShowcaseAsset,
} from "@/data/homepage-showcase";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Slice - Fractional collectible ownership" },
      {
        name: "description",
        content:
          "Discover authenticated collectibles and explore illustrative fractional ownership examples.",
      },
    ],
  }),
  component: HomePage,
});

const metricIcons = [CircleDollarSign, ChartNoAxesCombined, Boxes, BadgeCheck, UsersRound] as const;

const howSliceWorks = [
  {
    number: "01",
    icon: <Sparkles />,
    title: "Discover",
    detail: "Browse authenticated collectible assets available through Slice.",
    to: "/marketplace" as const,
  },
  {
    number: "02",
    icon: <CircleDollarSign />,
    title: "Buy shares",
    detail: "Choose the number of shares you want without buying the entire collectible.",
    to: "/marketplace" as const,
  },
  {
    number: "03",
    icon: <ChartNoAxesCombined />,
    title: "Track",
    detail: "Track your shares, percentage ownership, cost basis and portfolio activity.",
    to: "/portfolio" as const,
  },
  {
    number: "04",
    icon: <TrendingUp />,
    title: "Trade",
    detail: "Buy or sell supported share positions through the marketplace.",
    to: "/marketplace" as const,
  },
] as const;

function HomePage() {
  const { isAuthenticated } = useSession();

  return (
    <div className="approved-home">
      <section className="page-shell approved-home__hero" aria-labelledby="home-heading">
        <div className="approved-home__copy">
          <p className="page-kicker">Slice - The collectible investment platform</p>
          <h1 id="home-heading">
            <span>Invest.</span>
            <span>Collect.</span>
            <span>Grow.</span>
          </h1>
          <p className="approved-home__lead">
            Own shares in authenticated collectible cards without buying the entire asset. Build a
            portfolio, track your percentage ownership and participate in the Slice marketplace.
          </p>
          <div className="approved-home__actions">
            <Link to="/marketplace" className="primary-action approved-home__primary-cta">
              Explore Markets <ArrowRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={isAuthenticated} className="approved-home__secondary-cta">
              List an Asset
            </ListAssetLink>
          </div>
          <div className="approved-home__community" aria-label="Slice product principle">
            <div className="approved-home__avatars" aria-hidden="true">
              {["SL", "IC", "E"].map((initials) => (
                <span key={initials}>{initials}</span>
              ))}
            </div>
            <div>
              <strong>Own shares, not the whole card</strong>
              <small>Start from a single share and build your position over time.</small>
            </div>
          </div>
          <HeroOwnershipLine />
        </div>

        <div className="approved-home__featured-stack">
          <FeaturedMarketHero />
          <TradingEducation compact />
        </div>
      </section>

      <OwnershipWorks />

      <section
        className="page-shell approved-home__metrics"
        aria-label="Illustrative product example"
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
            </article>
          );
        })}
      </section>

      <section className="page-shell approved-home__section" aria-labelledby="trending-heading">
        <SectionHeading
          eyebrow="Illustrative market examples"
          title="Trending opportunities."
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
                  <div>
                    <small>Asset value</small>
                    <b>{asset.displayPrice}</b>
                  </div>
                  <span className={`is-${asset.movementTone}`}>{asset.displayMovement}</span>
                </div>
                <div className="approved-home__availability">
                  <span>
                    <i style={{ width: asset.displayAvailability }} />
                  </span>
                  <small>
                    {asset.displaySharePrice} · {asset.displayAvailability} available
                  </small>
                </div>
              </div>
            </ShowcaseAssetLink>
          ))}
        </div>
      </section>

      <section
        className="page-shell approved-home__intelligence"
        aria-label="Slice market examples"
      >
        <MarketMovers />

        <article className="approved-home__panel approved-home__portfolio-preview">
          <header>
            <div>
              <h2>Portfolio preview</h2>
              <p>Illustrative ownership example</p>
            </div>
            <PortfolioLink authenticated={isAuthenticated}>View portfolio</PortfolioLink>
          </header>
          <div className="approved-home__portfolio-value">
            <strong>{"\u00a3"}8,942.18</strong>
            <span>
              Example <small>portfolio</small>
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
            {HOMEPAGE_PORTFOLIO_EXAMPLE.map((holding) => (
              <div key={holding.label}>
                <dt>{holding.label}</dt>
                <dd>
                  {holding.shares} · {holding.ownership}
                </dd>
              </div>
            ))}
          </dl>
        </article>

        <article className="approved-home__panel approved-home__allocation">
          <header>
            <div>
              <h2>Asset allocation</h2>
              <p>Sample portfolio allocation by value</p>
            </div>
          </header>
          <div className="approved-home__allocation-body">
            <div className="approved-home__donut" aria-hidden="true">
              <span>
                <strong>{"\u00a3"}8.9K</strong>
                <small>Sample value</small>
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

      <HowSliceWorks />

      <section className="page-shell approved-home__section" aria-labelledby="what-slice-heading">
        <SectionHeading
          eyebrow="Built for collectible ownership"
          title="What you can do with Slice."
          headingId="what-slice-heading"
        />
        <div className="approved-home__features approved-home__features--four">
          <FeatureCard
            icon={<Boxes />}
            title="Fractional ownership"
            detail="Buy shares in high-value collectible assets instead of purchasing the entire card."
            to="/marketplace"
          />
          <FeatureCard
            icon={<TrendingUp />}
            title="Marketplace"
            detail="Discover collectible share opportunities and manage supported buy or sell orders."
            to="/marketplace"
          />
          <FeatureCard
            icon={<ChartNoAxesCombined />}
            title="Portfolio"
            detail="Track shares, percentage ownership, cost basis and activity in one place."
            to="/portfolio"
          />
          <FeatureCard
            icon={<UsersRound />}
            title="Collector network"
            detail="Discover collectors and view public collectible catalogues across the platform."
            to="/collectors"
          />
        </div>
      </section>

      <section className="page-shell approved-home__physical" aria-labelledby="physical-heading">
        <div className="approved-home__physical-copy">
          <p className="page-kicker">The collectible is real</p>
          <h2 id="physical-heading">Own part of a physical collectible.</h2>
          <p>
            Slice divides eligible authenticated collectibles into ownership shares. Track your
            shares, ownership percentage, cost basis and market position in your portfolio.
          </p>
        </div>
        <div
          className="approved-home__comparison"
          aria-label="Illustrative full card and fractional ownership comparison"
        >
          <div>
            <span>Whole collectible reference</span>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.referenceValue}</strong>
            <small>{HOMEPAGE_FEATURED_ASSET.title}</small>
          </div>
          <ArrowRight aria-hidden="true" />
          <div className="is-slice">
            <span>Own shares</span>
            <strong>
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleShares} ·{" "}
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestment}
            </strong>
            <small>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleOwnership} ownership · illustrative</small>
          </div>
        </div>
      </section>

      <section className="page-shell approved-home__final-cta">
        <div>
          <p className="page-kicker">Own the cards you believe in</p>
          <h2>
            You do not need to buy
            <br />
            <span>the entire collectible.</span>
          </h2>
          <p>Buy shares, build your portfolio and follow the market through Slice.</p>
        </div>
        <div className="approved-home__actions">
          <Link to="/marketplace" className="primary-action approved-home__primary-cta">
            Explore Markets <ArrowRight aria-hidden="true" />
          </Link>
          <Link
            to={isAuthenticated ? "/portfolio" : "/signup"}
            className="approved-home__secondary-cta"
          >
            {isAuthenticated ? "View portfolio" : "Create Account"}
          </Link>
        </div>
      </section>
    </div>
  );
}

function HeroOwnershipLine() {
  const items = [
    ["Whole collectible reference", HOMEPAGE_OWNERSHIP_EXAMPLE.referenceValue],
    ["Share price", HOMEPAGE_OWNERSHIP_EXAMPLE.sharePrice],
    [
      "Example purchase",
      `${HOMEPAGE_OWNERSHIP_EXAMPLE.exampleShares} / ${HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestment}`,
    ],
    ["Ownership", HOMEPAGE_OWNERSHIP_EXAMPLE.exampleOwnership],
  ] as const;

  return (
    <div className="approved-home__ownership-line" aria-label="Illustrative ownership example">
      <p>Example ownership</p>
      <dl>
        {items.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function LegacyOwnershipWorks() {
  return (
    <section className="page-shell approved-home__ownership" aria-labelledby="ownership-heading">
      <SectionHeading
        eyebrow="Illustrative ownership example"
        title="How ownership works."
        headingId="ownership-heading"
      />
      <div className="approved-home__ownership-card">
        <div className="approved-home__ownership-stage">
          <span className="approved-home__ownership-icon">
            <Vault aria-hidden="true" />
          </span>
          <div>
            <small>Whole collectible</small>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.collectibleValue}</strong>
            <p>1999 Charizard</p>
          </div>
        </div>
        <div className="approved-home__ownership-divider" aria-hidden="true">
          <span>
            <ArrowRight />
          </span>
          <small>
            Divided into {HOMEPAGE_OWNERSHIP_EXAMPLE.totalShares} at{" "}
            {HOMEPAGE_OWNERSHIP_EXAMPLE.sharePrice} each
          </small>
        </div>
        <div className="approved-home__ownership-stage is-slice">
          <span className="approved-home__ownership-icon">
            <BadgeCheck aria-hidden="true" />
          </span>
          <div>
            <small>Your ownership</small>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleOwnership}</strong>
            <p>
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleShares} ·{" "}
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestment} example purchase
            </p>
          </div>
        </div>
        <dl className="approved-home__ownership-facts">
          <div>
            <dt>Total shares</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.totalShares}</dd>
          </div>
          <div>
            <dt>Share price</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.sharePrice}</dd>
          </div>
          <div>
            <dt>Example purchase</dt>
            <dd>
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleShares} ·{" "}
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestment}
            </dd>
          </div>
          <div>
            <dt>Ownership</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleOwnership}</dd>
          </div>
        </dl>
      </div>
      <aside className="approved-home__ownership-explainer">
        <strong>What am I actually buying?</strong>
        <p>
          You’re purchasing shares that represent a percentage interest in the collectible listed on
          Slice. Your position, cost basis and ownership percentage are tracked in your portfolio.
        </p>
      </aside>
    </section>
  );
}

function OwnershipWorks() {
  const featured = HOMEPAGE_FEATURED_ASSET;

  return (
    <section className="page-shell approved-home__ownership" aria-labelledby="ownership-heading">
      <SectionHeading
        eyebrow="The collectible is real"
        title="Own part of a physical collectible."
        headingId="ownership-heading"
      />
      <p className="approved-home__ownership-lead">
        Slice divides eligible authenticated collectibles into ownership shares. Buy shares instead
        of the entire card, track your position in your portfolio, and trade supported shares
        through the Slice marketplace.
      </p>
      <div className="approved-home__ownership-flow" aria-label="How Slice ownership works">
        <article className="approved-home__ownership-node approved-home__ownership-node--collectible">
          <div className="approved-home__ownership-image">
            <img src={featured.image} alt={featured.title} loading="lazy" />
          </div>
          <div>
            <small>Physical collectible</small>
            <strong>{featured.title}</strong>
            <p>{featured.grade}</p>
          </div>
        </article>
        <OwnershipFlowArrow label="Whole-card reference" />
        <article className="approved-home__ownership-node">
          <span className="approved-home__ownership-icon">
            <Vault aria-hidden="true" />
          </span>
          <div>
            <small>External / whole collectible reference</small>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.referenceValue}</strong>
            <p>Recent reference for this collectible</p>
          </div>
        </article>
        <OwnershipFlowArrow label="Slice ownership" />
        <article className="approved-home__ownership-node is-slice">
          <span className="approved-home__ownership-icon">
            <BadgeCheck aria-hidden="true" />
          </span>
          <div>
            <small>Illustrative Slice share price</small>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.sharePrice}</strong>
            <p>{HOMEPAGE_OWNERSHIP_EXAMPLE.totalShares} in this educational example</p>
          </div>
        </article>
        <OwnershipFlowArrow label="Your portfolio" />
        <article className="approved-home__ownership-node approved-home__ownership-node--portfolio">
          <span className="approved-home__ownership-icon">
            <ChartNoAxesCombined aria-hidden="true" />
          </span>
          <div>
            <small>Investor position</small>
            <strong>
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleShares} ·{" "}
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestment}
            </strong>
            <p>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleOwnership} ownership · illustrative</p>
          </div>
        </article>
      </div>
      <aside className="approved-home__ownership-explainer">
        <strong>What appears in your portfolio?</strong>
        <p>
          Shares owned, ownership percentage, cost basis and current market position. The whole-card
          reference and illustrative Slice share price are always shown separately.
        </p>
      </aside>
    </section>
  );
}

function OwnershipFlowArrow({ label }: { label: string }) {
  return (
    <div className="approved-home__ownership-arrow" aria-hidden="true">
      <ArrowRight />
      <span>{label}</span>
    </div>
  );
}

function TradingEducation({ compact = false }: { compact?: boolean }) {
  const [buyShares, setBuyShares] = useState(25);
  const [buyReviewed, setBuyReviewed] = useState(false);
  const [sellReviewed, setSellReviewed] = useState(false);
  const ownership = ((buyShares / HOMEPAGE_OWNERSHIP_EXAMPLE.totalSharesCount) * 100).toFixed(2);
  const investment = `£${(buyShares * 10).toFixed(2)}`;

  return (
    <section
      className={`approved-home__trading-demo${compact ? " approved-home__trading-demo--compact" : ""}`}
      aria-labelledby="trading-demo-heading"
    >
      <header>
        <div>
          <p className="page-kicker">How trading works</p>
          <h3 id="trading-demo-heading">Buy and sell ownership shares.</h3>
          <p>Educational examples only — these controls never place an order.</p>
        </div>
        <div className="approved-home__trading-asset">
          <img src={HOMEPAGE_FEATURED_ASSET.image} alt="" />
          <span>
            <strong>{HOMEPAGE_FEATURED_ASSET.title}</strong>
            <small>{HOMEPAGE_FEATURED_ASSET.grade}</small>
          </span>
        </div>
      </header>
      <div className="approved-home__trading-demo-grid">
        <article className="approved-home__trade-example">
          <div className="approved-home__trade-example-heading">
            <span>Buy shares</span>
            <small>Demo only</small>
          </div>
          <dl className="approved-home__trade-price">
            <div>
              <dt>Illustrative Slice share price</dt>
              <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.sharePrice}</dd>
            </div>
            <div>
              <dt>Select shares</dt>
              <dd>{buyShares}</dd>
            </div>
          </dl>
          <div className="approved-home__share-options" aria-label="Select example shares">
            {[1, 5, 10, 25].map((shares) => (
              <button
                key={shares}
                type="button"
                aria-pressed={buyShares === shares}
                className={buyShares === shares ? "is-selected" : undefined}
                onClick={() => {
                  setBuyShares(shares);
                  setBuyReviewed(false);
                }}
              >
                {shares}
              </button>
            ))}
          </div>
          <div className="approved-home__trade-result">
            <strong>
              {buyShares} shares · {investment}
            </strong>
            <span>Ownership after purchase: {ownership}%</span>
          </div>
          <ol className="approved-home__trade-flow">
            <li className="is-current">Choose shares</li>
            <li className={buyReviewed ? "is-current" : undefined}>Review</li>
            <li>Own shares</li>
          </ol>
          <button
            type="button"
            className="approved-home__demo-action"
            onClick={() => setBuyReviewed(true)}
          >
            {buyReviewed ? "Demo order reviewed" : "Buy shares — demo only"}
            <ArrowRight aria-hidden="true" />
          </button>
        </article>
        <article className="approved-home__trade-example approved-home__trade-example--sell">
          <div className="approved-home__trade-example-heading">
            <span>Sell shares</span>
            <small>Demo only</small>
          </div>
          <dl className="approved-home__trade-price">
            <div>
              <dt>Example current position</dt>
              <dd>25 shares</dd>
            </div>
            <div>
              <dt>Sell</dt>
              <dd>5 shares</dd>
            </div>
          </dl>
          <div className="approved-home__trade-result">
            <strong>Estimated proceeds: £50</strong>
            <span>Remaining position: 20 shares</span>
          </div>
          <ol className="approved-home__trade-flow">
            <li className="is-current">Choose shares</li>
            <li className={sellReviewed ? "is-current" : undefined}>Review</li>
            <li>Sell on marketplace</li>
          </ol>
          <button
            type="button"
            className="approved-home__demo-action approved-home__demo-action--secondary"
            onClick={() => setSellReviewed(true)}
          >
            {sellReviewed ? "Demo sale reviewed" : "Sell shares — demo only"}
            <ArrowRight aria-hidden="true" />
          </button>
        </article>
      </div>
      <p className="approved-home__trading-demo-note">
        Real authenticated Buy and Sell pages remain the authority: select a collectible, choose
        shares, review an order, and see matched trades update Portfolio and Orders.
      </p>
    </section>
  );
}

function HowSliceWorks() {
  return (
    <section
      className="page-shell approved-home__section approved-home__how"
      aria-labelledby="how-slice-heading"
    >
      <SectionHeading
        eyebrow="How Slice works"
        title="Own collectibles differently."
        headingId="how-slice-heading"
      />
      <ol className="approved-home__how-grid">
        {howSliceWorks.map((step) => (
          <li key={step.number}>
            <span className="approved-home__how-number">{step.number}</span>
            <span className="approved-home__how-icon">{step.icon}</span>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
            <Link to={step.to} className="approved-home__text-link">
              Explore <ArrowRight aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function MarketMovers() {
  type MoverTab = keyof typeof HOMEPAGE_MARKET_MOVERS;
  const [tab, setTab] = useState<MoverTab>("Modern Chase");
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
              <small>Asset value {asset.displayPrice}</small>
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
  to: "/marketplace" | "/vault-live" | "/collectors" | "/portfolio";
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
