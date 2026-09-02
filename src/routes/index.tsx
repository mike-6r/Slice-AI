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
import { useCurrency } from "@/currency/CurrencyProvider";
import { isBetaEnvironment } from "@/config/environment";
import { useTrendingAssets } from "@/queries/hooks";
import { MarketAssetCard } from "@/components/marketplace/MarketAssetCard";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import { FeaturedMarketHero } from "@/components/home/FeaturedMarketHero";
import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_FEATURED_PSA10_VALUE_MINOR_USD,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
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
          "Discover authenticated collectibles, explore clear ownership and experience a simpler way to collect.",
      },
    ],
  }),
  component: HomePage,
});

const howSliceWorks = [
  {
    number: "01",
    label: "Discover",
    icon: <Sparkles />,
    title: "Find a real collectible",
    detail:
      "Explore authenticated cards with their identity, grade, provenance and market context.",
    action: "Browse the market",
    to: "/marketplace" as const,
  },
  {
    number: "02",
    label: "Choose",
    icon: <CircleDollarSign />,
    title: "Choose an ownership position",
    detail: "Review the card, available ownership and price per unit before you commit.",
    action: "Review ownership",
    to: "/marketplace" as const,
  },
  {
    number: "03",
    label: "Track",
    icon: <ChartNoAxesCombined />,
    title: "Track your position",
    detail:
      "Your portfolio records settled ownership, cost basis, value and activity in one place.",
    action: "Open portfolio",
    to: "/portfolio" as const,
  },
  {
    number: "04",
    label: "Trade",
    icon: <TrendingUp />,
    title: "Trade when supported",
    detail:
      "When a market is active, submit a buy or sell order and review its status as it moves.",
    action: "Explore supported markets",
    to: "/marketplace" as const,
  },
] as const;

function HomePage() {
  const { isAuthenticated } = useSession();
  const { formatMoney } = useCurrency();
  const trending = useTrendingAssets();

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
            Own a Slice of authenticated collectible cards without buying the entire asset. Build a
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
              <strong>Own a Slice, not the whole card</strong>
              <small>Start with an ownership position and build it over time.</small>
            </div>
          </div>
          <aside className="approved-home__hero-guide" aria-label="Why people use Slice">
            <div className="approved-home__hero-guide-heading">
              <span className="approved-home__hero-guide-badge">Why Slice?</span>
              <strong>A clearer way to follow a valuable card.</strong>
              <p>Everything starts with the collectible, then gets easier to understand.</p>
            </div>
            <ul>
              <li>
                <BadgeCheck aria-hidden="true" />
                <span>
                  <b>Physical collectible</b>
                  <small>Published cards show their identity and grade.</small>
                </span>
              </li>
              <li>
                <Boxes aria-hidden="true" />
                <span>
                  <b>Clear ownership</b>
                  <small>Slice explains what your position represents.</small>
                </span>
              </li>
              <li>
                <ChartNoAxesCombined aria-hidden="true" />
                <span>
                  <b>One simple portfolio</b>
                  <small>Keep ownership, cost and activity together.</small>
                </span>
              </li>
            </ul>
          </aside>
        </div>

        <div className="approved-home__featured-stack">
          <FeaturedMarketHero />
          <TradingEducation compact />
        </div>
      </section>

      <OwnershipWorks />

      <HowSliceWorks />

      <section className="page-shell approved-home__section" aria-labelledby="what-slice-heading">
        <SectionHeading
          eyebrow="One clear home for your collectibles"
          title="Everything you need to follow a card."
          headingId="what-slice-heading"
        />
        <div className="approved-home__features approved-home__features--four">
          <FeatureCard
            icon={<Boxes />}
            title="Own part of a collectible"
            detail="Start with an ownership position instead of buying the entire card."
            to="/marketplace"
          />
          <FeatureCard
            icon={<TrendingUp />}
            title="Find cards and market data"
            detail="Compare published collectibles, grades and the latest available market information."
            to="/marketplace"
          />
          <FeatureCard
            icon={<ChartNoAxesCombined />}
            title="Know what you own"
            detail="See ownership, cost basis and activity in one clear portfolio."
            to="/portfolio"
          />
          <FeatureCard
            icon={<UsersRound />}
            title="Discover collectors"
            detail="Explore public collector profiles and the collectibles they have published."
            to="/collectors"
          />
        </div>
      </section>

      <section className="page-shell approved-home__section" aria-labelledby="trending-heading">
        <SectionHeading
          eyebrow={isBetaEnvironment ? "Live market pulse" : "Illustrative market examples"}
          title={isBetaEnvironment ? "What collectors are watching." : "Trending opportunities."}
          action="View all markets"
          to="/marketplace"
          headingId="trending-heading"
        />
        {isBetaEnvironment ? (
          trending.isPending ? (
            <MarketPulseState kind="loading" />
          ) : trending.isError || !trending.data?.length ? (
            <MarketPulseState kind="empty" />
          ) : (
            <LiveAssetCards assets={trending.data} />
          )
        ) : (
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
                      <small>External reference</small>
                      <b>{formatMoney(asset.displayPriceMinor, asset.displayPriceCurrency)}</b>
                    </div>
                    <span className="is-neutral">Reference example</span>
                  </div>
                  <div className="approved-home__illustrative-terms">
                    <span>Slice economics</span>
                    <small>
                      {formatMoney(asset.displaySlicePriceMinor, "GBP")} · illustrative terms
                    </small>
                  </div>
                </div>
              </ShowcaseAssetLink>
            ))}
          </div>
        )}
      </section>

      <section className="page-shell approved-home__final-cta">
        <div>
          <p className="page-kicker">Own the cards you believe in</p>
          <h2>
            You do not need to buy
            <br />
            <span>the entire collectible.</span>
          </h2>
          <p>Own a Slice, build your portfolio and follow the market through Slice.</p>
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

function MarketPulseState({ kind }: { kind: "loading" | "empty" }) {
  return (
    <div className="approved-home__market-empty" role={kind === "empty" ? "status" : undefined}>
      <span className="approved-home__market-empty-icon">
        {kind === "loading" ? (
          <ChartNoAxesCombined aria-hidden="true" />
        ) : (
          <Sparkles aria-hidden="true" />
        )}
      </span>
      <div>
        <h3>{kind === "loading" ? "Checking the live catalogue…" : "No live market data yet"}</h3>
        <p>
          {kind === "loading"
            ? "We’re checking the latest published collectibles and market observations."
            : "Published assets will appear here as soon as a collectible completes Slice review and market-readiness. Check the marketplace for the latest catalogue status."}
        </p>
        {kind === "empty" ? (
          <Link to="/marketplace" className="approved-home__text-link">
            Browse the marketplace <ArrowRight aria-hidden="true" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function LiveAssetCards({ assets }: { assets: import("@/domain").Asset[] }) {
  return (
    <div className="approved-home__trending" data-testid="homepage-trending-assets">
      {assets.map((asset) => (
        <MarketAssetCard key={asset.id} asset={toMarketplaceAsset(asset)} compact />
      ))}
    </div>
  );
}

function LegacyOwnershipWorks() {
  const { formatMoney } = useCurrency();
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
            <strong>
              {formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.illustrativeValuationMinor, "GBP")}
            </strong>
            <p>1999 Charizard</p>
          </div>
        </div>
        <div className="approved-home__ownership-divider" aria-hidden="true">
          <span>
            <ArrowRight />
          </span>
          <small>
            Divided into {HOMEPAGE_OWNERSHIP_EXAMPLE.totalSlices} at{" "}
            {formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP")} each
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
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSlices} ·{" "}
              {formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestmentMinor, "GBP")} example
              purchase
            </p>
          </div>
        </div>
        <dl className="approved-home__ownership-facts">
          <div>
            <dt>Total Slices</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.totalSlices}</dd>
          </div>
          <div>
            <dt>Price per Slice</dt>
            <dd>{formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP")}</dd>
          </div>
          <div>
            <dt>Example purchase</dt>
            <dd>
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSlices} ·{" "}
              {formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestmentMinor, "GBP")}
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
          You’re purchasing Slices that represent a percentage interest in the collectible listed on
          Slice. Your position, cost basis and ownership percentage are tracked in your portfolio.
        </p>
      </aside>
    </section>
  );
}

function OwnershipWorks() {
  const { formatMoney, formatSourceMoney } = useCurrency();
  if (isBetaEnvironment) {
    const featuredImage = HOMEPAGE_FEATURED_ASSET.image;
    const featuredTitle = HOMEPAGE_FEATURED_ASSET.title;
    return (
      <section className="page-shell approved-home__ownership" aria-labelledby="ownership-heading">
        <SectionHeading
          eyebrow="Start here"
          title="From a real card to your portfolio."
          headingId="ownership-heading"
        />
        <p className="approved-home__ownership-lead">
          There are three simple ideas: the card is real, Slice defines the ownership structure, and
          your portfolio records your position after a real order settles.
        </p>
        <div className="approved-home__ownership-guide" aria-hidden="true">
          <span>
            <b>01</b> Physical collectible
          </span>
          <span>
            <b>02</b> Slice ownership structure
          </span>
          <span>
            <b>03</b> Your portfolio
          </span>
        </div>
        <div className="approved-home__ownership-flow" aria-label="How Slice ownership works">
          <article className="approved-home__ownership-node approved-home__ownership-node--collectible">
            <div className="approved-home__ownership-image">
              <img src={featuredImage} alt={featuredTitle} />
            </div>
            <div>
              <small>Step 1 · Physical collectible</small>
              <strong>{featuredTitle}</strong>
              <p>A real collectible sits at the centre of the Slice experience.</p>
            </div>
          </article>
          <OwnershipFlowArrow label="Card → terms" />
          <article className="approved-home__ownership-node approved-home__ownership-node--structure is-slice">
            <span className="approved-home__ownership-icon">
              <Boxes aria-hidden="true" />
            </span>
            <div>
              <small>Step 2 · Slice creates terms</small>
              <strong>Ownership structure</strong>
              <p>
                Slice sets the units and pricing shown to investors. This is separate from the
                external card market.
              </p>
            </div>
          </article>
          <OwnershipFlowArrow label="Terms → portfolio" />
          <article className="approved-home__ownership-node approved-home__ownership-node--portfolio">
            <span className="approved-home__ownership-icon">
              <ChartNoAxesCombined aria-hidden="true" />
            </span>
            <div>
              <small>Step 3 · Your account</small>
              <strong>Your portfolio position</strong>
              <p>After an order settles, your ownership, cost basis and activity appear here.</p>
            </div>
          </article>
        </div>
        <aside className="approved-home__ownership-plain">
          <strong>In plain English</strong>
          <p>
            You are not buying a picture or a promise of a return. You are choosing an ownership
            position in a real collectible, then Slice keeps the record of it in your portfolio.
          </p>
        </aside>
      </section>
    );
  }
  const featured = HOMEPAGE_FEATURED_ASSET;

  return (
    <section className="page-shell approved-home__ownership" aria-labelledby="ownership-heading">
      <SectionHeading
        eyebrow="The collectible is real"
        title="Own part of a physical collectible."
        headingId="ownership-heading"
      />
      <p className="approved-home__ownership-lead">
        Slice lets investors buy Slices in authenticated collectibles. The card remains the
        underlying asset, while your Slices, cost basis, and ownership percentage are tracked in
        your portfolio.
      </p>
      <div className="approved-home__ownership-flow" aria-label="How Slice ownership works">
        <article className="approved-home__ownership-node approved-home__ownership-node--collectible">
          <div className="approved-home__ownership-image">
            <img src={featured.image} alt={featured.title} loading="lazy" />
          </div>
          <div>
            <small>1. Underlying collectible</small>
            <strong>{featured.title}</strong>
            <p>A real authenticated collectible sits underneath the Slice market.</p>
          </div>
        </article>
        <OwnershipFlowArrow label="Slice creates Slices" />
        <article className="approved-home__ownership-node approved-home__ownership-node--structure is-slice">
          <span className="approved-home__ownership-icon">
            <Vault aria-hidden="true" />
          </span>
          <div>
            <small>2. Illustrative Slice structure</small>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.totalSlices}</strong>
            <dl className="approved-home__ownership-structure">
              <div>
                <dt>Whole collectible reference</dt>
                <dd>
                  {formatMoney(HOMEPAGE_FEATURED_PSA10_VALUE_MINOR_USD, "USD")}
                  <small>
                    Source: {formatSourceMoney(HOMEPAGE_FEATURED_PSA10_VALUE_MINOR_USD, "USD")} USD
                  </small>
                </dd>
              </div>
              <div>
                <dt>Price per Slice</dt>
                <dd>{formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP")}</dd>
              </div>
            </dl>
            <p>
              Slice creates this illustrative ownership structure, not the external marketplace.
            </p>
          </div>
        </article>
        <OwnershipFlowArrow label="Investor owns Slices" />
        <article className="approved-home__ownership-node approved-home__ownership-node--portfolio">
          <span className="approved-home__ownership-icon">
            <ChartNoAxesCombined aria-hidden="true" />
          </span>
          <div>
            <small>3. Example ownership</small>
            <strong>
              {HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSlices} ·{" "}
              {formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestmentMinor, "GBP")}
            </strong>
            <p>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleOwnership} ownership · illustrative</p>
          </div>
        </article>
      </div>
      <aside className="approved-home__ownership-explainer">
        <strong>Your portfolio tracks the position.</strong>
        <p>
          Slices owned, ownership percentage, cost basis and current market position. The external
          reference and illustrative Slice price are always shown separately.
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
  const { formatMoney } = useCurrency();
  const [buySlices, setBuySlices] = useState(25);
  const [buyReviewed, setBuyReviewed] = useState(false);
  const [sellReviewed, setSellReviewed] = useState(false);
  const ownership = ((buySlices / HOMEPAGE_OWNERSHIP_EXAMPLE.totalSlicesCount) * 100).toFixed(2);
  const investment = formatMoney(buySlices * HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP");

  return (
    <section
      className={`approved-home__trading-demo${compact ? " approved-home__trading-demo--compact" : ""}`}
      aria-labelledby="trading-demo-heading"
    >
      <header>
        <div>
          <p className="page-kicker">How trading works</p>
          <h3 id="trading-demo-heading">Buy and sell Slices.</h3>
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
            <span>Buy Slices</span>
            <small>Demo only</small>
          </div>
          <dl className="approved-home__trade-price">
            <div>
              <dt>Price per Slice</dt>
              <dd>{formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP")}</dd>
            </div>
            <div>
              <dt>Select Slices</dt>
              <dd>{buySlices}</dd>
            </div>
          </dl>
          <div className="approved-home__share-options" aria-label="Select example Slices">
            {[1, 5, 10, 25].map((slices) => (
              <button
                key={slices}
                type="button"
                aria-pressed={buySlices === slices}
                className={buySlices === slices ? "is-selected" : undefined}
                onClick={() => {
                  setBuySlices(slices);
                  setBuyReviewed(false);
                }}
              >
                {slices}
              </button>
            ))}
          </div>
          <div className="approved-home__trade-result">
            <strong>
              {buySlices} Slices · {investment}
            </strong>
            <span>Ownership after purchase: {ownership}%</span>
          </div>
          <div className="approved-home__trade-example-footer">
            <ol className="approved-home__trade-flow">
              <li className="is-current">Choose Slices</li>
              <li className={buyReviewed ? "is-current" : undefined}>Review</li>
              <li>Own Slices</li>
            </ol>
            <button
              type="button"
              className="approved-home__demo-action"
              onClick={() => setBuyReviewed(true)}
            >
              {buyReviewed ? "Demo order reviewed" : "Buy Slices — demo only"}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </article>
        <article className="approved-home__trade-example approved-home__trade-example--sell">
          <div className="approved-home__trade-example-heading">
            <span>Sell Slices</span>
            <small>Demo only</small>
          </div>
          <dl className="approved-home__trade-price">
            <div>
              <dt>Example current position</dt>
              <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSlices}</dd>
            </div>
            <div>
              <dt>Sell</dt>
              <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSellSlices}</dd>
            </div>
          </dl>
          <div className="approved-home__trade-result">
            <strong>
              Estimated proceeds:{" "}
              {formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSellProceedsMinor, "GBP")}
            </strong>
            <span>Remaining position: {HOMEPAGE_OWNERSHIP_EXAMPLE.remainingSlices}</span>
          </div>
          <div className="approved-home__trade-example-footer">
            <ol className="approved-home__trade-flow">
              <li className="is-current">Choose Slices</li>
              <li className={sellReviewed ? "is-current" : undefined}>Review</li>
              <li>Sell on marketplace</li>
            </ol>
            <button
              type="button"
              className="approved-home__demo-action approved-home__demo-action--secondary"
              onClick={() => setSellReviewed(true)}
            >
              {sellReviewed ? "Demo sale reviewed" : "Sell Slices — demo only"}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        </article>
      </div>
      <p className="approved-home__trading-demo-note">
        Real authenticated Buy and Sell pages remain the authority: select a collectible, choose
        Slices, review an order, and see matched trades update Portfolio and Orders.
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
        title="The Slice journey, in four simple steps."
        headingId="how-slice-heading"
      />
      <p className="approved-home__how-intro">
        Slice connects a real collectible to a clear, trackable ownership record. Start with the
        card, understand the terms, follow your position in Portfolio, then trade when a supported
        market is available.
      </p>
      <div className="approved-home__how-guide">
        <div className="approved-home__how-guide-copy">
          <span className="approved-home__how-guide-badge">New here? Start here.</span>
          <strong>One real card. Four clear moments.</strong>
          <p>
            The collectible stays at the centre. Slice makes the ownership terms understandable,
            then keeps your settled position and activity together in one calm workspace.
          </p>
        </div>
        <div className="approved-home__how-guide-points" aria-label="The Slice model at a glance">
          <span>
            <b>01</b> Real card
          </span>
          <span>
            <b>02</b> Clear terms
          </span>
          <span>
            <b>03</b> Your record
          </span>
          <span>
            <b>04</b> Supported trading
          </span>
        </div>
      </div>
      <ol className="approved-home__how-grid">
        {howSliceWorks.map((step) => (
          <li key={step.number}>
            <span className="approved-home__how-number">{step.number}</span>
            <span className="approved-home__how-icon">{step.icon}</span>
            <span className="approved-home__how-label">{step.label}</span>
            <h3>{step.title}</h3>
            <p>{step.detail}</p>
            <Link to={step.to} className="approved-home__text-link">
              {step.action} <ArrowRight aria-hidden="true" />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

function ShowcaseAssetLink({
  asset,
  className,
  staticOnly = false,
  children,
}: {
  asset: HomepageShowcaseAsset;
  className: string;
  staticOnly?: boolean;
  children: ReactNode;
}) {
  if (staticOnly) {
    return (
      <Link to="/marketplace" className={className}>
        {children}
      </Link>
    );
  }
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
    <Link to="/list" search={{ draft: undefined }} className={className}>
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
  to: "/marketplace" | "/collectors" | "/portfolio";
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
