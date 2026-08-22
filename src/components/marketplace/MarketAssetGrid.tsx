import { MarketAssetCard, MarketAssetCardSkeleton, MarketDetailedRow } from "./MarketAssetCard";
import type { MarketplaceAsset } from "./market-api-presentation";
import type { MarketView } from "./marketplace-helpers";

export function MarketAssetGrid({
  assets,
  view,
}: {
  assets: MarketplaceAsset[];
  view: MarketView;
}) {
  if (view === "detailed")
    return (
      <div className="market-detailed-list">
        {assets.map((asset) => (
          <MarketDetailedRow key={asset.id} asset={asset} />
        ))}
      </div>
    );
  return (
    <div className={`market-asset-grid ${view === "compact" ? "is-compact" : ""}`}>
      {assets.map((asset) => (
        <MarketAssetCard key={asset.id} asset={asset} compact={view === "compact"} />
      ))}
    </div>
  );
}

export function MarketAssetGridSkeleton({
  count = 4,
  view = "grid",
}: {
  count?: number;
  view?: MarketView;
}) {
  if (view === "detailed") {
    return (
      <div className="market-detailed-list" aria-label="Loading market catalogue" aria-busy="true">
        {Array.from({ length: count }, (_, index) => (
          <MarketAssetCardSkeleton key={index} compact />
        ))}
      </div>
    );
  }
  return (
    <div
      className={`market-asset-grid ${view === "compact" ? "is-compact" : ""}`}
      aria-label="Loading market catalogue"
      aria-busy="true"
    >
      {Array.from({ length: count }, (_, index) => (
        <MarketAssetCardSkeleton key={index} compact={view === "compact"} />
      ))}
    </div>
  );
}
