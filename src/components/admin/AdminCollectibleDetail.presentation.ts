export const collectibleDetailTabs = [
  "overview",
  "identity-media",
  "valuation",
  "ownership",
  "market",
  "history",
] as const;

export type CollectibleDetailTab = (typeof collectibleDetailTabs)[number];

export function formatCollectibleDetailState(value: unknown) {
  return String(value ?? "Not recorded")
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((word) => word[0]!.toUpperCase() + word.slice(1))
    .join(" ");
}
