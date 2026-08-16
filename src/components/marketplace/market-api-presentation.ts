import type { Asset } from "@/domain";
import type { SupportedCurrency } from "@/data/repositories";

export type MarketplaceAsset = {
  id: string;
  slug: string;
  title: string;
  category: string;
  setName?: string;
  cardNumber?: string;
  conditionLabel?: string;
  year?: number;
  grader?: string;
  gradeScore?: number;
  gradeLabel?: string;
  grade?: string;
  certificationNumber?: string;
  estimatedMarketValueMinor?: number;
  estimatedMarketValueCurrency?: SupportedCurrency;
  source?: string;
  asOf?: string;
  confidence?: number;
  availabilityBps?: number;
  ownersCount?: number;
  dataStatus?: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
  change24hBps?: number;
  marketReference?: {
    amountMinor: number;
    currency: SupportedCurrency;
  };
  media?: Array<{ url: string; alt: string }>;
};

export const toMarketplaceAsset = (asset: Asset): MarketplaceAsset => ({
  id: asset.id,
  slug: asset.slug ?? asset.id,
  title: asset.details.title,
  category: asset.details.category,
  setName: asset.details.card?.set,
  cardNumber: asset.details.card?.cardNumber,
  conditionLabel: asset.conditionLabel,
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
  estimatedMarketValueCurrency: asset.market?.estimatedMarketValue?.currency,
  source: asset.market?.source,
  asOf: asset.market?.asOf,
  confidence: asset.market?.confidence ?? asset.confidence,
  availabilityBps: asset.market?.availabilityBps,
  ownersCount: asset.market?.ownersCount,
  dataStatus: asset.market?.dataStatus,
  change24hBps: asset.market?.change24hBps,
  marketReference: (() => {
    const direct =
      asset.market?.reference?.currentListing ?? asset.market?.reference?.recentCompletedSale;
    if (direct) {
      return {
        amountMinor: direct.amount.amount,
        currency: direct.amount.currency,
      };
    }
    const guide = asset.marketSummary?.priceGuides;
    if (!guide?.latestMinor || !guide.currency) return undefined;
    const amountMinor = Number(guide.latestMinor);
    if (!Number.isSafeInteger(amountMinor)) return undefined;
    if (!['GBP', 'USD', 'CAD', 'EUR'].includes(guide.currency)) return undefined;
    return {
      amountMinor,
      currency: guide.currency as SupportedCurrency,
    };
  })(),
  media: asset.media
    .filter((item) => item.kind === "image")
    .map((item) => ({ url: item.url, alt: item.alt })),
});
