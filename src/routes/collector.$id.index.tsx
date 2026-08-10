import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BadgeCheck } from "lucide-react";
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
  return (
    <div className="pb-16">
      <section className="border-b border-border bg-surface/25">
        <div className="page-shell py-10 lg:py-14">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-positive/20 bg-positive/8 px-3 py-1.5 text-xs font-semibold text-positive">
            <BadgeCheck className="size-4" aria-hidden="true" />
            Public profile
          </span>
          <h1 className="mt-4 font-display text-4xl font-bold">{collector.displayName}</h1>
          <p className="mt-3 max-w-2xl text-subtle">{collector.focus}</p>
          <p className="mt-6 text-sm text-subtle">
            This public profile does not publish authoritative holdings, portfolio values, or
            performance.
          </p>
        </div>
      </section>
    </div>
  );
}
