import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { MarketplaceAsset } from "./market-api-presentation";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, className }: { children: ReactNode; className?: string }) => (
    <a className={className}>{children}</a>
  ),
  useNavigate: () => vi.fn(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: undefined, isLoading: false }),
  useMutation: () => ({ isPending: false, mutate: vi.fn() }),
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/auth/use-session", () => ({ useSession: () => ({ isAuthenticated: false }) }));
vi.mock("@/providers/AppServicesProvider", () => ({
  useAppServices: () => ({ ownership: { toggleWatchlist: vi.fn() } }),
}));
vi.mock("@/currency/CurrencyProvider", () => ({
  useCurrency: () => ({
    currency: "GBP",
    ratesAvailable: false,
    formatMoney: (amount: number, source = "GBP") =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: source }).format(amount / 100),
    formatSourceMoney: (amount: number, source = "GBP") =>
      new Intl.NumberFormat("en-US", { style: "currency", currency: source }).format(amount / 100),
  }),
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
  activeListingsCount: 0,
  availableListingUnits: "0",
};

const rawPreMarketAsset: MarketplaceAsset = {
  ...asset,
  title: "Raw Umbreon",
  conditionLabel: "Mint",
  estimatedMarketValueMinor: 222500,
  sliceValuationAmountMinor: 222500,
  sliceValuationCurrency: "GBP",
  marketReference: { amountMinor: 222500, currency: "USD" },
  availabilityBps: undefined,
  ownersCount: undefined,
  ownershipStatus: "PUBLISHED",
  tradingStatus: "CLOSED",
  tradingEnabled: false,
  tradingHasExecutionHistory: false,
  marketLifecycle: {
    phase: "ISSUANCE_PENDING",
    badge: "Pre-market",
    headline: "Ownership is being prepared",
    statusPill: "Not yet issued",
    explanation: "Ownership is being prepared.",
    tradeabilityMessage:
      "Ownership is being prepared. Trading will open once issuance is complete.",
    canBuy: false,
    canSell: false,
    currentStep: 2,
    nextAction: "Complete issuance",
    blockingDependency: "Issuance",
    steps: [],
    admin: {
      publicState: "Not yet issued",
      internalState: "ISSUANCE_PENDING",
      nextAction: "Complete issuance",
      blockingDependency: "Issuance",
    },
  },
};

describe("MarketAssetCard layout contracts", () => {
  it("keeps projected media and the action in compact cards", () => {
    const html = renderToStaticMarkup(<MarketAssetCard asset={asset} compact />);

    expect(html).toContain("is-compact");
    expect(html).toContain("https://cdn.example/front.webp");
    expect(html).toContain("market-card-cta");
    expect(html).toContain("View collectible");
    expect(html).not.toContain("Media unavailable");
  });

  it("keeps the detailed action as a dedicated row child", () => {
    const html = renderToStaticMarkup(<MarketDetailedRow asset={asset} />);

    expect(html).toContain('class="market-detailed-row"');
    expect(html).toContain("market-detailed-identity");
    expect(html).toContain("View collectible");
    expect(html).toContain("market-card-cta");
  });

  it("uses truthful raw and pre-market language without fake movement", () => {
    const html = renderToStaticMarkup(<MarketAssetCard asset={rawPreMarketAsset} />);

    expect(html).toContain("Raw / Ungraded");
    expect(html).toContain("Condition: Mint");
    expect(html).toContain("Slice valuation");
    expect(html).toContain("$2,225");
    expect(html).toContain("Market reference");
    expect(html).toContain("No active listings");
    expect(html).toContain("Not yet issued");
    expect(html).toContain("Not yet issued");
    expect(html).not.toContain("Grade pending");
    expect(html).not.toContain("No 24h move");
    expect(html).not.toContain("Availability not published");
  });

  it("uses authoritative listing state instead of snapshot availability", () => {
    const html = renderToStaticMarkup(
      <MarketAssetCard
        asset={{
          ...asset,
          activeListingsCount: 3,
          availableListingUnits: "12",
        }}
      />,
    );

    expect(html).toContain("3 active listings");
    expect(html).toContain("12 Slices currently offered");
    expect(html).not.toContain("Buy & sell anytime");
  });

  it("uses readable identity and singular listing copy", () => {
    const html = renderToStaticMarkup(
      <MarketAssetCard
        asset={{
          ...asset,
          activeListingsCount: 1,
          availableListingUnits: "1",
        }}
      />,
    );

    expect(html).toContain("Example Set · 1/10");
    expect(html).not.toContain("Example Set • #1/10");
    expect(html).toContain("1 active listing");
    expect(html).toContain("1 Slice currently offered");
  });

  it("keeps missing identity data explicit", () => {
    const html = renderToStaticMarkup(
      <MarketAssetCard asset={{ ...asset, setName: undefined, cardNumber: undefined }} />,
    );

    expect(html).toContain("Set and card number unavailable");
  });
});
