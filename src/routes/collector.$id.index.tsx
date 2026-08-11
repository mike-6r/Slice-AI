import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, ArrowLeft, BadgeCheck, Sparkles } from "lucide-react";
import {
  CollectorAvatar,
  PublicCollectorAssetCard,
} from "@/components/collectors/public-collector-ui";
import { collectorSpecialties } from "@/components/collectors/collector-specialties";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/collector/$id/")({
  head: () => ({ meta: [{ title: "Collector profile | Slice" }] }),
  component: CollectorPage,
});

function CollectorPage() {
  const { id } = Route.useParams();
  const services = useAppServices();
  const result = useQuery({
    queryKey: ["collector", id],
    queryFn: () => services.collectors.get(id as never),
  });
  if (result.isLoading)
    return <section className="page-shell py-12">Loading public profile…</section>;
  if (result.isError)
    return (
      <section className="page-shell py-12">
        <p>Profile unavailable.</p>
        <button type="button" onClick={() => void result.refetch()}>
          Retry
        </button>
      </section>
    );
  if (!result.data)
    return (
      <section className="page-shell py-12">
        <h1>Profile not found</h1>
        <p>This collector is private or unavailable.</p>
        <Link to="/collectors">Browse public collectors</Link>
      </section>
    );
  const collector = result.data;
  const listings = collector.publishedListings ?? [];
  const specialties = collectorSpecialties(collector);
  const categoryCount = new Set(listings.map((listing) => listing.category)).size;
  return (
    <div className="public-collector-page">
      <section className="public-collector-hero">
        <div className="collectors-shell">
          <Link to="/collectors" className="public-collector-back">
            <ArrowLeft aria-hidden="true" /> Browse collectors
          </Link>
          <div className="public-collector-identity">
            <CollectorAvatar collector={collector} featured />
            <div>
              <span>
                <BadgeCheck aria-hidden="true" /> Public collector
              </span>
              <h1>{collector.displayName}</h1>
              <p>@{collector.handle}</p>
            </div>
          </div>
          <p className="public-collector-bio">{collector.focus}</p>
          {specialties.length > 0 && (
            <div className="collector-specialty-chips">
              {specialties.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
          )}
          <dl className="public-collector-stats">
            <div>
              <dt>Published collectibles</dt>
              <dd>{collector.publishedListingCount ?? listings.length}</dd>
            </div>
            <div>
              <dt>Categories represented</dt>
              <dd>{categoryCount || "—"}</dd>
            </div>
            <div>
              <dt>Profile visibility</dt>
              <dd className="is-positive">Public</dd>
            </div>
          </dl>
        </div>
      </section>
      <section className="collectors-shell public-collector-listings">
        <div className="public-collector-section-heading">
          <div>
            <p className="collectors-kicker">Published collectibles</p>
            <h2>Catalogue available to inspect.</h2>
          </div>
          <Link to="/collector/$id/assets" params={{ id }}>
            <Sparkles aria-hidden="true" /> View all listings
          </Link>
        </div>
        {listings.length ? (
          <div className="public-collector-assets-grid">
            {listings.slice(0, 4).map((listing) => (
              <PublicCollectorAssetCard key={listing.assetId} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="mt-6 rounded-2xl border border-border bg-elevated p-8 text-center">
            <Archive className="mx-auto size-8 text-accent" aria-hidden="true" />
            <h2 className="mt-4 text-xl font-semibold">No public listings yet</h2>
            <p className="mx-auto mt-3 max-w-xl text-subtle">
              This collector has not published a catalogue listing.
            </p>
          </div>
        )}
        <p className="public-collector-privacy-note">
          This profile publishes catalogue listings only. Holdings, portfolio value, private
          submissions, operational review state, and performance are never public.
        </p>
        <section className="public-collector-activity" aria-labelledby="public-activity-heading">
          <div>
            <p className="collectors-kicker">Public activity</p>
            <h2 id="public-activity-heading">Activity stays opt-in.</h2>
          </div>
          <div className="public-collector-activity-empty">
            <Archive aria-hidden="true" />
            <div>
              <h3>No public collector activity is available.</h3>
              <p>
                Slice only shows activity when it is intentionally published through a safe public
                projection.
              </p>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
}
