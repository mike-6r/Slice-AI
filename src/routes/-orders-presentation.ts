import type { OrderBook, TradingOrderView } from "@/domain";

export const ORDER_EMPTY_STATES = {
  open: "No open orders.",
  filled: "No filled orders.",
  cancelled: "No cancelled orders.",
  all: "No orders found.",
  executions: "No filled orders yet.",
  activity: "No recent order activity.",
  book: "No order book data available.",
} as const;

export const ORDER_ERROR_STATES = {
  orders: "Unable to load orders.",
  executions: "Unable to load executions.",
  book: "Unable to load order book.",
  activity: "Unable to load recent order activity.",
} as const;

export type OrderTab = "OPEN" | "FILLED" | "CANCELLED" | "ALL";
export type OrderSideFilter = "ALL" | "BUY" | "SELL";

export const isOpenOrder = (order: TradingOrderView) =>
  order.status === "OPEN" || order.status === "PARTIALLY_FILLED";

export function ordersForTab(items: TradingOrderView[], tab: OrderTab) {
  if (tab === "OPEN") return items.filter(isOpenOrder);
  if (tab === "FILLED") return items.filter((order) => order.status === "FILLED");
  if (tab === "CANCELLED") return items.filter((order) => order.status === "CANCELLED");
  return items;
}

/** Client-side presentation filter over the already self-scoped D14 order response. */
export function ordersForSide(items: TradingOrderView[], side: OrderSideFilter) {
  return side === "ALL" ? items : items.filter((order) => order.side === side);
}

/** Presentation-only GBP formatting. All money inputs remain integer minor-unit strings. */
export function formatOrderMoney(value: string) {
  const amount = BigInt(value);
  const absolute = amount < 0n ? -amount : amount;
  return `${amount < 0n ? "-" : ""}\u00a3${(absolute / 100n).toLocaleString("en-GB")}.${(
    absolute % 100n
  )
    .toString()
    .padStart(2, "0")}`;
}

export function orderNotionalMinor(order: TradingOrderView, units = order.originalUnits) {
  return (BigInt(order.limitPriceMinor) * BigInt(units)).toString();
}

export function sumOrderNotionalMinor(orders: TradingOrderView[], useRemaining = false) {
  return orders
    .reduce(
      (total, order) =>
        total +
        BigInt(order.limitPriceMinor) *
          BigInt(useRemaining ? order.remainingUnits : order.originalUnits),
      0n,
    )
    .toString();
}

export function formatOrderStatus(status: TradingOrderView["status"]) {
  return status
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

export function isCancellable(order: TradingOrderView) {
  return isOpenOrder(order);
}

export function orderBookSummary(book: OrderBook) {
  const bestBid = book.bids[0]?.pricePerUnit.amount;
  const bestAsk = book.asks[0]?.pricePerUnit.amount;
  const bidNotional = book.bids.reduce(
    (total, level) => total + BigInt(level.pricePerUnit.amount) * BigInt(level.units),
    0n,
  );
  const askNotional = book.asks.reduce(
    (total, level) => total + BigInt(level.pricePerUnit.amount) * BigInt(level.units),
    0n,
  );
  const spread =
    bestBid === undefined || bestAsk === undefined ? null : BigInt(bestAsk) - BigInt(bestBid);
  return {
    bestBid: bestBid === undefined ? null : String(bestBid),
    bestAsk: bestAsk === undefined ? null : String(bestAsk),
    bidNotional: bidNotional.toString(),
    askNotional: askNotional.toString(),
    spread: spread === null ? null : spread.toString(),
  };
}
