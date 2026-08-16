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
 * landing page; the surrounding market pulse demonstrates the experience
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
        Live collectible experience
        <span>Explore ↗</span>
      </div>

      <ShowcaseLink asset={featured} className="featured-market-hero__static-media">
        <img src={featured.image} alt={featured.title} decoding="async" />
        <span>Slice showcase</span>
      </ShowcaseLink>

      <div className="charizard-showcase__copy">
        <div className="charizard-showcase__tags" aria-label="Featured collectible details">
          <span>Featured collectible</span>
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
            <span>Market pulse</span>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.referenceValue}</strong>
            <b>+8.4% · 30 days</b>
          </div>
          <div
            className="charizard-showcase__chart"
            role="img"
            aria-label="Rising market pulse over the last 30 days"
          >
            <svg viewBox="0 0 360 112" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id="charizard-pulse-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3a5" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#22d3a5" stopOpacity="0" />
                </linearGradient>
              </defs>
              <path
                d="M0 91 L22 95 L43 83 L66 89 L88 72 L110 78 L133 62 L157 68 L178 54 L202 57 L224 43 L246 47 L268 34 L292 38 L316 23 L338 26 L360 9 L360 112 L0 112 Z"
                fill="url(#charizard-pulse-fill)"
              />
              <path
                d="M0 91 L22 95 L43 83 L66 89 L88 72 L110 78 L133 62 L157 68 L178 54 L202 57 L224 43 L246 47 L268 34 L292 38 L316 23 L338 26 L360 9"
                fill="none"
                stroke="#22d3a5"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth="2.5"
              />
              <circle cx="360" cy="9" r="3.4" fill="#a7f3d0" />
            </svg>
            <span>£2.0K</span>
            <span>£1.8K</span>
          </div>
        </div>

        <div className="charizard-showcase__facts">
          <div>
            <span>Slices available</span>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.availableShares}</strong>
          </div>
          <div>
            <span>Starting at</span>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.sharePrice}</strong>
          </div>
          <div>
            <span>Minimum</span>
            <strong>1 Slice</strong>
          </div>
        </div>

        <ShowcaseLink asset={featured} className="charizard-showcase__cta">
          Explore the Slice experience <ArrowRight aria-hidden="true" />
        </ShowcaseLink>
      </div>

      <div className="charizard-showcase__stamp" aria-hidden="true">
        <CheckCircle2 />
        <span>Real collectible</span>
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
