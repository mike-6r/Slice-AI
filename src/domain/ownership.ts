import type { AssetId } from "./asset";
import type { BasisPoints, Brand, ISODateTime, Money, OwnershipUnits } from "./common";
import type { UserId } from "./user";

export type OwnershipPositionId = Brand<string, "OwnershipPositionId">;
export interface OwnershipUnit {
  assetId: AssetId;
  totalUnits: OwnershipUnits;
}
export interface OwnershipPosition {
  id: OwnershipPositionId;
  userId: UserId;
  assetId: AssetId;
  units: OwnershipUnits;
  ownershipBps: BasisPoints;
  costBasis: Money;
}
export interface OwnershipListing {
  id: string;
  positionId: OwnershipPositionId;
  assetId: AssetId;
  units: OwnershipUnits;
  pricePerUnit: Money;
  createdAt: ISODateTime;
  status: "open" | "filled" | "cancelled";
}
export interface OwnershipSnapshot {
  assetId: AssetId;
  capturedAt: ISODateTime;
  totalUnits: OwnershipUnits;
  availableBps: BasisPoints;
}
export interface OwnershipTransfer {
  id: string;
  assetId: AssetId;
  fromUserId: UserId;
  toUserId: UserId;
  units: OwnershipUnits;
  occurredAt: ISODateTime;
  status: "simulated" | "pending";
}
