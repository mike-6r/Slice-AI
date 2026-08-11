import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { Archive, Search, Sparkles, Tags, UserRoundCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { CollectorCard, FeaturedCollector } from "@/components/collectors/public-collector-ui";
import { collectorSpecialties } from "@/components/collectors/collector-specialties";
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
  const [specialty, setSpecialty] = useState("All collectors");
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
  const allCollectors = useMemo(
    () => result.data?.pages.flatMap((page) => page.items) ?? [],
    [result.data],
  );
  const specialties = useMemo(
    () =>
      [...new Set(allCollectors.flatMap(collectorSpecialties))].sort((left, right) =>
        left.localeCompare(right),
      ),
    [allCollectors],
  );
  const collectors = useMemo(
    () =>
      allCollectors.filter(
        (collector) =>
          `${collector.displayName} ${collector.handle} ${collector.focus}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()) &&
          (specialty === "All collectors" || collectorSpecialties(collector).includes(specialty)),
      ),
    [allCollectors, query, specialty],
  );
  const featured =
    collectors.find((collector) => collector.handle === "slice-demo-collector") ?? collectors[0];
  const publishedCount = allCollectors.reduce(
    (count, collector) => count + (collector.publishedListingCount ?? 0),
    0,
  );
  const categoryCount = new Set(
    allCollectors.flatMap((collector) =>
      (collector.publishedListings ?? []).map((listing) => listing.category),
    ),
  ).size;

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
            Only collectors who choose to publish a profile are shown. Public profiles highlight
            collectible expertise and published marketplace activity.
          </p>
        </div>
        <div className="collectors-hero-metrics">
          <article className="collectors-metric-card is-emerald">
            <span className="collectors-metric-label">Visible public profiles</span>
            <strong>{allCollectors.length}</strong>
            <UserRoundCheck aria-hidden="true" />
          </article>
          <article className="collectors-metric-card is-violet">
            <span className="collectors-metric-label">Published collectibles</span>
            <strong>{publishedCount}</strong>
            <Archive aria-hidden="true" />
          </article>
          <article className="collectors-metric-card is-amber">
            <span className="collectors-metric-label">Categories represented</span>
            <strong>{categoryCount}</strong>
            <Tags aria-hidden="true" />
          </article>
        </div>
      </section>
      <section className="collectors-shell collectors-filter-bar">
        <CollectorSearch query={query} onQueryChange={setQuery} />
        {specialties.length > 0 && (
          <div className="collectors-filter-list" aria-label="Filter collectors by specialty">
            {["All collectors", ...specialties].map((item) => (
              <button
                key={item}
                type="button"
                className={specialty === item ? "is-active" : undefined}
                onClick={() => setSpecialty(item)}
              >
                {item}
              </button>
            ))}
          </div>
        )}
      </section>
      {result.isLoading ? (
        <section className="collectors-shell collectors-empty-state">
          <Sparkles aria-hidden="true" />
          <h2>Loading public collectors</h2>
        </section>
      ) : result.isError ? (
        <section className="collectors-shell collectors-empty-state">
          <Archive aria-hidden="true" />
          <h2>Collectors are unavailable.</h2>
          <button type="button" onClick={() => void result.refetch()}>
            Retry
          </button>
        </section>
      ) : featured ? (
        <section className="collectors-shell collectors-spotlight">
          <FeaturedCollector collector={featured} />
          <aside className="collectors-leaderboard">
            <header>
              <div>
                <p className="collectors-kicker">Discovery</p>
                <h2>Public collector catalogue</h2>
              </div>
              <Sparkles aria-hidden="true" />
            </header>
            <ol>
              {collectors.slice(0, 5).map((collector, index) => (
                <li key={collector.userId}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <Link to="/collector/$id" params={{ id: collector.handle }}>
                    {collector.displayName}
                    <small>{collector.publishedListingCount ?? 0} published collectibles</small>
                  </Link>
                  <strong>Public</strong>
                </li>
              ))}
            </ol>
            <Link
              to="/collector/$id"
              params={{ id: featured.handle }}
              className="collectors-leaderboard-link"
            >
              Explore featured profile <Sparkles aria-hidden="true" />
            </Link>
          </aside>
        </section>
      ) : null}
      <section className="collectors-shell collectors-directory">
        <div className="collectors-directory-heading">
          <div>
            <p className="collectors-kicker">Public collectors</p>
            <h2>Collectors sharing their catalogue.</h2>
          </div>
          <span>
            {collectors.length} matching profile{collectors.length === 1 ? "" : "s"}
          </span>
        </div>
        {!result.isLoading &&
          !result.isError &&
          (collectors.length ? (
            <div className="collectors-directory-grid">
              {collectors.map((collector, index) => (
                <CollectorCard key={collector.userId} collector={collector} toneIndex={index} />
              ))}
            </div>
          ) : (
            <div className="collectors-empty-state">
              <Archive aria-hidden="true" />
              <h2>No collectors found</h2>
              <p>Try another search or specialty.</p>
            </div>
          ))}
      </section>
      {result.hasNextPage && (
        <section className="collectors-shell pb-8">
          <button
            type="button"
            disabled={result.isFetchingNextPage}
            onClick={() => void result.fetchNextPage()}
          >
            {result.isFetchingNextPage ? "Loading…" : "Load more public collectors"}
          </button>
        </section>
      )}
    </div>
  );
}
