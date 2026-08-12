import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AppRepositories } from "@/data/repositories";
import type { Asset, PortfolioSummary, TradingExecutionPage, TradingOrderPage } from "@/domain";
import { mockRepositories } from "@/mocks/repositories";
import { AppServicesProvider } from "@/providers/AppServicesProvider";
import { queryKeys } from "@/queries/keys";

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => () => ({}),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/auth/use-session", () => ({ useSession: () => ({ isAuthenticated: true }) }));

import { Orders } from "./orders";

const orders: TradingOrderPage = {
  items: [
    {
      id: "order-safe",
      assetId: "asset-safe",
      assetSlug: "safe-asset",
      side: "BUY",
      type: "LIMIT",
      timeInForce: "GTC",
      status: "OPEN",
      limitPriceMinor: "185000",
      originalUnits: "2",
      remainingUnits: "2",
      filledUnits: "0",
      averageFillPriceMinor: null,
      createdAt: "2026-08-09T00:00:00.000Z" as never,
      closedAt: null,
    },
  ],
  nextCursor: null,
};
const executions: TradingExecutionPage = {
  items: [
    {
      executionId: "execution-safe",
      assetSlug: "safe-asset",
      side: "BUY",
      units: "1",
      priceMinor: "185000",
      feeMinor: "0",
      settlementStatus: "PENDING",
      marketSequence: "1",
      executedAt: "2026-08-09T00:00:00.000Z" as never,
    },
  ],
  nextCursor: null,
};
const asset: Asset = {
  id: "asset-safe" as Asset["id"],
  slug: "safe-asset",
  symbol: "SAFE",
  details: { title: "Safe asset", category: "pokemon", card: { set: "Safe set" } },
  status: "listed",
  media: [],
  grade: { company: "PSA", label: "10" },
};
const portfolio: PortfolioSummary = {
  currency: "GBP",
  cash: {
    currency: "GBP",
    totalMinor: "1000000",
    reservedMinor: "370000",
    availableMinor: "630000",
  },
  holdings: [
    {
      assetId: "asset-safe",
      slug: "safe-asset",
      title: "Safe asset",
      ownedUnits: "8",
      reservedUnits: "2",
      availableUnits: "6",
      estimatedValueMinor: "1480000",
      valuationAsOf: "2026-08-09T00:00:00.000Z" as never,
      valuationStatus: "FULL",
      costBasisMinor: "1200000",
    },
  ],
  estimatedHoldingsValueMinor: "1480000",
  estimatedPortfolioValueMinor: "2110000",
  valuationStatus: "FULL",
};

function renderOrders(
  input: {
    orderPage?: TradingOrderPage;
    executionPage?: TradingExecutionPage;
    portfolioSummary?: PortfolioSummary;
  } = {},
) {
  const orderPage = input.orderPage ?? orders;
  const executionPage = input.executionPage ?? executions;
  const portfolioSummary = input.portfolioSummary ?? portfolio;
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.trading.orders, orderPage);
  client.setQueryData(queryKeys.trading.executions(), executionPage);
  client.setQueryData([...queryKeys.assets.all, "orders"], {
    items: [asset],
    hasMore: false,
    nextCursor: null,
  });
  client.setQueryData(queryKeys.portfolio.summary, portfolioSummary);
  const repositories: AppRepositories = {
    ...mockRepositories,
    trading: {
      ...mockRepositories.trading,
      listOwnOrders: async () => orderPage,
      listOwnExecutions: async () => executionPage,
      cancelOrder: async () => ({ ...orders.items[0], status: "CANCELLED" }),
    },
    assets: {
      ...mockRepositories.assets,
      listAssets: async () => ({ items: [asset], hasMore: false, nextCursor: null }),
    },
    portfolio: {
      ...mockRepositories.portfolio,
      getPortfolio: async () => portfolioSummary,
    },
  };
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <AppServicesProvider repositories={repositories}>
        <Orders />
      </AppServicesProvider>
    </QueryClientProvider>,
  );
}

describe("Document 014 orders UI", () => {
  it("renders authoritative orders, executions, reservations, and public asset context", () => {
    const html = renderOrders();
    expect(html).toContain("Your Orders");
    expect(html).toContain("Safe asset");
    expect(html).toContain("£1,850.00");
    expect(html).toContain("PSA 10");
    expect(html).toContain("Total traded");
    expect(html).toContain("Reservation context");
    expect(html).toContain("Reserved cash");
    expect(html).toContain("Cancel");
    expect(html).toContain("Recent executions");
    expect(html).toContain("Buy 2 shares of Safe asset");
    expect(html).not.toContain("order-safe");
    expect(html).not.toContain("execution-safe");
    expect(html).not.toContain("Asset reference unavailable");
    expect(html).not.toContain("Order book depth");
  });

  it("keeps the full workspace composed with truthful compact empty states", () => {
    const html = renderOrders({
      orderPage: { items: [], nextCursor: null },
      executionPage: { items: [], nextCursor: null },
      portfolioSummary: {
        ...portfolio,
        cash: { ...portfolio.cash, reservedMinor: "0", availableMinor: "1000000" },
        holdings: [],
      },
    });
    expect(html).toContain("No open orders.");
    expect(html).toContain("Orders you place will appear here.");
    expect(html).toContain("No executions yet.");
    expect(html).toContain("No recent order activity.");
    expect(html).toContain("No ownership shares are reserved.");
    expect(html).not.toContain("£24,500.00");
  });
});
