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
  client.setQueryData(queryKeys.portfolio.lots, lots);
  client.setQueryData(queryKeys.portfolio.transactions(), transactions);
  const repositories: AppRepositories = {
    ...mockRepositories,
    portfolio: {
      getPortfolio: async () => summary,
      getHoldings: async () => summary.holdings,
      getLots: async () => lots,
      getTransactions: async () => transactions,
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

describe("Document 013 portfolio UI", () => {
  it("renders authoritative cash, holdings and safe activity without fabricated performance", () => {
    const html = renderPortfolio();
    expect(html).toContain("Portfolio value");
    expect(html).toContain("Available cash");
    expect(html).toContain("Reserved cash");
    expect(html).toContain("Safe asset");
    expect(html).toContain("20");
    expect(html).toContain("Recent transactions");
    expect(html).toContain("Recent activity");
    expect(html).toContain("Demo Funding");
    expect(html).toContain("No portfolio performance history available.");
    expect(html.match(/class="portfolio-summary-kpi"/g)).toHaveLength(4);
    expect(html).not.toContain('class="portfolio-kpi"');
    expect(html).toContain("portfolio-kpi__content");
    expect(html.match(/class="kpi-icon-tile"/g)).toHaveLength(4);
    expect(html).toContain("portfolio-empty-state--performance");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("account-safe-id");
    expect(html).not.toContain("P/L");
    expect(html).not.toContain("24h change");
    expect(html).not.toContain("View all holdings");
    expect(html).not.toContain("account-safe-id");
  });
});
