import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceAsset } from "./market-api-presentation";

vi.mock("./MarketAssetCard", () => ({
  MarketAssetCard: ({ asset, compact }: { asset: MarketplaceAsset; compact?: boolean }) => (
    <article className={`market-investment-card${compact ? " is-compact" : ""}`}>
      {asset.title}
    </article>
  ),
  MarketAssetCardSkeleton: ({ compact }: { compact?: boolean }) => (
    <article className={`market-investment-card${compact ? " is-compact" : ""}`} />
  ),
  MarketDetailedRow: ({ asset }: { asset: MarketplaceAsset }) => (
    <article className="market-detailed-row">{asset.title}</article>
  ),
}));

import { MarketAssetGrid, MarketAssetGridSkeleton } from "./MarketAssetGrid";

const assets = [
  { id: "asset-1", title: "Umbreon VMAX" },
  { id: "asset-2", title: "Charizard" },
] as MarketplaceAsset[];

describe("marketplace view modes", () => {
  it("keeps grid mode on the responsive asset grid hook", () => {
    const html = renderToStaticMarkup(<MarketAssetGrid assets={assets} view="grid" />);

    expect(html).toContain('class="market-asset-grid"');
    expect(html).not.toContain("is-compact");
    expect(html).toContain("Umbreon VMAX");
  });

  it("keeps compact mode distinct without changing the asset source", () => {
    const html = renderToStaticMarkup(<MarketAssetGrid assets={assets} view="compact" />);

    expect(html).toContain('class="market-asset-grid is-compact"');
    expect(html).toContain("Charizard");
  });

  it("keeps detailed mode as a real list view", () => {
    const html = renderToStaticMarkup(<MarketAssetGrid assets={assets} view="detailed" />);

    expect(html).toContain('class="market-detailed-list"');
    expect(html).toContain('class="market-detailed-row"');
    expect(html).not.toContain("market-asset-grid");
  });

  it("uses the same view hook while assets are loading", () => {
    const html = renderToStaticMarkup(<MarketAssetGridSkeleton count={2} view="compact" />);

    expect(html).toContain('class="market-asset-grid is-compact"');
    expect(html).toContain('aria-busy="true"');
  });
});
