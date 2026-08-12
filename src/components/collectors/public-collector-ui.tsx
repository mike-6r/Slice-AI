import { Link } from "@tanstack/react-router";
import { ArrowRight, BadgeCheck, Box, Sparkles } from "lucide-react";
import type { CollectorProfile, CollectorPublishedListing } from "@/domain";
import { formatCurrency } from "@/lib/format";
import { assetShowcaseMedia } from "@/components/marketplace/demo-asset-media";
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
    <span className={`collector-avatar${featured ? " is-featured" : ""}`}>{initials || "S"}</span>
  );
}

function AssetMedia({ listing }: { listing: CollectorPublishedListing }) {
  const media = assetShowcaseMedia(listing.slug);
  return media ? (
    <img src={media.src} alt={media.alt} />
  ) : (
    <Box aria-label="Public media unavailable" />
  );
}

export function CollectorAssetPreview({
  listing,
  compact = false,
}: {
  listing: CollectorPublishedListing;
  compact?: boolean;
}) {
  return (
    <Link
      to="/asset/$id"
      params={{ id: listing.slug }}
      className={compact ? "collector-mini-holding" : "featured-holding-card"}
      aria-label={`View ${listing.title}`}
    >
      {compact ? (
        <>
          <AssetMedia listing={listing} />
          <span>{collectorCategoryLabel(listing.category)}</span>
        </>
      ) : (
        <>
          <div className="featured-holding-media">
            <span className="featured-holding-light" aria-hidden="true" />
            <AssetMedia listing={listing} />
          </div>
          <div className="featured-holding-copy">
            <h4>{listing.title}</h4>
            <p>{collectorCategoryLabel(listing.category)}</p>
            <div>
              <strong>
                {listing.estimatedMarketValue
                  ? formatCurrency(listing.estimatedMarketValue.amount)
                  : "Value unavailable"}
              </strong>
              <span>{listing.dataStatus ?? "Public"}</span>
            </div>
          </div>
        </>
      )}
    </Link>
  );
}

export function FeaturedCollector({ collector }: { collector: CollectorProfile }) {
  const listings = collector.publishedListings ?? [];
  const specialties = collectorSpecialties(collector);
  const categoryCount = new Set(listings.map((listing) => listing.category)).size;
  return (
    <article className="featured-collector-card">
      <span className="featured-collector-glow" aria-hidden="true" />
      <header className="featured-collector-header">
        <p className="collectors-kicker">
          <Sparkles aria-hidden="true" /> Featured collector
        </p>
      </header>
      <div className="featured-collector-identity">
        <CollectorAvatar collector={collector} featured />
        <div>
          <h2>
            {collector.displayName}
            <BadgeCheck aria-label="Public collector" />
          </h2>
          <strong>@{collector.handle}</strong>
          <p>Authenticated collectibles</p>
        </div>
      </div>
      {specialties.length > 0 && (
        <div className="collector-specialty-chips" aria-label="Collector specialities">
          {specialties.map((item) => (
            <span key={item}>{item}</span>
          ))}
        </div>
      )}
      <dl className="featured-collector-stats has-3-stats">
        <div>
          <dt>Published collectibles</dt>
          <dd>{collector.publishedListingCount ?? listings.length}</dd>
        </div>
        <div>
          <dt>Categories represented</dt>
          <dd>{categoryCount || "\u2014"}</dd>
        </div>
        <div>
          <dt>Public profile</dt>
          <dd className="is-positive">Active</dd>
        </div>
      </dl>
      {listings.length > 0 && (
        <div className="featured-holdings">
          <h3>Published collectibles</h3>
          <div className="featured-holdings-grid">
            {listings.slice(0, 3).map((listing) => (
              <CollectorAssetPreview key={listing.assetId} listing={listing} />
            ))}
          </div>
        </div>
      )}
      {listings.length === 0 && (
        <div className="featured-collector-empty-preview">
          <Box aria-hidden="true" />
          <div>
            <strong>Public catalogue in progress</strong>
            <p>This collector has not published a catalogue listing yet.</p>
          </div>
        </div>
      )}
      <Link to="/collector/$id" params={{ id: collector.handle }} className="featured-assets-link">
        View public profile <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}

export function CollectorDiscoveryPanel({ collectors }: { collectors: CollectorProfile[] }) {
  const specialties = [...new Set(collectors.flatMap(collectorSpecialties))].slice(0, 6);
  const allListings = collectors.flatMap((collector) => collector.publishedListings ?? []);
  const listings = allListings.slice(0, 3);

  return (
    <aside className="collector-discovery-panel">
      <header>
        <div>
          <p className="collectors-kicker">Discovery</p>
          <h2>Collectible expertise.</h2>
        </div>
        <Sparkles aria-hidden="true" />
      </header>
      {specialties.length > 0 && (
        <div className="collector-discovery-specialties" aria-label="Public collector specialties">
          {specialties.map((specialty) => (
            <span key={specialty}>{specialty}</span>
          ))}
        </div>
      )}
      {listings.length > 0 && (
        <div className="collector-discovery-assets" aria-label="Published collectible previews">
          {listings.map((listing) => (
            <CollectorAssetPreview key={listing.assetId} listing={listing} compact />
          ))}
        </div>
      )}
      <dl className="collector-discovery-summary">
        <div>
          <dt>Public profiles</dt>
          <dd>{collectors.length}</dd>
        </div>
        <div>
          <dt>Published collectibles</dt>
          <dd>{allListings.length}</dd>
        </div>
      </dl>
      {specialties.length === 0 && listings.length === 0 && (
        <div className="collector-discovery-empty">
          <Sparkles aria-hidden="true" />
          <div>
            <strong>Profiles are growing</strong>
            <p>Collector catalogues appear here when owners choose to publish them.</p>
          </div>
        </div>
      )}
      <Link to="/marketplace" className="featured-assets-link">
        Browse published collectibles <ArrowRight aria-hidden="true" />
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
  const categoryCount = new Set(listings.map((listing) => listing.category)).size;
  const count = collector.publishedListingCount ?? listings.length;
  return (
    <article className={`collector-profile-card is-tone-${toneIndex % 4}`}>
      <header>
        <CollectorAvatar collector={collector} />
        <div>
          <Link to="/collector/$id" params={{ id: collector.handle }}>
            {collector.displayName}
          </Link>
          <small>@{collector.handle}</small>
        </div>
        <span className="collector-public-status">
          <BadgeCheck aria-hidden="true" /> Public
        </span>
      </header>
      <div className="collector-profile-copy">
        <strong>Public collector profile</strong>
        <p>{specialties.length ? specialties.join(" \u00b7 ") : collector.focus}</p>
      </div>
      <dl className="collector-profile-stats">
        <div>
          <dt>Published</dt>
          <dd>{count}</dd>
        </div>
        <div>
          <dt>Categories</dt>
          <dd>{categoryCount || "\u2014"}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd className="is-positive">Public</dd>
        </div>
      </dl>
      {listings.length ? (
        <div
          className="collector-mini-strip"
          aria-label={`${collector.displayName} published collectibles`}
        >
          {listings.slice(0, 3).map((listing) => (
            <CollectorAssetPreview key={listing.assetId} listing={listing} compact />
          ))}
          {count > 3 && (
            <Link
              to="/collector/$id/assets"
              params={{ id: collector.handle }}
              className="collector-more-assets"
            >
              +{count - 3}
            </Link>
          )}
        </div>
      ) : (
        <p className="collector-card-empty">No published collectibles yet.</p>
      )}
      <Link
        to="/collector/$id"
        params={{ id: collector.handle }}
        className="collector-card-profile-link"
      >
        View profile <ArrowRight aria-hidden="true" />
      </Link>
    </article>
  );
}

export function PublicCollectorAssetCard({ listing }: { listing: CollectorPublishedListing }) {
  const media = assetShowcaseMedia(listing.slug);
  return (
    <Link to="/asset/$id" params={{ id: listing.slug }} className="public-collector-asset-card">
      <div className="public-collector-asset-media">
        {media ? (
          <img src={media.src} alt={media.alt} />
        ) : (
          <Box aria-label="Public media unavailable" />
        )}
      </div>
      <div>
        <p>{collectorCategoryLabel(listing.category)}</p>
        <h3>{listing.title}</h3>
        <strong>
          {listing.estimatedMarketValue
            ? formatCurrency(listing.estimatedMarketValue.amount)
            : "Value unavailable"}
        </strong>
      </div>
    </Link>
  );
}
