import { AlignJustify, Grid2X2, ListFilter, Rows3, Search, SlidersHorizontal } from "lucide-react";

import {
  MARKET_SORTS,
  type MarketSort,
  type MarketView,
} from "@/components/marketplace/marketplace-helpers";

const VIEWS: Array<{ value: MarketView; label: string; icon: typeof Grid2X2 }> = [
  { value: "grid", label: "Grid", icon: Grid2X2 },
  { value: "compact", label: "Compact", icon: Rows3 },
  { value: "detailed", label: "Detailed", icon: AlignJustify },
];

export function MarketToolbar({
  assetCount,
  view,
  sort,
  onViewChange,
  onSortChange,
  onOpenFilters,
  query,
  onQueryChange,
}: {
  assetCount: string;
  view: MarketView;
  sort: MarketSort;
  onViewChange: (view: MarketView) => void;
  onSortChange: (sort: MarketSort) => void;
  onOpenFilters: () => void;
  query: string;
  onQueryChange: (query: string) => void;
}) {
  return (
    <div className="markets-toolbar">
      <div className="markets-toolbar-count">
        <strong>{assetCount}</strong> {assetCount === "1" ? "asset" : "assets"}
      </div>
      <label className="markets-result-search">
        <Search aria-hidden="true" />
        <span className="sr-only">Search market assets</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="Search assets, sets or categories"
        />
      </label>
      <button type="button" className="markets-mobile-filter" onClick={onOpenFilters}>
        <ListFilter aria-hidden="true" /> Filters
      </button>
      <div className="markets-view-control" role="group" aria-label="Market view">
        {VIEWS.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              type="button"
              aria-pressed={view === item.value}
              className={view === item.value ? "is-active" : ""}
              onClick={() => onViewChange(item.value)}
            >
              <Icon aria-hidden="true" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </div>
      <label className="markets-sort-control">
        <SlidersHorizontal aria-hidden="true" />
        <span>Sort by</span>
        <select value={sort} onChange={(event) => onSortChange(event.target.value as MarketSort)}>
          {MARKET_SORTS.map((item) => (
            <option key={item.value} value={item.value}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
