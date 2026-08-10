import { ChevronDown, CircleEllipsis, Search, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { MarketFilters } from "./marketplace-helpers";

type FilterKey = keyof MarketFilters;

function AccordionFilter({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <section className="markets-filter-accordion">
      <button type="button" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <span>Grade</span>
        <ChevronDown className={open ? "is-open" : ""} aria-hidden="true" />
      </button>
      {open && (
        <div className="markets-filter-options">
          {["Any grade", "PSA", "BGS", "CGC"].map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={value === option}
              className={value === option ? "is-selected" : ""}
              onClick={() => onChange(option)}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

export function MarketFilterPanel({
  filters,
  categories,
  onChange,
  onClear,
  onClose,
}: {
  filters: MarketFilters;
  categories: Array<{ slug: string; name: string }>;
  onChange: (key: FilterKey, value: string) => void;
  onClear: () => void;
  onClose?: () => void;
}) {
  const [categoryQuery, setCategoryQuery] = useState("");
  const visible = useMemo(() => {
    const query = categoryQuery.trim().toLowerCase();
    return categories.filter((category) => !query || category.name.toLowerCase().includes(query));
  }, [categories, categoryQuery]);
  return (
    <div className="markets-filter-panel">
      <div className="markets-filter-header">
        <h2>Filters</h2>
        <button type="button" onClick={onClear}>
          Clear all
        </button>
        {onClose && (
          <button
            type="button"
            className="markets-filter-close"
            onClick={onClose}
            aria-label="Close filters"
          >
            <X aria-hidden="true" />
          </button>
        )}
      </div>
      <label className="markets-category-search">
        <Search aria-hidden="true" />
        <span className="sr-only">Search categories</span>
        <input
          value={categoryQuery}
          onChange={(event) => setCategoryQuery(event.target.value)}
          placeholder="Search categories..."
        />
      </label>
      <section className="markets-category-section" aria-labelledby="category-filter-heading">
        <h3 id="category-filter-heading">Categories</h3>
        <div>
          <button
            type="button"
            aria-pressed={filters.category === "All Assets"}
            className={filters.category === "All Assets" ? "is-selected" : ""}
            onClick={() => onChange("category", "All Assets")}
          >
            <CircleEllipsis aria-hidden="true" />
            <span>All Assets</span>
          </button>
          {visible.map((category) => (
            <button
              key={category.slug}
              type="button"
              aria-pressed={filters.category === category.slug}
              className={filters.category === category.slug ? "is-selected" : ""}
              onClick={() => onChange("category", category.slug)}
            >
              <CircleEllipsis aria-hidden="true" />
              <span>{category.name}</span>
            </button>
          ))}
        </div>
      </section>
      <AccordionFilter value={filters.grade} onChange={(value) => onChange("grade", value)} />
    </div>
  );
}

export function MobileFilterDrawer({
  open,
  children,
  onClose,
}: {
  open: boolean;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div
      className="markets-filter-drawer"
      role="dialog"
      aria-modal="true"
      aria-label="Market filters"
    >
      <button type="button" aria-label="Close filters" onClick={onClose} />
      <div>{children}</div>
    </div>
  );
}
