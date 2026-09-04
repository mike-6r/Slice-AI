import { useQuery } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  Search,
  SlidersHorizontal,
  UsersRound,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { CollectorCard, FeaturedCollector } from "@/components/collectors/public-collector-ui";
import { useAppServices } from "@/providers/AppServicesProvider";
import type { CollectorDirectorySort, CollectorDirectoryStatus } from "@/domain";

const PAGE_SIZE = 12;
export type CollectorSearch = {
  q?: string;
  specialty?: string;
  status?: CollectorDirectoryStatus;
  sort?: CollectorDirectorySort;
  page?: number;
};

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

export const Route = createFileRoute("/collectors")({
  validateSearch: (search: Record<string, unknown>): CollectorSearch => ({
    ...(typeof search.q === "string" && search.q.trim()
      ? { q: search.q.trim().slice(0, 120) }
      : {}),
    ...(typeof search.specialty === "string" && search.specialty.trim()
      ? { specialty: search.specialty.trim().slice(0, 80) }
      : {}),
    sort: ["featured", "assets", "recent", "name"].includes(String(search.sort))
      ? (String(search.sort) as CollectorDirectorySort)
      : "featured",
    status: ["all", "pre-sale", "market-live", "both"].includes(String(search.status))
      ? (String(search.status) as CollectorDirectoryStatus)
      : "all",
    page: Math.max(1, Math.min(10_000, Number(search.page ?? 1) || 1)),
  }),
  head: () => ({
    meta: [
      { title: "Collectors | Slice" },
      {
        name: "description",
        content: "Explore active Collectors and the published collectibles they showcase on Slice.",
      },
    ],
  }),
  component: CollectorsPage,
});

function CollectorsPage() {
  const services = useAppServices();
  const navigate = useNavigate({ from: "/collectors" });
  const search = Route.useSearch();
  const sort = search.sort ?? "featured";
  const status = search.status ?? "all";
  const currentPage = search.page ?? 1;
  const [query, setQuery] = useState(search.q ?? "");

  useEffect(() => setQuery(search.q ?? ""), [search.q]);

  const result = useQuery({
    queryKey: ["collectors", search.q ?? "", search.specialty ?? "", status, sort, currentPage],
    queryFn: () =>
      services.repositories.collectors.listPublicCollectors({
        q: search.q,
        specialty: search.specialty,
        status,
        sort,
        page: currentPage,
        pageSize: PAGE_SIZE,
      }),
    staleTime: 30_000,
  });

  const data = result.data;
  const specialties = data?.specialties ?? [];
  const page = data?.pagination;
  const hasFilters = Boolean(search.q || search.specialty || status !== "all");

  const setSearch = (next: Partial<CollectorSearch>) => {
    void navigate({
      search: {
        q: "q" in next ? next.q : search.q,
        specialty: "specialty" in next ? next.specialty : search.specialty,
        status: "status" in next ? next.status : status,
        sort: "sort" in next ? next.sort : sort,
        page: "page" in next ? next.page : 1,
      },
      replace: true,
    });
  };

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch({ q: query.trim() || undefined });
  };

  return (
    <div className="collectors-page">
      <section className="collectors-shell collectors-hero collectors-hero--directory">
        <div className="collectors-hero-copy">
          <p className="collectors-kicker">The Slice community</p>
          <h1>Collectors worth knowing.</h1>
          <p>
            Discover active Collectors and the published collectibles they choose to showcase on
            Slice.
          </p>
          <div className="collectors-hero-note">
            <UsersRound aria-hidden="true" />
            <span>Only collectors with at least one listed asset are shown.</span>
          </div>
        </div>
        <div className="collectors-hero-aside" aria-label="Collector directory summary">
          <span className="collectors-hero-aside__eyebrow">A better way to explore</span>
          <strong>Find the next point of view for your collection.</strong>
          <span>
            Search by name or specialty, then open a profile to see the published assets behind it.
          </span>
        </div>
      </section>

      <section
        className="collectors-shell collectors-directory"
        aria-labelledby="directory-heading"
      >
        <div className="collectors-directory-toolbar">
          <form className="collectors-directory-search" onSubmit={submitSearch}>
            <Search aria-hidden="true" />
            <label className="sr-only" htmlFor="collector-search">
              Search public collectors
            </label>
            <input
              id="collector-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search collectors by name or specialty"
            />
            <button type="submit">Search</button>
          </form>
          <label className="collectors-select-control collectors-specialty-control">
            <SlidersHorizontal aria-hidden="true" />
            <span className="sr-only">Specialty</span>
            <select
              aria-label="Filter collectors by specialty"
              value={search.specialty ?? ""}
              onChange={(event) => setSearch({ specialty: event.target.value || undefined })}
            >
              <option value="">All specialties</option>
              {specialties.map((specialty) => (
                <option key={specialty.name} value={specialty.name}>
                  {specialty.name}
                  {specialty.count ? ` (${specialty.count})` : ""}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <label className="collectors-select-control collectors-status-control">
            <span>Status</span>
            <select
              aria-label="Filter collectors by market status"
              value={status}
              onChange={(event) =>
                setSearch({ status: event.target.value as CollectorDirectoryStatus })
              }
            >
              <option value="all">All statuses</option>
              <option value="pre-sale">Has Pre-Sale</option>
              <option value="market-live">Has Market Live</option>
              <option value="both">Has Both</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
          <label className="collectors-select-control collectors-sort-control">
            <span>Sort</span>
            <select
              aria-label="Sort public collectors"
              value={sort}
              onChange={(event) =>
                setSearch({ sort: event.target.value as CollectorDirectorySort })
              }
            >
              <option value="featured">Featured first</option>
              <option value="assets">Most published</option>
              <option value="recent">Recently joined</option>
              <option value="name">Alphabetical</option>
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
        </div>

        <div className="collectors-directory-results-bar">
          <UsersRound aria-hidden="true" />
          <div>
            <strong id="directory-heading">
              {data?.stats?.eligibleCollectorCount ?? page?.total ?? 0} Active Collectors
            </strong>
            <span>Public directory</span>
          </div>
        </div>

        <dl className="collectors-directory-stats" aria-label="Collector directory totals">
          <div><dt>Active Collectors</dt><dd>{data?.stats.eligibleCollectorCount ?? 0}</dd></div>
          <div><dt>Published Assets</dt><dd>{data?.stats.publishedAssetCount ?? 0}</dd></div>
          <div><dt>Featured</dt><dd>{data?.stats.featuredCollectorCount ?? 0}</dd></div>
        </dl>

        {result.isPending ? (
          <div className="collectors-directory-grid collectors-loading-grid" role="status">
            {Array.from({ length: 6 }, (_, index) => (
              <div className="collector-card-skeleton" key={index}>
                <span />
                <div>
                  <span />
                  <span />
                </div>
                <span />
                <span />
              </div>
            ))}
          </div>
        ) : result.isError ? (
          <div className="collectors-empty-state" role="alert">
            <BoxIcon />
            <h3>Collectors are unavailable.</h3>
            <p>We could not load the public directory right now.</p>
            <button type="button" onClick={() => void result.refetch()}>
              Try again
            </button>
          </div>
        ) : data ? (
          <>
            {data.featured.length > 0 ? (
              <section className="collectors-featured-section" aria-labelledby="featured-heading">
                <div className="collectors-section-heading">
                  <div>
                    <p className="collectors-kicker">Hand-picked by Slice</p>
                    <h2 id="featured-heading">Featured Collectors</h2>
                  </div>
                  <span>{data.stats.featuredCollectorCount} featured profiles</span>
                </div>
                <div className="collectors-featured-grid">
                  {data.featured.map((collector) => (
                    <FeaturedCollector key={collector.userId} collector={collector} />
                  ))}
                </div>
              </section>
            ) : null}
            {data.items.length ? (
              <section className="collectors-public-directory" aria-labelledby="public-directory-heading">
                <div className="collectors-directory-heading">
                  <div>
                    <p className="collectors-kicker">Explore the community</p>
                    <h2 id="public-directory-heading">Public Directory</h2>
                  </div>
                  {page ? (
                    <span>
                      Showing {page.total ? (page.page - 1) * page.pageSize + 1 : 0}–
                      {Math.min(page.page * page.pageSize, page.total)} of {page.total} Collectors
                    </span>
                  ) : null}
                </div>
                <div className="collectors-directory-grid">
                  {data.items.map((collector, index) => (
                    <CollectorCard key={collector.userId} collector={collector} toneIndex={index} />
                  ))}
                </div>
              </section>
            ) : (
              <div className="collectors-empty-state">
                <Search aria-hidden="true" />
                <h3>{hasFilters ? "No collectors matched your search." : "Collectors are coming soon."}</h3>
                <p>
                  {hasFilters
                    ? "Try a different name, specialty, or market status."
                    : "Public Collector profiles will appear once they have a public Slice asset."}
                </p>
                {hasFilters ? (
                  <button type="button" onClick={() => setSearch({ q: undefined, specialty: undefined, status: "all" })}>
                    Clear filters
                  </button>
                ) : (
                  <a className="collectors-empty-cta" href="/marketplace">Explore Markets</a>
                )}
              </div>
            )}
          </>
        ) : null}

        {page && page.totalPages > 1 && (
          <nav className="collectors-pagination" aria-label="Collectors pagination">
            <button
              type="button"
              disabled={!page.hasPreviousPage}
              onClick={() => setSearch({ page: currentPage - 1 })}
            >
              <ArrowLeft aria-hidden="true" /> Previous
            </button>
            <div className="collectors-page-numbers">
              {Array.from({ length: page.totalPages }, (_, index) => index + 1)
                .filter(
                  (pageNumber) =>
                    page.totalPages <= 7 ||
                    pageNumber === 1 ||
                    pageNumber === page.totalPages ||
                    Math.abs(pageNumber - page.page) <= 1,
                )
                .map((pageNumber) => (
                  <button
                    key={pageNumber}
                    type="button"
                    className={pageNumber === page.page ? "is-active" : undefined}
                    aria-label={`Go to page ${pageNumber}`}
                    aria-current={pageNumber === page.page ? "page" : undefined}
                    onClick={() => setSearch({ page: pageNumber })}
                  >
                    {pageNumber}
                  </button>
                ))}
            </div>
            <button
              type="button"
              disabled={!page.hasNextPage}
              onClick={() => setSearch({ page: currentPage + 1 })}
            >
              Next <ArrowRight aria-hidden="true" />
            </button>
          </nav>
        )}
      </section>
    </div>
  );
}

function BoxIcon() {
  return <UsersRound aria-hidden="true" />;
}
