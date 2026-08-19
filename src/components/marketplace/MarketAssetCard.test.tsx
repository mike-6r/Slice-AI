import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceAsset } from "./market-api-presentation";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
}));
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/auth/use-session", () => ({ useSession: () => ({ isAuthenticated: false }) }));
vi.mock("@/providers/AppServicesProvider", () => ({
  useAppServices: () => ({ ownership: { toggleWatchlist: vi.fn() } }),
}));
vi.mock("@/currency/CurrencyProvider", () => ({
  useCurrency: () => ({ formatMoney: (amount: number) => `£${(amount / 100).toFixed(2)}` }),
}));

import { MarketAssetCard, MarketDetailedRow } from "./MarketAssetCard";

const asset: MarketplaceAsset = {
  id: "asset-1",
  slug: "asset-1",
  title: "A collectible with a long enough title to wrap",
  category: "pokemon-tcg",
  setName: "Example Set",
  cardNumber: "1/10",
  media: [{ url: "https://cdn.example/front.webp", alt: "Approved front image" }],
  estimatedMarketValueMinor: 10000,
  estimatedMarketValueCurrency: "GBP",
  availabilityBps: 5000,
  ownersCount: 4,
  ownershipStatus: "ACTIVE",
  tradingStatus: "OPEN",
  tradingEnabled: true,
  tradingHasExecutionHistory: false,
};

describe("MarketAssetCard layout contracts", () => {
  it("keeps projected media and the action in compact cards", () => {
    const html = renderToStaticMarkup(<MarketAssetCard asset={asset} compact />);

    expect(html).toContain("is-compact");
    expect(html).toContain("https://cdn.example/front.webp");
    expect(html).toContain("market-card-cta");
    expect(html).toContain("View details");
    expect(html).not.toContain("Media unavailable");
  });

  it("keeps the detailed action as a dedicated row child", () => {
    const html = renderToStaticMarkup(<MarketDetailedRow asset={asset} />);

    expect(html).toContain('class="market-detailed-row"');
    expect(html).toContain("market-detailed-identity");
    expect(html).toContain("View Asset");
    expect(html).toContain("market-card-cta");
  });
});
