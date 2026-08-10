import type { Asset } from "@/domain";

export type MarketplaceAsset = {
  id: string;
  slug: string;
  title: string;
  category: string;
  setName?: string;
  grade?: string;
  estimatedMarketValueMinor?: number;
  source?: string;
  asOf?: string;
  confidence?: number;
  dataStatus?: "DEMO" | "DELAYED" | "LIVE";
  change24hBps?: number;
};

export const toMarketplaceAsset = (asset: Asset): MarketplaceAsset => ({
  id: asset.id,
  slug: asset.slug ?? asset.id,
  title: asset.details.title,
  category: asset.details.category,
  setName: asset.details.card?.set,
  grade: asset.grade ? `${asset.grade.company.toUpperCase()} ${asset.grade.label}` : undefined,
  estimatedMarketValueMinor: asset.market?.estimatedMarketValue?.amount,
  source: asset.market?.source,
  asOf: asset.market?.asOf,
  confidence: asset.market?.confidence ?? asset.confidence,
  dataStatus: asset.market?.dataStatus,
  change24hBps: asset.market?.change24hBps,
});
