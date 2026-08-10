import { useInfiniteQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
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
  sortMarketAssets,
  type MarketFilters,
  type MarketSort,
  type MarketView,
  type QuickFilterId,
} from "@/components/marketplace/marketplace-helpers";
import { useAppServices } from "@/providers/AppServicesProvider";

export const Route = createFileRoute("/marketplace")({
  validateSearch: (search: Record<string, unknown>) =>
    typeof search.q === "string" && search.q.length > 0 ? { q: search.q.slice(0, 120) } : {},
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
  const routeSearch = Route.useSearch();
  const [quickFilter, setQuickFilter] = useState<QuickFilterId>("trending");
  const [filters, setFilters] = useState<MarketFilters>(EMPTY_MARKET_FILTERS);
  const [sort, setSort] = useState<MarketSort>("trending");
  const [view, setView] = useState<MarketView>("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [query, setQuery] = useState(routeSearch.q ?? "");
  const category = filters.category === "All Assets" ? undefined : filters.category;
  const backendSort =
    sort === "price-high" || sort === "price-low"
      ? "estimatedMarketValue"
      : sort === "biggest-movers"
        ? "change24h"
        : "title";
  const result = useInfiniteQuery({
    queryKey: ["marketplace", { query, category, sort: backendSort, grade: filters.grade }],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam, signal }) =>
      services.assets.list({
        query: query.trim() || undefined,
        category,
        sort: backendSort,
        cursor: pageParam,
        limit: 24,
        signal,
      }),
    getNextPageParam: (page) => page.nextCursor ?? undefined,
  });
  const assets = useMemo(
    () =>
      sortMarketAssets(
        result.data?.pages.flatMap((page) => page.items.map(toMarketplaceAsset)) ?? [],
        sort,
      ),
    [result.data, sort],
  );
  const categories = useMemo(
    () =>
      Array.from(
        new Map(
          assets.map((asset) => [asset.category, { slug: asset.category, name: asset.category }]),
        ).values(),
      ),
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
  const hasUnsupportedGrade = filters.grade !== "Any grade";
  const visible = hasUnsupportedGrade
    ? assets.filter((asset) => asset.grade?.startsWith(filters.grade))
    : assets;

  return (
    <div className="markets-page">
      <MarketsHeader />
      <MarketQuickFilters value={quickFilter} onChange={selectQuickFilter} />
      <section className="markets-shell markets-workspace" aria-label="Asset marketplace">
        <aside className="markets-filter-column" aria-label="Market filters">
          <MarketFilterPanel
            filters={filters}
            categories={categories}
            onChange={updateFilter}
            onClear={() => setFilters(EMPTY_MARKET_FILTERS)}
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
              <h2>Loading the catalogue…</h2>
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
              <h2>No assets match these filters</h2>
              <p>Try another search or clear the filters to see the catalogue.</p>
              <button type="button" onClick={() => setFilters(EMPTY_MARKET_FILTERS)}>
                Clear filters
              </button>
            </div>
          )}
        </div>
      </section>
      <MobileFilterDrawer open={filtersOpen} onClose={() => setFiltersOpen(false)}>
        <MarketFilterPanel
          filters={filters}
          categories={categories}
          onChange={updateFilter}
          onClear={() => setFilters(EMPTY_MARKET_FILTERS)}
          onClose={() => setFiltersOpen(false)}
        />
      </MobileFilterDrawer>
    </div>
  );
}
