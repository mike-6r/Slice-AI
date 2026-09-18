import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  ChevronDown,
  CircleHelp,
  Layers3,
  Plus,
  RefreshCw,
  Search,
  SlidersHorizontal,
  UsersRound,
  X,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import {
  CollectorDiscoveryCard,
  CollectorSpotlight,
} from "@/components/collectors/CollectorDiscoveryCard";
import {
  COLLECTOR_PAGE_SIZE,
  COLLECTOR_STATUS_LABELS,
  collectorDirectoryKey,
  collectorPageWindow,
  normalizeCollectorSearch,
  type CollectorSearchState,
} from "@/components/collectors/directory-presentation";
import { useAppServices } from "@/providers/AppServicesProvider";
import type { CollectorDirectorySort, CollectorDirectoryStatus } from "@/domain";
import "@/components/collectors/collector-discovery.css";

export type CollectorSearch = CollectorSearchState;

export function CollectorSearch({
  query,
  onQueryChange,
}: {
  query: string;
  onQueryChange: (value: string) => void;
}) {
  return (
    <label className="cn-search-field">
      <Search aria-hidden="true" />
      <span className="sr-only">Search public collectors</span>
      <input
        aria-label="Search public collectors"
        type="search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        placeholder="Name, username or specialty"
        maxLength={120}
      />
    </label>
  );
}

export const Route = createFileRoute("/collectors")({
  validateSearch: normalizeCollectorSearch,
  head: () => ({
    meta: [
      { title: "Collectors | Slice" },
      {
        name: "description",
        content:
          "Meet the collectors bringing their collections to Slice. Explore public profiles, discover their specialities and browse their published assets.",
      },
    ],
  }),
  component: CollectorsPage,
});

export function CollectorsPage() {
  const services = useAppServices();
  const queryClient = useQueryClient();
  const navigate = useNavigate({ from: "/collectors" });
  const search = Route.useSearch();
  const status = search.status ?? "all";
  const sort = search.sort ?? "featured";
  const currentPage = search.page ?? 1;
  const [query, setQuery] = useState(search.q ?? "");
  useEffect(() => setQuery(search.q ?? ""), [search.q]);

  const directoryQuery = (state: CollectorSearchState) => ({
    queryKey: collectorDirectoryKey(state),
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      services.repositories.collectors.listPublicCollectors({
        ...state,
        status: state.status ?? "all",
        sort: state.sort ?? "featured",
        page: state.page ?? 1,
        pageSize: COLLECTOR_PAGE_SIZE,
        signal,
      }),
    staleTime: 30_000,
  });
  const result = useQuery(directoryQuery(search));
  // The unfiltered first page is also the hero's source. React Query shares this
  // request with the default directory; searches never change the network totals.
  const overview = useQuery(directoryQuery({}));
  const data = result.data;
  const page = data?.pagination;
  const stats = overview.data?.stats;
  const spotlight = overview.isError
    ? undefined
    : (overview.data?.featured[0] ?? overview.data?.items[0]);
  const specialties = overview.data?.specialties ?? data?.specialties ?? [];
  const hasFilters = Boolean(search.q || search.specialty || status !== "all");
  const isOutOfRange = Boolean(page && currentPage > Math.max(1, page.totalPages));

  const setSearch = (next: Partial<CollectorSearchState>) => {
    void navigate({ search: { ...search, ...next, page: next.page ?? 1 } });
  };
  const clearFilters = () => {
    setQuery("");
    setSearch({ q: undefined, specialty: undefined, status: "all" });
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearch({ q: query.trim() || undefined });
  };
  const goToPage = (pageNumber: number) => {
    setSearch({ page: pageNumber });
    document.getElementById("collector-results")?.focus({ preventScroll: true });
    document.getElementById("collector-results")?.scrollIntoView({ block: "start" });
  };

  return (
    <div className="collector-network">
      <div className="cn-shell">
        <section className="cn-hero" aria-labelledby="collectors-title">
          <div className="cn-hero-copy">
            <p className="cn-eyebrow">
              <span className="cn-live-dot" /> The Slice collector network
            </p>
            <h1 id="collectors-title">
              Great collections.
              <br />
              <em>Real people.</em>
              <br />A shared passion.
            </h1>
            <p className="cn-hero-description">
              Meet the collectors bringing their world to Slice. Discover what they collect, explore
              their published assets, and find something worth a closer look.
            </p>
            <div className="cn-hero-actions">
              <a href="#collector-results" className="cn-button cn-button--primary">
                Explore collectors <ArrowDown aria-hidden="true" />
              </a>
              <a href="#collectors-explained" className="cn-text-link">
                <CircleHelp aria-hidden="true" /> How it works
              </a>
            </div>
            <div className="cn-network-summary" aria-label="Public collector network totals">
              <UsersRound aria-hidden="true" />
              <span>
                {overview.isError ? (
                  "Directory totals unavailable"
                ) : overview.isPending ? (
                  "Loading the collector network…"
                ) : (
                  <>
                    <strong>{stats?.eligibleCollectorCount.toLocaleString("en-GB") ?? "—"}</strong>{" "}
                    public {stats?.eligibleCollectorCount === 1 ? "collector" : "collectors"}
                    <i aria-hidden="true" />{" "}
                    <strong>{stats?.publishedAssetCount.toLocaleString("en-GB") ?? "—"}</strong>{" "}
                    published {stats?.publishedAssetCount === 1 ? "asset" : "assets"}
                  </>
                )}
              </span>
            </div>
          </div>
          <CollectorSpotlight collector={spotlight} loading={overview.isPending} />
        </section>

        <section
          id="collectors-explained"
          className="cn-how"
          aria-label="How to explore collectors"
        >
          <div className="cn-how-step">
            <span className="cn-step-icon">
              <UsersRound aria-hidden="true" />
            </span>
            <div>
              <span className="cn-step-number">01 / THE PEOPLE</span>
              <h2>Find your kind of collector.</h2>
              <p>
                Discover public profiles by collecting focus, from trading cards to sports
                collectibles.
              </p>
            </div>
          </div>
          <div className="cn-how-step">
            <span className="cn-step-icon">
              <Layers3 aria-hidden="true" />
            </span>
            <div>
              <span className="cn-step-number">02 / THE COLLECTION</span>
              <h2>See what they bring to Slice.</h2>
              <p>
                A public catalogue shows the assets they have published, not their private holdings.
              </p>
            </div>
          </div>
          <div className="cn-how-step">
            <span className="cn-step-icon">
              <BookOpen aria-hidden="true" />
            </span>
            <div>
              <span className="cn-step-number">03 / THE DETAILS</span>
              <h2>Look closer before you decide.</h2>
              <p>Open an asset for its identity, images, availability and offering details.</p>
            </div>
          </div>
        </section>

        <section className="cn-directory" aria-labelledby="collector-results">
          <header className="cn-section-heading">
            <div>
              <p className="cn-eyebrow">Discover the community</p>
              <h2 id="collector-results" tabIndex={-1}>
                Find your collecting world.
              </h2>
              <p>Explore the people and the published collections behind them.</p>
            </div>
            <a href="#collector-guide" className="cn-text-link">
              New to Slice? Start here <ArrowDown aria-hidden="true" />
            </a>
          </header>
          <div className="cn-directory-controls">
            <div
              className="cn-specialty-tabs"
              role="group"
              aria-label="Browse collector specialties"
            >
              <button
                type="button"
                aria-pressed={!search.specialty}
                onClick={() => setSearch({ specialty: undefined })}
              >
                <Layers3 aria-hidden="true" /> All specialties
              </button>
              {specialties.slice(0, 5).map((specialty) => (
                <button
                  type="button"
                  key={specialty.name}
                  aria-pressed={search.specialty === specialty.name}
                  onClick={() => setSearch({ specialty: specialty.name })}
                >
                  {specialty.name}
                </button>
              ))}
            </div>
            <div className="cn-filter-row">
              <form className="cn-search" onSubmit={submitSearch}>
                <CollectorSearch query={query} onQueryChange={setQuery} />
                <button type="submit" aria-label="Search collectors">
                  <ArrowRight aria-hidden="true" />
                </button>
              </form>
              <label className="cn-select">
                <SlidersHorizontal aria-hidden="true" />
                <span className="sr-only">Specialty</span>
                <select
                  aria-label="Filter collectors by specialty"
                  value={search.specialty ?? ""}
                  onChange={(event) => setSearch({ specialty: event.target.value || undefined })}
                >
                  <option value="">All specialties</option>
                  {search.specialty &&
                  !specialties.some((item) => item.name === search.specialty) ? (
                    <option value={search.specialty}>{search.specialty}</option>
                  ) : null}
                  {specialties.map((specialty) => (
                    <option key={specialty.name} value={specialty.name}>
                      {specialty.name}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
              <label className="cn-select">
                <span className="sr-only">Availability</span>
                <select
                  aria-label="Filter collectors by market status"
                  value={status}
                  onChange={(event) =>
                    setSearch({ status: event.target.value as CollectorDirectoryStatus })
                  }
                >
                  {Object.entries(COLLECTOR_STATUS_LABELS).map(([key, label]) => (
                    <option value={key} key={key}>
                      {label}
                    </option>
                  ))}
                </select>
                <ChevronDown aria-hidden="true" />
              </label>
            </div>
            {hasFilters ? (
              <div className="cn-active-filters" aria-label="Active filters">
                <span>Filtered by</span>
                {search.q ? (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      setSearch({ q: undefined });
                    }}
                    aria-label="Remove search filter"
                  >
                    “{search.q}” <X aria-hidden="true" />
                  </button>
                ) : null}
                {search.specialty ? (
                  <button
                    type="button"
                    onClick={() => setSearch({ specialty: undefined })}
                    aria-label="Remove specialty filter"
                  >
                    {search.specialty}
                    <X aria-hidden="true" />
                  </button>
                ) : null}
                {status !== "all" ? (
                  <button
                    type="button"
                    onClick={() => setSearch({ status: "all" })}
                    aria-label="Remove availability filter"
                  >
                    {COLLECTOR_STATUS_LABELS[status]}
                    <X aria-hidden="true" />
                  </button>
                ) : null}
                <button type="button" className="cn-reset" onClick={clearFilters}>
                  Clear all
                </button>
              </div>
            ) : null}
          </div>
          <div className="cn-results-bar">
            <p role="status" aria-live="polite">
              {result.isPending ? (
                "Finding collectors…"
              ) : result.isError ? (
                "Directory unavailable"
              ) : (
                <>
                  <strong>{(page?.total ?? 0).toLocaleString("en-GB")}</strong>{" "}
                  {page?.total === 1 ? "collector" : "collectors"}
                  {hasFilters ? " matching your filters" : " to explore"}
                  {result.isFetching ? " · Updating…" : ""}
                </>
              )}
            </p>
            <label>
              <span>Sort by</span>
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
                <option value="name">Name: A–Z</option>
              </select>
              <ChevronDown aria-hidden="true" />
            </label>
          </div>

          {result.isPending ? (
            <div className="cn-directory-grid" aria-label="Loading collectors" aria-busy="true">
              {[1, 2].map((item) => (
                <div className="cn-skeleton" key={item}>
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ))}
            </div>
          ) : result.isError ? (
            <div className="cn-empty" role="alert">
              <RefreshCw aria-hidden="true" />
              <h3>We couldn’t open the directory.</h3>
              <p>Your filters are saved. Try loading the collectors again.</p>
              <button
                type="button"
                className="cn-button cn-button--primary"
                onClick={() =>
                  void queryClient.invalidateQueries({ queryKey: ["collectors", "directory"] })
                }
              >
                Try again <RefreshCw aria-hidden="true" />
              </button>
            </div>
          ) : data?.items.length ? (
            <div className={`cn-directory-grid${data.items.length === 1 ? " is-single" : ""}`}>
              {data.items.map((collector) => (
                <CollectorDiscoveryCard key={collector.userId} collector={collector} />
              ))}
            </div>
          ) : (
            <div className="cn-empty">
              <Search aria-hidden="true" />
              <h3>
                {isOutOfRange
                  ? "There are no collectors on this page."
                  : hasFilters
                    ? "No collections match just yet."
                    : "The next collection is on its way."}
              </h3>
              <p>
                {isOutOfRange
                  ? "The directory may have changed. Head back to the first page."
                  : hasFilters
                    ? "Try another name, broaden your specialty, or clear your availability filter."
                    : "Public profiles appear here when collectors have a published asset. You can explore the markets in the meantime."}
              </p>
              {isOutOfRange ? (
                <button
                  type="button"
                  className="cn-button cn-button--primary"
                  onClick={() => goToPage(1)}
                >
                  Back to first page <ArrowLeft aria-hidden="true" />
                </button>
              ) : hasFilters ? (
                <button
                  type="button"
                  className="cn-button cn-button--primary"
                  onClick={clearFilters}
                >
                  Clear filters <X aria-hidden="true" />
                </button>
              ) : (
                <Link to="/marketplace" className="cn-button cn-button--primary">
                  Explore markets <ArrowUpRight aria-hidden="true" />
                </Link>
              )}
            </div>
          )}

          {!result.isError && !result.isPending && page && page.total > 0 && !isOutOfRange ? (
            <div className="cn-pagination-bar">
              <p>
                Showing {((page.page - 1) * page.pageSize + 1).toLocaleString("en-GB")}–
                {Math.min(page.page * page.pageSize, page.total).toLocaleString("en-GB")} of{" "}
                {page.total.toLocaleString("en-GB")}
              </p>
              <nav aria-label="Collectors pagination">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={!page.hasPreviousPage}
                  onClick={() => goToPage(currentPage - 1)}
                >
                  <ArrowLeft aria-hidden="true" />
                  <span>Previous</span>
                </button>
                <div className="cn-page-numbers">
                  {collectorPageWindow(page.page, page.totalPages).map((item, index) =>
                    item === "gap" ? (
                      <span key={`gap-${index}`}>…</span>
                    ) : (
                      <button
                        type="button"
                        key={item}
                        aria-label={`Go to page ${item}`}
                        aria-current={item === page.page ? "page" : undefined}
                        onClick={() => goToPage(item)}
                      >
                        {item}
                      </button>
                    ),
                  )}
                </div>
                <span className="cn-page-mobile">
                  {page.page} / {page.totalPages}
                </span>
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={!page.hasNextPage}
                  onClick={() => goToPage(currentPage + 1)}
                >
                  <span>Next</span>
                  <ArrowRight aria-hidden="true" />
                </button>
              </nav>
            </div>
          ) : null}
          <p className="cn-directory-note">
            <CircleHelp aria-hidden="true" /> Pre-sale and market live describe an asset’s
            availability. A featured profile is a discovery highlight, not an investment
            recommendation.
          </p>
        </section>

        <section className="cn-join" aria-labelledby="collector-join-heading">
          <div className="cn-join-emblem" aria-hidden="true">
            <Layers3 />
            <span>YOUR NEXT CHAPTER</span>
          </div>
          <div>
            <p className="cn-eyebrow">For the collectors</p>
            <h2 id="collector-join-heading">
              Your collection has a story.
              <br />
              <span>Give it a place on Slice.</span>
            </h2>
            <p>
              Start with a submission, then track review, physical intake and publication from your
              Collector workspace.
            </p>
          </div>
          <div className="cn-join-actions">
            <Link to="/list" search={{ draft: undefined }} className="cn-button cn-button--primary">
              Start an asset submission <Plus aria-hidden="true" />
            </Link>
            <Link to="/how-it-works" className="cn-text-link">
              Explore the process <ArrowUpRight aria-hidden="true" />
            </Link>
            <small>Submissions are subject to review. Publication is not automatic.</small>
          </div>
        </section>
        <section
          id="collector-guide"
          className="cn-guide"
          aria-labelledby="collector-guide-heading"
        >
          <div>
            <p className="cn-eyebrow">A little context</p>
            <h2 id="collector-guide-heading">
              The collector’s side
              <br />
              of Slice, explained.
            </h2>
            <p>Start with the people. Get the full picture on the asset.</p>
          </div>
          <div className="cn-faqs">
            <details>
              <summary>
                What is a collector on Slice?
                <Plus aria-hidden="true" />
              </summary>
              <p>
                Collectors submit collectibles to Slice and manage them through the Collector
                workspace. This directory shows public profiles with published assets, so you can
                explore both the collector and their catalogue.
              </p>
            </details>
            <details>
              <summary>
                What will I find on a collector’s profile?
                <Plus aria-hidden="true" />
              </summary>
              <p>
                Their public collecting focus, published catalogue and public listing activity.
                Catalogue entries are assets they brought to Slice, not a statement of what they
                currently own or their investment performance.
              </p>
            </details>
            <details>
              <summary>
                How are pre-sale and market live different?
                <Plus aria-hidden="true" />
              </summary>
              <p>
                A pre-sale is an offering stage with its own availability, timing and conditions.
                Market live indicates an asset published on the market. Open the asset to check its
                current status, price, offering terms and any restrictions before taking action.
              </p>
            </details>
            <details>
              <summary>
                How do I get my collection onto Slice?
                <Plus aria-hidden="true" />
              </summary>
              <p>
                Start an asset submission. You’ll be guided through any required account setup, the
                asset’s identity and supporting images. Track the review and any next steps in your
                Collector workspace. Submitting an asset does not guarantee acceptance or
                publication.
              </p>
            </details>
          </div>
        </section>
      </div>
    </div>
  );
}
