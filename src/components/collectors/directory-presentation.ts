import type { CollectorDirectorySort, CollectorDirectoryStatus, CollectorProfile } from "@/domain";

export type CollectorSearchState = {
  q?: string;
  specialty?: string;
  status?: CollectorDirectoryStatus;
  sort?: CollectorDirectorySort;
  page?: number;
};

export const COLLECTOR_PAGE_SIZE = 12;
export const COLLECTOR_STATUS_LABELS: Record<CollectorDirectoryStatus, string> = {
  all: "All availability",
  "pre-sale": "Has pre-sale assets",
  "market-live": "Has live market assets",
  both: "Has pre-sale & live assets",
};

export function normalizeCollectorSearch(search: Record<string, unknown>): CollectorSearchState {
  const page = Number(search.page ?? 1);
  return {
    ...(typeof search.q === "string" && search.q.trim()
      ? { q: search.q.trim().slice(0, 120) }
      : {}),
    ...(typeof search.specialty === "string" && search.specialty.trim()
      ? { specialty: search.specialty.trim().slice(0, 80) }
      : {}),
    status: ["all", "pre-sale", "market-live", "both"].includes(String(search.status))
      ? (search.status as CollectorDirectoryStatus)
      : "all",
    sort: ["featured", "assets", "recent", "name"].includes(String(search.sort))
      ? (search.sort as CollectorDirectorySort)
      : "featured",
    page: Number.isFinite(page) ? Math.max(1, Math.min(10_000, Math.floor(page))) : 1,
  };
}

export function collectorDirectoryKey(search: CollectorSearchState) {
  return [
    "collectors",
    "directory",
    search.q ?? "",
    search.specialty ?? "",
    search.status ?? "all",
    search.sort ?? "featured",
    search.page ?? 1,
    COLLECTOR_PAGE_SIZE,
  ] as const;
}

/** A bounded pagination window, even for a very large directory. */
export function collectorPageWindow(current: number, total: number): Array<number | "gap"> {
  if (total <= 7) return Array.from({ length: Math.max(0, total) }, (_, index) => index + 1);
  const middle = Math.max(3, Math.min(current, total - 2));
  const pages = [...new Set([1, middle - 1, middle, middle + 1, total])];
  const result: Array<number | "gap"> = [];
  pages.forEach((page, index) => {
    if (index && page - pages[index - 1] > 1) result.push("gap");
    result.push(page);
  });
  return result;
}

export function collectorPreviewListings(collector: CollectorProfile) {
  const items = [
    ...(collector.featuredPreviewAssets ?? []),
    ...(collector.publishedListings ?? []),
  ];
  return items.filter(
    (item, index) => items.findIndex((entry) => entry.assetId === item.assetId) === index,
  );
}

export function collectorInitials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] ?? "")
      .join("")
      .toUpperCase() || "S"
  );
}

export const collectorProfileSearch = {
  tab: "catalogue",
  status: "all",
  q: "",
  category: "all",
  sort: "recent",
  page: 1,
} as const;
