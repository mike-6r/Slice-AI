import { assetShowcaseMedia } from "./demo-asset-media";
import type { MarketplaceAsset } from "./market-api-presentation";

export type MarketplaceMedia = { src: string; alt: string; slot?: string };

const mediaRole = (item: { alt: string; slot?: string }) =>
  `${item.slot ?? ""} ${item.alt}`.trim().toLowerCase();

const isFrontMedia = (item: { alt: string; slot?: string }) => mediaRole(item).includes("front");
const isBackMedia = (item: { alt: string; slot?: string }) => mediaRole(item).includes("back");

export function resolveMarketplaceMediaGallery(
  asset: Pick<MarketplaceAsset, "media" | "slug">,
): MarketplaceMedia[] {
  const usableMedia =
    asset.media?.filter((item) => item.url.trim().length > 0 && !mediaRole(item).includes("video")) ??
    [];
  const ordered = [
    ...usableMedia.filter(isFrontMedia),
    ...usableMedia.filter((item) => !isFrontMedia(item)),
  ].map((item) => ({
    src: item.url,
    alt: item.alt,
    ...(item.slot ? { slot: item.slot } : {}),
  }));
  if (ordered.length > 0) return ordered;
  const fallback = assetShowcaseMedia(asset.slug);
  return fallback ? [fallback] : [];
}

export function resolveMarketplaceMediaSides(
  asset: Pick<MarketplaceAsset, "media" | "slug">,
): { front?: MarketplaceMedia; back?: MarketplaceMedia } {
  const gallery = resolveMarketplaceMediaGallery(asset);
  const front = gallery.find(isFrontMedia) ?? gallery[0];
  const back = gallery.find(isBackMedia) ?? gallery.find((item) => item !== front);
  return { front, back };
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
