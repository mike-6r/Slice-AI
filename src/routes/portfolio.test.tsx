import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { mockRepositories } from "@/mocks/repositories";
import { AppServicesProvider } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";
import type { AppRepositories } from "@/data/repositories";
import type { PreSaleReservationView } from "@/data/repositories";
import type {
  ISODateTime,
  PortfolioLot,
  PortfolioSummary,
  PortfolioTransactionPage,
} from "@/domain";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => {
    const route = () => ({});
    route.useSearch = () => ({});
    route.fullPath = "/portfolio";
    return route;
  },
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
  useNavigate: () => () => undefined,
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

function renderPortfolio(
  options: {
    portfolioSummary?: PortfolioSummary;
    reservations?: PreSaleReservationView[];
  } = {},
) {
  const portfolioSummary = options.portfolioSummary ?? summary;
  const reservations = options.reservations ?? [];
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.portfolio.summary, portfolioSummary);
  client.setQueryData(["portfolio", "pre-sale-reservations"], reservations);
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
  client.setQueryData(queryKeys.portfolio.holdings, portfolioSummary.holdings);
  client.setQueryData(queryKeys.portfolio.lots, lots);
  client.setQueryData(queryKeys.portfolio.transactions(), transactions);
  const repositories: AppRepositories = {
    ...mockRepositories,
    portfolio: {
      getPortfolio: async () => portfolioSummary,
      getHoldings: async () => portfolioSummary.holdings,
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
      getWalletInsights: async () => ({
        period: "month" as const,
        currency: "GBP" as const,
        totalDepositsMinor: "0",
        totalWithdrawalsMinor: "0",
        netMovementMinor: "0",
        settledMovementCount: 0,
        previousPeriod: null,
      }),
    },
    preSale: {
      ...mockRepositories.preSale,
      listReservations: async () => reservations,
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
    expect(html).toContain("Collector capital");
    expect(html).toContain("Your collection,");
    expect(html).toContain("Total account value");
    expect(html).toContain("Capital deployed");
    expect(html).toContain("Ready to invest");
    expect(html).toContain("Reserved for orders");
    expect(html).toContain("Unrealised return");
    expect(html).toContain("Safe asset");
    expect(html).toContain("1 active position");
    expect(html).toContain("Collection mix");
    expect(html).toContain("Live ledger");
    expect(html).toContain("Deposit");
    expect(html).toContain("Account value over time");
    expect(html).toContain("History appears after the next authoritative account snapshot.");
    expect(html).toContain("Order tape");
    expect(html).toContain("Worth a closer look");
    expect(html).toContain("portfolio-atlas");
    expect(html).not.toContain("portfolio-summary-kpi");
    expect(html).not.toContain("portfolio-overview-content");
    expect(html).not.toContain("Total portfolio value");
    expect(html).not.toContain("Demo Funding");
    expect(html).not.toContain("account-safe-id");
    expect(html).not.toContain("24h change");
  });

  it("integrates an active Pre-Sale reservation into positions without a false empty state", () => {
    const reservation: PreSaleReservationView = {
      id: "reservation-1",
      asset: { slug: "presale-asset", title: "Pre-Sale asset" },
      units: "1",
      totalUnits: "1000",
      sliceOwnershipPercentageBps: 10,
      pricePerUnitMinor: "1850",
      grossMinor: "1850",
      status: "ACTIVE",
      createdAt: at,
      deadlineAt: "2099-08-07T00:00:00.000Z",
      physicalStatus: "AWAITING_INTAKE",
      disclosure: "Conditional until finalization.",
    };
    const html = renderPortfolio({
      portfolioSummary: {
        ...summary,
        holdings: [],
        estimatedHoldingsValueMinor: "0",
        estimatedPortfolioValueMinor: "10000",
        totalAccountValueMinor: "10000",
      },
      reservations: [reservation],
    });
    expect(html).toContain("1 active position");
    expect(html).toContain("Pre-Sale asset");
    expect(html).toContain("£18.50");
    expect(html).toContain("0.10%");
    expect(html).toContain("Reservation remains conditional until finalisation");
    expect(html).toContain("Reserved");
    expect(html).toContain("Pre-Sale reservation · 1 Slice");
    expect(html).toContain("Awaiting intake");
    expect(html).not.toContain("Your collection starts with one Slice.");
    expect(html).not.toContain("Conditional Positions");
  });
});
