import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";

import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
  showcaseDestination,
  type HomepageShowcaseAsset,
} from "@/data/homepage-showcase";

/**
 * Editorial homepage showcase. This is a clearly static visual module; it
 * intentionally does not consume or imply a live public-market quote.
 */
export function FeaturedMarketHero() {
  const featured = HOMEPAGE_FEATURED_ASSET;
  return (
    <section
      className="featured-market-hero"
      aria-label="Featured asset showcase"
      data-static-showcase="true"
    >
      <ShowcaseLink asset={featured} className="featured-showcase">
        <div className="featured-showcase__surface">
          <img
            className="featured-showcase__image"
            src={featured.image}
            alt="PSA-graded 1999 Charizard Base Set Holo card"
            decoding="async"
          />
          <div className="featured-showcase__pedestal" aria-hidden="true" />
          <div className="featured-showcase__badge" aria-hidden="true">
            <span>
              <b>Slice</b>
              <small>public</small>
            </span>
            <span>
              <b>10</b>
              <small>status</small>
            </span>
          </div>
        </div>
      </ShowcaseLink>

      <ShowcaseLink asset={featured} className="featured-static-panel">
        <p className="page-kicker">Featured asset</p>
        <h2 id="home-featured-heading">{featured.title}</h2>
        <p className="featured-static-panel__subtitle">{featured.grade}</p>

        <div className="featured-static-panel__price">
          <strong>{featured.displayPrice}</strong>
          <span>
            {featured.displayMovement} <small>(24H)</small>
          </span>
        </div>

        <div
          className="featured-static-panel__chart"
          role="img"
          aria-label="Illustrative upward 30-day featured asset value chart"
        >
          <svg viewBox="0 0 360 112" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <linearGradient id="featured-chart-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22d3a5" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#22d3a5" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d="M0 88 L16 92 L31 86 L46 94 L61 89 L77 77 L92 82 L108 71 L123 66 L138 67 L154 63 L169 51 L185 48 L200 39 L215 42 L231 44 L246 54 L262 57 L277 49 L292 38 L308 37 L323 27 L338 26 L360 10 L360 112 L0 112 Z"
              fill="url(#featured-chart-fill)"
            />
            <path
              d="M0 88 L16 92 L31 86 L46 94 L61 89 L77 77 L92 82 L108 71 L123 66 L138 67 L154 63 L169 51 L185 48 L200 39 L215 42 L231 44 L246 54 L262 57 L277 49 L292 38 L308 37 L323 27 L338 26 L360 10"
              fill="none"
              stroke="#22d3a5"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2.25"
            />
            <circle cx="360" cy="10" r="3.2" fill="#22d3a5" />
          </svg>
          <span className="featured-static-panel__price-label featured-static-panel__price-label--high">
            &pound;25K
          </span>
          <span className="featured-static-panel__price-label featured-static-panel__price-label--upper-middle">
            &pound;24K
          </span>
          <span className="featured-static-panel__price-label featured-static-panel__price-label--middle">
            &pound;22K
          </span>
          <span className="featured-static-panel__price-label featured-static-panel__price-label--low">
            &pound;21K
          </span>
        </div>

        <div className="featured-static-panel__ranges" aria-label="Static market history period">
          {["24H", "7D", "30D", "90D", "1Y", "ALL"].map((range) => (
            <span key={range} className={range === "30D" ? "is-active" : undefined}>
              {range}
            </span>
          ))}
        </div>

        <dl className="featured-static-panel__stats">
          <div>
            <dt>Available ownership</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.availableOwnership}</dd>
          </div>
          <div>
            <dt>Share price</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.sharePrice}</dd>
          </div>
          <div>
            <dt>Minimum position</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.minimumPosition}</dd>
          </div>
        </dl>
      </ShowcaseLink>
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
