import type { AssetId } from "./asset";
import type { Brand, ISODateTime, Money, OwnershipUnits } from "./common";
import type { UserId } from "./user";

export type OrderId = Brand<string, "OrderId">;
export type OrderSide = "buy" | "sell";
export type OrderType = "market" | "limit";
export type OrderStatus =
  "draft" | "open" | "partially-filled" | "filled" | "cancelled" | "rejected";
export type TradeStatus = "simulated" | "pending" | "completed" | "cancelled";
export interface Order {
  id: OrderId;
  userId: UserId;
  assetId: AssetId;
  side: OrderSide;
  type: OrderType;
  status: OrderStatus;
  units: OwnershipUnits;
  limitPrice?: Money;
  createdAt: ISODateTime;
}
export type BuyOrder = Order & { side: "buy" };
export type SellOrder = Order & { side: "sell" };
export interface Trade {
  id: string;
  orderId: OrderId;
  assetId: AssetId;
  units: OwnershipUnits;
  pricePerUnit: Money;
  status: TradeStatus;
  executedAt: ISODateTime;
}
export interface OrderPreview {
  assetId: AssetId;
  side: OrderSide;
  units: OwnershipUnits;
  estimatedSubtotal: Money;
  estimatedFee: Money;
  estimatedTotal: Money;
  disclaimer: string;
}

/** Safe, backend-authoritative Document 014 order contracts. */
export type TradingOrderSide = "BUY" | "SELL";
export type TradingOrderStatus =
  "OPEN" | "PARTIALLY_FILLED" | "FILLED" | "CANCELLED" | "REJECTED" | "EXPIRED";
export interface TradingOrderInput {
  /** The published market asset id, never a finance or ownership account id. */
  assetId: string;
  side: TradingOrderSide;
  type: "LIMIT";
  timeInForce: "GTC" | "IOC";
  units: string;
  limitPriceMinor: string;
}
export interface TradingOrderPreview {
  assetId: string;
  side: TradingOrderSide;
  type: "LIMIT";
  timeInForce: "GTC" | "IOC";
  units: string;
  limitPriceMinor: string;
  grossMinor: string;
  feeMinor: string;
  feeApplication: "SETTLEMENT_BOUNDARY_PENDING" | "NOT_APPLIED" | string;
  reservationMinor: string | null;
  reservationUnits: string | null;
  marketStatus: "OPEN" | "CLOSED" | "HALTED";
  eligibility: "ELIGIBLE" | "INELIGIBLE";
  /** Optional D14 executable-liquidity projection returned by ownership preview. */
  estimatedGrossMinor?: string;
  estimatedAveragePriceMinor?: string | null;
  executableUnits?: string;
  openUnits?: string;
  bestMarketPriceMinor?: string | null;
  worstExpectedPriceMinor?: string | null;
}

export type OwnershipPreviewInput = {
  assetId: string;
  side: TradingOrderSide;
  desiredOwnershipPercent?: string;
  desiredAmountMinor?: string;
  limitPriceMinor?: string;
  timeInForce: "GTC" | "IOC";
};

export type OwnershipOrderPreview = {
  assetId: string;
  side: TradingOrderSide;
  requestedOwnershipPercent: string;
  requestedSlices: string | null;
  ownershipIncrementPercent: string;
  totalSlices: string;
  availableSlices: string;
  availableOwnershipPercent: string;
  ownedSlices: string;
  ownedOwnershipPercent: string;
  resultingOwnershipPercent: string | null;
  remainingOwnershipPercent: string | null;
  slicePriceMinor: string | null;
  impliedWholeValueMinor: string | null;
  externalReferenceMinor: string | null;
  onePercentSlices: string | null;
  onePercentValueMinor: string | null;
  limitPriceMinor: string | null;
  estimatedCostMinor: string | null;
  estimatedAveragePriceMinor: string | null;
  estimatedReservationMinor: string | null;
  feeMinor: string | null;
  executableSlices: string;
  openSlices: string;
  availableCashMinor: string | null;
  cashShortfallMinor: string | null;
  maximumExceeded: boolean;
  bestMarketPriceMinor: string | null;
  worstExpectedPriceMinor: string | null;
  lowerSnap: { slices: string; ownershipPercent: string } | null;
  upperSnap: { slices: string; ownershipPercent: string } | null;
  hasImmediateLiquidity: boolean;
  marketStatus: "OPEN" | "CLOSED" | "HALTED";
  eligibility: "ELIGIBLE" | "INELIGIBLE";
  requestedAmountMinor: string | null;
  projectedRemainingAvailableIfFullyFilled: string | null;
};

export type OwnershipMarketSummary = {
  assetId: string;
  totalSlices: string;
  availableSlices: string;
  availableOwnershipPercent: string;
  ownershipIncrementPercent: string;
  slicePriceMinor: string | null;
  impliedWholeValueMinor: string | null;
  externalReferenceMinor: string | null;
  onePercentSlices: string | null;
  onePercentValueMinor: string | null;
  bestAskMinor: string | null;
  bestBidMinor: string | null;
  hasImmediateLiquidity: boolean;
  marketStatus: "OPEN" | "CLOSED" | "HALTED";
};
export interface TradingOrderView {
  id: string;
  assetId: string;
  assetSlug: string | null;
  side: TradingOrderSide;
  type: "LIMIT";
  timeInForce: "GTC" | "IOC";
  status: TradingOrderStatus;
  limitPriceMinor: string;
  originalUnits: string;
  remainingUnits: string;
  filledUnits: string;
  averageFillPriceMinor: string | null;
  createdAt: ISODateTime;
  closedAt: ISODateTime | null;
  requestedOwnershipPercent?: string | null;
  filledOwnershipPercent?: string | null;
  remainingOwnershipPercent?: string | null;
}
export interface TradingOrderPage {
  items: TradingOrderView[];
  nextCursor: string | null;
}
export interface TradingExecution {
  executionId: string;
  assetSlug: string;
  side: TradingOrderSide;
  units: string;
  priceMinor: string;
  feeMinor: string;
  settlementStatus: string;
  marketSequence: string;
  executedAt: ISODateTime;
}
export interface TradingExecutionPage {
  items: TradingExecution[];
  nextCursor: string | null;
}
