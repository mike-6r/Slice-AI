import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArrowLeft, ArrowRight, ChevronLeft } from "lucide-react";
import { PublicCollectorAssetCard } from "@/components/collectors/public-collector-ui";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/collector/$id/assets")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(search.page !== undefined
      ? { page: Math.max(1, Math.min(10_000, Number(search.page) || 1)) }
      : {}),
  }),
  head: () => ({ meta: [{ title: "Collector listings | Slice" }] }),
  component: CollectorAssets,
});

function CollectorAssets() {
  const { id } = Route.useParams();
  const { page = 1 } = Route.useSearch();
  const navigate = useNavigate({ from: "/collector/$id/assets" });
  const services = useAppServices();
  const profile = useQuery({
    queryKey: ["collector", id, "assets", page],
    queryFn: () => services.collectors.get(id as never, { page, pageSize: 12 }),
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
  const pagination = profile.data.assetPagination;
  return (
    <div className="public-collector-page">
      <section className="public-collector-hero is-listings">
        <div className="collectors-shell">
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
            params={{ id }}
            className="public-collector-back"
          >
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
        {pagination && pagination.totalPages > 1 ? (
          <nav className="collectors-pagination" aria-label="Collector listings pagination">
            <button
              type="button"
              disabled={!pagination.hasPreviousPage}
              onClick={() => void navigate({ search: { page: Math.max(1, page - 1) } })}
            >
              <ArrowLeft aria-hidden="true" /> Previous
            </button>
            <span>
              Page {pagination.page} of {pagination.totalPages}
            </span>
            <button
              type="button"
              disabled={!pagination.hasNextPage}
              onClick={() => void navigate({ search: { page: page + 1 } })}
            >
              Next <ArrowRight aria-hidden="true" />
            </button>
          </nav>
        ) : null}
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
