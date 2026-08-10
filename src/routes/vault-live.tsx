import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, PackageCheck } from "lucide-react";
import { formatDate } from "@/lib/format";
import { useAppServices } from "@/providers/AppServicesProvider";
export const Route = createFileRoute("/vault-live")({
  head: () => ({ meta: [{ title: "Vault Live | Slice" }] }),
  component: VaultLive,
});
function VaultLive() {
  const services = useAppServices();
  const events = useInfiniteQuery({
    queryKey: ["vault", "events"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      services.repositories.vault.getPublicEvents({ cursor: pageParam, limit: 24, signal }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const summary = useQuery({
    queryKey: ["vault", "summary"],
    queryFn: () => services.repositories.vault.getPublicSummary(),
  });
  const eventItems = events.data?.pages.flatMap((page) => page.items) ?? [];
  return (
    <div className="pb-12">
      <section className="border-b border-border bg-surface/25">
        <div className="page-shell py-12 lg:py-16">
          <p className="page-kicker">Vault Live</p>
          <h1 className="page-title mt-3">Public vault activity.</h1>
          <p className="mt-4 max-w-2xl text-subtle">
            Only public-safe event summaries are shown. Custody evidence, locations, and providers
            remain private.
          </p>
          <p className="mt-4 text-sm text-subtle">
            {summary.data
              ? `${summary.data.eventCount} public events · ${summary.data.authority}`
              : "Loading vault summary…"}
          </p>
        </div>
      </section>
      <section className="page-shell py-8">
        {events.isLoading ? (
          <p>Loading public activity…</p>
        ) : events.isError ? (
          <div>
            <p>Vault activity unavailable.</p>
            <button type="button" onClick={() => void events.refetch()}>
              Retry
            </button>
          </div>
        ) : eventItems.length ? (
          <div className="grid gap-3">
            {eventItems.map((event) => (
              <article key={event.id} className="rounded-xl border border-border bg-elevated p-4">
                <PackageCheck className="inline size-4 text-accent" aria-hidden="true" />
                <strong className="ml-2">{event.type}</strong>
                <p className="mt-2 text-sm text-subtle">{event.publicSummary}</p>
                <p className="mt-2 text-xs text-muted">
                  {event.assetSlug} · {formatDate(event.occurredAt)}
                </p>
                <Link
                  to="/asset/$id"
                  params={{ id: event.assetSlug }}
                  className="mt-3 inline-block text-sm font-semibold text-accent"
                >
                  View asset
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <div className="text-center">
            <Archive className="mx-auto size-7 text-subtle" />
            <p className="mt-3">No public vault activity is available.</p>
          </div>
        )}
        {events.hasNextPage && (
          <button
            type="button"
            className="mt-6"
            disabled={events.isFetchingNextPage}
            onClick={() => void events.fetchNextPage()}
          >
            {events.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        )}
      </section>
    </div>
  );
}
