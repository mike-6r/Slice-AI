import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Search, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/collectors")({
  head: () => ({ meta: [{ title: "Collectors | Slice" }] }),
  component: CollectorsPage,
});
export function CollectorSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <label className="collectors-search">
      <Search aria-hidden="true" />
      <span className="sr-only">Search collectors</span>
      <input
        aria-label="Search public collectors"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Search collectors"
      />
    </label>
  );
}

function CollectorsPage() {
  const services = useAppServices();
  const [query, setQuery] = useState("");
  const result = useInfiniteQuery({
    queryKey: ["collectors"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      services.repositories.collectors.listPublicCollectors({
        cursor: pageParam,
        limit: 24,
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const collectors = useMemo(
    () =>
      (result.data?.pages.flatMap((page) => page.items) ?? []).filter((collector) =>
        `${collector.displayName} ${collector.handle} ${collector.focus}`
          .toLowerCase()
          .includes(query.trim().toLowerCase()),
      ),
    [result.data, query],
  );
  return (
    <div className="collectors-page">
      <section className="collectors-shell collectors-hero">
        <div className="collectors-hero-copy">
          <p className="collectors-kicker">Collectors</p>
          <h1>
            Expertise you
            <br />
            can inspect.
          </h1>
          <p>
            Only collectors who choose to publish a profile are shown. Holdings and performance are
            not available in this build.
          </p>
        </div>
        <div className="collectors-hero-metrics">
          <article className="collectors-metric-card is-emerald">
            <span className="collectors-metric-label">Public profiles</span>
            <strong>{collectors.length}</strong>
            <UserRoundCheck aria-hidden="true" />
          </article>
        </div>
      </section>
      <section className="collectors-shell collectors-filter-bar">
        <CollectorSearch query={query} onQueryChange={setQuery} />
      </section>
      <section className="collectors-shell">
        {result.isLoading ? (
          <p>Loading public collector profiles…</p>
        ) : result.isError ? (
          <div>
            <p>Collectors are unavailable.</p>
            <button type="button" onClick={() => void result.refetch()}>
              Retry
            </button>
          </div>
        ) : collectors.length ? (
          <div className="collectors-grid">
            {collectors.map((collector) => (
              <article key={collector.userId} className="collector-card">
                <p className="collector-card-handle">@{collector.handle}</p>
                <h2>{collector.displayName}</h2>
                <p>{collector.focus}</p>
                <p className="text-sm text-subtle">Public profile only · holdings unavailable</p>
                <Link to="/collector/$id" params={{ id: collector.handle }}>
                  View profile
                </Link>
              </article>
            ))}
          </div>
        ) : (
          <p>No public collector profiles match your search.</p>
        )}
      </section>
      {result.hasNextPage && (
        <section className="collectors-shell pb-8">
          <button
            type="button"
            disabled={result.isFetchingNextPage}
            onClick={() => void result.fetchNextPage()}
          >
            {result.isFetchingNextPage ? "Loading…" : "Load more"}
          </button>
        </section>
      )}
    </div>
  );
}
