import { Link } from "@tanstack/react-router";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ReactNode } from "react";

import {
  HOMEPAGE_FEATURED_ASSET,
  HOMEPAGE_FEATURED_PSA10_VALUE_MINOR_USD,
  HOMEPAGE_OWNERSHIP_EXAMPLE,
  HOMEPAGE_SLICE_SHARE_EXAMPLES,
  showcaseDestination,
  type HomepageShowcaseAsset,
} from "@/data/homepage-showcase";
import { useCurrency } from "@/currency/CurrencyProvider";

/**
 * Editorial homepage showcase. The card is the visual anchor for the
 * landing page; the surrounding examples demonstrate the experience
 * visitors can expect after joining Slice.
 */
export function FeaturedMarketHero() {
  const featured = HOMEPAGE_FEATURED_ASSET;
  const { formatMoney, formatSourceMoney } = useCurrency();
  const externalReference = formatMoney(HOMEPAGE_FEATURED_PSA10_VALUE_MINOR_USD, "USD");
  const externalSource = formatSourceMoney(HOMEPAGE_FEATURED_PSA10_VALUE_MINOR_USD, "USD");
  const sliceValuation = formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.illustrativeValuationMinor, "GBP");
  const slicePrice = formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.slicePriceMinor, "GBP");
  const exampleInvestment = formatMoney(HOMEPAGE_OWNERSHIP_EXAMPLE.exampleInvestmentMinor, "GBP");

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
            <strong>{externalReference}</strong>
            <b>PriceCharting PSA 10 guide · source {externalSource} USD</b>
          </div>
          <div className="charizard-showcase__value charizard-showcase__value--slice">
            <span>Illustrative Slice offering</span>
            <strong>{sliceValuation}</strong>
            <b>
              {HOMEPAGE_OWNERSHIP_EXAMPLE.totalSlices} · {slicePrice} per Slice
            </b>
          </div>
        </div>

        <div className="charizard-showcase__share-math" aria-label="Slice Share pricing examples">
          <div className="charizard-showcase__share-math-heading">
            <span>Simple percentage example</span>
            <strong>{HOMEPAGE_SLICE_SHARE_EXAMPLES.definition}</strong>
            <small>Collectible value ÷ 100 gives the price of one 1% Slice Share.</small>
          </div>
          <div className="charizard-showcase__share-math-examples">
            {HOMEPAGE_SLICE_SHARE_EXAMPLES.examples.map((example) => (
              <div key={example.collectibleValueMinor}>
                <span>{formatSourceMoney(example.collectibleValueMinor, "GBP")} card</span>
                <strong>
                  {formatSourceMoney(example.oneSliceSharePriceMinor, "GBP")} / Slice Share
                </strong>
                <small>{example.ownership} ownership</small>
              </div>
            ))}
          </div>
        </div>

        <div className="charizard-showcase__facts">
          <div>
            <span>Illustrative supply</span>
            <strong>{HOMEPAGE_OWNERSHIP_EXAMPLE.totalSlices}</strong>
          </div>
          <div>
            <span>Price per Slice</span>
            <strong>{slicePrice}</strong>
          </div>
          <div>
            <span>Example buy</span>
            <strong>25 · {exampleInvestment}</strong>
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
