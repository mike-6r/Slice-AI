import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { mockRepositories } from "@/mocks/repositories";
import { AppServicesProvider } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import type { AppRepositories } from "@/data/repositories";
import type {
  ISODateTime,
  PortfolioLot,
  PortfolioSummary,
  PortfolioTransactionPage,
} from "@/domain";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

import { Portfolio } from "./portfolio";

const at = "2026-08-07T00:00:00.000Z" as ISODateTime;
const summary: PortfolioSummary = {
  currency: "GBP" as const,
  cash: {
    currency: "GBP" as const,
    totalMinor: "10000",
    reservedMinor: "2500",
    availableMinor: "7500",
  },
  holdings: [
    {
      assetId: "asset-safe-id",
      slug: "safe-asset",
      title: "Safe asset",
      category: "Pokémon TCG",
      grade: "PSA 10 · Gem Mint",
      ownedUnits: "20",
      reservedUnits: "5",
      availableUnits: "15",
      estimatedValueMinor: "5000",
      valuationAsOf: at,
      valuationStatus: "FULL",
      costBasisMinor: "4000",
    },
  ],
  estimatedHoldingsValueMinor: "5000",
  estimatedPortfolioValueMinor: "15000",
  valuationStatus: "FULL" as const,
};

function renderPortfolio() {
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.portfolio.summary, summary);
  const lots: PortfolioLot[] = [
    {
      assetSlug: "safe-asset",
      assetTitle: "Safe asset",
      acquiredUnits: "20",
      remainingUnits: "15",
      totalCostMinor: "4000",
      acquiredAt: at,
      status: "OPEN",
    },
  ];
  const transactions: PortfolioTransactionPage = {
    items: [
      {
        type: "DEMO_FUNDING",
        side: "CREDIT",
        amountMinor: "10000",
        effectiveAt: at,
        status: null,
        reference: null,
      },
    ],
    nextCursor: "next-safe-cursor",
  };
  client.setQueryData(queryKeys.portfolio.holdings, summary.holdings);
  client.setQueryData(queryKeys.portfolio.lots, lots);
  client.setQueryData(queryKeys.portfolio.transactions(), transactions);
  const repositories: AppRepositories = {
    ...mockRepositories,
    portfolio: {
      getPortfolio: async () => summary,
      getHoldings: async () => summary.holdings,
      getLots: async () => lots,
      getTransactions: async () => transactions,
      getPerformance: async () => ({
        range: "1M" as const,
        points: [],
        periodChangeMinor: null,
        periodChangeBps: null,
        netCashFlowMinor: "0",
        direction: "NEUTRAL" as const,
        freshness: "UNAVAILABLE",
      }),
    },
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppServicesProvider repositories={repositories}>
        <Portfolio />
      </AppServicesProvider>
    </QueryClientProvider>,
  );
}

describe("approved portfolio workspace", () => {
  it("renders authoritative account data without fabricated historical performance", () => {
    const html = renderPortfolio();
    expect(html).toContain("Portfolio value");
    expect(html).toContain("Available cash");
    expect(html).toContain("Holdings value");
    expect(html).toContain("Invested cost");
    expect(html).toContain("Allocation by asset class");
    expect(html).toContain("Safe asset");
    expect(html).toContain("20");
    expect(html).toContain("Recent transactions");
    expect(html).toContain("Recent activity");
    expect(html).toContain("Funds added");
    expect(html).toContain("Current marked value");
    expect(html).toContain("Open position cost");
    expect(html).toContain("Unrealised P/L");
    expect(html).toContain("Historical performance data is not yet available.");
    expect(html).toContain("Portfolio breakdown");
    expect(html).toContain("Open orders / reserved cash");
    expect(html).toContain("Top holding");
    expect(html).toContain("Portfolio insights");
    expect(html.match(/class="portfolio-summary-kpi"/g)).toHaveLength(5);
    expect(html).not.toContain('class="portfolio-kpi"');
    expect(html).toContain("portfolio-kpi__content");
    expect(html.match(/class="kpi-icon-tile"/g)).toHaveLength(5);
    expect(html).toContain("portfolio-performance-snapshot");
    expect(html).not.toContain("Demo Funding");
    expect(html).not.toContain("account-safe-id");
    expect(html).not.toContain("24h change");
    expect(html).not.toContain("View all holdings");
    expect(html).not.toContain("account-safe-id");
  });
});
