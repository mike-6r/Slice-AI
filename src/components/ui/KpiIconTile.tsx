import type { LucideIcon } from "lucide-react";

/**
 * The single mini KPI tile used by customer-facing financial summaries.
 * Keeping the Lucide SVG inside this primitive makes its grid-centering,
 * dimensions, border, and visual weight identical wherever it is shown.
 */
export function KpiIconTile({ icon: Icon }: { icon: LucideIcon }) {
  return (
    <span className="kpi-icon-tile" aria-hidden="true">
      <Icon />
    </span>
  );
}
