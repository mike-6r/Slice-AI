import { Link } from "@tanstack/react-router";
import { ArrowRight, Box, Sparkles, UsersRound } from "lucide-react";
import type { CollectorProfile, CollectorPublishedListing } from "@/domain";
import { useCurrency } from "@/currency/CurrencyProvider";
import { collectorCategoryLabel, collectorSpecialties } from "./collector-specialties";

export function CollectorAvatar({
  collector,
  featured = false,
}: {
  collector: CollectorProfile;
  featured?: boolean;
}) {
  const initials = collector.displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
  return (
    <span className={`collector-avatar${featured ? " is-featured" : ""}`} aria-hidden="true">
      {collector.avatarUrl ? <img src={collector.avatarUrl} alt="" /> : initials || "S"}
    </span>
  );
}

function AssetMedia({
  listing,
  compact = false,
}: {
  listing: CollectorPublishedListing;
  compact?: boolean;
}) {
  const media =
    listing.media?.find((item) => item.slot.toLowerCase() === "front") ?? listing.media?.[0];
  return media ? (
    <img
      src={media.url}
      alt={media.alt}
      loading="lazy"
      onError={(event) => {
        event.currentTarget.hidden = true;
        event.currentTarget.parentElement?.classList.add("is-missing");
      }}
    />
  ) : (
    <Box aria-label={compact ? "Published media unavailable" : "No published media"} />
  );
}

export function CollectorAssetPreview({
  listing,
  compact = false,
}: {
  listing: CollectorPublishedListing;
  compact?: boolean;
}) {
  const { formatMoney } = useCurrency();
  const price = listing.preSale
    ? formatMoney(listing.preSale.pricePerUnitMinor, listing.preSale.currency)
    : listing.estimatedMarketValue
      ? formatMoney(listing.estimatedMarketValue.amount, listing.estimatedMarketValue.currency)
      : null;
  const state = listing.preSale ? "PRE-SALE" : "LIVE";
  return (
    <Link
      to="/asset/$id"
      params={{ id: listing.slug }}
      className={compact ? "collector-mini-holding" : "featured-holding-card"}
      aria-label={`View ${listing.title}`}
    >
      {compact ? (
        <>
          <span className="collector-mini-holding__media">
            <AssetMedia listing={listing} compact />
          </span>
          <span className="collector-mini-holding__copy">
            <strong>{listing.title}</strong>
            <small>{price ?? listing.grade ?? collectorCategoryLabel(listing.category)}</small>
            <em className={listing.preSale ? "is-presale" : "is-live"}>{state}</em>
          </span>
        </>
      ) : (
        <>
          <div className="featured-holding-media">
            <AssetMedia listing={listing} />
          </div>
          <div className="featured-holding-copy">
            <h4>{listing.title}</h4>
            <p>{listing.grade ?? listing.variant ?? collectorCategoryLabel(listing.category)}</p>
            <div>
              <strong>{price ?? "Value unavailable"}</strong>
              <span className={listing.preSale ? "is-presale" : "is-live"}>{state}</span>
            </div>
          </div>
        </>
      )}
    </Link>
  );
}

export function FeaturedCollector({ collector }: { collector: CollectorProfile }) {
  const listings = collector.featuredPreviewAssets?.length
    ? collector.featuredPreviewAssets
    : (collector.publishedListings ?? []);
  const specialties = collectorSpecialties(collector);
  const count = collector.publishedListingCount ?? listings.length;
  return (
    <article className="featured-collector-card collectors-featured-card">
      <div className="collectors-featured-card__topline">
        <span className="collectors-status-pill">
          <Sparkles aria-hidden="true" /> Featured collector
        </span>
        <span className="collectors-featured-card__index">Collector profile</span>
      </div>
      <div className="featured-collector-identity">
        <CollectorAvatar collector={collector} featured />
        <div className="featured-collector-identity__copy">
          <h2>
            <span>{collector.displayName}</span>
          </h2>
          <strong>@{collector.handle}</strong>
          <p>{collector.featuredCaption || collector.focus || "Collector profile"}</p>
        </div>
      </div>
      {specialties.length > 0 && (
        <div className="collector-specialty-chips" aria-label="Collector specialities">
          {specialties.slice(0, 4).map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}
      <dl className="featured-collector-stats has-4-stats">
        <div>
          <dt>Published</dt>
          <dd>{count}</dd>
        </div>
        <div>
          <dt>Live</dt>
          <dd>
            {collector.liveListingCount ?? listings.filter((listing) => !listing.preSale).length}
          </dd>
        </div>
        <div>
          <dt>Pre-Sale</dt>
          <dd>
            {collector.preSaleListingCount ??
              listings.filter((listing) => Boolean(listing.preSale)).length}
          </dd>
        </div>
        <div>
          <dt>Since</dt>
          <dd>{collector.publicSince ? new Date(collector.publicSince).getFullYear() : "—"}</dd>
        </div>
      </dl>
      {listings.length > 0 ? (
        <div className="featured-holdings">
          <div className="collectors-section-label-row">
            <h3>From the catalogue</h3>
            <span>{listings.length > 3 ? `+${listings.length - 3} more` : "Published assets"}</span>
          </div>
          <div className="featured-holdings-grid">
            {listings.slice(0, 3).map((listing) => (
              <CollectorAssetPreview key={listing.assetId} listing={listing} />
            ))}
          </div>
        </div>
      ) : (
        <div className="featured-collector-empty-preview">
          <Box aria-hidden="true" />
          <div>
            <strong>Catalogue in progress</strong>
            <p>This Collector has not published any collectibles yet.</p>
          </div>
        </div>
      )}
      <div className="featured-collector-actions">
        <Link
          to="/collector/$id"
          search={{
            tab: "catalogue",
            status: "all",
            q: "",
            category: "all",
            sort: "recent",
            page: 1,
          }}
          params={{ id: collector.handle }}
          className="featured-assets-link"
        >
          View profile <ArrowRight aria-hidden="true" />
        </Link>
        <Link to="/collector/$id/assets" params={{ id: collector.handle }} className="featured-assets-link">
          View all assets <ArrowRight aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

export function CollectorDiscoveryPanel({ collectors }: { collectors: CollectorProfile[] }) {
  const listings = collectors.flatMap((collector) => collector.publishedListings ?? []).slice(0, 4);
  return (
    <aside className="collector-discovery-panel collectors-directory-note">
      <div className="collectors-directory-note__icon" aria-hidden="true">
        <UsersRound />
      </div>
      <p className="collectors-kicker">Collector directory</p>
      <h2>See the people behind the collections.</h2>
      <p>
        Explore active Collector accounts, their published catalogue, and the categories they know
        best.
      </p>
      <dl className="collector-discovery-summary">
        <div>
          <dt>Profiles shown</dt>
          <dd>{collectors.length}</dd>
        </div>
        <div>
          <dt>Assets shared</dt>
          <dd>{listings.length ? "Real" : "—"}</dd>
        </div>
      </dl>
      <Link to="/marketplace" className="featured-assets-link">
        Browse the marketplace <ArrowRight aria-hidden="true" />
      </Link>
    </aside>
  );
}

export function CollectorCard({
  collector,
  toneIndex = 0,
}: {
  collector: CollectorProfile;
  toneIndex?: number;
}) {
  const listings = collector.publishedListings ?? [];
  const specialties = collectorSpecialties(collector);
  const count = collector.publishedListingCount ?? listings.length;
  return (
    <article
      className={`collector-directory-card is-tone-${toneIndex % 4}${collector.isFeatured ? " is-featured" : ""}`}
    >
      {collector.isFeatured ? (
        <span className="collector-featured-badge">
          <Sparkles aria-hidden="true" /> Featured
        </span>
      ) : null}
      <header>
        <CollectorAvatar collector={collector} />
        <div className="collector-card-identity">
          <Link
            to="/collector/$id"
            search={{
              tab: "catalogue",
              status: "all",
              q: "",
              category: "all",
              sort: "recent",
              page: 1,
            }}
            params={{ id: collector.handle }}
          >
            {collector.displayName}
          </Link>
          <small>@{collector.handle}</small>
        </div>
        <span className="collector-public-status">
          <UsersRound aria-hidden="true" /> Active Collector
        </span>
      </header>
      <div className="collector-profile-copy">
        <strong>{collector.focus || "Public collector profile"}</strong>
        <p>
          {specialties.length > 0 ? specialties.slice(0, 3).join(" · ") : "Published catalogue"}
        </p>
        {collector.latestPublicListingAt ? (
          <small>
            Latest listing {new Date(collector.latestPublicListingAt).toLocaleDateString()}
          </small>
        ) : null}
      </div>
      <dl className="collector-directory-stats">
        <div>
          <dt>Published</dt>
          <dd>{count}</dd>
        </div>
        <div>
          <dt>Live</dt>
          <dd>
            {collector.liveListingCount ?? listings.filter((listing) => !listing.preSale).length}
          </dd>
        </div>
        <div>
          <dt>Pre-Sale</dt>
          <dd>
            {collector.preSaleListingCount ??
              listings.filter((listing) => Boolean(listing.preSale)).length}
          </dd>
        </div>
        <div>
          <dt>Since</dt>
          <dd>{collector.publicSince ? new Date(collector.publicSince).getFullYear() : "—"}</dd>
        </div>
      </dl>
      {listings.length > 0 ? (
        <div
          className="collector-card-listings"
          aria-label={`${collector.displayName} published collectibles`}
        >
          <div className="collector-card-listings__heading">
            <span>{collector.isFeatured ? "Featured assets" : "Published assets"}</span>
            <small>{count} listed</small>
          </div>
          <div className={`collector-mini-strip${listings.length === 1 ? " is-single" : ""}`}>
            {listings.slice(0, 3).map((listing) => (
              <CollectorAssetPreview key={listing.assetId} listing={listing} compact />
            ))}
            {count > 3 ? <span className="collector-more-assets">+{count - 3} more</span> : null}
          </div>
        </div>
      ) : (
        <p className="collector-card-empty">Published previews unavailable.</p>
      )}
      <footer className="collector-card-footer">
        <Link
          to="/collector/$id"
          search={{
            tab: "catalogue",
            status: "all",
            q: "",
            category: "all",
            sort: "recent",
            page: 1,
          }}
          params={{ id: collector.handle }}
          className="collector-card-profile-link"
        >
          View profile <ArrowRight aria-hidden="true" />
        </Link>
        <Link
          to="/collector/$id/assets"
          params={{ id: collector.handle }}
          className="collector-card-assets-link"
        >
          View all {count} assets <ArrowRight aria-hidden="true" />
        </Link>
      </footer>
    </article>
  );
}

export function PublicCollectorAssetCard({ listing }: { listing: CollectorPublishedListing }) {
  const { formatMoney } = useCurrency();
  const isPreSale = Boolean(listing.preSale);
  const price = isPreSale
    ? formatMoney(listing.preSale!.pricePerUnitMinor, listing.preSale!.currency)
    : listing.estimatedMarketValue
      ? formatMoney(listing.estimatedMarketValue.amount, listing.estimatedMarketValue.currency)
      : "—";
  const ownership = listing.preSale?.sliceOwnershipPercentageBps;
  const available = listing.preSale?.availableUnits;
  const offered = listing.preSale?.offeredUnits;
  const progress =
    offered && Number(offered) > 0
      ? Math.min(100, (Number(listing.preSale?.reservedUnits ?? 0) / Number(offered)) * 100)
      : 0;
  return (
    <Link to="/asset/$id" params={{ id: listing.slug }} className="public-collector-asset-card">
      <div className="public-collector-asset-media">
        <AssetMedia listing={listing} />
        <span className={`public-collector-asset-badge ${isPreSale ? "is-presale" : "is-live"}`}>
          {isPreSale ? "PRE-SALE" : "LIVE"}
        </span>
      </div>
      <div className="public-collector-asset-copy">
        <p>{isPreSale ? "Pre-Sale" : "Market Live"}</p>
        <h3>{listing.title}</h3>
        <small>
          {[
            listing.year,
            listing.variant,
            listing.cardNumber ? `#${listing.cardNumber}` : null,
            listing.grade,
          ]
            .filter(Boolean)
            .join(" · ") || collectorCategoryLabel(listing.category)}
        </small>
        <strong>
          {price}
          {isPreSale ? " / Slice" : ""}
        </strong>
        {ownership !== undefined ? (
          <span className="public-collector-asset-ownership">
            {(ownership / 100).toFixed(2)}% ownership per Slice
          </span>
        ) : null}
        {isPreSale ? (
          <>
            <div
              className="public-collector-asset-progress"
              aria-label={`${progress.toFixed(0)}% reserved`}
            >
              <span style={{ width: `${progress}%` }} />
            </div>
            <span className="public-collector-asset-availability">
              {listing.preSale!.reservedUnits} / {listing.preSale!.offeredUnits} reserved
              <em>{available} available</em>
            </span>
          </>
        ) : null}
        <span className={`public-collector-asset-state ${isPreSale ? "is-presale" : "is-live"}`}>
          <i /> {isPreSale ? "Awaiting intake" : "Live on market"}
        </span>
        <span className="public-collector-asset-cta">
          View collectible <ArrowRight aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
