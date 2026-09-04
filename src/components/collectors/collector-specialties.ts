import { marketCategoryPresentation } from "@/components/marketplace/marketplace-presentation";
import type { CollectorProfile } from "@/domain";

const repairPublicText = (value: string) =>
  value.replace(/\u00c2\u00b7/g, "\u00b7").replace(/\u00c3\u00a9/g, "\u00e9");

export function collectorCategoryLabel(category: string) {
  return marketCategoryPresentation(repairPublicText(category)).label;
}

/**
 * Public filters are derived from the public focus string returned by the API;
 * they never infer a collector's private holdings or account data.
 */
export function collectorSpecialties(collector: CollectorProfile) {
  if (collector.specialties?.length) {
    return [...new Set(collector.specialties.map((item) => collectorCategoryLabel(item)).filter(Boolean))].slice(0, 5);
  }
  const value = repairPublicText(collector.focus).trim();
  return value.includes("\u00b7")
    ? [
        ...new Set(
          value
            .split("\u00b7")
            .map((item) => collectorCategoryLabel(item.trim()))
            .filter(Boolean),
        ),
      ].slice(0, 5)
    : [];
}
