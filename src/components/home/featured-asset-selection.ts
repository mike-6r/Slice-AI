import type { Asset } from "@/domain";

/**
 * Keeps the homepage stable: an explicit public editorial asset wins, otherwise the
 * first server-ordered eligible public asset is used. It never manufactures content.
 */
export function selectFeaturedAsset(
  editorialAsset: Asset | null | undefined,
  publishedAssets: readonly Asset[] | undefined,
) {
  return editorialAsset ?? publishedAssets?.[0] ?? undefined;
}
