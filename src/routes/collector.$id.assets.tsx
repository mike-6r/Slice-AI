import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, ChevronLeft } from "lucide-react";
import { PublicCollectorAssetCard } from "@/components/collectors/public-collector-ui";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/collector/$id/assets")({
  head: () => ({ meta: [{ title: "Collector listings | Slice" }] }),
  component: CollectorAssets,
});

function CollectorAssets() {
  const { id } = Route.useParams();
  const services = useAppServices();
  const profile = useQuery({
    queryKey: ["collector", id],
    queryFn: () => services.collectors.get(id as never),
  });
  if (profile.isLoading)
    return <PageState title="Loading public profile" description="Fetching collector details." />;
  if (profile.isError)
    return (
      <PageState
        title="Profile unavailable"
        description="We could not load this public profile."
        retry={() => void profile.refetch()}
      />
    );
  if (!profile.data)
    return (
      <PageState
        title="Profile not found"
        description="This collector is private or unavailable."
      />
    );
  const listings = profile.data.publishedListings ?? [];
  return (
    <div className="public-collector-page">
      <section className="public-collector-hero is-listings">
        <div className="collectors-shell">
          <Link to="/collector/$id" params={{ id }} className="public-collector-back">
            <ChevronLeft aria-hidden="true" /> Back to profile
          </Link>
          <p className="collectors-kicker">Public collector listings</p>
          <h1>{profile.data.displayName}</h1>
          <p>Published catalogue listings only—never private holdings or workflow records.</p>
        </div>
      </section>
      <section className="collectors-shell public-collector-listings">
        {listings.length ? (
          <div className="public-collector-assets-grid">
            {listings.map((listing) => (
              <PublicCollectorAssetCard key={listing.assetId} listing={listing} />
            ))}
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-elevated p-8 text-center">
            <Archive className="mx-auto size-8 text-accent" />
            <h2 className="mt-4 text-xl font-semibold">No public listings yet</h2>
          </div>
        )}
      </section>
    </div>
  );
}

function PageState({
  title,
  description,
  retry,
}: {
  title: string;
  description: string;
  retry?: () => void;
}) {
  return (
    <section className="page-shell py-12">
      <h1 className="page-title">{title}</h1>
      <p className="mt-3 text-subtle">{description}</p>
      {retry && (
        <button type="button" className="mt-4" onClick={retry}>
          Retry
        </button>
      )}
    </section>
  );
}
