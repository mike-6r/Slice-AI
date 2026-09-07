import { Link } from "@tanstack/react-router";
import {
  ArrowRight,
  ArrowUp,
  Boxes,
  Check,
  CircleDollarSign,
  LockKeyhole,
  ScanLine,
  Sparkles,
  TrendingUp,
  Vault,
} from "lucide-react";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

import { useSession } from "@/auth/use-session";
import { HOMEPAGE_FEATURED_ASSET, HOMEPAGE_OWNERSHIP_EXAMPLE } from "@/data/homepage-showcase";
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
    const observer = new IntersectionObserver(([entry]) => {
      if (!entry?.isIntersecting || entry.intersectionRatio < 0.3) return;
      setVisible(true);
      observer.disconnect();
    }, { threshold: [0, 0.3] });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { ref, visible };
}

function usePointerTilt() {
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element || window.matchMedia("(pointer: coarse)").matches) return;

    const move = (event: PointerEvent) => {
      const bounds = element.getBoundingClientRect();
      const x = ((event.clientX - bounds.left) / bounds.width - 0.5) * 10;
      const y = ((event.clientY - bounds.top) / bounds.height - 0.5) * -10;
      element.style.setProperty("--v2-pointer-x", x.toFixed(2));
      element.style.setProperty("--v2-pointer-y", y.toFixed(2));
    };
    const reset = () => {
      element.style.setProperty("--v2-pointer-x", "0");
      element.style.setProperty("--v2-pointer-y", "0");
    };

    element.addEventListener("pointermove", move, { passive: true });
    element.addEventListener("pointerleave", reset, { passive: true });
    return () => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerleave", reset);
    };
  }, []);

  return ref;
}

function useScenePlaybackProgress(sceneSelector: string, variableName: string, durationMs: number) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const scene = element.closest<HTMLElement>(sceneSelector);
    if (!scene || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.style.setProperty(variableName, "1");
      setProgress(1);
      return;
    }

    let frame = 0;
    let started = false;
    const setPlaybackProgress = (nextProgress: number) => {
      const bounded = Math.min(1, Math.max(0, nextProgress));
      element.style.setProperty(variableName, bounded.toFixed(3));
      setProgress((current) =>
        Math.abs(current - bounded) > 0.008 || bounded === 1 ? bounded : current,
      );
    };

    const play = () => {
      if (started) return;
      started = true;
      const startedAt = window.performance.now();
      const animate = (now: number) => {
        const elapsed = Math.min(1, (now - startedAt) / durationMs);
        const eased = 1 - Math.pow(1 - elapsed, 3);
        setPlaybackProgress(eased);
        if (elapsed < 1) frame = window.requestAnimationFrame(animate);
      };
      frame = window.requestAnimationFrame(animate);
    };

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || entry.intersectionRatio < 0.3) return;
        play();
        observer.disconnect();
      },
      { threshold: [0, 0.3] },
    );
    observer.observe(scene);
    return () => {
      observer.disconnect();
      if (frame) window.cancelAnimationFrame(frame);
    };
  }, [durationMs, sceneSelector, variableName]);

  return { ref, progress };
}

function Scene({
  id,
  className,
  label,
  children,
}: {
  id?: string;
  className: string;
  label: string;
  children: ReactNode;
}) {
  const scene = useSceneVisibility();
  return (
    <section
      ref={scene.ref}
      id={id}
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
  const visualRef = usePointerTilt();
  const illustrativeValue = HOMEPAGE_OWNERSHIP_EXAMPLE.illustrativeValuation.replace(".00", "");
  const slicePrice = HOMEPAGE_OWNERSHIP_EXAMPLE.slicePrice.replace(".00", "");
  const exampleInvestment = HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestment.replace(".00", "");
  const exampleOwnership = HOMEPAGE_OWNERSHIP_EXAMPLE.exampleOwnership.replace(/0%$/, "%");

  return (
    <Scene className="v2-scene--hero" label="One real collectible, one Slice">
      <div className="v2-sticky v2-hero">
        <div className="v2-hero__copy">
          <p className="v2-kicker">Slice / collectible ownership</p>
          <h1>
            <span>One real collectible.</span>
            <span className="is-accent">A new way to own it.</span>
          </h1>
          <p className="v2-hero__lede">
            You do not need to buy the entire card. Choose how many Slices you want.
          </p>
          <div className="v2-actions">
            <Link to="/marketplace" className="v2-button v2-button--primary">
              Explore Markets <ArrowRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={authenticated} />
          </div>
          <a className="v2-hero__scroll-cue" href="#v2-ownership-scene">
            <span>See how ownership works</span>
            <i aria-hidden="true" />
          </a>
          <p className="v2-hero__fineprint">Illustrative homepage scene · Demo only</p>
        </div>
        <div ref={visualRef} className="v2-hero__visual">
          <div className="v2-hero__vault-field" aria-hidden="true">
            <span className="v2-hero__vault-ring" />
            <span className="v2-hero__vault-line v2-hero__vault-line--one" />
            <span className="v2-hero__vault-line v2-hero__vault-line--two" />
          </div>
          <div className="v2-hero__asset-passport">
            <span>Real collectible</span>
            <strong>1999 Base Set 1st Edition Charizard</strong>
            <small>PSA 10 GEM-MT</small>
            <em>External reference available</em>
          </div>
          <CardVisual />
          <div className="v2-hero__market-reference" aria-label="External market reference">
            <span>Market reference</span>
            <strong>{HOMEPAGE_FEATURED_ASSET.displayPrice.replace(/\.00(?=\s)/, "")}</strong>
            <small>PriceCharting · External reference</small>
          </div>
          <div className="v2-hero__asset-meta">
            <span>1999 Pokémon Base Set</span>
            <i aria-hidden="true" />
            <span>1st Edition</span>
            <i aria-hidden="true" />
            <span>#4</span>
            <small>Illustrative / Demo only</small>
          </div>

          <aside
            className="v2-hero__ownership-example"
            aria-label="Illustrative Slice purchase example"
          >
            <div className="v2-hero__ownership-example-heading">
              <span>What would I actually buy?</span>
              <small>Illustrative example</small>
            </div>
            <div
              className="v2-hero__ownership-math"
              aria-label="Ten thousand pounds divided by one thousand Slices equals ten pounds per Slice"
            >
              <div>
                <b>{illustrativeValue}</b>
                <span>collectible</span>
              </div>
              <i aria-hidden="true">÷</i>
              <div>
                <b>1,000</b>
                <span>Slices</span>
              </div>
              <i aria-hidden="true">=</i>
              <div className="is-accent">
                <b>{slicePrice}</b>
                <span>per Slice</span>
              </div>
            </div>
            <div className="v2-hero__ownership-buy">
              <div>
                <span>Example buy</span>
                <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSlices}</strong>
              </div>
              <div>
                <span>You pay</span>
                <strong>{exampleInvestment}</strong>
              </div>
              <div className="is-accent">
                <span>You own</span>
                <strong>{exampleOwnership}</strong>
              </div>
            </div>
            <p>
              <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.exampleSlices}</strong> gives you{" "}
              <strong>{exampleOwnership}</strong> ownership of this collectible.
            </p>
          </aside>
        </div>
      </div>
    </Scene>
  );
}

const ownershipChoices = [
  { count: 1, slices: "1 Slice", price: "£10", ownership: "0.10%" },
  { count: 10, slices: "10 Slices", price: "£100", ownership: "1%" },
  { count: 25, slices: "25 Slices", price: "£250", ownership: "2.5%" },
  { count: 100, slices: "100 Slices", price: "£1,000", ownership: "10%" },
] as const;

const ownershipStoryStages = [
  { label: "Real collectible", copy: "A physical card stays whole." },
  { label: "Slices created", copy: "Ownership becomes 1,000 units." },
  { label: "You choose", copy: "Pick the amount that fits you." },
  { label: "Position created", copy: "Your selected Slices become one position." },
  { label: "Portfolio", copy: "Track the position you own." },
] as const;

function OwnershipScene() {
  const ownershipPlayback = useScenePlaybackProgress(
    ".v2-scene--ownership",
    "--v2-ownership-progress",
    1_650,
  );
  const [selectedSliceCount, setSelectedSliceCount] = useState(25);
  const selectedChoice =
    ownershipChoices.find((choice) => choice.count === selectedSliceCount) ?? ownershipChoices[2];
  const activeStage = Math.min(
    ownershipStoryStages.length - 1,
    Math.floor(ownershipPlayback.progress * 5),
  );
  const illustrativeValue = HOMEPAGE_OWNERSHIP_EXAMPLE.illustrativeValuation.replace(".00", "");
  const slicePrice = HOMEPAGE_OWNERSHIP_EXAMPLE.slicePrice.replace(".00", "");

  return (
    <Scene
      id="v2-ownership-scene"
      className="v2-scene--ownership"
      label="How Slice ownership works"
    >
      <div
        ref={ownershipPlayback.ref}
        className={`v2-sticky v2-ownership v2-ownership-story is-stage-${activeStage}`}
        style={
          {
            "--v2-ownership-progress": ownershipPlayback.progress.toFixed(3),
          } as CSSProperties
        }
      >
        <div className="v2-ownership-story__atmosphere" aria-hidden="true">
          <span className="v2-ownership-story__grid" />
          <span className="v2-ownership-story__glow" />
          <span className="v2-ownership-story__scan" />
        </div>

        <header className="v2-ownership-story__intro">
          <p className="v2-kicker">How ownership works</p>
          <h2>
            <span>Own part of it.</span>
            <span className="is-accent">Not the whole thing.</span>
          </h2>
          <p>
            The collectible stays whole. Slice creates ownership units tied to that exact item.
            Choose how many you want, see what you pay, and track your position in Portfolio.
          </p>
        </header>

        <nav className="v2-ownership-story__rail" aria-label="Ownership story progress">
          {ownershipStoryStages.map((stage, index) => (
            <div
              className={
                index === activeStage ? "is-active" : index < activeStage ? "is-complete" : ""
              }
              key={stage.label}
            >
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{stage.label}</strong>
              {index === activeStage ? <small>{stage.copy}</small> : null}
            </div>
          ))}
        </nav>

        <div
          className="v2-ownership-story__system"
          aria-label="One collectible becoming a portfolio position"
        >
          <article className="v2-ownership-story__stage v2-ownership-story__stage--collectible">
            <div className="v2-ownership-story__stage-heading">
              <span>01</span>
              <p>Real collectible</p>
            </div>
            <CardVisual compact />
            <div className="v2-ownership-story__collectible-detail">
              <strong>1999 Base Set Charizard</strong>
              <span>PSA 10 GEM-MT</span>
              <small>
                Market context: {HOMEPAGE_FEATURED_ASSET.displayPrice.replace(/\.00(?=\s)/, "")}{" "}
                external reference
              </small>
            </div>
            <p>
              <b>The card stays whole.</b> You are buying a position tied to this physical item.
            </p>
          </article>

          <div
            className="v2-ownership-story__connector v2-ownership-story__connector--one"
            aria-hidden="true"
          >
            <span />
          </div>

          <article className="v2-ownership-story__stage v2-ownership-story__stage--formation">
            <div className="v2-ownership-story__stage-heading">
              <span>02</span>
              <p>Slices created</p>
            </div>
            <div className="v2-ownership-story__slice-engine" aria-hidden="true">
              <div className="v2-ownership-story__slice-stack">
                {Array.from({ length: 18 }, (_, index) => (
                  <i key={index} style={{ "--v2-layer": index } as CSSProperties} />
                ))}
                <b>1 Slice</b>
              </div>
              <span className="v2-ownership-story__slice-count">1,000</span>
            </div>
            <div className="v2-ownership-story__math" aria-label="Illustrative ownership math">
              <div>
                <span>Collectible value</span>
                <strong>{illustrativeValue}</strong>
              </div>
              <i aria-hidden="true">÷</i>
              <div>
                <span>Total Slices</span>
                <strong>1,000</strong>
              </div>
              <i aria-hidden="true">=</i>
              <div className="is-accent">
                <span>Price per Slice</span>
                <strong>{slicePrice}</strong>
              </div>
            </div>
            <p>
              Slice divides ownership into <b>1,000 units</b> tied to this exact collectible.
            </p>
          </article>

          <div
            className="v2-ownership-story__connector v2-ownership-story__connector--two"
            aria-hidden="true"
          >
            <span />
          </div>

          <article className="v2-ownership-story__stage v2-ownership-story__stage--choose">
            <div className="v2-ownership-story__stage-heading">
              <span>03</span>
              <p>You choose</p>
            </div>
            <div className="v2-ownership-story__choice-grid" aria-label="Choose a number of Slices">
              {ownershipChoices.map((choice) => (
                <button
                  className={choice.count === selectedChoice.count ? "is-selected" : ""}
                  key={choice.slices}
                  onClick={() => setSelectedSliceCount(choice.count)}
                  type="button"
                  aria-pressed={choice.count === selectedChoice.count}
                >
                  <span>{choice.slices}</span>
                  <b>Pay {choice.price}</b>
                  <small>Own {choice.ownership}</small>
                </button>
              ))}
            </div>
            <div className="v2-ownership-story__selection-summary" aria-live="polite">
              <div>
                <span>You buy</span>
                <strong>{selectedChoice.slices}</strong>
              </div>
              <div>
                <span>You pay</span>
                <strong>{selectedChoice.price}</strong>
              </div>
              <div className="is-accent">
                <span>You own</span>
                <strong>{selectedChoice.ownership}</strong>
              </div>
            </div>
            <p>
              Buying <b>{selectedChoice.slices}</b> gives you <b>{selectedChoice.ownership}</b>{" "}
              ownership of this collectible.
            </p>
          </article>

          <div className="v2-ownership-story__transfer" aria-hidden="true">
            <span>Selected Slices</span>
            <div>
              {Array.from({ length: 25 }, (_, index) => (
                <i
                  className={index < Math.min(selectedChoice.count, 25) ? "is-claimed" : ""}
                  key={index}
                  style={{ "--v2-transfer-index": index } as CSSProperties}
                />
              ))}
            </div>
          </div>

          <div
            className="v2-ownership-story__connector v2-ownership-story__connector--three"
            aria-hidden="true"
          >
            <span />
          </div>

          <article className="v2-ownership-story__stage v2-ownership-story__stage--portfolio">
            <div className="v2-ownership-story__stage-heading">
              <span>04</span>
              <p>Position created</p>
            </div>
            <div className="v2-ownership-story__portfolio-card">
              <div className="v2-ownership-story__portfolio-card-top">
                <span>Your position</span>
                <b>Portfolio</b>
              </div>
              <div className="v2-ownership-story__portfolio-values">
                <div>
                  <span>Slices</span>
                  <strong>{selectedChoice.count}</strong>
                </div>
                <div>
                  <span>Ownership</span>
                  <strong>{selectedChoice.ownership}</strong>
                </div>
                <div>
                  <span>Position value</span>
                  <strong>{selectedChoice.price}</strong>
                </div>
              </div>
              <div className="v2-ownership-story__portfolio-track">
                <i style={{ width: selectedChoice.ownership }} />
              </div>
              <small>Avg cost {slicePrice} / Slice</small>
            </div>
            <p>
              Your purchased Slices are <b>recorded and tracked in Portfolio.</b>
            </p>
          </article>
        </div>

        <footer className="v2-ownership-story__footer">
          <span>01 Real collectible</span>
          <ArrowRight aria-hidden="true" />
          <span>1,000 priced Slices</span>
          <ArrowRight aria-hidden="true" />
          <span>Your position in Portfolio</span>
          <small>Illustrative example · Demo only</small>
        </footer>
      </div>
    </Scene>
  );
}

const lifecycle = [
  {
    label: "Reserve",
    status: "Reservation placed",
    copy: "Choose how many Slices you want before the collectible is fully processed.",
    hint: "Choose how many Slices you want to reserve.",
    trust: "Your reservation holds your place. It is not final ownership yet.",
    tone: "amber",
    icon: CircleDollarSign,
  },
  {
    label: "Receive",
    status: "Asset intake",
    copy: "Slice receives the physical collectible from the collector or seller.",
    hint: "The physical collectible arrives and its intake is recorded.",
    trust: "Physical intake is recorded before the next stage.",
    tone: "receive",
    icon: Vault,
  },
  {
    label: "Verify",
    status: "Details checked",
    copy: "Slice checks identity, condition, grade, and submission details.",
    hint: "Slice checks its identity, grade, and condition against the offering.",
    trust: "The collectible must match the offering before ownership is finalized.",
    tone: "verify",
    icon: ScanLine,
  },
  {
    label: "Secure",
    status: "Custody secured",
    copy: "The collectible is placed into protected custody and secured storage.",
    hint: "The card moves into protected custody and stays physically whole.",
    trust: "The physical asset stays protected while ownership is prepared.",
    tone: "secure",
    icon: LockKeyhole,
  },
  {
    label: "Market Live",
    status: "Ownership active",
    copy: "Ownership becomes active and the market can open when the offering is ready.",
    hint: "The offering is ready, so Slices can be bought and sold.",
    trust: "The reservation lifecycle is complete and trading can begin.",
    tone: "live",
    icon: TrendingUp,
  },
  {
    label: "Portfolio",
    status: "Position settled",
    copy: "Your settled position is tracked in your Slice Portfolio.",
    hint: "Your settled Slices appear in Portfolio for clear tracking.",
    trust: "You can see the Slices you own in one clear place.",
    tone: "portfolio",
    icon: Boxes,
  },
] as const;

function LifecycleMarketScene() {
  const lifecyclePlayback = useScenePlaybackProgress(
    ".v2-scene--lifecycle",
    "--v2-lifecycle-progress",
    1_800,
  );
  const chamberRef = usePointerTilt();
  const [pinnedStage, setPinnedStage] = useState<number | null>(null);
  const playbackStage = Math.min(
    lifecycle.length - 1,
    Math.floor(lifecyclePlayback.progress * lifecycle.length),
  );
  const activeIndex = pinnedStage ?? playbackStage;
  const activeStage = lifecycle[activeIndex];
  const nextStage = lifecycle[Math.min(activeIndex + 1, lifecycle.length - 1)];
  const ActiveIcon = activeStage.icon;

  return (
    <Scene
      id="v2-lifecycle-scene"
      className="v2-scene--lifecycle"
      label="What happens after you reserve"
    >
      <div
        ref={lifecyclePlayback.ref}
        className={"v2-sticky v2-lifecycle-story is-stage-" + activeIndex}
        data-stage={activeIndex}
        style={
          {
            "--v2-lifecycle-progress": lifecyclePlayback.progress.toFixed(3),
            "--v2-lifecycle-stage": activeIndex,
          } as CSSProperties
        }
      >
        <div className="v2-lifecycle-story__atmosphere" aria-hidden="true">
          <span className="v2-lifecycle-story__grid" />
          <span className="v2-lifecycle-story__beam" />
          <span className="v2-lifecycle-story__glow" />
        </div>

        <header className="v2-lifecycle-story__intro">
          <p className="v2-kicker">After you reserve</p>
          <h2>
            Your reservation becomes <span>a real position.</span>
          </h2>
          <p>
            A reservation is only the first step. Slice receives, checks, secures, and prepares the
            collectible before ownership is finalized in your account.
          </p>
        </header>

        <div ref={chamberRef} className="v2-lifecycle-story__chamber" data-stage={activeIndex}>
          <div className="v2-lifecycle-story__chamber-meta">
            <span>Collectible lifecycle</span>
            <b>0{activeIndex + 1} / 06</b>
          </div>
          <div className="v2-lifecycle-story__portal" aria-hidden="true">
            <i className="v2-lifecycle-story__ring v2-lifecycle-story__ring--outer" />
            <i className="v2-lifecycle-story__ring v2-lifecycle-story__ring--inner" />
            <i className="v2-lifecycle-story__scan" />
            <CardVisual compact />
            <i className="v2-lifecycle-story__floor" />
          </div>
          <div className="v2-lifecycle-story__asset-state">
            <ActiveIcon aria-hidden="true" />
            <div>
              <span>Current state</span>
              <strong>{activeStage.status}</strong>
            </div>
            <i aria-hidden="true" />
          </div>
          <small>Illustrative lifecycle / demo only</small>
        </div>

        <article className="v2-lifecycle-story__active-panel" aria-live="polite">
          <div className="v2-lifecycle-story__active-panel-top">
            <span>Now processing</span>
            <b>0{activeIndex + 1} / 06</b>
          </div>
          <div className="v2-lifecycle-story__active-icon">
            <ActiveIcon aria-hidden="true" />
          </div>
          <p className="v2-kicker">{activeStage.label}</p>
          <h3>{activeStage.status}</h3>
          <p>{activeStage.copy}</p>
          <aside>
            <Check aria-hidden="true" />
            <span>{activeStage.trust}</span>
          </aside>
          <footer>
            <span>{activeIndex === lifecycle.length - 1 ? "Lifecycle complete" : "Up next"}</span>
            <strong>{nextStage.label}</strong>
          </footer>
        </article>

        <nav className="v2-lifecycle-story__rail" aria-label="Post-reservation lifecycle">
          {lifecycle.map((stage, index) => {
            const Icon = stage.icon;
            const isActive = index === activeIndex;
            return (
              <button
                aria-pressed={isActive}
                className={isActive ? "is-active" : index < activeIndex ? "is-complete" : ""}
                key={stage.label}
                onClick={() => setPinnedStage(index)}
                type="button"
              >
                <Icon aria-hidden="true" />
                <b>{stage.label}</b>
                <span className="v2-lifecycle-story__step-tooltip" role="tooltip">
                  {stage.hint}
                </span>
              </button>
            );
          })}
          <div className="v2-lifecycle-story__rail-context" aria-live="polite">
            <span>
              <ActiveIcon aria-hidden="true" />
              Current stage <b>{activeStage.label}</b>
            </span>
            <p>{activeStage.hint}</p>
            <small>Click a stage to preview it.</small>
          </div>
        </nav>

        <p className="v2-lifecycle-story__clarifier">
          <strong>Reserve starts the process.</strong>
          Ownership is finalized after verification and custody, then tracked in Portfolio.
        </p>
      </div>
    </Scene>
  );
}

function PortfolioScene({ authenticated }: { authenticated: boolean }) {
  const portfolioPlayback = useScenePlaybackProgress(
    ".v2-scene--portfolio",
    "--v2-portfolio-progress",
    1_450,
  );
  const positionRef = usePointerTilt();
  const reducedMotion = useReducedMotion();
  const progress = reducedMotion ? 1 : portfolioPlayback.progress;
  const positionProgress = Math.min(1, Math.max(0, (progress - 0.16) / 0.34));
  const expansionProgress = Math.min(1, Math.max(0, (progress - 0.54) / 0.28));
  const slices = Math.round(25 * positionProgress);
  const ownership = (slices * 0.1).toFixed(1);
  const positionValue = slices * 10;
  const totalValue = Math.round(positionValue + 300 * expansionProgress);

  return (
    <Scene
      id="v2-portfolio-scene"
      className="v2-scene--portfolio"
      label="Where your ownership goes"
    >
      <div
        ref={portfolioPlayback.ref}
        className="v2-sticky v2-portfolio-reveal"
        style={
          {
            "--v2-portfolio-progress": progress.toFixed(3),
            "--v2-portfolio-position-progress": positionProgress.toFixed(3),
            "--v2-portfolio-expansion-progress": expansionProgress.toFixed(3),
          } as CSSProperties
        }
      >
        <div className="v2-portfolio-reveal__atmosphere" aria-hidden="true">
          <i className="v2-portfolio-reveal__grid" />
          <i className="v2-portfolio-reveal__beam" />
          <i className="v2-portfolio-reveal__glow" />
        </div>

        <header className="v2-portfolio-reveal__intro">
          <p className="v2-kicker">Your ownership, together</p>
          <h2>
            Your Slices. <span>One Portfolio.</span>
          </h2>
          <p>
            Every position shows your Slices, ownership percentage, value, and current status in one
            place.
          </p>
        </header>

        <div
          ref={positionRef}
          className="v2-portfolio-reveal__position"
          aria-label="Illustrative selected position"
        >
          <span className="v2-portfolio-reveal__position-label">Your selected position</span>
          <div className="v2-portfolio-reveal__card-stage">
            <i className="v2-portfolio-reveal__card-ring v2-portfolio-reveal__card-ring--outer" />
            <i className="v2-portfolio-reveal__card-ring v2-portfolio-reveal__card-ring--inner" />
            <CardVisual compact />
            <i className="v2-portfolio-reveal__card-floor" />
          </div>
          <div className="v2-portfolio-reveal__position-summary">
            <span>Base Set Charizard</span>
            <div>
              <b>{slices} Slices</b>
              <strong>{ownership}% ownership</strong>
            </div>
            <small>£{positionValue} position · £10 avg cost / Slice</small>
          </div>
          <small className="v2-demo-label">Illustrative ownership position</small>
        </div>

        <div className="v2-portfolio-reveal__transfer" aria-hidden="true">
          <span>25 selected Slices</span>
          <div>
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
          <b>→</b>
        </div>

        <section className="v2-portfolio-reveal__product" aria-label="Illustrative Portfolio">
          <header>
            <div>
              <p>Portfolio</p>
              <span>Illustrative Portfolio</span>
            </div>
            <b>{expansionProgress > 0.55 ? "3 positions" : "1 position"}</b>
          </header>

          <div className="v2-portfolio-reveal__total">
            <span>Total position value</span>
            <strong>£{totalValue}</strong>
            <small>Illustrative example</small>
            <i aria-hidden="true" />
          </div>

          <div className="v2-portfolio-reveal__product-heading">
            <span>Your positions</span>
            <small>Slices · ownership · value</small>
          </div>

          <article className="v2-portfolio-position-row v2-portfolio-position-row--primary">
            <span className="v2-portfolio-position-row__icon">
              <Boxes aria-hidden="true" />
            </span>
            <div className="v2-portfolio-position-row__asset">
              <b>Base Set Charizard</b>
              <small>Pre-Sale · position continues after finalization</small>
            </div>
            <div className="v2-portfolio-position-row__metric">
              <span>Slices</span>
              <b>{slices}</b>
            </div>
            <div className="v2-portfolio-position-row__metric">
              <span>Ownership</span>
              <b>{ownership}%</b>
            </div>
            <strong>£{positionValue}</strong>
            <em>Pre-Sale</em>
          </article>

          <article className="v2-portfolio-position-row v2-portfolio-position-row--secondary">
            <span className="v2-portfolio-position-row__icon">
              <Boxes aria-hidden="true" />
            </span>
            <div className="v2-portfolio-position-row__asset">
              <b>Umbreon VMAX</b>
              <small>Ownership position</small>
            </div>
            <div className="v2-portfolio-position-row__metric">
              <span>Slices</span>
              <b>10</b>
            </div>
            <div className="v2-portfolio-position-row__metric">
              <span>Ownership</span>
              <b>1.0%</b>
            </div>
            <strong>£100</strong>
            <em>Market Live</em>
          </article>

          <article className="v2-portfolio-position-row v2-portfolio-position-row--secondary">
            <span className="v2-portfolio-position-row__icon">
              <Boxes aria-hidden="true" />
            </span>
            <div className="v2-portfolio-position-row__asset">
              <b>Wembanyama Rookie</b>
              <small>Ownership position</small>
            </div>
            <div className="v2-portfolio-position-row__metric">
              <span>Slices</span>
              <b>15</b>
            </div>
            <div className="v2-portfolio-position-row__metric">
              <span>Ownership</span>
              <b>1.5%</b>
            </div>
            <strong>£200</strong>
            <em>Market Live</em>
          </article>
        </section>

        <footer className="v2-portfolio-reveal__footer">
          <div>
            <span>25 Slices</span>
            <ArrowRight aria-hidden="true" />
            <span>2.5% ownership</span>
            <ArrowRight aria-hidden="true" />
            <span>£250 position</span>
          </div>
          <p>
            <b>Know what you own.</b> Know what it’s worth. Know what happens next.
          </p>
          <Link
            to={authenticated ? "/portfolio" : "/login"}
            search={authenticated ? undefined : { returnTo: "/portfolio" }}
            className="v2-button v2-button--primary"
          >
            Open Portfolio <ArrowRight aria-hidden="true" />
          </Link>
        </footer>
      </div>
    </Scene>
  );
}

function RealityMarketScene() {
  const trending = useTrendingAssets();
  const reducedMotion = useReducedMotion();
  const marketPlayback = useScenePlaybackProgress(
    ".v2-scene--reality",
    "--v2-real-market-progress",
    1_500,
  );
  const progress = reducedMotion ? 1 : marketPlayback.progress;
  const publicAssets = trending.data ?? [];
  const marketState = trending.isPending
    ? "checking"
    : trending.isError || publicAssets.length === 0
      ? "unavailable"
      : "published";
  const returnToTop = () => {
    window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
  };

  return (
    <Scene id="v2-real-market-scene" className="v2-scene--reality" label="Real Slice marketplace">
      <div
        ref={marketPlayback.ref}
        className={`v2-market-reveal is-${marketState}`}
        style={{ "--v2-real-market-progress": progress.toFixed(3) } as CSSProperties}
      >
        <div className="v2-market-reveal__atmosphere" aria-hidden="true">
          <i className="v2-market-reveal__grid" />
          <i className="v2-market-reveal__beam" />
          <i className="v2-market-reveal__glow" />
        </div>

        <header className="v2-market-reveal__heading">
          <div>
            <p className="v2-kicker">The examples end here</p>
            <h2>
              Enough explaining. <span>See the real market.</span>
            </h2>
            <p>
              The illustrative experience is over. What follows is the published public market on
              Slice.
            </p>
          </div>
          <Link to="/marketplace" className="v2-button v2-button--primary">
            View all markets <ArrowRight aria-hidden="true" />
          </Link>
        </header>

        <div className="v2-market-reveal__transition" aria-hidden="true">
          <span>Illustrative guide</span>
          <i />
          <b>Public market</b>
        </div>

        <div className="v2-market-reveal__status" role="status">
          <span aria-hidden="true" />
          {marketState === "checking"
            ? "Checking public market data"
            : marketState === "unavailable"
              ? "Public market data unavailable"
              : "Published public assets"}
        </div>

        {marketState === "published" ? (
          <div className="v2-market-reveal__cards" data-count={Math.min(publicAssets.length, 3)}>
            {publicAssets.slice(0, 3).map((asset, index) => (
              <div
                className={`v2-market-reveal__card${asset.preSale ? " is-presale" : " is-live"}`}
                key={asset.id}
                style={{ "--v2-market-card-index": index } as CSSProperties}
              >
                <MarketAssetCard asset={toMarketplaceAsset(asset)} homepageCompact />
              </div>
            ))}
          </div>
        ) : (
          <div className="v2-market-reveal__state">
            <Sparkles aria-hidden="true" />
            <div>
              <b>
                {marketState === "checking" ? "Finding public assets" : "No public assets to show"}
              </b>
              <p>
                {marketState === "checking"
                  ? "The market will appear here as soon as the current public projection is available."
                  : "We can’t verify a published market projection right now. Explore the marketplace for the latest availability."}
              </p>
            </div>
            <Link to="/marketplace" className="v2-inline-link">
              Open marketplace <ArrowRight aria-hidden="true" />
            </Link>
          </div>
        )}

        <footer className="v2-market-reveal__final">
          <div>
            <p className="v2-kicker">Start with one Slice</p>
            <h3>Explore the market. Build your position.</h3>
            <p>
              Choose a collectible, see its published details, and decide what ownership means to
              you.
            </p>
          </div>
          <div className="v2-market-reveal__final-actions">
            <Link to="/marketplace" className="v2-button v2-button--primary">
              Explore Markets <ArrowRight aria-hidden="true" />
            </Link>
            <Link to="/collectors" className="v2-inline-link">
              Explore Collectors <ArrowRight aria-hidden="true" />
            </Link>
            <button className="v2-return-top" onClick={returnToTop} type="button">
              Return to top <ArrowUp aria-hidden="true" />
            </button>
          </div>
        </footer>
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
      <RealityMarketScene />
    </div>
  );
}
