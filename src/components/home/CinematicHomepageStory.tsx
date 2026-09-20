import { Link } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Boxes,
  Check,
  ChevronDown,
  CircleDollarSign,
  Fingerprint,
  Layers3,
  Pause,
  Play,
  RotateCcw,
  ScanLine,
  Sparkles,
  TrendingUp,
  Vault,
} from "lucide-react";
import { useState, type CSSProperties, type ReactNode } from "react";

import { useSession } from "@/auth/use-session";
import { HOMEPAGE_FEATURED_ASSET, HOMEPAGE_OWNERSHIP_EXAMPLE } from "@/data/homepage-showcase";
import { HOME_CHAPTERS, HOME_JOURNEY, HOME_QUESTIONS } from "@/data/homepage-story";
import { MarketAssetCard } from "@/components/marketplace/MarketAssetCard";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import { useTrendingAssets } from "@/queries/hooks";
import {
  JOURNEY_STAGE_MS,
  useCardTilt,
  useHomeMotion,
  useJourneyPlayback,
} from "./use-home-motion";

const example = HOMEPAGE_OWNERSHIP_EXAMPLE;
const gbp = (minor: number) =>
  new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
    maximumFractionDigits: 0,
  }).format(minor / 100);
const share = (count: number) =>
  Number(((count / example.totalSlicesCount) * 100).toFixed(2)) + "%";
const journeyIcons = [CircleDollarSign, Vault, ScanLine, Fingerprint, TrendingUp, Boxes];

function ChapterLabel({ number, children }: { number: string; children: ReactNode }) {
  return (
    <p className="sh-eyebrow">
      <span>{number}</span>
      <i aria-hidden="true" />
      {children}
    </p>
  );
}

function ListAssetLink({
  authenticated,
  children = "List a collectible",
}: {
  authenticated: boolean;
  children?: ReactNode;
}) {
  return authenticated ? (
    <Link className="sh-button sh-button--quiet" to="/list" search={{ draft: undefined }}>
      {children}
      <ArrowUpRight aria-hidden="true" />
    </Link>
  ) : (
    <Link className="sh-button sh-button--quiet" to="/login" search={{ returnTo: "/list" }}>
      {children}
      <ArrowUpRight aria-hidden="true" />
    </Link>
  );
}

function Card({ priority = false, className = "" }: { priority?: boolean; className?: string }) {
  return (
    <img
      className={"sh-card " + className}
      src={HOMEPAGE_FEATURED_ASSET.image}
      alt="1999 first edition Base Set Charizard in a PSA 10 graded slab — illustrative collectible"
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      width={502}
      height={766}
    />
  );
}

function Hero({ authenticated }: { authenticated: boolean }) {
  const tilt = useCardTilt();
  return (
    <section id="v2-hero-scene" className="sh-hero" data-home-scene aria-labelledby="home-title">
      <div className="sh-hero__ambience" aria-hidden="true">
        <i />
        <i />
        <i />
      </div>
      <div className="sh-wrap sh-hero__grid">
        <div className="sh-hero__copy" data-home-reveal>
          <ChapterLabel number="01">For the collector in you</ChapterLabel>
          <h1 id="home-title" tabIndex={-1}>
            One real
            <br />
            collectible.
            <br />
            <span>Your Slice.</span>
          </h1>
          <p className="sh-lead">
            The card you’ve always wanted. An amount that fits you. Discover a new way to own a part
            of something extraordinary.
          </p>
          <div className="sh-actions">
            <Link to="/marketplace" className="sh-button sh-button--primary">
              Explore markets <ArrowUpRight aria-hidden="true" />
            </Link>
            <a href="#v2-ownership-scene" className="sh-button sh-button--quiet">
              How it works <ArrowDown aria-hidden="true" />
            </a>
          </div>
          <div className="sh-hero__principles">
            <span>
              <Fingerprint aria-hidden="true" />
              Real collectibles
            </span>
            <span>
              <Layers3 aria-hidden="true" />
              Clear ownership
            </span>
            <span>
              <Boxes aria-hidden="true" />
              Your portfolio
            </span>
          </div>
        </div>
        <div ref={tilt} className="sh-hero__exhibit" data-home-reveal>
          <div className="sh-exhibit__title">
            <span>The collector’s icon</span>
            <span>001 / CHARIZARD</span>
          </div>
          <div className="sh-exhibit__outline" aria-hidden="true">
            SLICE
          </div>
          <div className="sh-exhibit__sheets" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <span className="sh-exhibit__edition" aria-hidden="true">
            THE ORIGINAL. / A NEW POSSIBILITY.
          </span>
          <div className="sh-exhibit__plinth" aria-hidden="true" />
          <div className="sh-exhibit__card">
            <Card priority />
            <span className="sh-exhibit__shine" aria-hidden="true" />
          </div>
          <div className="sh-exhibit__grade">
            <ScanLine aria-hidden="true" />
            <div>
              <span>A collecting classic</span>
              <strong>1999 · Base Set</strong>
              <small>1st Edition · PSA 10</small>
            </div>
          </div>
          <a href="#v2-ownership-scene" className="sh-exhibit__position">
            <span className="sh-tag">Illustrative position</span>
            <div>
              <strong>
                25<span> Slices</span>
              </strong>
              <b>2.5%</b>
            </div>
            <span>
              One card. Your part of it.
              <ArrowUpRight aria-hidden="true" />
            </span>
            <i aria-hidden="true">
              <i />
            </i>
          </a>
          <p className="sh-exhibit__caption">
            Featured collectible illustration. Not an available offering.
          </p>
        </div>
        <div className="sh-hero__foot">
          <a href="#v2-ownership-scene">
            <span className="sh-scroll-icon">
              <ArrowDown aria-hidden="true" />
            </span>
            Scroll to discover your Slice
          </a>
          <ListAssetLink authenticated={authenticated}>Have a card worth sharing?</ListAssetLink>
        </div>
      </div>
    </section>
  );
}

function Ownership({ count, onChange }: { count: number; onChange: (value: number) => void }) {
  return (
    <section
      id="v2-ownership-scene"
      className="sh-section sh-ownership"
      data-home-scene
      aria-labelledby="ownership-title"
    >
      <div className="sh-wrap">
        <header className="sh-section-heading" data-home-reveal>
          <div>
            <ChapterLabel number="02">A smaller entry. The same collectible.</ChapterLabel>
            <h2 id="ownership-title">
              The card stays whole.
              <br />
              <span>You choose your Slice.</span>
            </h2>
          </div>
          <p>
            One physical collectible, divided into ownership units. Try the example below and see
            exactly how the numbers connect.
          </p>
        </header>
        <div className="sh-ownership__grid" data-home-reveal>
          <div className="sh-ownership__visual">
            <div className="sh-panel-label">
              <span>01 / The collectible</span>
              <span className="sh-tag">Illustrative example</span>
            </div>
            <div className="sh-ownership__transformation">
              <Card />
              <div className="sh-slice-field" aria-hidden="true">
                {Array.from({ length: 100 }, (_, i) => (
                  <i
                    key={i}
                    style={
                      {
                        "--cell": i,
                        "--fill": Math.min(1, Math.max(0, count / 10 - i)) * 100 + "%",
                      } as CSSProperties
                    }
                  />
                ))}
              </div>
              <span className="sh-ownership__bridge" aria-hidden="true">
                <ArrowRight />
              </span>
            </div>
            <div className="sh-ownership__equation">
              <div>
                <span>Example value</span>
                <strong>{gbp(example.illustrativeValuationMinor)}</strong>
              </div>
              <b aria-hidden="true">÷</b>
              <div>
                <span>Total Slices</span>
                <strong>{example.totalSlicesCount.toLocaleString("en-GB")}</strong>
              </div>
              <b aria-hidden="true">=</b>
              <div>
                <span>Per Slice</span>
                <strong>{gbp(example.slicePriceMinor)}</strong>
              </div>
            </div>
            <p className="sh-small">
              Each tile represents 10 Slices. Mint shows your selected share of the 1,000-Slice
              example.
            </p>
          </div>
          <div className="sh-calculator">
            <div className="sh-panel-label">
              <span>02 / Make it yours</span>
              <span className="sh-interactive">
                <i />
                Try it
              </span>
            </div>
            <label htmlFor="home-slice-quantity">How many Slices feel like you?</label>
            <div className="sh-calculator__amount">
              <strong>{count}</strong>
              <span>
                {count === 1 ? "Slice" : "Slices"}
                <small>of {example.totalSlicesCount.toLocaleString("en-GB")}</small>
              </span>
              <Layers3 aria-hidden="true" />
            </div>
            <input
              id="home-slice-quantity"
              type="range"
              min={1}
              max={100}
              step={1}
              value={count}
              onChange={(event) => onChange(Number(event.target.value))}
              aria-valuetext={
                count +
                " Slices, " +
                share(count) +
                " ownership, " +
                gbp(count * example.slicePriceMinor) +
                " example cost"
              }
              style={{ "--range": ((count - 1) / 99) * 100 + "%" } as CSSProperties}
            />
            <div className="sh-calculator__range-labels">
              <span>1 Slice</span>
              <span>100 Slices</span>
            </div>
            <div
              className="sh-calculator__presets"
              role="group"
              aria-label="Example Slice quantities"
            >
              {[1, 10, 25, 100].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => onChange(value)}
                  aria-pressed={count === value}
                >
                  {value} {value === 1 ? "Slice" : "Slices"}
                </button>
              ))}
            </div>
            <div className="sh-calculator__result" aria-live="polite" aria-atomic="true">
              <div>
                <span>Example cost</span>
                <strong>{gbp(count * example.slicePriceMinor)}</strong>
              </div>
              <div>
                <span>Your ownership</span>
                <strong>{share(count)}</strong>
              </div>
            </div>
            <a href="#v2-portfolio-scene" className="sh-text-link">
              See this position in your portfolio <ArrowRight aria-hidden="true" />
            </a>
            <p className="sh-small">
              A teaching example, not an order or valuation. Actual supply, price, fees and rights
              depend on the offering.
            </p>
          </div>
        </div>
        <div className="sh-section-note">
          <Fingerprint aria-hidden="true" />
          <p>
            <strong>Same physical card. Clear individual positions.</strong> Your Slice is tied to a
            specific collectible, with its own identity, evidence and offering terms.
          </p>
          <Link to="/how-it-works">
            The full guide <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Journey({ reducedMotion }: { reducedMotion: boolean }) {
  const playback = useJourneyPlayback(HOME_JOURNEY.length, reducedMotion);
  const { index } = playback;
  const stage = HOME_JOURNEY[index];
  const Icon = journeyIcons[index];
  return (
    <section
      id="v2-lifecycle-scene"
      className="sh-section sh-journey"
      data-home-scene
      aria-labelledby="journey-title"
    >
      <div className="sh-wrap sh-journey__inner">
        <header className="sh-section-heading" data-home-reveal>
          <div>
            <ChapterLabel number="03">Follow the whole journey</ChapterLabel>
            <h2 id="journey-title">
              From a real card.
              <br />
              <span>To your collection.</span>
            </h2>
          </div>
          <p>
            There’s a process behind every position. Explore each step from a conditional
            reservation to settled ownership.
          </p>
        </header>
        <div className="sh-tour-controls">
          {!reducedMotion && (
            <button
              type="button"
              onClick={playback.toggle}
              aria-label={
                playback.complete
                  ? "Replay the journey"
                  : playback.paused
                    ? "Play the journey"
                    : "Pause the journey"
              }
            >
              {playback.complete ? (
                <RotateCcw aria-hidden="true" />
              ) : playback.paused ? (
                <Play aria-hidden="true" />
              ) : (
                <Pause aria-hidden="true" />
              )}
              {playback.complete ? "Replay" : playback.paused ? "Play" : "Pause"}
            </button>
          )}
          <span>
            {reducedMotion
              ? "Choose any stage to explore."
              : playback.complete
                ? "The whole journey. One collectible."
                : playback.paused
                  ? "Explore at your own pace."
                  : "The story plays itself. Keep scrolling anytime."}
          </span>
          <span className="sh-tour-progress" aria-hidden="true">
            {playback.running && (
              <i key={index} style={{ animationDuration: `${JOURNEY_STAGE_MS}ms` }} />
            )}
          </span>
        </div>
        <div className="sh-journey__tabs" role="group" aria-label="Collectible journey stages">
          {HOME_JOURNEY.map((item, i) => {
            const StageIcon = journeyIcons[i];
            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={i === index}
                onClick={() => playback.select(i)}
              >
                <span className="sh-journey__step-number">0{i + 1}</span>
                <StageIcon aria-hidden="true" />
                <span>{item.label}</span>
                <i aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <p className="sh-sr-only" role="status" aria-live="polite" aria-atomic="true">
          {playback.manualStage === null
            ? ""
            : `Stage ${index + 1} of 6: ${stage.label}. ${stage.title} ${stage.copy}`}
        </p>
        <div
          ref={playback.ref}
          className="sh-journey__body"
          data-stage={index}
          data-home-reveal
          onFocusCapture={playback.pause}
        >
          <div className="sh-journey__chamber">
            <span className="sh-chamber__ordinal" aria-hidden="true">
              0{index + 1}
            </span>
            <div className="sh-chamber__rings" aria-hidden="true">
              <i />
              <i />
              <i />
            </div>
            <div className="sh-chamber__scan" aria-hidden="true" />
            <Card />
            <div className="sh-chamber__status">
              <Icon aria-hidden="true" />
              <span>
                Illustrative stage<strong>{stage.label}</strong>
              </span>
              <b>0{index + 1}/06</b>
            </div>
          </div>
          <div className="sh-journey__detail">
            <div className="sh-panel-label">
              <span>The collectible lifecycle</span>
              <span className="sh-tag">Process guide</span>
            </div>
            <div key={index} className="sh-journey__content">
              <span className="sh-icon-tile">
                <Icon aria-hidden="true" />
              </span>
              <h3>{stage.title}</h3>
              <p>{stage.copy}</p>
              <aside>
                <Check aria-hidden="true" />
                <span>{stage.detail}</span>
              </aside>
            </div>
            <div className="sh-journey__next">
              <div>
                <span>{index === 5 ? "Your next chapter" : "What happens next"}</span>
                <p>{stage.next}</p>
              </div>
              <button
                type="button"
                aria-label={index === 5 ? "Start the journey again" : "Next journey stage"}
                onClick={() => playback.select((index + 1) % HOME_JOURNEY.length)}
              >
                {index === 5 ? <ArrowLeft aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
              </button>
            </div>
          </div>
        </div>
        <div className="sh-journey__foot">
          <small>Availability and sequence depend on the asset and offering.</small>
        </div>
      </div>
    </section>
  );
}

function Portfolio({ count, authenticated }: { count: number; authenticated: boolean }) {
  const cost = gbp(count * example.slicePriceMinor);
  return (
    <section
      id="v2-portfolio-scene"
      className="sh-section sh-portfolio"
      data-home-scene
      aria-labelledby="portfolio-title"
    >
      <div className="sh-wrap sh-portfolio__grid">
        <div className="sh-portfolio__copy" data-home-reveal>
          <ChapterLabel number="04">The bigger picture. Yours.</ChapterLabel>
          <h2 id="portfolio-title">
            Your collection.
            <br />
            <span>In the clear.</span>
          </h2>
          <p className="sh-lead">
            Collecting is personal. Your portfolio should make it easy to see what you own, what you
            paid, and what happens next.
          </p>
          <ul className="sh-feature-list">
            <li>
              <Layers3 aria-hidden="true" />
              <div>
                <strong>Know your position</strong>
                <span>Slices and ownership percentage, side by side.</span>
              </div>
            </li>
            <li>
              <TrendingUp aria-hidden="true" />
              <div>
                <strong>Keep value in context</strong>
                <span>Cost basis and available marks stay distinct.</span>
              </div>
            </li>
            <li>
              <Boxes aria-hidden="true" />
              <div>
                <strong>See the whole account</strong>
                <span>Positions, cash and commitments, clearly separated.</span>
              </div>
            </li>
          </ul>
          <Link
            className="sh-button sh-button--primary"
            to={authenticated ? "/portfolio" : "/login"}
            search={authenticated ? undefined : { returnTo: "/portfolio" }}
          >
            Explore your portfolio <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
        <div className="sh-portfolio__visual" data-home-reveal>
          <div className="sh-portfolio__window">
            <header>
              <span className="sh-window-dots" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
              <span>My collection</span>
              <span className="sh-tag">Illustrative portfolio</span>
            </header>
            <div className="sh-portfolio__overview">
              <div>
                <span>Example position cost</span>
                <strong data-testid="home-portfolio-cost">{cost}</strong>
                <small>Your selection from the ownership example</small>
              </div>
              <div className="sh-share-ring" style={{ "--share": share(count) } as CSSProperties}>
                <div>
                  <strong>{share(count)}</strong>
                  <span>of this card</span>
                </div>
              </div>
            </div>
            <div className="sh-portfolio__subnav">
              <span>
                Positions <b>01</b>
              </span>
              <span>Activity</span>
              <span>Insights</span>
            </div>
            <article className="sh-position">
              <div className="sh-position__image">
                <Card />
              </div>
              <div className="sh-position__identity">
                <span>Pokémon · Base Set · 1999</span>
                <h3>Charizard</h3>
                <span className="sh-position__grade">1st Edition · PSA 10</span>
                <dl>
                  <div>
                    <dt>Slices</dt>
                    <dd data-testid="home-portfolio-slices">{count}</dd>
                  </div>
                  <div>
                    <dt>Ownership</dt>
                    <dd>{share(count)}</dd>
                  </div>
                  <div>
                    <dt>Example cost</dt>
                    <dd>{cost}</dd>
                  </div>
                </dl>
              </div>
            </article>
            <div className="sh-portfolio__activity">
              <span>
                <Check aria-hidden="true" />
              </span>
              <div>
                <strong>Your example, connected.</strong>
                <p>Change the number of Slices above. Your position updates here.</p>
              </div>
              <a href="#v2-ownership-scene" aria-label="Adjust the ownership example">
                <ArrowUpRight aria-hidden="true" />
              </a>
            </div>
            <footer>
              <span>No real holdings or returns shown</span>
              <span>Illustration only</span>
            </footer>
          </div>
          <div className="sh-portfolio__annotation">
            <span>Built around your collection.</span>
            <svg viewBox="0 0 90 45" fill="none" aria-hidden="true">
              <path d="M3 4c10 32 38 34 77 11M64 11l20 1-6 19" />
            </svg>
          </div>
        </div>
      </div>
    </section>
  );
}

function Marketplace() {
  const query = useTrendingAssets();
  const assets = query.data ?? [];
  const isDemo = import.meta.env.VITE_DATA_SOURCE === "mock";
  return (
    <section
      id="v2-real-market-scene"
      className="sh-section sh-market"
      data-home-scene
      aria-labelledby="market-title"
    >
      <div className="sh-wrap">
        <header className="sh-section-heading" data-home-reveal>
          <div>
            <ChapterLabel number="05">Find your next obsession</ChapterLabel>
            <h2 id="market-title">
              Less imagining.
              <br />
              <span>More discovering.</span>
            </h2>
          </div>
          <div>
            <p>
              Explore the catalogue. Open a collectible for its evidence, ownership terms and
              current availability.
            </p>
            <Link to="/marketplace" className="sh-text-link">
              Explore all markets <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        </header>
        <div className="sh-market__label">
          <span>
            <i />
            {isDemo ? "Demo catalogue" : "From the public catalogue"}
          </span>
          <small>
            {isDemo
              ? "Illustrative assets · not live offerings"
              : "Availability is shown on each asset"}
          </small>
        </div>
        {query.isPending ? (
          <div className="sh-market__skeleton" role="status">
            <span className="sh-sr-only">Loading catalogue</span>
            {[0, 1, 2].map((i) => (
              <div key={i}>
                <i />
                <i />
                <i />
              </div>
            ))}
          </div>
        ) : query.isError ? (
          <div className="sh-market__empty" role="status">
            <ScanLine aria-hidden="true" />
            <div>
              <h3>The catalogue couldn’t load.</h3>
              <p>Try again to check the latest published collectibles.</p>
            </div>
            <button
              className="sh-button sh-button--quiet"
              type="button"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              {query.isFetching ? "Checking…" : "Try again"}
              <ArrowRight aria-hidden="true" />
            </button>
          </div>
        ) : assets.length === 0 ? (
          <div className="sh-market__empty">
            <Sparkles aria-hidden="true" />
            <div>
              <h3>The next collection starts here.</h3>
              <p>
                Published collectibles will appear as they become available. Explore the marketplace
                or discover the collector community.
              </p>
            </div>
            <Link to="/collectors" className="sh-button sh-button--quiet">
              Meet the collectors <ArrowUpRight aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="sh-market__cards" data-home-reveal>
            {assets.slice(0, 3).map((asset) => (
              <MarketAssetCard key={asset.id} asset={toMarketplaceAsset(asset)} homepageCompact />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function CollectorInvitation({ authenticated }: { authenticated: boolean }) {
  return (
    <section
      className="sh-section sh-collectors"
      data-home-scene
      id="home-collectors"
      aria-labelledby="collector-title"
    >
      <div className="sh-wrap sh-collectors__panel" data-home-reveal>
        <div className="sh-collectors__art" aria-hidden="true">
          <span>
            COLLECT.
            <br />
            CONNECT.
          </span>
          <i />
          <Layers3 />
        </div>
        <div>
          <ChapterLabel number="↗">For the people behind the cards</ChapterLabel>
          <h2 id="collector-title">
            Great collections
            <br />
            deserve <span>great company.</span>
          </h2>
          <p>
            Discover collectors and their published assets. Have something special of your own?
            Start a submission and follow its journey through review.
          </p>
          <div className="sh-actions">
            <Link to="/collectors" className="sh-button sh-button--primary">
              Explore collectors <ArrowUpRight aria-hidden="true" />
            </Link>
            <ListAssetLink authenticated={authenticated} />
          </div>
        </div>
      </div>
    </section>
  );
}

function Questions() {
  return (
    <section
      className="sh-section sh-faq"
      data-home-scene
      id="home-questions"
      aria-labelledby="questions-title"
    >
      <div className="sh-wrap sh-faq__grid">
        <div>
          <ChapterLabel number="?">Good questions. Clear answers.</ChapterLabel>
          <h2 id="questions-title">
            Get the
            <br />
            <span>whole picture.</span>
          </h2>
          <p>
            A little clarity goes a long way.
            <br />
            Start here, then explore the details.
          </p>
          <Link to="/how-it-works" className="sh-text-link">
            How Slice works <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
        <div className="sh-faq__items" data-home-reveal>
          {HOME_QUESTIONS.map((item, i) => (
            <details key={item.question}>
              <summary>
                <span>0{i + 1}</span>
                <h3>{item.question}</h3>
                <ChevronDown aria-hidden="true" />
              </summary>
              <p>{item.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

export function CinematicHomepageStory() {
  const { isAuthenticated } = useSession();
  const [count, setCount] = useState(25);
  const motion = useHomeMotion();
  return (
    <div ref={motion.ref} className="slice-home">
      <Hero authenticated={isAuthenticated} />
      <nav className="sh-chapters" aria-label="Homepage chapters">
        <div className="sh-wrap">
          <a
            href="#v2-hero-scene"
            className="sh-chapters__brand"
            aria-label="Back to the introduction"
          >
            <Layers3 aria-hidden="true" />
            <span>The Slice story</span>
          </a>
          <div>
            {HOME_CHAPTERS.map((chapter, i) => (
              <a
                key={chapter.id}
                href={"#" + chapter.id}
                aria-current={motion.activeChapter === chapter.id ? "location" : undefined}
              >
                <span>0{i + 1}</span>
                {chapter.label}
              </a>
            ))}
          </div>
          <a
            href="#home-questions"
            className="sh-chapters__questions"
            aria-current={motion.activeChapter === "home-questions" ? "location" : undefined}
          >
            Questions? <ArrowDown aria-hidden="true" />
          </a>
        </div>
        <i className="sh-chapters__progress" aria-hidden="true" />
      </nav>
      <Ownership count={count} onChange={setCount} />
      <Journey reducedMotion={motion.reducedMotion} />
      <Portfolio count={count} authenticated={isAuthenticated} />
      <Marketplace />
      <CollectorInvitation authenticated={isAuthenticated} />
      <Questions />
      <section className="sh-finale" aria-labelledby="finale-title" data-home-reveal>
        <div className="sh-wrap">
          <p className="sh-eyebrow">A collector’s instinct. A new possibility.</p>
          <h2 id="finale-title">
            Make it <span>your Slice.</span>
          </h2>
          <div className="sh-actions">
            <Link to="/marketplace" className="sh-button sh-button--primary">
              Find your collectible <ArrowUpRight aria-hidden="true" />
            </Link>
            <Link
              to={isAuthenticated ? "/portfolio" : "/signup"}
              className="sh-button sh-button--quiet"
            >
              {isAuthenticated ? "Your portfolio" : "Create an account"}
              <ArrowRight aria-hidden="true" />
            </Link>
          </div>
          <div className="sh-finale__foot">
            <span>Real collectibles. Your kind of collection.</span>
            <button
              type="button"
              onClick={() => {
                document
                  .getElementById("v2-hero-scene")
                  ?.scrollIntoView({ behavior: motion.reducedMotion ? "instant" : "smooth" });
                document.getElementById("home-title")?.focus({ preventScroll: true });
              }}
            >
              Back to the beginning <ArrowUpRight aria-hidden="true" />
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
