import { Link } from "@tanstack/react-router";
import { ArrowUpRight, ImageOff, Layers3, Sparkles } from "lucide-react";
import { useState } from "react";
import type { CollectorProfile, CollectorPublishedListing } from "@/domain";
import { useCurrency } from "@/currency/CurrencyProvider";
import { collectorCategoryLabel, collectorSpecialties } from "./collector-specialties";
import {
  collectorInitials,
  collectorPreviewListings,
  collectorProfileSearch,
} from "./directory-presentation";

export function DiscoveryAvatar({ collector }: { collector: CollectorProfile }) {
  const [failedUrl, setFailedUrl] = useState<string>();
  return (
    <span className="cn-avatar" aria-hidden="true">
      {collector.avatarUrl && failedUrl !== collector.avatarUrl ? (
        <img
          src={collector.avatarUrl}
          alt=""
          loading="lazy"
          onError={() => setFailedUrl(collector.avatarUrl ?? undefined)}
        />
      ) : (
        collectorInitials(collector.displayName)
      )}
    </span>
  );
}

export function CollectorArtwork({
  listing,
  priority = false,
}: {
  listing: CollectorPublishedListing;
  priority?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string>();
  const media =
    listing.media?.find((item) => item.slot.toLowerCase() === "front") ?? listing.media?.[0];
  return media?.url && failedUrl !== media.url ? (
    <img
      src={media.url}
      alt={media.alt || listing.title}
      loading={priority ? "eager" : "lazy"}
      decoding="async"
      onError={() => setFailedUrl(media.url)}
    />
  ) : (
    <span className="cn-artwork-missing">
      <ImageOff aria-hidden="true" />
      <span>Image unavailable</span>
    </span>
  );
}

function DiscoveryAsset({ listing }: { listing: CollectorPublishedListing }) {
  const { formatMoney } = useCurrency();
  const price = listing.preSale
    ? formatMoney(listing.preSale.pricePerUnitMinor, listing.preSale.currency)
    : listing.marketPricePerSlice
      ? formatMoney(listing.marketPricePerSlice.amount, listing.marketPricePerSlice.currency)
      : null;
  return (
    <Link
      to="/asset/$id"
      params={{ id: listing.slug }}
      className="cn-asset"
      aria-label={`Explore ${listing.title}`}
    >
      <div className="cn-asset-art">
        <span className={`cn-availability ${listing.preSale ? "is-presale" : "is-live"}`}>
          <i aria-hidden="true" />
          {listing.preSale ? "Pre-sale" : "Market live"}
        </span>
        <CollectorArtwork listing={listing} />
        {listing.dataStatus === "DEMO" ? <span className="cn-demo-label">Demo</span> : null}
      </div>
      <div className="cn-asset-caption">
        <strong>{listing.title}</strong>
        <span>
          {[listing.grade, listing.year ?? collectorCategoryLabel(listing.category)]
            .filter(Boolean)
            .join(" · ")}
        </span>
        <div>
          <small>{price ? "Per Slice" : "Explore asset"}</small>
          <b>{price ?? <ArrowUpRight aria-hidden="true" />}</b>
        </div>
      </div>
    </Link>
  );
}

export function CollectorDiscoveryCard({ collector }: { collector: CollectorProfile }) {
  const listings = collectorPreviewListings(collector);
  const specialties = collectorSpecialties(collector);
  const count = collector.publishedListingCount ?? listings.length;
  const focus = ["Collector profile", "Public collector profile", ""].includes(
    collector.focus.trim(),
  )
    ? "Explore this collector’s published catalogue and find your next collectible to look into."
    : collector.focus;
  return (
    <article className="cn-collector-card" aria-label={`${collector.displayName} collection`}>
      <div className="cn-collector-copy">
        <div className="cn-card-topline">
          <span className="cn-eyebrow">The collector</span>
          {collector.isFeatured ? (
            <span className="cn-featured">
              <Sparkles aria-hidden="true" /> Featured
            </span>
          ) : null}
        </div>
        <header className="cn-collector-identity">
          <DiscoveryAvatar collector={collector} />
          <div>
            <h3>
              <Link
                to="/collector/$id"
                params={{ id: collector.handle }}
                search={collectorProfileSearch}
              >
                {collector.displayName}
              </Link>
            </h3>
            <span>@{collector.handle}</span>
          </div>
        </header>
        <p className="cn-collector-focus">{focus}</p>
        {specialties.length ? (
          <div className="cn-specialties" aria-label="Collector specialties">
            {specialties.slice(0, 3).map((specialty) => (
              <span key={specialty}>{specialty}</span>
            ))}
            {specialties.length > 3 ? <span>+{specialties.length - 3}</span> : null}
          </div>
        ) : null}
        <dl className="cn-card-stats">
          <div>
            <dt>Published {count === 1 ? "asset" : "assets"}</dt>
            <dd>{count.toLocaleString("en-GB")}</dd>
          </div>
          {collector.preSaleListingCount !== undefined ? (
            <div>
              <dt>Pre-sale</dt>
              <dd>{collector.preSaleListingCount.toLocaleString("en-GB")}</dd>
            </div>
          ) : null}
          {collector.liveListingCount !== undefined ? (
            <div>
              <dt>Market live</dt>
              <dd>{collector.liveListingCount.toLocaleString("en-GB")}</dd>
            </div>
          ) : null}
        </dl>
        <div className="cn-card-actions">
          <Link
            to="/collector/$id"
            params={{ id: collector.handle }}
            search={collectorProfileSearch}
            className="cn-button cn-button--primary"
          >
            View collector <ArrowUpRight aria-hidden="true" />
          </Link>
          <Link
            to="/collector/$id/assets"
            params={{ id: collector.handle }}
            className="cn-text-link"
          >
            Full catalogue <ArrowUpRight aria-hidden="true" />
          </Link>
        </div>
      </div>
      <div className="cn-collector-catalogue">
        <div className="cn-catalogue-heading">
          <span>
            <Layers3 aria-hidden="true" /> From the collection
          </span>
          <small>
            {listings.length
              ? `${Math.min(2, listings.length)} of ${Math.max(count, listings.length)}`
              : "Public catalogue"}
          </small>
        </div>
        {listings.length ? (
          <div className="cn-asset-pair">
            {listings.slice(0, 2).map((listing) => (
              <DiscoveryAsset listing={listing} key={listing.assetId} />
            ))}
          </div>
        ) : (
          <div className="cn-preview-empty">
            <Layers3 aria-hidden="true" />
            <p>Preview unavailable</p>
            <span>Open the collector’s catalogue to see their published assets.</span>
          </div>
        )}
      </div>
    </article>
  );
}

export function CollectorSpotlight({
  collector,
  loading,
}: {
  collector?: CollectorProfile;
  loading: boolean;
}) {
  const listings = collector ? collectorPreviewListings(collector).slice(0, 3) : [];
  return (
    <aside
      className={`cn-spotlight${loading ? " is-loading" : ""}`}
      aria-label="A collection from the Slice directory"
      aria-busy={loading}
    >
      <div className="cn-spotlight-top">
        <span className="cn-eyebrow">
          {collector?.isFeatured ? "Collector spotlight" : "A world worth collecting"}
        </span>
        <span className="cn-spotlight-mark">
          <Layers3 aria-hidden="true" /> SLICE / COLLECTIONS
        </span>
      </div>
      <div className={`cn-gallery cn-gallery--${listings.length}`}>
        {listings.length ? (
          listings.map((listing) => (
            <Link
              key={listing.assetId}
              to="/asset/$id"
              params={{ id: listing.slug }}
              className="cn-gallery-item"
              aria-label={`View ${listing.title}`}
            >
              <CollectorArtwork listing={listing} priority />
              <span>{listing.title}</span>
              {listing.dataStatus === "DEMO" ? <b className="cn-demo-label">Demo</b> : null}
            </Link>
          ))
        ) : (
          <div className="cn-gallery-placeholder">
            <Layers3 aria-hidden="true" />
            <span>
              {loading ? "Opening the collection…" : "Every collection starts with a story."}
            </span>
          </div>
        )}
      </div>
      <div className="cn-spotlight-footer">
        {collector ? (
          <>
            <DiscoveryAvatar collector={collector} />
            <div>
              <span>From the collection of</span>
              <Link
                to="/collector/$id"
                params={{ id: collector.handle }}
                search={collectorProfileSearch}
              >
                {collector.displayName}
              </Link>
            </div>
            <Link
              to="/collector/$id"
              params={{ id: collector.handle }}
              search={collectorProfileSearch}
              className="cn-circle-link"
              aria-label={`Explore ${collector.displayName}'s collection`}
            >
              <ArrowUpRight aria-hidden="true" />
            </Link>
          </>
        ) : (
          <>
            <span className="cn-placeholder-icon">
              <Layers3 aria-hidden="true" />
            </span>
            <p>
              Explore a collector’s profile.
              <br />
              <strong>See the story. Discover the assets.</strong>
            </p>
          </>
        )}
      </div>
    </aside>
  );
}
