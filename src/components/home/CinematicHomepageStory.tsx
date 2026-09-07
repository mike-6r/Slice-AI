import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  Boxes,
  Check,
  CircleDollarSign,
  Clock3,
  LockKeyhole,
  Sparkles,
  TrendingUp,
  UserRound,
  Vault,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useSession } from "@/auth/use-session";
import { useCurrency } from "@/currency/CurrencyProvider";
import { isBetaEnvironment } from "@/config/environment";
import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_FEATURED_PSA10_VALUE_MINOR_USD,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
  HOMEPAGE_TRENDING_ASSETS,
  showcaseDestination,
  type HomepageShowcaseAsset,
} from "@/data/homepage-showcase";
import { useTrendingAssets } from "@/queries/hooks";
import { MarketAssetCard } from "@/components/marketplace/MarketAssetCard";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(mediaQuery.matches);
    sync();
    mediaQuery.addEventListener("change", sync);
    return () => mediaQuery.removeEventListener("change", sync);
  }, []);

  return reducedMotion;
}

function useSceneVisibility() {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    if (!("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.16 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Scene({
  className = "",
  label,
  children,
}: {
  className?: string;
  label: string;
  children: ReactNode;
}) {
  const scene = useSceneVisibility();
  return (
    <section
      ref={scene.ref}
      className={`cinematic-scene ${className}${scene.visible ? " is-visible" : ""}`}
      aria-label={label}
    >
      {children}
    </section>
  );
}

function ShowcaseLink({
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
    <Link to="/list" search={{ draft: undefined }} className={className}>
      {children}
    </Link>
  ) : (
    <Link to="/login" search={{ returnTo: "/list" }} className={className}>
      {children}
    </Link>
  );
}

function PortfolioLink({ authenticated }: { authenticated: boolean }) {
  return authenticated ? (
    <Link to="/portfolio" className="cinematic-inline-link">
      Open Portfolio <ArrowRight aria-hidden="true" />
    </Link>
  ) : (
    <Link to="/login" search={{ returnTo: "/portfolio" }} className="cinematic-inline-link">
      See how Portfolio works <ArrowRight aria-hidden="true" />
    </Link>
  );
}

const lifecycleSteps = [
  { label: "Discover", copy: "Start with an authenticated collectible.", icon: Sparkles },
  { label: "Reserve", copy: "Choose the ownership position that fits.", icon: CircleDollarSign },
  { label: "Verify", copy: "Identity, condition and custody are checked.", icon: BadgeCheck },
  { label: "Own", copy: "Your settled Slices live in Portfolio.", icon: Vault },
  { label: "Trade", copy: "Buy or sell when the market is supported.", icon: TrendingUp },
] as const;

function CardVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`cinematic-card-visual${compact ? " is-compact" : ""}`}>
      <span className="cinematic-card-visual__halo" aria-hidden="true" />
      <div className="cinematic-card-visual__frame">
        <img src={HOMEPAGE_FEATURED_ASSET.image} alt={HOMEPAGE_FEATURED_ASSET.title} />
      </div>
      <span className="cinematic-card-visual__floor" aria-hidden="true" />
    </div>
  );
}

function HeroScene({ authenticated }: { authenticated: boolean }) {
  return (
    <Scene className="cinematic-scene--hero" label="Slice introduction">
      <div className="cinematic-sticky cinematic-hero">
        <div className="cinematic-hero__copy">
          <p className="cinematic-kicker">The collectible ownership platform</p>
          <h1>
            <span>Own the card.</span>
            <span>Not the whole card.</span>
            <span className="is-accent">Own a Slice.</span>
          </h1>
          <p className="cinematic-hero__lead">
            Discover authenticated collectibles, choose a clear ownership position, and follow it
            from market to portfolio.
          </p>
          <div className="cinematic-actions">
            <Link to="/marketplace" className="cinematic-button cinematic-button--primary">
              Explore Markets <ArrowRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={authenticated} className="cinematic-button">
              List an Asset
            </ListAssetLink>
          </div>
          <div className="cinematic-scroll-cue" aria-hidden="true">
            <span>Scroll to see the model</span>
            <ArrowDown />
          </div>
        </div>
        <div className="cinematic-hero__visual">
          <div className="cinematic-hero__orb cinematic-hero__orb--one" aria-hidden="true" />
          <div className="cinematic-hero__orb cinematic-hero__orb--two" aria-hidden="true" />
          <CardVisual />
          <div className="cinematic-hero__annotation cinematic-hero__annotation--left">
            <span>01</span>
            <b>One real collectible</b>
            <small>Authenticated · graded · held</small>
          </div>
          <div className="cinematic-hero__annotation cinematic-hero__annotation--right">
            <span>SLICE / 001</span>
            <b>Clear ownership</b>
            <small>Measured in a percentage you choose</small>
          </div>
          <div className="cinematic-demo-stamp">Illustrative example · Demo only</div>
        </div>
      </div>
    </Scene>
  );
}

function OwnershipScene() {
  return (
    <Scene className="cinematic-scene--ownership" label="One collectible becomes ownership">
      <div className="cinematic-sticky cinematic-ownership">
        <div className="cinematic-section-copy">
          <p className="cinematic-kicker">01 / Ownership, made legible</p>
          <h2>One collectible. Exactly the percentage you choose.</h2>
          <p>
            The physical card stays whole. Slice creates a transparent ownership structure around
            it, so your position is clear from the first Slice onward.
          </p>
        </div>
        <div className="cinematic-ownership__stage">
          <div className="cinematic-ownership__planes" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <CardVisual compact />
          <div className="cinematic-ownership__highlight">
            <span>1 Slice</span>
            <b>0.10%</b>
            <small>of this collectible</small>
          </div>
        </div>
        <dl className="cinematic-stat-strip">
          <div>
            <dt>Underlying asset</dt>
            <dd>1 collectible</dd>
          </div>
          <div>
            <dt>Ownership structure</dt>
            <dd>1,000 Slices</dd>
          </div>
          <div>
            <dt>One position</dt>
            <dd>0.10% ownership</dd>
          </div>
        </dl>
      </div>
    </Scene>
  );
}

function LifecycleScene() {
  const stages = [
    { label: "Pre-Sale", detail: "Reserve before intake.", tone: "amber" },
    { label: "Awaiting Intake", detail: "Slice receives the collectible.", tone: "neutral" },
    { label: "Verified", detail: "Identity and custody are confirmed.", tone: "teal" },
    { label: "Market Live", detail: "Ownership can trade when ready.", tone: "emerald" },
  ] as const;

  return (
    <Scene className="cinematic-scene--lifecycle" label="Pre-Sale to Market Live lifecycle">
      <div className="cinematic-sticky cinematic-lifecycle">
        <div className="cinematic-section-copy">
          <p className="cinematic-kicker">02 / A clear lifecycle</p>
          <h2>The same collectible, becoming a living market.</h2>
          <p>
            A reservation is only the beginning. Intake, verification, ownership finalization and
            market readiness each have a visible place in the journey.
          </p>
        </div>
        <div className="cinematic-lifecycle__asset">
          <CardVisual compact />
          <span className="cinematic-demo-stamp">Illustrative lifecycle · Demo only</span>
        </div>
        <ol className="cinematic-lifecycle__rail">
          {stages.map((stage, index) => (
            <li key={stage.label} className={`is-${stage.tone}`}>
              <span className="cinematic-lifecycle__node">0{index + 1}</span>
              <div>
                <b>{stage.label}</b>
                <small>{stage.detail}</small>
              </div>
              {index < stages.length - 1 ? (
                <ArrowRight aria-hidden="true" />
              ) : (
                <Check aria-hidden="true" />
              )}
            </li>
          ))}
        </ol>
      </div>
    </Scene>
  );
}

function TradingScene() {
  const { formatMoney } = useCurrency();
  return (
    <Scene className="cinematic-scene--trading" label="Market and trading reveal">
      <div className="cinematic-sticky cinematic-trading">
        <div className="cinematic-trading__asset">
          <CardVisual compact />
          <div className="cinematic-trading__asset-label">
            <span>Market Live</span>
            <b>{HOMEPAGE_FEATURED_ASSET.title}</b>
            <small>Illustrative trading example</small>
          </div>
        </div>
        <div className="cinematic-trading__panel">
          <div className="cinematic-panel-heading">
            <div>
              <p className="cinematic-kicker">03 / Market access</p>
              <h2>Turn a position into a market object.</h2>
            </div>
            <span className="cinematic-live-dot">LIVE UI</span>
          </div>
          <p className="cinematic-trading__intro">
            Follow the reference, choose your quantity, then review before a real order is placed.
            The authority remains on each live asset and order page.
          </p>
          <div className="cinematic-trading__quote">
            <div>
              <span>Illustrative price per Slice</span>
              <strong>{formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP")}</strong>
              <small>1 Slice = 0.10% ownership</small>
            </div>
            <div>
              <span>Market reference</span>
              <strong>{formatMoney(HOMEPAGE_FEATURED_PSA10_VALUE_MINOR_USD, "USD")}</strong>
              <small>External reference · demo context</small>
            </div>
          </div>
          <div className="cinematic-mini-chart" aria-label="Illustrative market reference chart">
            <div className="cinematic-mini-chart__head">
              <span>Reference movement</span>
              <b>Live on asset page</b>
            </div>
            <svg viewBox="0 0 560 120" role="img" aria-hidden="true">
              <path d="M0 94 C45 82, 70 89, 102 70 S162 78, 197 54 S248 64, 280 44 S335 54, 366 30 S413 48, 445 26 S490 42, 560 14" />
            </svg>
          </div>
          <div className="cinematic-trading__controls">
            <div>
              <span>Best ask / availability</span>
              <b>Shown when live data is available</b>
            </div>
            <button type="button" className="cinematic-control cinematic-control--buy">
              Buy
            </button>
            <button type="button" className="cinematic-control">
              Sell
            </button>
          </div>
          <small className="cinematic-disclaimer">
            Illustrative controls — no order is submitted from this homepage.
          </small>
        </div>
      </div>
    </Scene>
  );
}

function PortfolioScene({ authenticated }: { authenticated: boolean }) {
  return (
    <Scene className="cinematic-scene--portfolio" label="Position enters Portfolio">
      <div className="cinematic-sticky cinematic-portfolio">
        <div className="cinematic-section-copy">
          <p className="cinematic-kicker">04 / Your position</p>
          <h2>One calm home for everything you own.</h2>
          <p>
            After a real order settles, Portfolio keeps your Slices, ownership, cost basis and
            activity together. The example below is illustrative and not an account balance.
          </p>
          <PortfolioLink authenticated={authenticated} />
        </div>
        <div className="cinematic-portfolio__window">
          <div className="cinematic-window-bar">
            <span />
            <span />
            <span />
            <b>Portfolio / Position</b>
          </div>
          <div className="cinematic-portfolio__summary">
            <div>
              <span>Total position</span>
              <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSlices}</strong>
              <small>2.50% ownership</small>
            </div>
            <div>
              <span>Illustrative value</span>
              <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestment}</strong>
              <small>Cost basis example</small>
            </div>
          </div>
          <div className="cinematic-portfolio__rows">
            {[
              ["Base Set Charizard", "25 Slices", "2.50%"],
              ["Umbreon VMAX", "10 Slices", "1.00%"],
              ["Wembanyama Rookie", "15 Slices", "1.50%"],
            ].map(([name, slices, ownership]) => (
              <div key={name}>
                <span className="cinematic-portfolio__row-icon">
                  <Boxes aria-hidden="true" />
                </span>
                <b>{name}</b>
                <small>{slices}</small>
                <strong>{ownership}</strong>
              </div>
            ))}
          </div>
          <span className="cinematic-demo-stamp">Illustrative portfolio view</span>
        </div>
      </div>
    </Scene>
  );
}

function CollectorScene({ authenticated }: { authenticated: boolean }) {
  return (
    <Scene className="cinematic-scene--collector" label="Collector ownership story">
      <div className="cinematic-sticky cinematic-collector">
        <div className="cinematic-collector__asset">
          <CardVisual compact />
        </div>
        <div className="cinematic-section-copy">
          <p className="cinematic-kicker">05 / For collectors</p>
          <h2>Unlock part of the value without giving up the whole story.</h2>
          <p>
            Collectors can make a portion of an asset available through Slice while retaining the
            percentage they choose. This split is an illustrative example, not an offering term.
          </p>
          <div className="cinematic-actions">
            <Link to="/collectors" className="cinematic-button cinematic-button--primary">
              Explore Collectors <ArrowRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={authenticated} className="cinematic-button">
              List an Asset
            </ListAssetLink>
          </div>
        </div>
        <div className="cinematic-collector__split">
          <div className="cinematic-split__bar">
            <span />
            <span />
          </div>
          <div className="cinematic-split__legend">
            <div>
              <b>25%</b>
              <span>Collector retains</span>
            </div>
            <div>
              <b>75%</b>
              <span>Offered to the market</span>
            </div>
          </div>
          <small>Illustrative ownership split</small>
        </div>
      </div>
    </Scene>
  );
}

function LifecycleRailScene() {
  return (
    <Scene className="cinematic-scene--rail" label="Discover, reserve, verify, own and trade">
      <div className="cinematic-sticky cinematic-rail-scene">
        <div className="cinematic-section-copy">
          <p className="cinematic-kicker">06 / The Slice journey</p>
          <h2>Five moments. One continuous experience.</h2>
          <p>Scroll through the path from first discovery to supported trading.</p>
        </div>
        <div className="cinematic-horizontal-rail">
          <ol>
            {lifecycleSteps.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.label}>
                  <span className="cinematic-horizontal-rail__number">0{index + 1}</span>
                  <span className="cinematic-horizontal-rail__icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <b>{step.label}</b>
                  <p>{step.copy}</p>
                  <span className="cinematic-horizontal-rail__example">
                    {index === 0
                      ? "Market catalogue"
                      : index === 1
                        ? "Ownership terms"
                        : index === 2
                          ? "Verification status"
                          : index === 3
                            ? "Portfolio position"
                            : "Order review"}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Scene>
  );
}

function MarketScene() {
  const trending = useTrendingAssets();
  const { formatMoney } = useCurrency();
  return (
    <Scene className="cinematic-scene--market" label="Public market catalogue">
      <div className="cinematic-market">
        <div className="cinematic-market__heading">
          <div>
            <p className="cinematic-kicker">07 / See it in the market</p>
            <h2>Real public assets, ready to explore.</h2>
          </div>
          <Link to="/marketplace" className="cinematic-inline-link">
            View all markets <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        {isBetaEnvironment ? (
          trending.isPending ? (
            <div className="cinematic-market-state">
              <Clock3 aria-hidden="true" />
              <b>Checking the live catalogue…</b>
              <span>Published assets will appear as soon as the market projection is ready.</span>
            </div>
          ) : trending.isError || !trending.data?.length ? (
            <div className="cinematic-market-state">
              <Sparkles aria-hidden="true" />
              <b>No live market data yet</b>
              <span>Browse the marketplace for the latest catalogue status.</span>
            </div>
          ) : (
            <div className="cinematic-market__cards" data-testid="cinematic-live-market-cards">
              {trending.data.map((asset) => (
                <MarketAssetCard key={asset.id} asset={toMarketplaceAsset(asset)} homepageCompact />
              ))}
            </div>
          )
        ) : (
          <div className="cinematic-market__cards cinematic-market__cards--illustrative">
            {HOMEPAGE_TRENDING_ASSETS.slice(0, 3).map((asset) => (
              <ShowcaseLink
                key={asset.showcaseKey}
                asset={asset}
                className="cinematic-showcase-card"
              >
                <img src={asset.image} alt="" loading="lazy" />
                <span>{asset.category}</span>
                <b>{asset.title}</b>
                <strong>{formatMoney(asset.displayPriceMinor, asset.displayPriceCurrency)}</strong>
                <small>Illustrative catalogue example</small>
              </ShowcaseLink>
            ))}
          </div>
        )}
      </div>
    </Scene>
  );
}

export function CinematicHomepageStory() {
  const { isAuthenticated } = useSession();
  const reducedMotion = useReducedMotion();

  return (
    <div
      className={`approved-home approved-home--cinematic${reducedMotion ? " has-reduced-motion" : ""}`}
    >
      <div className="cinematic-progress" aria-hidden="true" />
      <HeroScene authenticated={isAuthenticated} />
      <OwnershipScene />
      <LifecycleScene />
      <TradingScene />
      <PortfolioScene authenticated={isAuthenticated} />
      <CollectorScene authenticated={isAuthenticated} />
      <LifecycleRailScene />
      <MarketScene />
      <Scene className="cinematic-scene--final" label="Start with one Slice">
        <div className="cinematic-final">
          <div className="cinematic-final__backdrop" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <p className="cinematic-kicker">The next collectible is yours to discover</p>
          <h2>You don’t need to buy the entire collectible.</h2>
          <p>Start with one Slice, then build your position over time.</p>
          <div className="cinematic-actions">
            <Link to="/marketplace" className="cinematic-button cinematic-button--primary">
              Explore Markets <ArrowRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={isAuthenticated} className="cinematic-button">
              List an Asset
            </ListAssetLink>
          </div>
        </div>
      </Scene>
    </div>
  );
}
