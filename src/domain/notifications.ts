import type { AssetId } from "./asset";
import type { ISODateTime } from "./common";
import type { UserId } from "./user";
export type NotificationType =
  "price-alert" | "order" | "portfolio" | "vault" | "discussion" | "proposal";
export interface Notification {
  id: string;
  userId: UserId;
  type: NotificationType;
  title: string;
  body: string;
  assetId?: AssetId;
  createdAt: ISODateTime;
  readAt?: ISODateTime;
}
export interface PriceAlert {
  id: string;
  assetId: AssetId;
  threshold: number;
  direction: "above" | "below";
  enabled: boolean;
}
export interface Watchlist {
  userId: UserId;
  assetIds: AssetId[];
}
