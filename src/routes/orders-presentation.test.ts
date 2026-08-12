import { describe, expect, it } from "vitest";

import type { OrderBook, TradingOrderView } from "@/domain";
import {
  formatOrderMoney,
  isCancellable,
  ORDER_EMPTY_STATES,
  ORDER_ERROR_STATES,
  orderBookSummary,
  orderNotionalMinor,
  ordersForSide,
  ordersForTab,
} from "./-orders-presentation";

const createdAt = "2026-08-09T00:00:00.000Z" as TradingOrderView["createdAt"];
const open: TradingOrderView = {
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
  createdAt,
  closedAt: null,
};

describe("Document 014 orders presentation authority", () => {
  it("filters real lifecycle states and only exposes cancellation for cancellable states", () => {
    const filled = {
      ...open,
      id: "filled",
      status: "FILLED" as const,
      filledUnits: "2",
      remainingUnits: "0",
    };
    const cancelled = {
      ...open,
      id: "cancelled",
      side: "SELL" as const,
      status: "CANCELLED" as const,
    };
    expect(ordersForTab([open, filled, cancelled], "OPEN")).toEqual([open]);
    expect(ordersForTab([open, filled, cancelled], "FILLED")).toEqual([filled]);
    expect(ordersForTab([open, filled, cancelled], "CANCELLED")).toEqual([cancelled]);
    expect(ordersForSide([open, filled, cancelled], "BUY")).toEqual([open, filled]);
    expect(ordersForSide([open, filled, cancelled], "SELL")).toEqual([cancelled]);
    expect(isCancellable(open)).toBe(true);
    expect(isCancellable(filled)).toBe(false);
    expect(isCancellable(cancelled)).toBe(false);
  });

  it("formats and derives order notional with bigint minor-unit math", () => {
    expect(orderNotionalMinor(open)).toBe("370000");
    expect(formatOrderMoney("9007199254740993")).toBe("£90,071,992,547,409.93");
  });

  it("summarises only authoritative aggregate book levels without user data or fabricated depth", () => {
    const book: OrderBook = {
      assetId: "asset-safe" as OrderBook["assetId"],
      bids: [{ pricePerUnit: { amount: 1000 as never, currency: "GBP" }, units: 3, orderCount: 1 }],
      asks: [{ pricePerUnit: { amount: 1200 as never, currency: "GBP" }, units: 2, orderCount: 1 }],
      updatedAt: createdAt,
    };
    expect(orderBookSummary(book)).toEqual({
      bestBid: "1000",
      bestAsk: "1200",
      bidNotional: "3000",
      askNotional: "2400",
      spread: "200",
    });
  });

  it("keeps unsupported metrics, empty panels, and per-panel failures explicit", () => {
    expect(ORDER_EMPTY_STATES).toMatchObject({
      open: "No open orders.",
      book: "No order book data available.",
      executions: "No filled orders yet.",
    });
    expect(Object.values(ORDER_ERROR_STATES)).toEqual(
      expect.arrayContaining(["Unable to load orders.", "Unable to load order book."]),
    );
  });
});
