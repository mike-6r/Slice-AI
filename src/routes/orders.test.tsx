import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderToStaticMarkup } from "react-dom/server";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import type { AppRepositories } from "@/data/repositories";
import type { Asset, TradingExecutionPage, TradingOrderPage } from "@/domain";
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
};

function renderOrders(
  input: { orderPage?: TradingOrderPage; executionPage?: TradingExecutionPage } = {},
) {
  const orderPage = input.orderPage ?? orders;
  const executionPage = input.executionPage ?? executions;
  const client = new QueryClient({ defaultOptions: { queries: { staleTime: Infinity } } });
  client.setQueryData(queryKeys.trading.orders, orderPage);
  client.setQueryData(queryKeys.trading.executions(), executionPage);
  client.setQueryData([...queryKeys.assets.all, "orders"], {
    items: [asset],
    hasMore: false,
    nextCursor: null,
  });
  client.setQueryData(queryKeys.market.orderBook("asset-safe"), {
    assetId: asset.id,
    bids: [{ pricePerUnit: { amount: 185000 as never, currency: "GBP" }, units: 2, orderCount: 1 }],
    asks: [{ pricePerUnit: { amount: 190000 as never, currency: "GBP" }, units: 1, orderCount: 1 }],
    updatedAt: "2026-08-09T00:00:00.000Z" as never,
  });
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
  it("renders authenticated, authoritative order, execution, and aggregate book data without private internals", () => {
    const html = renderOrders();
    expect(html).toContain("Your Orders");
    expect(html).toContain("Safe asset");
    expect(html).toContain("£1,850.00");
    expect(html).toContain("Order book depth");
    expect(html).toContain("Cancel");
    expect(html).toContain("Recent filled orders");
    expect(html).toContain("Avg. fill time");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("order-safe");
    expect(html).not.toContain("execution-safe");
    expect(html).not.toContain("reservation");
  });

  it("keeps the full workspace composed with truthful compact empty states", () => {
    const html = renderOrders({
      orderPage: { items: [], nextCursor: null },
      executionPage: { items: [], nextCursor: null },
    });
    expect(html).toContain("No open orders.");
    expect(html).toContain("Orders you place will appear here.");
    expect(html).toContain("No filled orders yet.");
    expect(html).toContain("No order book data available.");
    expect(html).toContain("No recent order activity.");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("£24,500.00");
  });
});
