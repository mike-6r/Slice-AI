import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  BadgeCheck,
  Boxes,
  Check,
  CircleDollarSign,
  Sparkles,
  TrendingUp,
  Vault,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

import { useSession } from "@/auth/use-session";
import { useCurrency } from "@/currency/CurrencyProvider";
import { isBetaEnvironment } from "@/config/environment";
import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
  HOMEPAGE_TRENDING_ASSETS,
  showcaseDestination,
  type HomepageShowcaseAsset,
} from "@/data/homepage-showcase";
import { MarketAssetCard } from "@/components/marketplace/MarketAssetCard";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import { useTrendingAssets } from "@/queries/hooks";

function useReducedMotion() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const sync = () => setReducedMotion(query.matches);
    sync();
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);

  return reducedMotion;
}

function useSceneVisibility() {
  const ref = useRef<HTMLElement | null>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || !("IntersectionObserver" in window)) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => setVisible(Boolean(entry?.isIntersecting)),
      { threshold: 0.2 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function Scene({
  className,
  label,
  children,
}: {
  className: string;
  label: string;
  children: ReactNode;
}) {
  const scene = useSceneVisibility();
  return (
    <section
      ref={scene.ref}
      className={`v2-scene ${className}${scene.visible ? " is-visible" : ""}`}
      aria-label={label}
    >
      {children}
    </section>
  );
}

function ListAssetLink({
  authenticated,
  className = "v2-button",
  children = "List an Asset",
}: {
  authenticated: boolean;
  className?: string;
  children?: ReactNode;
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

function CardVisual({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`v2-card-visual${compact ? " is-compact" : ""}`}>
      <span className="v2-card-visual__halo" aria-hidden="true" />
      <div className="v2-card-visual__frame">
        <img src={HOMEPAGE_FEATURED_ASSET.image} alt={HOMEPAGE_FEATURED_ASSET.title} />
      </div>
      <span className="v2-card-visual__floor" aria-hidden="true" />
    </div>
  );
}

function HeroScene({ authenticated }: { authenticated: boolean }) {
  return (
    <Scene className="v2-scene--hero" label="One real collectible, one Slice">
      <div className="v2-sticky v2-hero">
        <div className="v2-hero__copy">
          <p className="v2-kicker">Slice / collectible ownership</p>
          <h1>
            <span>One real</span>
            <span>collectible.</span>
            <span className="is-muted">Own a piece</span>
            <span className="is-accent">of it.</span>
          </h1>
          <div className="v2-hero__promise">
            <span>1 Slice</span>
            <b>=</b>
            <strong>0.10% ownership</strong>
          </div>
          <div className="v2-actions">
            <Link to="/marketplace" className="v2-button v2-button--primary">
              Explore Markets <ArrowRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={authenticated} />
          </div>
        </div>
        <div className="v2-hero__visual">
          <CardVisual />
          <div className="v2-card-note v2-card-note--top">
            <BadgeCheck aria-hidden="true" />
            <span>Graded collectible</span>
          </div>
          <div className="v2-card-note v2-card-note--bottom">
            <span>Illustrative experience</span>
            <small>Demo only</small>
          </div>
        </div>
      </div>
    </Scene>
  );
}

function OwnershipScene() {
  return (
    <Scene className="v2-scene--ownership" label="What a Slice is">
      <div className="v2-sticky v2-ownership">
        <div className="v2-ownership__visual">
          <div className="v2-ownership__planes" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <CardVisual compact />
          <div className="v2-your-slice">
            <span>YOUR SLICE</span>
            <strong>0.10%</strong>
            <small>of this collectible</small>
          </div>
        </div>
        <div className="v2-ownership__copy">
          <p className="v2-kicker">01 / Your percentage</p>
          <h2>
            A whole card.
            <br />
            <em>Shared ownership.</em>
          </h2>
          <div className="v2-math-row">
            <div>
              <b>1</b>
              <span>collectible</span>
            </div>
            <ArrowRight aria-hidden="true" />
            <div>
              <b>1,000</b>
              <span>Slices</span>
            </div>
          </div>
          <p className="v2-short-copy">
            The physical card stays whole. You own the percentage you choose.
          </p>
        </div>
      </div>
    </Scene>
  );
}

const lifecycle = [
  { label: "Pre-Sale", copy: "Reserve early.", tone: "amber", icon: CircleDollarSign },
  { label: "Awaiting Intake", copy: "Slice receives it.", tone: "neutral", icon: Vault },
  { label: "Verified", copy: "Verified and secured.", tone: "teal", icon: BadgeCheck },
  { label: "Market Live", copy: "Market opens.", tone: "emerald", icon: TrendingUp },
] as const;

function LifecycleMarketScene() {
  const { formatMoney } = useCurrency();
  return (
    <Scene className="v2-scene--lifecycle" label="From Pre-Sale to Market Live">
      <div className="v2-sticky v2-lifecycle">
        <div className="v2-lifecycle__asset">
          <CardVisual compact />
          <span className="v2-demo-label">Illustrative lifecycle / demo only</span>
        </div>
        <div className="v2-lifecycle__copy">
          <p className="v2-kicker">02 / The asset journey</p>
          <h2>
            Secure it.
            <br />
            <span>Open the market.</span>
          </h2>
          <ol className="v2-lifecycle__rail">
            {lifecycle.map((stage, index) => {
              const Icon = stage.icon;
              return (
                <li key={stage.label} className={`is-${stage.tone}`}>
                  <span className="v2-lifecycle__number">0{index + 1}</span>
                  <Icon aria-hidden="true" />
                  <div>
                    <b>{stage.label}</b>
                    <small>{stage.copy}</small>
                  </div>
                  {index === lifecycle.length - 1 ? <Check aria-hidden="true" /> : null}
                </li>
              );
            })}
          </ol>
        </div>
        <div className="v2-market-seed">
          <div>
            <span>Price per Slice</span>
            <strong>{formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP")}</strong>
          </div>
          <div>
            <span>Ownership per Slice</span>
            <strong>0.10%</strong>
          </div>
          <small>Market UI assembles after verification.</small>
        </div>
      </div>
    </Scene>
  );
}

function PortfolioScene({ authenticated }: { authenticated: boolean }) {
  const { formatMoney } = useCurrency();
  return (
    <Scene className="v2-scene--portfolio" label="Buy a Slice and find it in Portfolio">
      <div className="v2-sticky v2-portfolio">
        <div className="v2-trade-panel">
          <div className="v2-panel-label">
            <span>Market Live</span>
            <small>Illustrative controls</small>
          </div>
          <h2>Buy a Slice.</h2>
          <div className="v2-trade-price">
            <span>Price per Slice</span>
            <strong>{formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP")}</strong>
          </div>
          <div className="v2-quantity">
            <span>Quantity</span>
            <b>25</b>
            <small>Slices</small>
          </div>
          <div className="v2-trade-total">
            <span>Your position</span>
            <strong>2.5% ownership</strong>
            <small>Illustrative example</small>
          </div>
          <button type="button" className="v2-button v2-button--primary">
            Review Buy <ArrowRight aria-hidden="true" />
          </button>
          <small className="v2-disclaimer">No order is submitted from the homepage.</small>
        </div>
        <div className="v2-portfolio-copy">
          <p className="v2-kicker">03 / Your position</p>
          <h2>
            Every Slice you own.
            <br />
            <span>One Portfolio.</span>
          </h2>
          <p className="v2-short-copy">
            Your settled ownership, cost basis and activity live together.
          </p>
          <Link
            to={authenticated ? "/portfolio" : "/login"}
            search={authenticated ? undefined : { returnTo: "/portfolio" }}
            className="v2-inline-link"
          >
            See Portfolio <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <div className="v2-portfolio-window">
          <div className="v2-window-bar">
            <i />
            <i />
            <i />
            <span>Portfolio / Position</span>
          </div>
          <div className="v2-position-hero">
            <span>Your position</span>
            <strong>25 Slices</strong>
            <b>2.5% ownership</b>
          </div>
          {[
            ["Base Set Charizard", "25 Slices", "2.50%"],
            ["Umbreon VMAX", "10 Slices", "1.00%"],
            ["Wembanyama Rookie", "15 Slices", "1.50%"],
          ].map(([name, slices, ownership]) => (
            <div className="v2-position-row" key={name}>
              <span>
                <Boxes aria-hidden="true" />
              </span>
              <b>{name}</b>
              <small>{slices}</small>
              <strong>{ownership}</strong>
            </div>
          ))}
          <span className="v2-demo-label">Illustrative portfolio view</span>
        </div>
      </div>
    </Scene>
  );
}

function CollectorScene({ authenticated }: { authenticated: boolean }) {
  return (
    <Scene className="v2-scene--collector" label="Collector ownership story">
      <div className="v2-sticky v2-collector">
        <div className="v2-collector__copy">
          <p className="v2-kicker">04 / For collectors</p>
          <h2>
            Own part of a collectible.
            <br />
            <span>Or unlock part of one.</span>
          </h2>
          <p className="v2-short-copy">
            Offer a percentage while keeping the rest of the story yours.
          </p>
          <div className="v2-actions">
            <Link to="/collectors" className="v2-button v2-button--primary">
              Explore Collectors <ArrowRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={authenticated} />
          </div>
        </div>
        <div className="v2-collector__visual">
          <CardVisual compact />
          <div className="v2-collector__split">
            <div>
              <b>25%</b>
              <span>Collector retains</span>
            </div>
            <div>
              <b>75%</b>
              <span>Offered to market</span>
            </div>
          </div>
          <small className="v2-demo-label">Illustrative split / demo only</small>
        </div>
      </div>
    </Scene>
  );
}

function ShowcaseLink({ asset }: { asset: HomepageShowcaseAsset }) {
  const destination = showcaseDestination(asset);
  const content = (
    <>
      <img src={asset.image} alt="" loading="lazy" />
      <span>{asset.category}</span>
      <b>{asset.title}</b>
      <strong>{asset.displayPrice}</strong>
      <small>Illustrative catalogue example</small>
    </>
  );
  return destination.kind === "asset" ? (
    <Link to="/asset/$id" params={{ id: destination.id }} className="v2-showcase-card">
      {content}
    </Link>
  ) : (
    <Link to={destination.to} className="v2-showcase-card">
      {content}
    </Link>
  );
}

function RealityMarketScene() {
  const trending = useTrendingAssets();
  return (
    <Scene className="v2-scene--reality" label="Real Slice marketplace">
      <div className="v2-reality">
        <div className="v2-reality__heading">
          <div>
            <p className="v2-kicker">05 / The real market</p>
            <h2>
              Enough explaining.
              <br />
              <span>See the real market.</span>
            </h2>
          </div>
          <Link to="/marketplace" className="v2-inline-link">
            View all markets <ArrowRight aria-hidden="true" />
          </Link>
        </div>
        <p className="v2-reality__lead">
          The illustrative experience ends here. What follows is the current public Slice market.
        </p>
        {isBetaEnvironment ? (
          trending.isPending ? (
            <div className="v2-market-state">
              <Sparkles aria-hidden="true" />
              Checking current public assets…
            </div>
          ) : trending.isError || !trending.data?.length ? (
            <div className="v2-market-state">
              <Sparkles aria-hidden="true" />
              No public market assets yet.
            </div>
          ) : (
            <div className="v2-real-cards">
              {trending.data.map((asset) => (
                <MarketAssetCard key={asset.id} asset={toMarketplaceAsset(asset)} homepageCompact />
              ))}
            </div>
          )
        ) : (
          <div className="v2-real-cards v2-real-cards--illustrative">
            {HOMEPAGE_TRENDING_ASSETS.slice(0, 3).map((asset) => (
              <ShowcaseLink key={asset.showcaseKey} asset={asset} />
            ))}
          </div>
        )}
        <div className="v2-journey-line" aria-label="Slice journey">
          <span>Discover</span>
          <i />
          <span>Reserve</span>
          <i />
          <span>Verify</span>
          <i />
          <span>Own</span>
          <i />
          <span>Trade</span>
        </div>
        <div className="v2-final-cta">
          <div>
            <p className="v2-kicker">Start with one Slice</p>
            <h3>You don’t need the entire collectible.</h3>
          </div>
          <Link to="/marketplace" className="v2-button v2-button--primary">
            Explore Markets <ArrowRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </Scene>
  );
}

export function CinematicHomepageStory() {
  const { isAuthenticated } = useSession();
  const reducedMotion = useReducedMotion();
  return (
    <div
      className={`approved-home approved-home--cinematic-v2${reducedMotion ? " has-reduced-motion" : ""}`}
    >
      <div className="v2-progress" aria-hidden="true" />
      <HeroScene authenticated={isAuthenticated} />
      <OwnershipScene />
      <LifecycleMarketScene />
      <PortfolioScene authenticated={isAuthenticated} />
      <CollectorScene authenticated={isAuthenticated} />
      <RealityMarketScene />
    </div>
  );
}
