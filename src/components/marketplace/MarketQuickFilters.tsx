import { Flame, Gauge, Sparkles } from "lucide-react";
import type { QuickFilterId } from "./marketplace-helpers";

const QUICK_FILTERS = [
  { id: "trending", label: "All assets", icon: Flame },
  { id: "new-listings", label: "Newest", icon: Sparkles },
  { id: "biggest-movers", label: "Biggest movers", icon: Gauge },
] satisfies Array<{ id: QuickFilterId; label: string; icon: typeof Flame }>;

export function MarketQuickFilters({
  value,
  onChange,
}: {
  value: QuickFilterId;
  onChange: (value: QuickFilterId) => void;
}) {
  return (
    <div className="markets-shell markets-quick-rail" role="toolbar" aria-label="Market filters">
      {QUICK_FILTERS.map((item) => {
        const Icon = item.icon;
        const active = item.id === value;
        return (
          <button
            key={item.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(item.id)}
            className={active ? "is-active" : ""}
          >
            <Icon aria-hidden="true" />
            <span>{item.label}</span>
          </button>
        );
      })}
    </div>
  );
}
