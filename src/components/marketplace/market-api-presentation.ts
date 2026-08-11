import type { Asset } from "@/domain";

export type MarketplaceAsset = {
  id: string;
  slug: string;
  title: string;
  category: string;
  setName?: string;
  year?: number;
  grader?: string;
  gradeScore?: number;
  gradeLabel?: string;
  grade?: string;
  certificationNumber?: string;
  estimatedMarketValueMinor?: number;
  source?: string;
  asOf?: string;
  confidence?: number;
  availabilityBps?: number;
  ownersCount?: number;
  dataStatus?: "DEMO" | "DELAYED" | "LIVE";
  change24hBps?: number;
};

export const toMarketplaceAsset = (asset: Asset): MarketplaceAsset => ({
  id: asset.id,
  slug: asset.slug ?? asset.id,
  title: asset.details.title,
  category: asset.details.category,
  setName: asset.details.card?.set,
  year: asset.details.card?.year,
  grader: asset.grade?.company.toUpperCase(),
  gradeScore: asset.grade?.numeric,
  gradeLabel: asset.grade?.label,
  grade: asset.grade
    ? [
        asset.grade.company.toUpperCase(),
        asset.grade.numeric === undefined
          ? undefined
          : Number(asset.grade.numeric.toFixed(2)).toString(),
        asset.grade.label,
      ]
        .filter(Boolean)
        .join(" · ")
    : undefined,
  certificationNumber: asset.certification?.number,
  estimatedMarketValueMinor: asset.market?.estimatedMarketValue?.amount,
  source: asset.market?.source,
  asOf: asset.market?.asOf,
  confidence: asset.market?.confidence ?? asset.confidence,
  availabilityBps: asset.market?.availabilityBps,
  ownersCount: asset.market?.ownersCount,
  dataStatus: asset.market?.dataStatus,
  change24hBps: asset.market?.change24hBps,
});
