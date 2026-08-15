import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { isBetaEnvironment } from "@/config/environment";
import { useFeaturedAssets } from "@/queries/hooks";
import { useCurrency } from "@/currency/CurrencyProvider";

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
  const featuredQuery = useFeaturedAssets();
  const { formatMoney } = useCurrency();
  if (isBetaEnvironment) {
    const asset = featuredQuery.data?.[0];
    if (!asset) {
      return (
        <section
          className="featured-market-hero featured-market-hero--empty featured-market-hero--static-example"
          aria-label="Featured asset"
          data-static-showcase="true"
        >
          <div className="featured-market-hero__static-media">
            <img src={HOMEPAGE_FEATURED_ASSET.image} alt={HOMEPAGE_FEATURED_ASSET.title} />
            <span>Illustrative example</span>
          </div>
          <div>
            <p className="page-kicker">Static showcase example</p>
            <h2>{HOMEPAGE_FEATURED_ASSET.title}</h2>
            <p>
              This Umbreon image is a static educational example, not a live published Slice asset
              or market quote.
            </p>
            <Link to="/marketplace" className="text-link">
              View the marketplace
            </Link>
          </div>
        </section>
      );
    }
    const marketValue = asset.market?.estimatedMarketValue;
    return (
      <section
        className="featured-market-hero featured-market-hero--beta"
        aria-label="Featured asset"
      >
        <div className="featured-static-panel">
          <p className="page-kicker">Published asset</p>
          <h2 id="home-featured-heading">{asset.details.title}</h2>
          <p className="featured-static-panel__subtitle">
            {asset.grade?.label ?? asset.details.category}
          </p>
          <div className="featured-static-panel__price">
            <strong>{marketValue ? formatMoney(marketValue.amount) : "Unavailable"}</strong>
            <span>{marketValue ? "Authoritative market data" : "No reliable market data yet"}</span>
          </div>
          <p className="featured-static-panel__disclaimer">
            Values and availability are shown only when backed by published Slice data.
          </p>
          <Link to="/asset/$id" params={{ id: asset.slug ?? asset.id }} className="text-link">
            View asset <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>
    );
  }
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
            alt={featured.title}
            decoding="async"
          />
          <div className="featured-showcase__pedestal" aria-hidden="true" />
          <div className="featured-showcase__badge" aria-hidden="true">
            <span>
              <b>Slice</b>
              <small>showcase</small>
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
            &pound;1.95K
          </span>
          <span className="featured-static-panel__price-label featured-static-panel__price-label--upper-middle">
            &pound;1.90K
          </span>
          <span className="featured-static-panel__price-label featured-static-panel__price-label--middle">
            &pound;1.85K
          </span>
          <span className="featured-static-panel__price-label featured-static-panel__price-label--low">
            &pound;1.80K
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
            <dt>Shares available</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.availableShares}</dd>
          </div>
          <div>
            <dt>Share price</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.sharePrice}</dd>
          </div>
          <div>
            <dt>Minimum purchase</dt>
            <dd>{HOMEPAGE_OWNERSHIP_EXAMPLE.minimumPurchase}</dd>
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
