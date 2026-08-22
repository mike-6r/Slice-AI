import { assetShowcaseMedia } from "./demo-asset-media";
import type { MarketplaceAsset } from "./market-api-presentation";

export type MarketplaceMedia = { src: string; alt: string };

export function resolveMarketplaceMediaGallery(
  asset: Pick<MarketplaceAsset, "media" | "slug">,
): MarketplaceMedia[] {
  const usableMedia = asset.media?.filter((item) => item.url.trim().length > 0) ?? [];
  const ordered = [
    ...usableMedia.filter((item) => item.alt.toLowerCase().includes("front")),
    ...usableMedia.filter((item) => !item.alt.toLowerCase().includes("front")),
  ].map((item) => ({ src: item.url, alt: item.alt }));
  if (ordered.length > 0) return ordered;
  const fallback = assetShowcaseMedia(asset.slug);
  return fallback ? [fallback] : [];
}

/**
 * Resolve public media in authority order. Live asset media wins over the
 * exact staged showcase fallback; unknown assets intentionally remain without
 * a photograph instead of borrowing another collectible's image.
 */
export function resolveMarketplaceMedia(
  asset: Pick<MarketplaceAsset, "media" | "slug">,
): MarketplaceMedia | undefined {
  return resolveMarketplaceMediaGallery(asset)[0];
}

/**
 * A manual choice is authoritative until the pointer leaves the showcase.
 * This keeps hover preview and the explicit button from fighting each other.
 */
export function effectiveCardFlipState(manualFlip: boolean | null, hoverFlip: boolean) {
  return manualFlip ?? hoverFlip;
}
