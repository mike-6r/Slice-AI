import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
  showcaseDestination,
  type HomepageShowcaseAsset,
} from "@/data/homepage-showcase";

/**
 * Editorial homepage showcase. The card is the visual anchor for the
 * landing page; the surrounding examples demonstrate the experience
 * visitors can expect after joining Slice.
 */
export function FeaturedMarketHero() {
  const featured = HOMEPAGE_FEATURED_ASSET;

  return (
    <section
      className="featured-market-hero featured-market-hero--charizard"
      aria-labelledby="home-featured-heading"
    >
      <span className="charizard-showcase__glow" aria-hidden="true" />
      <div className="charizard-showcase__eyebrow" aria-hidden="true">
        <span>●</span>
        The Slice experience
        <span>Explore ↗</span>
      </div>

      <ShowcaseLink asset={featured} className="featured-market-hero__static-media">
        <img src={featured.image} alt={featured.title} decoding="async" />
      </ShowcaseLink>

      <div className="charizard-showcase__copy">
        <div className="charizard-showcase__tags" aria-label="Featured collectible details">
          <span>Illustrative example</span>
          <span>Demo only</span>
          <span>{featured.grade}</span>
        </div>
        <p className="page-kicker">A new way to collect</p>
        <h2 id="home-featured-heading">{featured.title}</h2>
        <p>
          Step into the Slice experience: discover a prized collectible, choose a clear ownership
          position, and follow it from one beautiful portfolio.
        </p>

        <div className="charizard-showcase__market-card">
          <div className="charizard-showcase__value">
            <span>External market reference</span>
            <strong>{featured.displayPrice}</strong>
            <b>PriceCharting PSA 10 guide · USD</b>
          </div>
          <div className="charizard-showcase__value charizard-showcase__value--slice">
            <span>Illustrative Slice offering</span>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.illustrativeValuation}</strong>
            <b>
              {HOMEPAGE_OWNERSHIP_EXAMPLE.totalSlices} · {HOMEPAGE_OWNERSHIP_EXAMPLE.slicePrice} per
              Slice
            </b>
          </div>
        </div>

        <div className="charizard-showcase__facts">
          <div>
            <span>Illustrative supply</span>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.totalSlices}</strong>
          </div>
          <div>
            <span>Price per Slice</span>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.slicePrice}</strong>
          </div>
          <div>
            <span>Example buy</span>
            <strong>25 · £250</strong>
          </div>
        </div>

        <ShowcaseLink asset={featured} className="charizard-showcase__cta">
          Explore the Slice experience <ArrowRight aria-hidden="true" />
        </ShowcaseLink>
      </div>

      <div className="charizard-showcase__stamp" aria-hidden="true">
        <CheckCircle2 />
        <span>Collectible ownership</span>
        <small>
          Clear ownership
          <br />
          Simple portfolio
        </small>
      </div>
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
  if (destination.kind === "asset") {
    return (
      <Link
        to="/asset/$id"
        params={{ id: destination.id }}
        className={`${className} featured-showcase-link`}
      >
        {children}
      </Link>
    );
  }
  return (
    <Link to={destination.to} className={`${className} featured-showcase-link`}>
      {children}
    </Link>
  );
}
