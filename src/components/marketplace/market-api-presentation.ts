import type { Asset, MarketLifecycleProjection, SimilarAsset, SliceGrade } from "@/domain";
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
  publicVerificationStatus?: "VERIFIED" | "IN_PROGRESS" | "UNAVAILABLE";
  listing?: Asset["listing"];
  custodyStatus?: string;
  insuranceActive?: boolean;
  issuedUnits?: string;
  sliceValuationAmountMinor?: number;
  sliceValuationCurrency?: SupportedCurrency;
  sliceValuationApprovedAt?: string;
  sliceValuationSourceType?: string;
  estimatedMarketValueMinor?: number;
  estimatedMarketValueCurrency?: SupportedCurrency;
  source?: string;
  asOf?: string;
  confidence?: number;
  availabilityBps?: number;
  ownersCount?: number;
  activeListingsCount?: number;
  availableListingUnits?: string;
  dataStatus?: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
  change24hBps?: number;
  marketReference?: {
    amountMinor: number;
    currency: SupportedCurrency;
    source?: string;
    context?: string;
    movement24hBps?: number;
    movement7dBps?: number;
    movement30dBps?: number;
    lastRefreshedAt?: string;
    freshness?: string;
  };
  marketReferenceLink?: {
    provider: string;
    externalReference: string;
    url: string | null;
    status: string;
    lastCheckedAt: string | null;
  };
  media?: Array<{ url: string; alt: string; slot?: string }>;
  sliceGrade?: SliceGrade;
  ownershipStatus?: string;
  tradingStatus?: string;
  tradingEnabled?: boolean;
  tradingHasExecutionHistory?: boolean;
  marketLifecycle?: MarketLifecycleProjection;
  initialOffering?: import("@/domain").InitialOfferingProjection;
  preSale?: import("@/domain").PreSaleProjection;
  preSaleBasisMinor?: number;
  preSaleBasisCurrency?: SupportedCurrency;
};

export type MarketplaceSimilarAsset = SimilarAsset;

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
  publicVerificationStatus: asset.publicVerificationStatus,
  listing: asset.listing,
  custodyStatus: asset.custody?.status,
  insuranceActive: asset.insurance?.status === "ACTIVE",
  issuedUnits: asset.ownership?.issuedUnits,
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
  sliceGrade: asset.sliceGrade,
  sliceValuationAmountMinor: asset.sliceValuation?.amount.amount,
  sliceValuationCurrency: asset.sliceValuation?.amount.currency,
  sliceValuationApprovedAt: asset.sliceValuation?.approvedAt,
  sliceValuationSourceType: asset.sliceValuation?.sourceType,
  estimatedMarketValueMinor:
    asset.sliceValuation?.amount.amount ?? asset.market?.estimatedMarketValue?.amount,
  estimatedMarketValueCurrency:
    asset.sliceValuation?.amount.currency ?? asset.market?.estimatedMarketValue?.currency,
  source: asset.market?.source,
  asOf: asset.market?.asOf,
  confidence: asset.market?.confidence ?? asset.confidence,
  availabilityBps: asset.market?.availabilityBps,
  ownersCount: asset.market?.ownersCount,
  activeListingsCount: asset.market?.activeListingsCount ?? 0,
  availableListingUnits: asset.market?.availableListingUnits ?? "0",
  dataStatus: asset.market?.dataStatus,
  change24hBps: asset.market?.change24hBps,
  marketReference: (() => {
    const direct =
      asset.market?.reference?.currentListing ?? asset.market?.reference?.recentCompletedSale;
    if (direct) {
      return {
        amountMinor: direct.amount.amount,
        currency: direct.amount.currency,
        source: direct.source,
        context: direct.externalReference,
        movement24hBps: asset.market?.reference?.movement24hBps ?? undefined,
        movement7dBps: asset.market?.reference?.movement7dBps ?? undefined,
        movement30dBps: asset.market?.reference?.movement30dBps ?? undefined,
        lastRefreshedAt: asset.market?.reference?.lastRefreshedAt ?? undefined,
        freshness: asset.market?.reference?.freshness ?? undefined,
      };
    }
    const guide = asset.marketSummary?.priceGuides;
    if (!guide?.latestMinor || !guide.currency) return undefined;
    const amountMinor = Number(guide.latestMinor);
    if (!Number.isSafeInteger(amountMinor)) return undefined;
    if (!["GBP", "USD", "CAD", "EUR"].includes(guide.currency)) return undefined;
    return {
      amountMinor,
      currency: guide.currency as SupportedCurrency,
      source: asset.market?.source ?? "External reference",
      context: "Price guide",
    };
  })(),
  marketReferenceLink: asset.market?.referenceLink,
  media: asset.media
    .filter((item) => item.kind === "image")
    .map((item) => ({ url: item.url, alt: item.alt, slot: item.slot })),
  ownershipStatus: asset.ownership?.status,
  tradingStatus: asset.trading?.status,
  tradingEnabled: asset.trading?.enabled,
  tradingHasExecutionHistory: asset.trading?.hasExecutionHistory,
  marketLifecycle: asset.marketLifecycle,
  initialOffering: asset.initialOffering,
  preSale: asset.preSale,
  preSaleBasisMinor:
    asset.preSale?.collectorEstimateMinor && /^\d+$/.test(asset.preSale.collectorEstimateMinor)
      ? Number(asset.preSale.collectorEstimateMinor)
      : undefined,
  preSaleBasisCurrency: asset.preSale?.currency,
});

export const toMarketplaceSimilarAsset = (asset: SimilarAsset): MarketplaceSimilarAsset => asset;
