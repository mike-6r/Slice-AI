import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { SearchX } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { MarketAssetGrid } from "@/components/marketplace/MarketAssetGrid";
import {
  MarketFilterPanel,
  MobileFilterDrawer,
} from "@/components/marketplace/MarketFilterSidebar";
import { MarketPagination } from "@/components/marketplace/MarketPagination";
import { MarketQuickFilters } from "@/components/marketplace/MarketQuickFilters";
import { MarketToolbar } from "@/components/marketplace/MarketToolbar";
import { MarketsHeader } from "@/components/marketplace/MarketsHeader";
import { toMarketplaceAsset } from "@/components/marketplace/market-api-presentation";
import {
  EMPTY_MARKET_FILTERS,
  filterMarketAssets,
  sortMarketAssets,
  type MarketFilters,
  type MarketSort,
  type MarketView,
  type QuickFilterId,
} from "@/components/marketplace/marketplace-helpers";
import { marketCategoryPresentation } from "@/components/marketplace/marketplace-presentation";
import { useAppServices } from "@/providers/AppServicesProvider";
import { isBetaEnvironment } from "@/config/environment";
import { useSession } from "@/auth/use-session";

export const Route = createFileRoute("/marketplace")({
  validateSearch: (search: Record<string, unknown>) => ({
    ...(typeof search.q === "string" && search.q.length > 0 ? { q: search.q.slice(0, 120) } : {}),
    ...(typeof search.category === "string" && search.category.length > 0
      ? { category: search.category.slice(0, 120) }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: "Markets | Slice" },
      { name: "description", content: "Discover authenticated collectible markets on Slice." },
    ],
  }),
  component: Marketplace,
});

function Marketplace() {
  const services = useAppServices();
  const { isAuthenticated } = useSession();
  const routeSearch = Route.useSearch();
  const [quickFilter, setQuickFilter] = useState<QuickFilterId>("trending");
  const [filters, setFilters] = useState<MarketFilters>({
    ...EMPTY_MARKET_FILTERS,
    category: routeSearch.category
      ? marketCategoryPresentation(routeSearch.category).slug
      : EMPTY_MARKET_FILTERS.category,
  });
  const [sort, setSort] = useState<MarketSort>("trending");
  const [view, setView] = useState<MarketView>("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState(routeSearch.q ?? "");
  const result = useInfiniteQuery({
    queryKey: ["marketplace", "public-catalogue"],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      services.assets.list({
        sort: "title",
        cursor: pageParam,
        limit: 48,
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const assets = useMemo(
    () => result.data?.pages.flatMap((page) => page.items.map(toMarketplaceAsset)) ?? [],
    [result.data],
  );
  const categories = useMemo(() => {
    const counts = new Map<string, { slug: string; name: string; count: number }>();
    for (const asset of assets) {
      const category = marketCategoryPresentation(asset.category);
      const current = counts.get(category.slug);
      counts.set(category.slug, {
        slug: category.slug,
        name: category.label,
        count: (current?.count ?? 0) + 1,
      });
    }
    return Array.from(counts.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [assets]);
  const gradeOptions = useMemo(
    () => [
      "Any grade",
      ...Array.from(new Set(assets.flatMap((asset) => (asset.grade ? [asset.grade] : [])))).sort(),
    ],
    [assets],
  );
  const setEditionOptions = useMemo(
    () => [
      "Any set / edition",
      ...Array.from(
        new Set(assets.flatMap((asset) => (asset.setName ? [asset.setName] : []))),
      ).sort(),
    ],
    [assets],
  );

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
  }, []);
  useEffect(() => {
    setQuery(routeSearch.q ?? "");
  }, [routeSearch.q]);
  const updateFilter = (key: keyof MarketFilters, value: string) =>
    setFilters((current) => ({ ...current, [key]: value }));
  const selectQuickFilter = (value: QuickFilterId) => {
    setQuickFilter(value);
    setSort(
      value === "biggest-movers"
        ? "biggest-movers"
        : value === "new-listings"
          ? "newest"
          : "trending",
    );
  };
  const visible = useMemo(
    () => sortMarketAssets(filterMarketAssets(assets, filters, query, quickFilter), sort),
    [assets, filters, query, quickFilter, sort],
  );
  const hasActiveFilters = Boolean(
    query.trim() ||
    Object.entries(filters).some(
      ([key, value]) => value !== EMPTY_MARKET_FILTERS[key as keyof MarketFilters],
    ),
  );
  const clearFilters = () => setFilters(EMPTY_MARKET_FILTERS);

  return (
    <div className="markets-page">
      <MarketsHeader />
      <MarketQuickFilters value={quickFilter} onChange={selectQuickFilter} />
      <section className="markets-shell markets-workspace" aria-label="Asset marketplace">
        <aside className="markets-filter-column" aria-label="Market filters">
          <MarketFilterPanel
            filters={filters}
            categories={categories}
            gradeOptions={gradeOptions}
            setEditionOptions={setEditionOptions}
            totalCount={assets.length}
            onChange={updateFilter}
            onClear={clearFilters}
          />
        </aside>
        <div className="markets-results">
          <MarketToolbar
            assetCount={String(visible.length)}
            view={view}
            sort={sort}
            onViewChange={setView}
            onSortChange={setSort}
            onOpenFilters={() => setFiltersOpen(true)}
            query={query}
            onQueryChange={setQuery}
          />
          {result.isLoading ? (
            <div className="markets-empty-state">
              <h2>Loading the catalogue&hellip;</h2>
              <p>Fetching published assets from Slice.</p>
            </div>
          ) : result.isError ? (
            <div className="markets-empty-state">
              <h2>Markets are unavailable</h2>
              <p>We could not load the catalogue. Please try again.</p>
              <button type="button" onClick={() => void result.refetch()}>
                Retry
              </button>
            </div>
          ) : visible.length > 0 ? (
            <>
              <MarketAssetGrid assets={visible} view={view} />
              <MarketPagination
                shown={visible.length}
                total={visible.length}
                onLoadMore={() => void result.fetchNextPage()}
                hasMore={result.hasNextPage}
                isLoading={result.isFetchingNextPage}
              />
            </>
          ) : (
            <div className="markets-empty-state">
              <SearchX aria-hidden="true" />
              {isBetaEnvironment && !hasActiveFilters ? (
                <>
                  <h2>No collectibles available yet</h2>
                  <p>
                    New collectibles will appear here after completing Slice verification and market
                    readiness. This controlled Beta is not showing retired showcase data.
                  </p>
                  <Link
                    to={isAuthenticated ? "/onboarding" : "/signup"}
                    search={isAuthenticated ? { returnTo: "/list" } : undefined}
                    className="primary-action"
                  >
                    {isAuthenticated ? "Become a Collector" : "Create an account"}
                  </Link>
                </>
              ) : (
                <>
                  <h2>No assets match these filters</h2>
                  <p>Try another search or clear the filters to see the catalogue.</p>
                  <button
                    type="button"
                    onClick={() => {
                      clearFilters();
                      setQuery("");
                      setQuickFilter("trending");
                      setSort("trending");
                    }}
                  >
                    Clear filters
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </section>
      <MobileFilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <MarketFilterPanel
          filters={filters}
          categories={categories}
          gradeOptions={gradeOptions}
          setEditionOptions={setEditionOptions}
          totalCount={assets.length}
          onChange={updateFilter}
          onClear={clearFilters}
          onClose={() => setFiltersOpen(false)}
        />
      </MobileFilterDrawer>
    </div>
  );
}
