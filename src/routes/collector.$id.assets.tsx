import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, ChevronLeft } from "lucide-react";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/collector/$id/assets")({
  head: () => ({ meta: [{ title: "Collector assets | Slice" }] }),
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
  return (
    <div className="pb-16">
      <section className="border-b border-border bg-surface/25">
        <div className="page-shell py-10 lg:py-14">
          <Link
            to="/collector/$id"
            params={{ id }}
            className="inline-flex items-center gap-2 text-sm text-subtle"
          >
            <ChevronLeft className="size-4" />
            Back to profile
          </Link>
          <p className="page-kicker mt-8">Public profile</p>
          <h1 className="page-title mt-3">{profile.data.displayName}</h1>
          <p className="mt-3 text-subtle">{profile.data.focus}</p>
        </div>
      </section>
      <section className="page-shell py-10">
        <div className="rounded-2xl border border-border bg-elevated p-8 text-center">
          <Archive className="mx-auto size-8 text-accent" aria-hidden="true" />
          <h2 className="mt-4 text-xl font-semibold">Public holding details are unavailable</h2>
          <p className="mx-auto mt-3 max-w-xl text-subtle">
            Authoritative holdings, ownership, allocation, value, and performance will be published
            only when the ownership and financial-ledger services are available.
          </p>
        </div>
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
