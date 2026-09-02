import { ApiClient, ApiError } from "@/api/http-client";
import type {
  AdminAccountHistoryResponse,
  AdminComplianceCase,
  AdminFinanceDashboard,
  AdminFinanceRecord,
  AdminFinanceRecordsResponse,
  AdminFinanceSummary,
  AdminTrustSupportDashboard,
  AdminTrustSupportRecord,
  AdminTrustSupportRecordsResponse,
  AdminIntegrationsSummary,
  AdminOverview,
  AdminOperationsOverview,
  AdminPlatformDashboard,
  AdminPlatformRecordsResponse,
  AdminPlatformRecord,
  AdminIntakeDetail,
  AdminIntakeLocation,
  AdminIntakeLocationDetail,
  AdminIntakeLocationsResponse,
  IntakeLocationInput,
  AdminIntakeRow,
  AdminMembershipDetailResponse,
  AdminMembershipDirectoryResponse,
  AdminMembershipRow,
  AdminRiskOperations,
  AdminComplianceDetail,
  AdminControlCenter,
  AdminCatalogueResponse,
  AdminRepository,
  AdminSearchResult,
  AdminUserDetail,
  AdminUserSummary,
  AppRepositories,
  AssetRepository,
  AssetOperationsBoardResponse,
  InitialOfferingProjection,
  InitialOfferingPreview,
  SupportedCurrency,
} from "@/data/repositories";
import type {
  Asset,
  AssetId,
  SliceGrade,
  CollectorProfile,
  CollectorDirectoryPage,
  GradingCompany,
  ISODateTime,
  Money,
  ComplianceSession,
  ComplianceSummary,
  ConnectPayoutSetup,
  WithdrawalPreflight,
  FeePolicy,
  TradingExecution,
  TradingExecutionPage,
  TradingOrderInput,
  TradingOrderPage,
  TradingOrderPreview,
  OwnershipOrderPreview,
  OwnershipMarketBreakdownCategory,
  OwnershipMarketSummary,
  TradingOrderView,
  UserId,
  WalletMovementPage,
  WalletMovementView,
  AssetSubmission,
  AssetOperationSummary,
  SaleProposal,
  SaleProposalPage,
  SubmissionCategory,
  SubmissionDetail,
  RawCardPreGrade,
  RawCardPreGradeResponse,
  SubmissionMedia,
  CertificationVerification,
  SubmissionReviewDetail,
  SubmissionReviewQueueResponse,
  SubmissionReviewSummary,
  MarketResearchSnapshot,
  CollectibleReferenceImport,
  PublicationReadiness,
  AccountCapability,
  IdentityDetailsProjection,
  MarketSummary,
  MarketSnapshot,
  SimilarAsset,
} from "@/domain";
import { basisPoints, minorUnits, percentage } from "@/domain";
import { createFinanceApiRepository } from "./finance-api-repository";

type MarketAssetDto = {
  publicId: string;
  slug: string;
  title: string;
  shortName: string | null;
  year: number | null;
  manufacturer: string | null;
  cardNumber: string | null;
  description: string | null;
  conditionLabel?: string | null;
  publicVerificationStatus?: "VERIFIED" | "IN_PROGRESS" | "UNAVAILABLE";
  publication?: { status: string; asOf: string | null } | null;
  listing?: {
    listedAt: string | null;
    listedBy: {
      displayName: string;
      username: string | null;
      slug: string;
    } | null;
  } | null;
  custody?: { status: string; asOf: string } | null;
  insurance?: { status: string; expiresAt: string } | null;
  media?: Array<{ id: string; slot: string; url: string; alt: string }>;
  sliceGrade?: SliceGrade | null;
  certificationNumber?: string;
  category: { slug: string; name: string };
  collectibleSet: { slug: string; name: string } | null;
  // The public API serializes decimal grades as strings to preserve their
  // canonical precision (for example, "10.00").
  grading: { companyCode: string; grade: string; label: string } | null;
  sliceValuation: {
    id: string;
    amount: { minor: string; currency: "GBP" | "USD" | "EUR" | "CAD" };
    confidence: number;
    sourceType: string;
    approvedAt: string;
    status: "ACTIVE";
  } | null;
  estimatedMarketValue: { minor: string; currency: "GBP" | "USD" | "EUR" | "CAD" } | null;
  change24hBps: number | null;
  availabilityBps: number | null;
  ownersCount?: number | null;
  activeListings?: { count: number; availableUnits: string } | null;
  confidence: number | null;
  source: string | null;
  markSource?: string | null;
  freshness?: string | null;
  lastSuccessfulRefreshAt?: string | null;
  dataStatus: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE" | null;
  asOf: string | null;
  marketReference: {
    currentListing?: ExternalMarketObservationDto;
    recentCompletedSale?: ExternalMarketObservationDto;
    movement24hBps?: number | null;
    movement7dBps?: number | null;
    movement30dBps?: number | null;
    movement90dBps?: number | null;
    movement1yBps?: number | null;
    lastRefreshedAt?: string | null;
    historyStartedAt?: string | null;
    freshness?: string | null;
  } | null;
  marketSummary?: {
    completedSales: MarketObservationSummaryDto | null;
    activeListings: MarketObservationSummaryDto | null;
    priceGuides: MarketObservationSummaryDto | null;
    providerCount: number;
  };
  ownership?: {
    status: string;
    totalUnits: string;
    issuedUnits: string;
  } | null;
  initialOffering?: import("@/domain").InitialOfferingProjection | null;
  marketLifecycle?: import("@/domain").MarketLifecycleProjection;
  trading?: {
    status: string;
    enabled: boolean;
    hasExecutionHistory: boolean;
  } | null;
};
type MarketObservationSummaryDto = {
  count: number;
  mixedCurrency?: boolean;
  currency?: string;
  lowMinor?: string;
  highMinor?: string;
  medianMinor?: string;
  latestMinor?: string;
  latestAt?: string;
};
type ExternalMarketObservationDto = {
  amount: { minor: string; currency: "GBP" | "USD" | "EUR" | "CAD" };
  source: string;
  externalReference: string;
  listingUrl: string;
  imageUrl?: string;
  observedAt: string;
};

type MarketAssetPageDto = { items: MarketAssetDto[]; hasMore: boolean; nextCursor: string | null };
type MarketSnapshotDto = {
  generatedAt: string;
  status: "CURRENT" | "AGING" | "STALE" | "DELAYED" | "UNAVAILABLE";
  lastUpdatedAt: string | null;
  items: Array<{
    assetId: string;
    slug: string;
    title: string;
    setName?: string;
    cardNumber?: string;
    sliceMarketPrice?: {
      amount: { minor: string; currency: SupportedCurrency };
      kind: "INITIAL_OFFERING" | "LAST_TRADE";
      observedAt: string;
    };
    externalReference?: {
      amount: { minor: string; currency: SupportedCurrency };
      source: string;
      movement24hBps?: number | null;
      lastRefreshedAt?: string | null;
      freshness?: string | null;
    };
    marketState: "INITIAL_OFFERING" | "SECONDARY_MARKET" | "REFERENCE_ONLY";
    lastUpdatedAt: string | null;
  }>;
};
type SimilarAssetDto = {
  assetId: string;
  slug: string;
  title: string;
  category: string;
  setName?: string;
  cardNumber?: string;
  thumbnail?: { url: string; alt: string } | null;
  marketState: SimilarAsset["marketState"];
  displayPrice: {
    type: SimilarAsset["displayPrice"]["type"];
    amount: { minor: string; currency: SupportedCurrency } | null;
    observedAt: string | null;
  };
  movement24hBps?: number | null;
};
type CollectorDto = {
  slug: string;
  username?: string | null;
  headline: string | null;
  specialism: string | null;
  displayName: string | null;
  avatarReference?: string | null;
  publicSince?: string | null;
  isFeatured?: boolean;
  featurePriority?: number;
  featuredCaption?: string | null;
  latestPublicListingAt?: string | null;
  featuredPreviewAssets?: Array<{
    publicId: string;
    slug: string;
    title: string;
    category: string;
    variant?: string | null;
    grade?: string | null;
    listedAt?: string | null;
    media?: Array<{ id: string; slot: string; url: string; alt: string }>;
    market: {
      estimatedValueMinor: string;
      currency: "GBP" | "USD" | "EUR" | "CAD";
      asOf: string;
      dataStatus: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
    } | null;
  }>;
  publishedListingCount?: number;
  publishedListings?: Array<{
    publicId: string;
    slug: string;
    title: string;
    category: string;
    variant?: string | null;
    grade?: string | null;
    listedAt?: string | null;
    media?: Array<{ id: string; slot: string; url: string; alt: string }>;
    market: {
      estimatedValueMinor: string;
      currency: "GBP" | "USD" | "EUR" | "CAD";
      asOf: string;
      dataStatus: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
    } | null;
  }>;
};
const mapCollector = (value: CollectorDto): CollectorProfile => ({
  userId: value.slug as UserId,
  handle: value.username ?? value.slug,
  displayName: value.displayName ?? value.slug,
  avatarUrl: value.avatarReference ?? null,
  focus: value.specialism ?? value.headline ?? "Collector profile",
  category: "mixed",
  publicSince: value.publicSince ?? undefined,
  isFeatured: value.isFeatured === true,
  featurePriority: value.featurePriority ?? 0,
  featuredCaption: value.featuredCaption ?? null,
  latestPublicListingAt: value.latestPublicListingAt ?? null,
  featuredPreviewAssets: (value.featuredPreviewAssets ?? []).map((listing) => ({
    assetId: listing.publicId as AssetId,
    slug: listing.slug,
    title: listing.title,
    category: listing.category,
    variant: listing.variant,
    grade: listing.grade,
    listedAt: listing.listedAt,
    media: listing.media,
    estimatedMarketValue: listing.market
      ? { amount: safeMinor(listing.market.estimatedValueMinor), currency: listing.market.currency }
      : undefined,
    asOf: listing.market?.asOf,
    dataStatus: listing.market?.dataStatus,
  })),
  publishedListingCount: value.publishedListingCount ?? 0,
  publishedListings: (value.publishedListings ?? []).map((listing) => ({
    assetId: listing.publicId as AssetId,
    slug: listing.slug,
    title: listing.title,
    category: listing.category,
    variant: listing.variant,
    grade: listing.grade,
    listedAt: listing.listedAt,
    media: listing.media,
    estimatedMarketValue: listing.market
      ? { amount: safeMinor(listing.market.estimatedValueMinor), currency: listing.market.currency }
      : undefined,
    asOf: listing.market?.asOf,
    dataStatus: listing.market?.dataStatus,
  })),
});

const mapCollectorPage = (value: {
  items: CollectorDto[];
  featured?: CollectorDto[];
  specialties?: Array<string | { name: string; count?: number }>;
  stats?: CollectorDirectoryPage["stats"];
  nextCursor: string | null;
  pagination?: CollectorDirectoryPage["pagination"];
}): CollectorDirectoryPage => ({
  items: value.items.map(mapCollector),
  featured: (value.featured ?? []).map(mapCollector),
  specialties: (value.specialties ?? []).map((specialty) =>
    typeof specialty === "string" ? { name: specialty } : specialty,
  ),
  stats: value.stats ?? {
    eligibleCollectorCount: value.pagination?.total ?? value.items.length,
    publishedAssetCount: value.items.reduce(
      (sum, collector) => sum + (collector.publishedListingCount ?? 0),
      0,
    ),
    featuredCollectorCount: value.featured?.length ?? 0,
  },
  nextCursor: value.nextCursor,
  pagination: value.pagination ?? {
    page: 1,
    pageSize: value.items.length,
    total: value.items.length,
    totalPages: value.items.length ? 1 : 0,
    hasNextPage: Boolean(value.nextCursor),
    hasPreviousPage: false,
  },
});

const safeMinor = (value: string): Money["amount"] => {
  const amount = Number(value);
  if (!Number.isSafeInteger(amount))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid money value from service.");
  return minorUnits(amount);
};
/** Legacy order-book presentation needs a number; reject unsafe wire units instead of rounding them. */
const safeUnitCount = (value: string) => {
  if (!/^\d+$/.test(value))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid unit value from service.");
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Unit value exceeds safe display range.");
  return parsed;
};

export const mapMarketAsset = (value: MarketAssetDto): Asset => ({
  id: value.publicId as AssetId,
  slug: value.slug,
  symbol: value.slug.toUpperCase(),
  details: {
    title: value.title,
    category: value.category.slug as Asset["details"]["category"],
    description: value.description ?? undefined,
    card: {
      manufacturer: value.manufacturer ?? undefined,
      set: value.collectibleSet?.name,
      cardNumber: value.cardNumber ?? undefined,
      year: value.year ?? undefined,
    },
  },
  conditionLabel: value.conditionLabel ?? undefined,
  publicVerificationStatus: value.publicVerificationStatus,
  publication: value.publication
    ? { status: value.publication.status, asOf: value.publication.asOf as ISODateTime | null }
    : undefined,
  listing: value.listing
    ? {
        listedAt: value.listing.listedAt as ISODateTime | null,
        listedBy: value.listing.listedBy,
      }
    : undefined,
  custody: value.custody
    ? { status: value.custody.status, asOf: value.custody.asOf as ISODateTime }
    : null,
  insurance: value.insurance
    ? { status: value.insurance.status, expiresAt: value.insurance.expiresAt as ISODateTime }
    : null,
  status: "listed",
  media: [...(value.media ?? [])]
    .sort((a, b) => {
      const aIsFront = a.slot.toLowerCase() === "front";
      const bIsFront = b.slot.toLowerCase() === "front";
      return Number(bIsFront) - Number(aIsFront);
    })
    .map((item, index) => ({
      id: item.id,
      url: item.url,
      alt: item.alt,
      kind: "image" as const,
      order: index,
    })),
  sliceGrade: value.sliceGrade ?? undefined,
  grade: value.grading
    ? {
        company: value.grading.companyCode.toLowerCase() as GradingCompany,
        label: value.grading.label,
        numeric: Number(value.grading.grade),
      }
    : undefined,
  certification:
    value.grading && value.certificationNumber
      ? {
          company: value.grading.companyCode.toUpperCase() as GradingCompany,
          number: value.certificationNumber,
        }
      : undefined,
  sliceValuation: value.sliceValuation
    ? {
        id: value.sliceValuation.id,
        amount: {
          amount: safeMinor(value.sliceValuation.amount.minor),
          currency: value.sliceValuation.amount.currency,
        },
        confidence: percentage(value.sliceValuation.confidence),
        sourceType: value.sliceValuation.sourceType,
        approvedAt: value.sliceValuation.approvedAt as ISODateTime,
        status: value.sliceValuation.status,
      }
    : undefined,
  market: {
    estimatedMarketValue: value.estimatedMarketValue
      ? {
          amount: safeMinor(value.estimatedMarketValue.minor),
          currency: value.estimatedMarketValue.currency,
        }
      : undefined,
    source: value.source ?? undefined,
    markSource: value.markSource ?? undefined,
    freshness: value.freshness ?? undefined,
    lastSuccessfulRefreshAt: value.lastSuccessfulRefreshAt as ISODateTime | undefined,
    asOf: (value.asOf ?? undefined) as ISODateTime | undefined,
    confidence: value.confidence === null ? undefined : percentage(value.confidence),
    dataStatus: value.dataStatus ?? undefined,
    change24hBps: value.change24hBps ?? undefined,
    availabilityBps:
      value.availabilityBps === null || value.availabilityBps === undefined
        ? undefined
        : basisPoints(value.availabilityBps),
    ownersCount: value.ownersCount ?? undefined,
    activeListingsCount: value.activeListings?.count ?? 0,
    availableListingUnits: value.activeListings?.availableUnits ?? "0",
    hasTradingHistory: value.trading?.hasExecutionHistory ?? false,
    reference: value.marketReference
      ? {
          ...(value.marketReference.currentListing
            ? { currentListing: mapExternalMarketObservation(value.marketReference.currentListing) }
            : {}),
          ...(value.marketReference.recentCompletedSale
            ? {
                recentCompletedSale: mapExternalMarketObservation(
                  value.marketReference.recentCompletedSale,
                ),
              }
            : {}),
          movement24hBps: value.marketReference.movement24hBps ?? null,
          movement7dBps: value.marketReference.movement7dBps ?? null,
          movement30dBps: value.marketReference.movement30dBps ?? null,
          movement90dBps: value.marketReference.movement90dBps ?? null,
          movement1yBps: value.marketReference.movement1yBps ?? null,
          lastRefreshedAt: value.marketReference.lastRefreshedAt as ISODateTime | null,
          historyStartedAt: value.marketReference.historyStartedAt as ISODateTime | null,
          freshness: value.marketReference.freshness ?? undefined,
        }
      : undefined,
  },
  marketSummary: value.marketSummary
    ? {
        completedSales: mapMarketObservationSummary(value.marketSummary.completedSales),
        activeListings: mapMarketObservationSummary(value.marketSummary.activeListings),
        priceGuides: mapMarketObservationSummary(value.marketSummary.priceGuides),
        providerCount: value.marketSummary.providerCount,
      }
    : undefined,
  ownership: value.ownership ?? undefined,
  initialOffering: value.initialOffering ?? undefined,
  trading: value.trading ?? undefined,
  marketLifecycle: value.marketLifecycle,
});

const mapMarketSnapshot = (value: MarketSnapshotDto): MarketSnapshot => ({
  generatedAt: value.generatedAt as ISODateTime,
  status: value.status,
  lastUpdatedAt: value.lastUpdatedAt as ISODateTime | null,
  items: value.items.map((item) => ({
    assetId: item.assetId as AssetId,
    slug: item.slug,
    title: item.title,
    ...(item.setName ? { setName: item.setName } : {}),
    ...(item.cardNumber ? { cardNumber: item.cardNumber } : {}),
    ...(item.sliceMarketPrice
      ? {
          sliceMarketPrice: {
            amount: {
              amount: safeMinor(item.sliceMarketPrice.amount.minor),
              currency: item.sliceMarketPrice.amount.currency,
            },
            kind: item.sliceMarketPrice.kind,
            observedAt: item.sliceMarketPrice.observedAt as ISODateTime,
          },
        }
      : {}),
    ...(item.externalReference
      ? {
          externalReference: {
            amount: {
              amount: safeMinor(item.externalReference.amount.minor),
              currency: item.externalReference.amount.currency,
            },
            source: item.externalReference.source,
            movement24hBps: item.externalReference.movement24hBps ?? null,
            lastRefreshedAt: item.externalReference.lastRefreshedAt as ISODateTime | null,
            freshness: item.externalReference.freshness ?? null,
          },
        }
      : {}),
    marketState: item.marketState,
    lastUpdatedAt: item.lastUpdatedAt as ISODateTime | null,
  })),
});

const mapMarketObservationSummary = (value: MarketObservationSummaryDto | null | undefined) =>
  value
    ? {
        ...value,
        latestAt: value.latestAt as import("@/domain/common").ISODateTime | undefined,
      }
    : null;

const mapExternalMarketObservation = (value: ExternalMarketObservationDto) => ({
  amount: { amount: safeMinor(value.amount.minor), currency: value.amount.currency },
  source: value.source,
  externalReference: value.externalReference,
  listingUrl: value.listingUrl,
  imageUrl: value.imageUrl,
  observedAt: value.observedAt as ISODateTime,
});

const unsupported = (name: string) => () =>
  Promise.reject(new ApiError("FEATURE_UNAVAILABLE", `${name} is not yet available from the API.`));

const stringField = (value: unknown, field: string) => {
  if (typeof value !== "string" || value.length === 0)
    throw new ApiError("CLIENT_CONTRACT_ERROR", `Invalid ${field} from service.`);
  return value;
};
const stringArrayField = (value: unknown, field: string) => {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string"))
    throw new ApiError("CLIENT_CONTRACT_ERROR", `Invalid ${field} from service.`);
  return value;
};
const nullableString = (value: unknown, field: string) => {
  if (value === null) return null;
  return stringField(value, field);
};
const booleanField = (value: unknown, field: string) => {
  if (typeof value !== "boolean")
    throw new ApiError("CLIENT_CONTRACT_ERROR", `Invalid ${field} from service.`);
  return value;
};
const mapNotificationPreferences = (
  raw: unknown,
): Awaited<ReturnType<AppRepositories["account"]["getNotificationPreferences"]>> => {
  const value = objectField(raw, "notification preferences");
  if (!Array.isArray(value.preferences))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid notification preferences from service.");
  return {
    preferences: value.preferences.map((rawPreference) => {
      const preference = objectField(rawPreference, "notification preference");
      const topic = preference.topic;
      if (topic !== "ORDER_UPDATES" && topic !== "PORTFOLIO_UPDATES")
        throw new ApiError(
          "CLIENT_CONTRACT_ERROR",
          "Invalid notification preference topic from service.",
        );
      if (preference.channel !== "IN_APP")
        throw new ApiError(
          "CLIENT_CONTRACT_ERROR",
          "Invalid notification preference channel from service.",
        );
      return {
        topic: topic as "ORDER_UPDATES" | "PORTFOLIO_UPDATES",
        channel: "IN_APP" as const,
        enabled: booleanField(preference.enabled, "notificationPreference.enabled"),
      };
    }),
  };
};
const objectField = (value: unknown, field: string): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new ApiError("CLIENT_CONTRACT_ERROR", `Invalid ${field} from service.`);
  return value as Record<string, unknown>;
};
const mapTradingOrder = (raw: unknown): TradingOrderView => {
  const value = objectField(raw, "trading order");
  const side = value.side;
  const status = value.status;
  const tif = value.timeInForce;
  if (
    (side !== "BUY" && side !== "SELL") ||
    !["OPEN", "PARTIALLY_FILLED", "FILLED", "CANCELLED", "REJECTED", "EXPIRED"].includes(
      String(status),
    ) ||
    (tif !== "GTC" && tif !== "IOC") ||
    value.type !== "LIMIT"
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid trading order state from service.");
  return {
    id: stringField(value.id, "order.id"),
    assetId: stringField(value.assetId, "order.assetId"),
    assetSlug:
      value.assetSlug === undefined ? null : nullableString(value.assetSlug, "order.assetSlug"),
    assetSummary:
      value.assetSummary && typeof value.assetSummary === "object"
        ? (() => {
            const summary = objectField(value.assetSummary, "order.assetSummary");
            return {
              slug: nullableString(summary.slug, "order.assetSummary.slug"),
              title: stringField(summary.title, "order.assetSummary.title"),
              category: nullableString(summary.category, "order.assetSummary.category"),
              setName: nullableString(summary.setName, "order.assetSummary.setName"),
              thumbnailUrl: nullableString(summary.thumbnailUrl, "order.assetSummary.thumbnailUrl"),
            };
          })()
        : undefined,
    side,
    type: "LIMIT",
    timeInForce: tif,
    status: status as TradingOrderView["status"],
    limitPriceMinor: stringField(value.limitPriceMinor, "order.limitPriceMinor"),
    originalUnits: stringField(value.originalUnits, "order.originalUnits"),
    remainingUnits: stringField(value.remainingUnits, "order.remainingUnits"),
    filledUnits: stringField(value.filledUnits, "order.filledUnits"),
    averageFillPriceMinor: nullableString(
      value.averageFillPriceMinor,
      "order.averageFillPriceMinor",
    ),
    createdAt: stringField(value.createdAt, "order.createdAt") as ISODateTime,
    closedAt: nullableString(value.closedAt, "order.closedAt") as ISODateTime | null,
    requestedOwnershipPercent: nullableString(
      value.requestedOwnershipPercent,
      "order.requestedOwnershipPercent",
    ),
    filledOwnershipPercent: nullableString(
      value.filledOwnershipPercent,
      "order.filledOwnershipPercent",
    ),
    remainingOwnershipPercent: nullableString(
      value.remainingOwnershipPercent,
      "order.remainingOwnershipPercent",
    ),
  };
};
const mapTradingPreview = (raw: unknown): TradingOrderPreview => {
  const value = objectField(raw, "trading preview");
  if (
    (value.side !== "BUY" && value.side !== "SELL") ||
    (value.timeInForce !== "GTC" && value.timeInForce !== "IOC") ||
    value.type !== "LIMIT"
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid trading preview from service.");
  return {
    assetId: stringField(value.assetId, "preview.assetId"),
    side: value.side,
    type: "LIMIT",
    timeInForce: value.timeInForce,
    units: stringField(value.units, "preview.units"),
    limitPriceMinor: stringField(value.limitPriceMinor, "preview.limitPriceMinor"),
    grossMinor: stringField(value.grossMinor, "preview.grossMinor"),
    feeMinor: stringField(value.feeMinor, "preview.feeMinor"),
    feeApplication: stringField(value.feeApplication, "preview.feeApplication"),
    feeRole:
      value.feeRole === "MAKER" || value.feeRole === "TAKER"
        ? value.feeRole
        : value.feeRole === null
          ? null
          : undefined,
    ...(value.feeBps === undefined ? {} : { feeBps: Number(value.feeBps) }),
    reservationMinor: nullableString(value.reservationMinor, "preview.reservationMinor"),
    reservationUnits: nullableString(value.reservationUnits, "preview.reservationUnits"),
    marketStatus: stringField(
      value.marketStatus,
      "preview.marketStatus",
    ) as TradingOrderPreview["marketStatus"],
    eligibility: stringField(
      value.eligibility,
      "preview.eligibility",
    ) as TradingOrderPreview["eligibility"],
    estimatedGrossMinor:
      value.estimatedGrossMinor === undefined
        ? undefined
        : stringField(value.estimatedGrossMinor, "preview.estimatedGrossMinor"),
    estimatedAveragePriceMinor:
      value.estimatedAveragePriceMinor === undefined
        ? undefined
        : nullableString(value.estimatedAveragePriceMinor, "preview.estimatedAveragePriceMinor"),
    executableUnits:
      value.executableUnits === undefined
        ? undefined
        : stringField(value.executableUnits, "preview.executableUnits"),
    openUnits:
      value.openUnits === undefined ? undefined : stringField(value.openUnits, "preview.openUnits"),
    bestMarketPriceMinor:
      value.bestMarketPriceMinor === undefined
        ? undefined
        : nullableString(value.bestMarketPriceMinor, "preview.bestMarketPriceMinor"),
    worstExpectedPriceMinor:
      value.worstExpectedPriceMinor === undefined
        ? undefined
        : nullableString(value.worstExpectedPriceMinor, "preview.worstExpectedPriceMinor"),
  };
};
const mapOwnershipPreview = (raw: unknown): OwnershipOrderPreview => {
  const value = objectField(raw, "ownership preview");
  const snap = (input: unknown, label: string) => {
    if (input === null || input === undefined) return null;
    const item = objectField(input, label);
    return {
      slices: stringField(item.slices, `${label}.slices`),
      ownershipPercent: stringField(item.ownershipPercent, `${label}.ownershipPercent`),
    };
  };
  return {
    assetId: stringField(value.assetId, "ownershipPreview.assetId"),
    side: value.side as OwnershipOrderPreview["side"],
    requestedOwnershipPercent: stringField(
      value.requestedOwnershipPercent,
      "ownershipPreview.requestedOwnershipPercent",
    ),
    requestedSlices: nullableString(value.requestedSlices, "ownershipPreview.requestedSlices"),
    ownershipIncrementPercent: stringField(
      value.ownershipIncrementPercent,
      "ownershipPreview.ownershipIncrementPercent",
    ),
    totalSlices: stringField(value.totalSlices, "ownershipPreview.totalSlices"),
    availableSlices: stringField(value.availableSlices, "ownershipPreview.availableSlices"),
    availableOwnershipPercent: stringField(
      value.availableOwnershipPercent,
      "ownershipPreview.availableOwnershipPercent",
    ),
    ownedSlices: stringField(value.ownedSlices, "ownershipPreview.ownedSlices"),
    ownedOwnershipPercent: stringField(
      value.ownedOwnershipPercent,
      "ownershipPreview.ownedOwnershipPercent",
    ),
    resultingOwnershipPercent: nullableString(
      value.resultingOwnershipPercent,
      "ownershipPreview.resultingOwnershipPercent",
    ),
    remainingOwnershipPercent: nullableString(
      value.remainingOwnershipPercent,
      "ownershipPreview.remainingOwnershipPercent",
    ),
    slicePriceMinor: nullableString(value.slicePriceMinor, "ownershipPreview.slicePriceMinor"),
    impliedWholeValueMinor: nullableString(
      value.impliedWholeValueMinor,
      "ownershipPreview.impliedWholeValueMinor",
    ),
    externalReferenceMinor: nullableString(
      value.externalReferenceMinor,
      "ownershipPreview.externalReferenceMinor",
    ),
    onePercentSlices: nullableString(value.onePercentSlices, "ownershipPreview.onePercentSlices"),
    onePercentValueMinor: nullableString(
      value.onePercentValueMinor,
      "ownershipPreview.onePercentValueMinor",
    ),
    limitPriceMinor: nullableString(value.limitPriceMinor, "ownershipPreview.limitPriceMinor"),
    estimatedCostMinor: nullableString(
      value.estimatedCostMinor,
      "ownershipPreview.estimatedCostMinor",
    ),
    estimatedAveragePriceMinor: nullableString(
      value.estimatedAveragePriceMinor,
      "ownershipPreview.estimatedAveragePriceMinor",
    ),
    estimatedReservationMinor: nullableString(
      value.estimatedReservationMinor,
      "ownershipPreview.estimatedReservationMinor",
    ),
    feeMinor: nullableString(value.feeMinor, "ownershipPreview.feeMinor"),
    executableSlices: stringField(value.executableSlices, "ownershipPreview.executableSlices"),
    openSlices: stringField(value.openSlices, "ownershipPreview.openSlices"),
    availableCashMinor: nullableString(
      value.availableCashMinor,
      "ownershipPreview.availableCashMinor",
    ),
    cashShortfallMinor: nullableString(
      value.cashShortfallMinor,
      "ownershipPreview.cashShortfallMinor",
    ),
    maximumExceeded: Boolean(value.maximumExceeded),
    bestMarketPriceMinor: nullableString(
      value.bestMarketPriceMinor,
      "ownershipPreview.bestMarketPriceMinor",
    ),
    worstExpectedPriceMinor: nullableString(
      value.worstExpectedPriceMinor,
      "ownershipPreview.worstExpectedPriceMinor",
    ),
    lowerSnap: snap(value.lowerSnap, "ownershipPreview.lowerSnap"),
    upperSnap: snap(value.upperSnap, "ownershipPreview.upperSnap"),
    hasImmediateLiquidity: Boolean(value.hasImmediateLiquidity),
    marketStatus: value.marketStatus as OwnershipOrderPreview["marketStatus"],
    eligibility: value.eligibility as OwnershipOrderPreview["eligibility"],
    requestedAmountMinor: nullableString(
      value.requestedAmountMinor,
      "ownershipPreview.requestedAmountMinor",
    ),
    projectedRemainingAvailableIfFullyFilled: nullableString(
      value.projectedRemainingAvailableIfFullyFilled,
      "ownershipPreview.projectedRemainingAvailableIfFullyFilled",
    ),
  };
};
const mapOwnershipMarketSummary = (raw: unknown): OwnershipMarketSummary => {
  const value = objectField(raw, "ownership market summary");
  return {
    assetId: stringField(value.assetId, "summary.assetId"),
    currency: value.currency as OwnershipMarketSummary["currency"],
    totalSlices: stringField(value.totalSlices, "summary.totalSlices"),
    availableSlices: stringField(value.availableSlices, "summary.availableSlices"),
    availableOwnershipPercent: stringField(
      value.availableOwnershipPercent,
      "summary.availableOwnershipPercent",
    ),
    ownershipIncrementPercent: stringField(
      value.ownershipIncrementPercent,
      "summary.ownershipIncrementPercent",
    ),
    slicePriceMinor: nullableString(value.slicePriceMinor, "summary.slicePriceMinor"),
    impliedWholeValueMinor: nullableString(
      value.impliedWholeValueMinor,
      "summary.impliedWholeValueMinor",
    ),
    externalReferenceMinor: nullableString(
      value.externalReferenceMinor,
      "summary.externalReferenceMinor",
    ),
    onePercentSlices: nullableString(value.onePercentSlices, "summary.onePercentSlices"),
    onePercentValueMinor: nullableString(
      value.onePercentValueMinor,
      "summary.onePercentValueMinor",
    ),
    bestAskMinor: nullableString(value.bestAskMinor, "summary.bestAskMinor"),
    bestBidMinor: nullableString(value.bestBidMinor, "summary.bestBidMinor"),
    hasImmediateLiquidity: Boolean(value.hasImmediateLiquidity),
    marketStatus: value.marketStatus as OwnershipMarketSummary["marketStatus"],
    ownershipBreakdown:
      value.ownershipBreakdown && typeof value.ownershipBreakdown === "object"
        ? {
            semantics: (value.ownershipBreakdown as Record<string, unknown>)
              .semantics as "SETTLED_OWNERSHIP",
            categories: Array.isArray(
              (value.ownershipBreakdown as Record<string, unknown>).categories,
            )
              ? (
                  (value.ownershipBreakdown as Record<string, unknown>).categories as Array<
                    Record<string, unknown>
                  >
                ).map((category, index) => ({
                  key: stringField(
                    category.key,
                    `summary.ownershipBreakdown.categories[${index}].key`,
                  ) as OwnershipMarketBreakdownCategory["key"],
                  label: stringField(
                    category.label,
                    `summary.ownershipBreakdown.categories[${index}].label`,
                  ),
                  units: stringField(
                    category.units,
                    `summary.ownershipBreakdown.categories[${index}].units`,
                  ),
                  tone: stringField(
                    category.tone,
                    `summary.ownershipBreakdown.categories[${index}].tone`,
                  ) as "retained" | "owned" | "available" | "inventory" | "unallocated",
                }))
              : [],
            reconciles: booleanField(
              (value.ownershipBreakdown as Record<string, unknown>).reconciles,
              "summary.ownershipBreakdown.reconciles",
            ),
            issuedUnits: stringField(
              (value.ownershipBreakdown as Record<string, unknown>).issuedUnits,
              "summary.ownershipBreakdown.issuedUnits",
            ),
            categorizedUnits: stringField(
              (value.ownershipBreakdown as Record<string, unknown>).categorizedUnits,
              "summary.ownershipBreakdown.categorizedUnits",
            ),
            listedAvailability: (() => {
              const listed = objectField(
                (value.ownershipBreakdown as Record<string, unknown>).listedAvailability,
                "summary.ownershipBreakdown.listedAvailability",
              );
              return {
                units: stringField(
                  listed.units,
                  "summary.ownershipBreakdown.listedAvailability.units",
                ),
                percentage: stringField(
                  listed.percentage,
                  "summary.ownershipBreakdown.listedAvailability.percentage",
                ),
                relationship: listed.relationship as
                  "SUBSET_OF_OWNERSHIP_BUCKET" | "SEPARATE_INVENTORY",
              };
            })(),
          }
        : undefined,
  };
};
const mapTradingPage = (raw: unknown): TradingOrderPage => {
  const value = objectField(raw, "orders page");
  if (!Array.isArray(value.items))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid orders page from service.");
  return {
    items: value.items.map(mapTradingOrder),
    nextCursor: nullableString(value.nextCursor, "orders.nextCursor"),
    ...(typeof value.page === "number" ? { page: value.page } : {}),
    ...(typeof value.pageSize === "number" ? { pageSize: value.pageSize } : {}),
    ...(typeof value.total === "number" ? { total: value.total } : {}),
    ...(typeof value.totalPages === "number" ? { totalPages: value.totalPages } : {}),
  };
};
const mapExecutionPage = (raw: unknown): TradingExecutionPage => {
  const value = objectField(raw, "executions page");
  if (!Array.isArray(value.items))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid executions page from service.");
  const items: TradingExecution[] = value.items.map((rawItem) => {
    const item = objectField(rawItem, "execution");
    if (item.side !== "BUY" && item.side !== "SELL")
      throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid execution side from service.");
    return {
      executionId: stringField(item.executionId, "execution.id"),
      assetSlug: stringField(item.assetSlug, "execution.assetSlug"),
      assetSummary:
        item.assetSummary && typeof item.assetSummary === "object"
          ? (() => {
              const summary = objectField(item.assetSummary, "execution.assetSummary");
              return {
                slug: nullableString(summary.slug, "execution.assetSummary.slug"),
                title: stringField(summary.title, "execution.assetSummary.title"),
                category: nullableString(summary.category, "execution.assetSummary.category"),
                setName: nullableString(summary.setName, "execution.assetSummary.setName"),
                thumbnailUrl: nullableString(
                  summary.thumbnailUrl,
                  "execution.assetSummary.thumbnailUrl",
                ),
              };
            })()
          : undefined,
      side: item.side,
      units: stringField(item.units, "execution.units"),
      priceMinor: stringField(item.priceMinor, "execution.priceMinor"),
      feeMinor: stringField(item.feeMinor, "execution.feeMinor"),
      ...(item.grossMinor === undefined
        ? {}
        : { grossMinor: stringField(item.grossMinor, "execution.grossMinor") }),
      ...(item.netMinor === undefined
        ? {}
        : { netMinor: stringField(item.netMinor, "execution.netMinor") }),
      settlementStatus: stringField(item.settlementStatus, "execution.settlementStatus"),
      marketSequence: stringField(item.marketSequence, "execution.marketSequence"),
      executedAt: stringField(item.executedAt, "execution.executedAt") as ISODateTime,
    };
  });
  return { items, nextCursor: nullableString(value.nextCursor, "executions.nextCursor") };
};
const mapCompliance = (raw: unknown): ComplianceSummary => {
  const value = objectField(raw, "compliance status");
  if (!["NOT_STARTED", "PENDING", "APPROVED", "REVIEW", "REJECTED"].includes(String(value.status)))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid compliance status from service.");
  return {
    status: value.status as ComplianceSummary["status"],
    identityState: [
      "NOT_STARTED",
      "REQUIRES_INPUT",
      "PROCESSING",
      "VERIFIED",
      "FAILED",
      "CANCELED",
    ].includes(String(value.identityState))
      ? (value.identityState as ComplianceSummary["identityState"])
      : undefined,
    provider: ["LOCAL_TEST", "STRIPE_SANDBOX", "STRIPE_LIVE"].includes(String(value.provider))
      ? (value.provider as ComplianceSummary["provider"])
      : undefined,
    expiresAt: nullableString(value.expiresAt, "compliance.expiresAt") as ISODateTime | null,
    updatedAt: nullableString(value.updatedAt, "compliance.updatedAt") as ISODateTime | null,
    capability:
      value.capability === "NOT_REQUIRED_IN_CURRENT_BETA" || value.capability === "NOT_CONFIGURED"
        ? value.capability
        : undefined,
  };
};
const mapIdentityDetails = (raw: unknown): IdentityDetailsProjection => {
  const value = objectField(raw, "identity details");
  const available = booleanField(value.available, "identityDetails.available");
  const details =
    value.details === null
      ? null
      : (() => {
          const source = objectField(value.details, "identityDetails.details");
          const address =
            source.address === null
              ? null
              : (() => {
                  const item = objectField(source.address, "identityDetails.address");
                  return {
                    line1: nullableString(item.line1, "identityDetails.address.line1"),
                    line2: nullableString(item.line2, "identityDetails.address.line2"),
                    city: nullableString(item.city, "identityDetails.address.city"),
                    region: nullableString(item.region, "identityDetails.address.region"),
                    postalCode: nullableString(
                      item.postalCode,
                      "identityDetails.address.postalCode",
                    ),
                    countryCode: nullableString(
                      item.countryCode,
                      "identityDetails.address.countryCode",
                    ),
                  };
                })();
          return {
            fullName: nullableString(source.fullName, "identityDetails.fullName"),
            email: nullableString(source.email, "identityDetails.email"),
            phone: nullableString(source.phone, "identityDetails.phone"),
            dateOfBirth: nullableString(source.dateOfBirth, "identityDetails.dateOfBirth"),
            address,
          };
        })();
  if (available !== Boolean(details))
    throw new ApiError(
      "CLIENT_CONTRACT_ERROR",
      "Invalid identity details availability from service.",
    );
  return {
    available,
    verifiedAt: nullableString(
      value.verifiedAt,
      "identityDetails.verifiedAt",
    ) as ISODateTime | null,
    details,
  };
};
const mapMovement = (raw: unknown): WalletMovementView => {
  const value = objectField(raw, "wallet movement");
  if (
    (value.type !== "DEPOSIT" && value.type !== "WITHDRAWAL") ||
    ![
      "CREATED",
      "PENDING_PROVIDER",
      "PROCESSING",
      "SETTLED",
      "FAILED",
      "CANCELLED",
      "RETURNED",
      "MANUAL_REVIEW",
      "HELD",
      "REVERSED",
    ].includes(String(value.status)) ||
    value.currency !== "GBP" ||
    typeof value.replayed !== "boolean"
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid wallet movement from service.");
  return {
    id: stringField(value.id, "movement.id"),
    type: value.type,
    amountMinor: stringField(value.amountMinor, "movement.amountMinor"),
    ...(value.sliceFeeMinor === undefined
      ? {}
      : { sliceFeeMinor: stringField(value.sliceFeeMinor, "movement.sliceFeeMinor") }),
    ...(value.providerAmountMinor === undefined
      ? {}
      : {
          providerAmountMinor: stringField(
            value.providerAmountMinor,
            "movement.providerAmountMinor",
          ),
        }),
    currency: "GBP",
    status: value.status as WalletMovementView["status"],
    createdAt: stringField(value.createdAt, "movement.createdAt") as ISODateTime,
    updatedAt: stringField(value.updatedAt, "movement.updatedAt") as ISODateTime,
    replayed: value.replayed,
    ...(value.sourceLabel === undefined
      ? {}
      : { sourceLabel: nullableString(value.sourceLabel, "movement.sourceLabel") }),
    ...(value.reference === undefined
      ? {}
      : { reference: nullableString(value.reference, "movement.reference") }),
  };
};
const mapMovementPage = (raw: unknown): WalletMovementPage => {
  const value = objectField(raw, "wallet movements page");
  if (!Array.isArray(value.items))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid wallet movements from service.");
  return {
    items: value.items.map(mapMovement),
    nextCursor: nullableString(value.nextCursor, "movements.nextCursor"),
  };
};
const mapBankConnection = (raw: unknown): import("@/domain").BankConnection => {
  const value = objectField(raw, "bank connection");
  if (
    value.currency !== "GBP" ||
    !["CONNECTED", "DISCONNECTED", "EXPIRED"].includes(String(value.status))
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid bank connection from service.");
  return {
    id: stringField(value.id, "bankConnection.id"),
    institutionName: nullableString(value.institutionName, "bankConnection.institutionName"),
    accountName: nullableString(value.accountName, "bankConnection.accountName"),
    accountMask: nullableString(value.accountMask, "bankConnection.accountMask"),
    accountType: stringField(value.accountType, "bankConnection.accountType"),
    currency: "GBP",
    status: value.status as import("@/domain").BankConnection["status"],
    riskState: [
      "CLEAR",
      "SHARED_INSTRUMENT_REVIEW",
      "DUPLICATE_INSTRUMENT_BLOCKED",
      "MANUAL_REVIEW_REQUIRED",
    ].includes(String(value.riskState))
      ? (value.riskState as import("@/domain").BankConnection["riskState"])
      : undefined,
    isDefault: Boolean(value.isDefault),
    updatedAt: stringField(value.updatedAt, "bankConnection.updatedAt") as ISODateTime,
  };
};
const mapConnectPayoutSetup = (raw: unknown): ConnectPayoutSetup => {
  const value = objectField(raw, "connect payout setup");
  if (
    !["NOT_STARTED", "ACTION_REQUIRED", "UNDER_REVIEW", "READY", "RESTRICTED", "DISABLED"].includes(
      String(value.status),
    )
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid connect payout status from service.");
  const summary = value.requirementsSummary;
  if (summary !== null && (typeof summary !== "object" || Array.isArray(summary)))
    throw new ApiError(
      "CLIENT_CONTRACT_ERROR",
      "Invalid connect payout requirements from service.",
    );
  return {
    status: value.status as ConnectPayoutSetup["status"],
    requirementsSummary:
      summary === null
        ? null
        : {
            currentlyDueCount: Number((summary as Record<string, unknown>).currentlyDueCount ?? 0),
            pastDueCount: Number((summary as Record<string, unknown>).pastDueCount ?? 0),
            pendingVerificationCount: Number(
              (summary as Record<string, unknown>).pendingVerificationCount ?? 0,
            ),
            hasValidationErrors: Boolean((summary as Record<string, unknown>).hasValidationErrors),
            hasDisabledReason: Boolean((summary as Record<string, unknown>).hasDisabledReason),
          },
    onboardingUrl: nullableString(value.onboardingUrl, "connect.onboardingUrl"),
    expiresAt:
      value.expiresAt === null
        ? null
        : typeof value.expiresAt === "number" && Number.isFinite(value.expiresAt)
          ? (new Date(value.expiresAt * 1000).toISOString() as ISODateTime)
          : (nullableString(value.expiresAt, "connect.expiresAt") as ISODateTime),
  };
};
const mapWithdrawalPreflight = (raw: unknown): WithdrawalPreflight => {
  const value = objectField(raw, "withdrawal preflight");
  const providerStatus = ["AVAILABLE", "INSUFFICIENT", "UNAVAILABLE", "NOT_APPLICABLE"].includes(
    String(value.providerLiquidityStatus),
  )
    ? (value.providerLiquidityStatus as WithdrawalPreflight["providerLiquidityStatus"])
    : null;
  const eligibilityStatus = ["AVAILABLE", "MATURITY_PENDING", "INSUFFICIENT_CASH"].includes(
    String(value.customerEligibilityStatus),
  )
    ? (value.customerEligibilityStatus as WithdrawalPreflight["customerEligibilityStatus"])
    : null;
  if (value.currency !== "GBP" || !providerStatus || !eligibilityStatus)
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid withdrawal preflight from service.");
  return {
    currency: "GBP",
    walletAvailableMinor: stringField(value.walletAvailableMinor, "preflight.walletAvailableMinor"),
    tradeAvailableMinor: stringField(value.tradeAvailableMinor, "preflight.tradeAvailableMinor"),
    customerEligibleMinor: stringField(
      value.customerEligibleMinor,
      "preflight.customerEligibleMinor",
    ),
    withdrawableMinor: stringField(value.withdrawableMinor, "preflight.withdrawableMinor"),
    settlingMinor: stringField(value.settlingMinor, "preflight.settlingMinor"),
    reservedMinor: stringField(value.reservedMinor, "preflight.reservedMinor"),
    grossMinor: stringField(value.grossMinor, "preflight.grossMinor"),
    feeMinor: stringField(value.feeMinor, "preflight.feeMinor"),
    netPayoutMinor: stringField(value.netPayoutMinor, "preflight.netPayoutMinor"),
    maturityStatus: ["MATURED", "PARTIALLY_SETTLING", "SETTLING", "NOT_AVAILABLE"].includes(
      String(value.maturityStatus),
    )
      ? (value.maturityStatus as WithdrawalPreflight["maturityStatus"])
      : (() => {
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid preflight.maturityStatus.");
        })(),
    customerEligibilityStatus: eligibilityStatus,
    providerLiquidityStatus: providerStatus,
    nextAvailabilityAt: nullableString(
      value.nextAvailabilityAt,
      "preflight.nextAvailabilityAt",
    ) as ISODateTime | null,
    checkedAt: stringField(value.checkedAt, "preflight.checkedAt") as ISODateTime,
  };
};
const mapFeePolicy = (raw: unknown): FeePolicy => {
  const value = objectField(raw, "fee policy");
  const nonNegativeInteger = (input: unknown, label: string) => {
    if (typeof input !== "number" || !Number.isInteger(input) || input < 0)
      throw new ApiError("CLIENT_CONTRACT_ERROR", `Invalid ${label}.`);
    return input;
  };
  const movement = (input: unknown, label: string) => {
    const row = objectField(input, label);
    if (typeof row.providerFeeSeparate !== "boolean")
      throw new ApiError("CLIENT_CONTRACT_ERROR", `Invalid ${label}.`);
    return {
      sliceFeeBps: nonNegativeInteger(row.sliceFeeBps, `${label}.sliceFeeBps`),
      providerFeeSeparate: row.providerFeeSeparate,
    };
  };
  const secondary = objectField(value.secondaryTrading, "fee policy secondary trading");
  const offering = objectField(value.initialOffering, "fee policy initial offering");
  if (value.currency !== "GBP")
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Unsupported fee policy currency.");
  return {
    currency: "GBP",
    movementScheduleVersion: stringField(
      value.movementScheduleVersion,
      "feePolicy.movementScheduleVersion",
    ),
    deposit: movement(value.deposit, "fee policy deposit"),
    withdrawal: movement(value.withdrawal, "fee policy withdrawal"),
    secondaryTrading: {
      scheduleVersion: stringField(
        secondary.scheduleVersion,
        "feePolicy.secondaryTrading.scheduleVersion",
      ),
      makerFeeBps: nonNegativeInteger(
        secondary.makerFeeBps,
        "feePolicy.secondaryTrading.makerFeeBps",
      ),
      takerFeeBps: nonNegativeInteger(
        secondary.takerFeeBps,
        "feePolicy.secondaryTrading.takerFeeBps",
      ),
    },
    initialOffering: {
      scheduleVersion: stringField(
        offering.scheduleVersion,
        "feePolicy.initialOffering.scheduleVersion",
      ),
      feeBps: nonNegativeInteger(offering.feeBps, "feePolicy.initialOffering.feeBps"),
    },
  };
};
const mapSubmission = (raw: unknown): AssetSubmission => {
  const value = objectField(raw, "submission");
  const metadata = value.declaredMetadata;
  if (metadata !== null && (typeof metadata !== "object" || Array.isArray(metadata)))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid submission metadata from service.");
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 1)
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid submission version from service.");
  const currentStep = value.currentStep === undefined ? 1 : value.currentStep;
  if (
    !Number.isSafeInteger(currentStep) ||
    (currentStep as number) < 1 ||
    (currentStep as number) > 7
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid submission current step from service.");
  return {
    id: stringField(value.id, "submission.id"),
    status: stringField(value.status, "submission.status"),
    version: value.version as number,
    currentStep: currentStep as number,
    categoryId: stringField(value.categoryId, "submission.categoryId"),
    setId: nullableString(value.setId, "submission.setId"),
    gradeScaleEntryId: nullableString(value.gradeScaleEntryId, "submission.gradeScaleEntryId"),
    declaredMetadata: metadata as Record<string, unknown> | null,
    preferredIntakeLocationId: nullableString(
      value.preferredIntakeLocationId,
      "submission.preferredIntakeLocationId",
    ),
    preferredDeliveryMethod:
      value.preferredDeliveryMethod === "SHIPMENT" || value.preferredDeliveryMethod === "IN_PERSON"
        ? value.preferredDeliveryMethod
        : null,
    submittedAt: nullableString(value.submittedAt, "submission.submittedAt") as ISODateTime | null,
    reviewedAt: nullableString(value.reviewedAt, "submission.reviewedAt") as ISODateTime | null,
    decisionCode: nullableString(value.decisionCode, "submission.decisionCode"),
    createdAt: stringField(value.createdAt, "submission.createdAt") as ISODateTime,
    updatedAt: stringField(value.updatedAt, "submission.updatedAt") as ISODateTime,
  };
};
const mapSubmissionMedia = (raw: unknown): SubmissionMedia => {
  const value = objectField(raw, "submission media");
  const status = stringField(value.status, "submission media.status");
  if (!["PENDING_UPLOAD", "UPLOADED", "SCANNING", "SAFE", "REJECTED", "DELETED"].includes(status))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid submission media status from service.");
  return {
    id: stringField(value.id, "submission media.id"),
    slot: stringField(value.slot, "submission media.slot"),
    mimeType: stringField(value.mimeType, "submission media.mimeType"),
    sizeBytes: Number(value.sizeBytes),
    status: status as SubmissionMedia["status"],
    previewUrl: typeof value.previewUrl === "string" ? value.previewUrl : null,
    createdAt: stringField(value.createdAt, "submission media.createdAt") as ISODateTime,
    updatedAt: stringField(value.updatedAt, "submission media.updatedAt") as ISODateTime,
  };
};
const mapSubmissionDetail = (raw: unknown): SubmissionDetail => {
  const value = objectField(raw, "submission detail");
  if (!Array.isArray(value.media))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid submission media from service.");
  return {
    ...mapSubmission(value),
    media: value.media.map(mapSubmissionMedia),
    marketResearch: value.marketResearch ? mapMarketResearch(value.marketResearch) : null,
    preGrade: value.preGrade ? mapRawCardPreGrade(value.preGrade) : null,
    certificationVerification: value.certificationVerification
      ? mapCertificationVerification(value.certificationVerification)
      : null,
  };
};
const mapCertificationVerification = (raw: unknown): CertificationVerification => {
  const value = objectField(raw, "certification verification");
  return {
    id: stringField(value.id, "certificationVerification.id"),
    companyCode: stringField(value.companyCode, "certificationVerification.companyCode"),
    certificationNumber: stringField(
      value.certificationNumber,
      "certificationVerification.certificationNumber",
    ),
    normalizedCertificationNumber: stringField(
      value.normalizedCertificationNumber,
      "certificationVerification.normalizedCertificationNumber",
    ),
    status: stringField(value.status, "certificationVerification.status"),
    verificationMode: stringField(
      value.verificationMode,
      "certificationVerification.verificationMode",
    ),
    officialVerificationUrl: nullableString(
      value.officialVerificationUrl,
      "certificationVerification.officialVerificationUrl",
    ),
    verifiedGrade: nullableString(value.verifiedGrade, "certificationVerification.verifiedGrade"),
    verifiedLabel: nullableString(value.verifiedLabel, "certificationVerification.verifiedLabel"),
    designation: nullableString(value.designation, "certificationVerification.designation"),
    gradeEra: nullableString(value.gradeEra, "certificationVerification.gradeEra"),
    verifiedAt: nullableString(
      value.verifiedAt,
      "certificationVerification.verifiedAt",
    ) as ISODateTime | null,
    createdAt: stringField(value.createdAt, "certificationVerification.createdAt") as ISODateTime,
  };
};
const mapRawCardPreGrade = (raw: unknown): RawCardPreGrade => {
  const value = objectField(raw, "raw card pre-grade");
  const status = stringField(value.status, "pre-grade.status");
  if (
    ![
      "IN_PROGRESS",
      "SUCCEEDED",
      "FAILED",
      "TEMPORARILY_UNAVAILABLE",
      "NOT_CONFIGURED",
      "STALE",
    ].includes(status)
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid raw card pre-grade status from service.");
  const number = (field: unknown) =>
    typeof field === "number" && Number.isFinite(field) ? field : null;
  return {
    id: stringField(value.id, "pre-grade.id"),
    submissionId: stringField(value.submissionId, "pre-grade.submissionId"),
    provider: stringField(value.provider, "pre-grade.provider"),
    status: status as RawCardPreGrade["status"],
    providerRequestId: nullableString(value.providerRequestId, "pre-grade.providerRequestId"),
    overallEstimate: number(value.overallEstimate),
    overallMin: number(value.overallMin),
    overallMax: number(value.overallMax),
    frontDetected: typeof value.frontDetected === "boolean" ? value.frontDetected : null,
    backDetected: typeof value.backDetected === "boolean" ? value.backDetected : null,
    centeringScore: number(value.centeringScore),
    cornerScore: number(value.cornerScore),
    edgeScore: number(value.edgeScore),
    surfaceScore: number(value.surfaceScore),
    confidence: number(value.confidence),
    conditionLabel: nullableString(value.conditionLabel, "pre-grade.conditionLabel"),
    autographDetected:
      typeof value.autographDetected === "boolean" ? value.autographDetected : null,
    categoryDetected: nullableString(value.categoryDetected, "pre-grade.categoryDetected"),
    warnings: Array.isArray(value.warnings)
      ? value.warnings.filter((item): item is string => typeof item === "string")
      : [],
    analysisFingerprint: stringField(value.analysisFingerprint, "pre-grade.analysisFingerprint"),
    analyzedAt: nullableString(value.analyzedAt, "pre-grade.analyzedAt") as ISODateTime | null,
    providerVersion: nullableString(value.providerVersion, "pre-grade.providerVersion"),
    errorCode: nullableString(value.errorCode, "pre-grade.errorCode"),
    supersededAt: nullableString(
      value.supersededAt,
      "pre-grade.supersededAt",
    ) as ISODateTime | null,
    createdAt: stringField(value.createdAt, "pre-grade.createdAt") as ISODateTime,
    updatedAt: stringField(value.updatedAt, "pre-grade.updatedAt") as ISODateTime,
    visualizations: Array.isArray(value.visualizations)
      ? value.visualizations.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const visualization = item as Record<string, unknown>;
          if (
            (visualization.side !== "FRONT" && visualization.side !== "BACK") ||
            (visualization.type !== "overview" && visualization.type !== "centering")
          )
            return [];
          return [
            {
              side: visualization.side,
              type: visualization.type,
              url: nullableString(visualization.url, "pre-grade.visualizations.url"),
              centering:
                visualization.centering &&
                typeof visualization.centering === "object" &&
                !Array.isArray(visualization.centering)
                  ? (Object.fromEntries(
                      Object.entries(visualization.centering).filter(
                        ([, value]) => typeof value === "number",
                      ),
                    ) as Record<string, number>)
                  : null,
            },
          ];
        })
      : [],
  };
};
const mapRawCardPreGradeResponse = (raw: unknown): RawCardPreGradeResponse => {
  const value = objectField(raw, "raw card pre-grade response");
  return {
    current: value.current ? mapRawCardPreGrade(value.current) : null,
    history: Array.isArray(value.history) ? value.history.map(mapRawCardPreGrade) : [],
  };
};
const mapMarketResearch = (raw: unknown): MarketResearchSnapshot => {
  const value = objectField(raw, "market research");
  if (!Array.isArray(value.observations))
    throw new ApiError(
      "CLIENT_CONTRACT_ERROR",
      "Invalid market research observations from service.",
    );
  const snapshot = objectField(value.snapshot, "market research snapshot");
  const range = (item: unknown) =>
    item === null || item === undefined ? null : objectField(item, "market research range");
  const sales = range(snapshot.sales);
  const listings = range(snapshot.listings);
  const priceGuides = range(snapshot.priceGuides);
  return {
    id: stringField(value.id, "marketResearch.id"),
    state: stringField(value.state, "marketResearch.state") as MarketResearchSnapshot["state"],
    dataQuality: nullableString(
      value.dataQuality,
      "marketResearch.dataQuality",
    ) as MarketResearchSnapshot["dataQuality"],
    identity: objectField(value.identity, "marketResearch.identity"),
    sourceCoverage: objectField(
      value.sourceCoverage,
      "marketResearch.sourceCoverage",
    ) as MarketResearchSnapshot["sourceCoverage"],
    providerFailures: (Array.isArray(value.providerFailures)
      ? value.providerFailures
      : []) as MarketResearchSnapshot["providerFailures"],
    snapshot: {
      sales: sales as MarketResearchSnapshot["snapshot"]["sales"],
      listings: listings as MarketResearchSnapshot["snapshot"]["listings"],
      priceGuides: priceGuides as MarketResearchSnapshot["snapshot"]["priceGuides"],
      referenceImageUrl:
        typeof snapshot.referenceImageUrl === "string" ? snapshot.referenceImageUrl : null,
      exactCompCount: Number(snapshot.exactCompCount),
      strongCompCount: Number(snapshot.strongCompCount),
      rejectedCompCount: Number(snapshot.rejectedCompCount),
      updatedAt: typeof snapshot.updatedAt === "string" ? snapshot.updatedAt : undefined,
    },
    collectedAt: stringField(value.collectedAt, "marketResearch.collectedAt") as ISODateTime,
    observations: value.observations.map((rawObservation) => {
      const item = objectField(rawObservation, "market observation");
      return {
        providerCode: stringField(item.providerCode, "marketObservation.provider"),
        externalReferenceId: stringField(item.externalReferenceId, "marketObservation.reference"),
        externalUrl: nullableString(item.externalUrl, "marketObservation.url"),
        observationType: stringField(
          item.observationType,
          "marketObservation.type",
        ) as MarketResearchSnapshot["observations"][number]["observationType"],
        originalTitle: stringField(item.originalTitle, "marketObservation.title"),
        amountMinor: stringField(item.amountMinor, "marketObservation.amount"),
        currency: stringField(item.currency, "marketObservation.currency"),
        observedAt: stringField(item.observedAt, "marketObservation.observedAt") as ISODateTime,
        soldAt: nullableString(item.soldAt, "marketObservation.soldAt") as ISODateTime | null,
        grader: nullableString(item.grader, "marketObservation.grader"),
        grade: nullableString(item.grade, "marketObservation.grade"),
        variant: nullableString(item.variant, "marketObservation.variant"),
        matchQuality: stringField(
          item.matchQuality,
          "marketObservation.matchQuality",
        ) as MarketResearchSnapshot["observations"][number]["matchQuality"],
        exclusionReason: nullableString(item.exclusionReason, "marketObservation.exclusionReason"),
        includedInSnapshot: Boolean(item.includedInSnapshot),
      };
    }),
  };
};
const mapReviewSummary = (raw: unknown): SubmissionReviewSummary => {
  const value = objectField(raw, "submission review");
  return {
    id: stringField(value.id, "review.id"),
    assetId: nullableString(value.assetId, "review.assetId"),
    status: stringField(value.status, "review.status"),
    submittedAt: stringField(value.submittedAt, "review.submittedAt") as ISODateTime,
    categoryId: stringField(value.categoryId, "review.categoryId"),
    setId: nullableString(value.setId, "review.setId"),
    gradeScaleEntryId: nullableString(value.gradeScaleEntryId, "review.gradeScaleEntryId"),
  };
};
const mapReviewQueue = (raw: unknown): SubmissionReviewQueueResponse => {
  const value = objectField(raw, "review queue");
  if (!Array.isArray(value.items))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review queue items from service.");
  const pagination = objectField(value.pagination, "review queue.pagination");
  const counts = objectField(value.counts, "review queue.counts");
  const summary = objectField(value.summary, "review queue.summary");
  const mapCount = (source: Record<string, unknown>, key: string) => {
    const count = Number(source[key]);
    if (!Number.isSafeInteger(count) || count < 0)
      throw new ApiError("CLIENT_CONTRACT_ERROR", `Invalid review queue.${key}.`);
    return count;
  };
  return {
    items: value.items.map((rawItem) => {
      const item = objectField(rawItem, "review queue item");
      const collector = objectField(item.collector, "review queue collector");
      const collectible = objectField(item.collectible, "review queue collectible");
      const evidence = objectField(item.evidence, "review queue evidence");
      const research = objectField(item.research, "review queue research");
      const reviewer = objectField(item.reviewer, "review queue reviewer");
      const evidenceStatus = stringField(evidence.status, "review queue evidence.status");
      const researchStatus = stringField(research.status, "review queue research.status");
      if (!["COMPLETE", "PARTIAL", "MISSING_REQUIRED"].includes(evidenceStatus))
        throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review queue evidence status.");
      if (
        !["COMPLETED", "IN_PROGRESS", "PENDING", "UNAVAILABLE", "NOT_REQUESTED"].includes(
          researchStatus,
        )
      )
        throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review queue research status.");
      const priority = stringField(item.priority, "review queue item.priority");
      if (!["HIGH", "MEDIUM", "LOW"].includes(priority))
        throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review queue item priority.");
      return {
        id: stringField(item.id, "review queue item.id"),
        submissionReference: stringField(item.submissionReference, "review queue item.reference"),
        reviewState: stringField(item.reviewState, "review queue item.reviewState"),
        category: stringField(item.category, "review queue item.category"),
        collector: {
          displayName: stringField(collector.displayName, "review queue collector.displayName"),
          username: nullableString(collector.username, "review queue collector.username"),
          membership: nullableString(collector.membership, "review queue collector.membership"),
        },
        collectible: {
          title: stringField(collectible.title, "review queue collectible.title"),
          year: nullableString(collectible.year, "review queue collectible.year"),
          variant: nullableString(collectible.variant, "review queue collectible.variant"),
          set: nullableString(collectible.set, "review queue collectible.set"),
          grader: nullableString(collectible.grader, "review queue collectible.grader"),
          grade: nullableString(collectible.grade, "review queue collectible.grade"),
          cardNumber: nullableString(collectible.cardNumber, "review queue collectible.cardNumber"),
        },
        thumbnailUrl: nullableString(item.thumbnailUrl, "review queue item.thumbnailUrl"),
        evidence: {
          percent: Number(evidence.percent),
          status:
            evidenceStatus as SubmissionReviewQueueResponse["items"][number]["evidence"]["status"],
          missingRequired: Number(evidence.missingRequired),
          presentRequired: Number(evidence.presentRequired),
          required: Number(evidence.required),
          itemCount: Number(evidence.itemCount),
          certificationStatus: nullableString(
            evidence.certificationStatus,
            "review queue evidence.certificationStatus",
          ),
        },
        research: {
          status:
            researchStatus as SubmissionReviewQueueResponse["items"][number]["research"]["status"],
          observedAt: nullableString(research.observedAt, "review queue research.observedAt"),
        },
        reviewer: {
          state: stringField(
            reviewer.state,
            "review queue reviewer.state",
          ) as SubmissionReviewQueueResponse["items"][number]["reviewer"]["state"],
          displayName: nullableString(reviewer.displayName, "review queue reviewer.displayName"),
        },
        submittedAt: stringField(item.submittedAt, "review queue item.submittedAt") as ISODateTime,
        readinessState: stringField(
          item.readinessState,
          "review queue item.readinessState",
        ) as SubmissionReviewQueueResponse["items"][number]["readinessState"],
        readinessReason: stringField(item.readinessReason, "review queue item.readinessReason"),
        ageHours: Number(item.ageHours ?? 0),
        overdue: item.overdue === null ? null : Boolean(item.overdue),
        priority: priority as SubmissionReviewQueueResponse["items"][number]["priority"],
        testFixture: Boolean(item.testFixture),
      };
    }),
    pagination: {
      page: mapCount(pagination, "page"),
      pageSize: mapCount(pagination, "pageSize"),
      total: mapCount(pagination, "total"),
      totalPages: mapCount(pagination, "totalPages"),
    },
    counts: {
      all: mapCount(counts, "all"),
      awaitingEvidence: mapCount(counts, "awaitingEvidence"),
      researchPending: mapCount(counts, "researchPending"),
      readyToReview: mapCount(counts, "readyToReview"),
      blocked: mapCount(counts, "blocked"),
      highPriority: mapCount(counts, "highPriority"),
      claimed: mapCount(counts, "claimed"),
      unclaimed: mapCount(counts, "unclaimed"),
    },
    summary: {
      awaitingEvidence: mapCount(summary, "awaitingEvidence"),
      researchPending: mapCount(summary, "researchPending"),
      readyToReview: mapCount(summary, "readyToReview"),
      blocked: mapCount(summary, "blocked"),
      highPriority: mapCount(summary, "highPriority"),
      claimed: mapCount(summary, "claimed"),
      unclaimed: mapCount(summary, "unclaimed"),
    },
    nextCursor: nullableString(value.nextCursor, "review queue.nextCursor"),
  };
};
const mapReviewDetail = (raw: unknown): SubmissionReviewDetail => {
  const value = objectField(raw, "submission review detail");
  if (!Array.isArray(value.media) || !Array.isArray(value.reviews))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review detail from service.");
  return {
    ...mapReviewSummary(value),
    version: Number(value.version),
    declaredMetadata: value.declaredMetadata as Record<string, unknown> | null,
    reviewMetadata:
      value.reviewMetadata && typeof value.reviewMetadata === "object"
        ? (value.reviewMetadata as Record<string, unknown>)
        : null,
    media: value.media.map(mapSubmissionMedia),
    reviews: value.reviews.map((rawReview) => {
      const review = objectField(rawReview, "review history");
      return {
        id: typeof review.id === "string" ? review.id : undefined,
        status: stringField(review.status, "review history.status"),
        decision: nullableString(review.decision, "review history.decision"),
        reasonCode: nullableString(review.reasonCode, "review history.reasonCode"),
        note:
          review.note === null || review.note === undefined
            ? null
            : stringField(review.note, "review history.note"),
        actor:
          review.actor && typeof review.actor === "object"
            ? (() => {
                const actor = objectField(review.actor, "review history.actor");
                return {
                  displayName: stringField(actor.displayName, "review history.actor.displayName"),
                  username:
                    actor.username === null || actor.username === undefined
                      ? null
                      : stringField(actor.username, "review history.actor.username"),
                };
              })()
            : null,
        createdAt: stringField(review.createdAt, "review history.createdAt") as ISODateTime,
        updatedAt: stringField(review.updatedAt, "review history.updatedAt") as ISODateTime,
        completedAt: nullableString(
          review.completedAt,
          "review history.completedAt",
        ) as ISODateTime | null,
      };
    }),
    marketResearch: value.marketResearch ? mapMarketResearch(value.marketResearch) : null,
    preGrade: value.preGrade ? mapRawCardPreGrade(value.preGrade) : null,
    certificationVerification:
      value.certificationVerification && typeof value.certificationVerification === "object"
        ? (objectField(value.certificationVerification, "certification verification") as never)
        : null,
    collectorSummary:
      value.collectorSummary && typeof value.collectorSummary === "object"
        ? (objectField(value.collectorSummary, "collector summary") as never)
        : undefined,
    submissionDetails:
      value.submissionDetails && typeof value.submissionDetails === "object"
        ? (objectField(value.submissionDetails, "submission details") as never)
        : undefined,
    collectible:
      value.collectible && typeof value.collectible === "object"
        ? (objectField(value.collectible, "collectible") as never)
        : undefined,
    evidenceSummary:
      value.evidenceSummary && typeof value.evidenceSummary === "object"
        ? (objectField(value.evidenceSummary, "evidence summary") as never)
        : undefined,
    condition:
      value.condition && typeof value.condition === "object"
        ? (objectField(value.condition, "condition") as never)
        : undefined,
    notableDetails: Array.isArray(value.notableDetails)
      ? (value.notableDetails as never)
      : undefined,
    customerReference:
      value.customerReference && typeof value.customerReference === "object"
        ? (value.customerReference as Record<string, unknown>)
        : null,
    reviewChecklist: Array.isArray(value.reviewChecklist)
      ? (value.reviewChecklist as never)
      : undefined,
    activity: Array.isArray(value.activity) ? (value.activity as never) : undefined,
    notes:
      value.notes && typeof value.notes === "object"
        ? (objectField(value.notes, "review notes") as never)
        : undefined,
    changeRequest:
      value.changeRequest && typeof value.changeRequest === "object"
        ? (objectField(value.changeRequest, "change request") as never)
        : null,
    researchReferences: Array.isArray(value.researchReferences)
      ? (value.researchReferences as never)
      : undefined,
    relatedItems: Array.isArray(value.relatedItems) ? (value.relatedItems as never) : undefined,
    reviewAssignment:
      value.reviewAssignment && typeof value.reviewAssignment === "object"
        ? (objectField(value.reviewAssignment, "review assignment") as never)
        : undefined,
    reviewFindings: Array.isArray(value.reviewFindings)
      ? (value.reviewFindings as never)
      : undefined,
    staffReview:
      value.staffReview && typeof value.staffReview === "object"
        ? (objectField(value.staffReview, "staff review") as never)
        : undefined,
    readiness:
      value.readiness && typeof value.readiness === "object"
        ? (objectField(value.readiness, "review readiness") as never)
        : undefined,
    reviewPresentation:
      value.reviewPresentation && typeof value.reviewPresentation === "object"
        ? (objectField(value.reviewPresentation, "review presentation") as never)
        : undefined,
    allowedActions:
      value.allowedActions && typeof value.allowedActions === "object"
        ? (objectField(value.allowedActions, "review allowed actions") as never)
        : undefined,
    availableCommands: Array.isArray(value.availableCommands)
      ? value.availableCommands.map((rawCommand) => {
          const command = objectField(rawCommand, "review available command");
          return {
            id: stringField(command.id, "review available command.id"),
            allowed: Boolean(command.allowed),
            reason: nullableString(command.reason, "review available command.reason"),
          };
        })
      : undefined,
    reviewWorkspace:
      value.reviewWorkspace && typeof value.reviewWorkspace === "object"
        ? (objectField(value.reviewWorkspace, "review workspace") as never)
        : undefined,
  };
};
const mapOperation = (raw: unknown): AssetOperationSummary => {
  const value = objectField(raw, "asset operation");
  const valuationStatus = stringField(value.valuationStatus, "operation.valuationStatus");
  const coverageStatus = stringField(value.coverageStatus, "operation.coverageStatus");
  if (
    !["ACTIVE", "MISSING"].includes(valuationStatus) ||
    !["ACTIVE", "MISSING"].includes(coverageStatus)
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid asset operation state from service.");
  return {
    id: stringField(value.id, "operation.id"),
    publicId: stringField(value.publicId, "operation.publicId"),
    title: stringField(value.title, "operation.title"),
    catalogueStatus: stringField(value.catalogueStatus, "operation.catalogueStatus"),
    valuationStatus: valuationStatus as AssetOperationSummary["valuationStatus"],
    custodyStatus: stringField(value.custodyStatus, "operation.custodyStatus"),
    coverageStatus: coverageStatus as AssetOperationSummary["coverageStatus"],
    publicationStatus: stringField(value.publicationStatus, "operation.publicationStatus"),
    updatedAt: stringField(value.updatedAt, "operation.updatedAt") as ISODateTime,
  };
};
const mapOperationsBoard = (raw: unknown): AssetOperationsBoardResponse => {
  const value = objectField(raw, "asset operations board");
  return value as unknown as AssetOperationsBoardResponse;
};
async function sha256Hex(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}
const mapSaleProposal = (raw: unknown): SaleProposal => {
  const value = objectField(raw, "sale proposal");
  const status = stringField(value.status, "proposal.status");
  const ownVote = value.ownVote;
  if (
    ![
      "DRAFT",
      "OPEN",
      "APPROVED",
      "REJECTED",
      "EXPIRED",
      "CANCELLED",
      "SALE_PENDING",
      "SOLD",
      "DISTRIBUTED",
      "FAILED",
    ].includes(status) ||
    value.currency !== "GBP" ||
    typeof value.votingEnabled !== "boolean" ||
    (ownVote !== null && ownVote !== "APPROVE" && ownVote !== "REJECT")
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid sale proposal from service.");
  return {
    id: stringField(value.id, "proposal.id"),
    assetId: stringField(value.assetId, "proposal.assetId") as import("@/domain").AssetId,
    status: status as SaleProposal["status"],
    offerMinor: stringField(value.offerMinor, "proposal.offerMinor"),
    currency: "GBP",
    opensAt: nullableString(value.opensAt, "proposal.opensAt") as ISODateTime | null,
    closesAt: nullableString(value.closesAt, "proposal.closesAt") as ISODateTime | null,
    eligibleUnits: stringField(value.eligibleUnits, "proposal.eligibleUnits"),
    approveUnits: stringField(value.approveUnits, "proposal.approveUnits"),
    rejectUnits: stringField(value.rejectUnits, "proposal.rejectUnits"),
    votingEnabled: value.votingEnabled,
    ownVote,
  };
};
const mapProposalMutation = (
  value: Record<string, unknown>,
  field: string,
): { proposalId: string; status: SaleProposal["status"]; replayed: boolean } => {
  const status = stringField(value.status, "proposal.status");
  if (
    ![
      "DRAFT",
      "OPEN",
      "APPROVED",
      "REJECTED",
      "EXPIRED",
      "CANCELLED",
      "SALE_PENDING",
      "SOLD",
      "DISTRIBUTED",
      "FAILED",
    ].includes(status) ||
    typeof value.replayed !== "boolean"
  )
    throw new ApiError("CLIENT_CONTRACT_ERROR", `Invalid ${field} from service.`);
  return {
    proposalId: stringField(value.proposalId, "proposal.proposalId"),
    status: status as SaleProposal["status"],
    replayed: value.replayed,
  };
};
const mapSaleProposalPage = (raw: unknown): SaleProposalPage => {
  const value = objectField(raw, "sale proposal page");
  if (!Array.isArray(value.items))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid sale proposal page from service.");
  return {
    items: value.items.map((item) => {
      const proposal = mapSaleProposal(item);
      const itemValue = objectField(item, "sale proposal summary");
      const asset = objectField(itemValue.asset, "proposal.asset");
      const viewerState = itemValue.viewerState;
      if (
        ![
          "ELIGIBLE",
          "ALREADY_VOTED",
          "NOT_ELIGIBLE",
          "NOT_OPEN",
          "CLOSED",
          "LEGAL_GATE_DISABLED",
        ].includes(String(viewerState))
      )
        throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid proposal viewer state from service.");
      return {
        ...proposal,
        asset: {
          id: stringField(asset.id, "proposal.asset.id") as import("@/domain").AssetId,
          slug: stringField(asset.slug, "proposal.asset.slug"),
          title: stringField(asset.title, "proposal.asset.title"),
        },
        closedAt: nullableString(itemValue.closedAt, "proposal.closedAt") as ISODateTime | null,
        viewerState: viewerState as import("@/domain").ProposalViewerState,
        viewerEligibleUnits: nullableString(
          itemValue.viewerEligibleUnits,
          "proposal.viewerEligibleUnits",
        ),
      };
    }),
    nextCursor: nullableString(value.nextCursor, "proposals.nextCursor"),
  };
};

const mapAdminRole = (raw: unknown) => {
  const value = objectField(raw, "admin role");
  return {
    id: stringField(value.id, "admin role.id"),
    role: stringField(value.role, "admin role.role"),
    scopeType: stringField(value.scopeType, "admin role.scopeType"),
    scopeId: nullableString(value.scopeId, "admin role.scopeId"),
    createdAt: stringField(value.createdAt, "admin role.createdAt"),
  };
};

const mapAdminUser = (raw: unknown): AdminUserSummary => {
  const value = objectField(raw, "admin user");
  const roles = Array.isArray(value.roles) ? value.roles.map(mapAdminRole) : [];
  const roleNames = roles.map((role) => role.role);
  const primaryType = ["ADMIN", "STAFF", "COLLECTOR", "INVESTOR"].includes(
    String(value.primaryType),
  )
    ? (String(value.primaryType) as AdminUserSummary["primaryType"])
    : roleNames.includes("ADMIN")
      ? "ADMIN"
      : [
            "SUPPORT",
            "COMPLIANCE_ANALYST",
            "ASSET_REVIEWER",
            "VAULT_OPERATOR",
            "FINANCE_OPERATOR",
          ].some((role) => roleNames.includes(role))
        ? "STAFF"
        : roleNames.includes("COLLECTOR")
          ? "COLLECTOR"
          : "INVESTOR";
  const membership = value.membership
    ? objectField(value.membership, "admin user membership")
    : null;
  const attention = value.attention ? objectField(value.attention, "admin user attention") : {};
  return {
    id: stringField(value.id, "admin user.id"),
    displayName: stringField(value.displayName, "admin user.displayName"),
    username: nullableString(value.username, "admin user.username"),
    email: stringField(value.email, "admin user.email"),
    primaryType,
    accountStatus: stringField(value.accountStatus, "admin user.accountStatus"),
    accountStateReason: nullableString(value.accountStateReason, "admin user.accountStateReason"),
    financialState: stringField(value.financialState ?? "UNAVAILABLE", "admin user.financialState"),
    financialExceptionCount:
      value.financialExceptionCount === null || value.financialExceptionCount === undefined
        ? null
        : Number(value.financialExceptionCount),
    financialAmountMinor: nullableString(
      value.financialAmountMinor,
      "admin user.financialAmountMinor",
    ),
    bacsHeldMinor: nullableString(value.bacsHeldMinor, "admin user.bacsHeldMinor"),
    complianceState: stringField(
      value.complianceState ?? "UNAVAILABLE",
      "admin user.complianceState",
    ),
    complianceReason: nullableString(value.complianceReason, "admin user.complianceReason"),
    payoutState: stringField(value.payoutState ?? "NOT_CONFIGURED", "admin user.payoutState"),
    payoutReason: nullableString(value.payoutReason, "admin user.payoutReason"),
    attention: {
      required: Boolean(attention.required),
      level: ["NONE", "ATTENTION", "BLOCKING", "RESTRICTED"].includes(String(attention.level))
        ? (String(attention.level) as AdminUserSummary["attention"]["level"])
        : "NONE",
      domain: ["ACCESS", "FINANCIAL", "COMPLIANCE", "PAYOUT"].includes(String(attention.domain))
        ? (String(attention.domain) as NonNullable<AdminUserSummary["attention"]["domain"]>)
        : null,
      reason: nullableString(attention.reason, "admin user attention.reason"),
      nextAction: nullableString(attention.nextAction, "admin user attention.nextAction"),
    },
    fixture: value.fixture === "DEMO" ? "DEMO" : "NORMAL",
    roles,
    createdAt: stringField(value.createdAt, "admin user.createdAt"),
    lastActivityAt: nullableString(value.lastActivityAt, "admin user.lastActivityAt"),
    membership: membership
      ? {
          plan: ["STARTER", "PRO", "ELITE"].includes(String(membership.plan))
            ? (String(membership.plan) as "STARTER" | "PRO" | "ELITE")
            : null,
          status: nullableString(membership.status, "admin user membership.status"),
        }
      : { plan: null, status: null },
  };
};

const mapAdminUserDetail = (raw: unknown): AdminUserDetail => {
  const value = objectField(raw, "admin user detail");
  const user = mapAdminUser(value);
  const profile = value.profile === null ? null : objectField(value.profile, "admin user profile");
  const counts = objectField(value.counts, "admin user counts");
  const identity =
    value.identity && typeof value.identity === "object"
      ? objectField(value.identity, "admin user identity")
      : {};
  const discord =
    identity.discord && typeof identity.discord === "object"
      ? objectField(identity.discord, "admin user discord")
      : {};
  const complianceSummary =
    value.complianceSummary && typeof value.complianceSummary === "object"
      ? objectField(value.complianceSummary, "admin user compliance")
      : {};
  const portfolioSummary =
    value.portfolioSummary && typeof value.portfolioSummary === "object"
      ? objectField(value.portfolioSummary, "admin user portfolio")
      : {};
  const walletSummary =
    value.walletSummary && typeof value.walletSummary === "object"
      ? objectField(value.walletSummary, "admin user wallet")
      : null;
  const collectorOverview =
    value.collectorOverview && typeof value.collectorOverview === "object"
      ? objectField(value.collectorOverview, "admin user collector")
      : null;
  const permissions =
    value.permissions && typeof value.permissions === "object"
      ? objectField(value.permissions, "admin user permissions")
      : {};
  const capabilitySummary = Array.isArray(value.capabilitySummary) ? value.capabilitySummary : [];
  const financialDetails =
    value.financialDetails && typeof value.financialDetails === "object"
      ? objectField(value.financialDetails, "admin user financial details")
      : null;
  const payoutDetails =
    value.payoutDetails && typeof value.payoutDetails === "object"
      ? objectField(value.payoutDetails, "admin user payout details")
      : null;
  const actionCenter = Array.isArray(value.actionCenter) ? value.actionCenter : [];
  const recommendedAction =
    value.recommendedAction && typeof value.recommendedAction === "object"
      ? objectField(value.recommendedAction, "admin user recommended action")
      : null;
  const availableCommands = Array.isArray(value.availableCommands) ? value.availableCommands : [];
  const support =
    value.support && typeof value.support === "object"
      ? objectField(value.support, "admin user support state")
      : { state: "UNAVAILABLE", reason: "Support tickets are not linked to Slice accounts" };
  const mapMoney = (source: Record<string, unknown>, field: string) =>
    stringField(source[field] ?? "0", `admin user ${field}`);
  const mapNullableMoney = (source: Record<string, unknown>, field: string) =>
    nullableString(source[field], `admin user ${field}`);
  return {
    ...user,
    revision: stringField(value.revision ?? user.createdAt, "admin user revision"),
    actionCenter: actionCenter.map((rawAction) => {
      const action = objectField(rawAction, "admin user action center item");
      const tab = action.tab === "Operations" || action.tab === "History" ? action.tab : "Overview";
      const severity = ["ATTENTION", "BLOCKING", "RESTRICTED"].includes(String(action.severity))
        ? (String(action.severity) as "ATTENTION" | "BLOCKING" | "RESTRICTED")
        : "ATTENTION";
      return {
        id: stringField(action.id, "admin user action center.id"),
        severity,
        title: stringField(action.title, "admin user action center.title"),
        explanation: stringField(action.explanation, "admin user action center.explanation"),
        recommendedAction: stringField(
          action.recommendedAction,
          "admin user action center.recommendedAction",
        ),
        tab,
      };
    }),
    recommendedAction: recommendedAction
      ? {
          title: stringField(recommendedAction.title, "admin user recommended action.title"),
          explanation: stringField(
            recommendedAction.explanation,
            "admin user recommended action.explanation",
          ),
          tab:
            recommendedAction.tab === "Operations" || recommendedAction.tab === "History"
              ? recommendedAction.tab
              : "Overview",
        }
      : null,
    availableCommands: availableCommands.map((rawCommand) => {
      const command = objectField(rawCommand, "admin user available command");
      return {
        id: stringField(command.id, "admin user available command.id"),
        allowed: Boolean(command.allowed),
        reason: nullableString(command.reason, "admin user available command.reason"),
      };
    }),
    adminOverrides: Array.isArray(value.adminOverrides)
      ? value.adminOverrides.map((rawOverride) => {
          const override = objectField(rawOverride, "admin user override");
          const beforeState =
            override.beforeState && typeof override.beforeState === "object"
              ? (override.beforeState as Record<string, unknown>)
              : {};
          const afterState =
            override.afterState && typeof override.afterState === "object"
              ? (override.afterState as Record<string, unknown>)
              : {};
          return {
            id: stringField(override.id, "admin user override.id"),
            command: stringField(override.command, "admin user override.command"),
            targetType: stringField(override.targetType, "admin user override.targetType"),
            targetKey: nullableString(override.targetKey, "admin user override.targetKey"),
            forcedState: nullableString(override.forcedState, "admin user override.forcedState"),
            normalBlocker: nullableString(
              override.normalBlocker,
              "admin user override.normalBlocker",
            ),
            reason: stringField(override.reason, "admin user override.reason"),
            beforeState,
            afterState,
            affectedCapabilities: Array.isArray(override.affectedCapabilities)
              ? override.affectedCapabilities.filter(
                  (item): item is string => typeof item === "string",
                )
              : [],
            source: stringField(override.source, "admin user override.source"),
            incidentReference: nullableString(
              override.incidentReference,
              "admin user override.incidentReference",
            ),
            expiresAt: nullableString(override.expiresAt, "admin user override.expiresAt"),
            createdAt: stringField(override.createdAt, "admin user override.createdAt"),
          };
        })
      : [],
    support: {
      state: ["UNAVAILABLE", "CLEAR", "OPEN", "ESCALATED"].includes(String(support.state))
        ? (String(support.state) as "UNAVAILABLE" | "CLEAR" | "OPEN" | "ESCALATED")
        : "UNAVAILABLE",
      reason: stringField(support.reason, "admin user support.reason"),
    },
    semanticRoles: Array.isArray(value.semanticRoles)
      ? value.semanticRoles
          .filter((role): role is string => typeof role === "string" && role !== "USER")
          .filter((role, index, roles) => roles.indexOf(role) === index)
      : Array.from(new Set(user.roles.map((role) => role.role).filter((role) => role !== "USER"))),
    profile: profile
      ? {
          displayName: nullableString(profile.displayName, "profile.displayName"),
          publicUsername: nullableString(profile.publicUsername, "profile.publicUsername"),
          countryCode: nullableString(profile.countryCode, "profile.countryCode"),
          timezone: nullableString(profile.timezone, "profile.timezone"),
          preferredCurrency: nullableString(profile.preferredCurrency, "profile.preferredCurrency"),
        }
      : null,
    statusHistory: Array.isArray(value.statusHistory)
      ? value.statusHistory.map((rawEntry) => {
          const entry = objectField(rawEntry, "admin status history");
          return {
            fromStatus: nullableString(entry.fromStatus, "statusHistory.fromStatus"),
            toStatus: stringField(entry.toStatus, "statusHistory.toStatus"),
            reason: nullableString(entry.reason, "statusHistory.reason"),
            actorUserId: nullableString(entry.actorUserId, "statusHistory.actorUserId"),
            createdAt: stringField(entry.createdAt, "statusHistory.createdAt"),
          };
        })
      : [],
    counts: {
      submissions: Number(counts.submissions ?? 0),
      complianceCases: Number(counts.complianceCases ?? 0),
      financialAccounts: Number(counts.financialAccounts ?? 0),
      moneyMovements: Number(counts.moneyMovements ?? 0),
      auditEvents: Number(counts.auditEvents ?? 0),
    },
    collector: value.collector
      ? (() => {
          const collector = objectField(value.collector, "admin user collector");
          const subscription = collector.subscription
            ? objectField(collector.subscription, "admin user subscription")
            : null;
          const publicDirectory = collector.publicDirectory
            ? objectField(collector.publicDirectory, "admin user collector directory")
            : null;
          return {
            publicDirectory: publicDirectory
              ? {
                  slug: stringField(publicDirectory.slug, "admin user collector directory.slug"),
                  isPublic: Boolean(publicDirectory.isPublic),
                  isFeatured: Boolean(publicDirectory.isFeatured),
                  featurePriority: Number(publicDirectory.featurePriority ?? 0),
                  featuredCaption: nullableString(
                    publicDirectory.featuredCaption,
                    "admin user collector directory.featuredCaption",
                  ),
                  featuredAt: nullableString(
                    publicDirectory.featuredAt,
                    "admin user collector directory.featuredAt",
                  ),
                  publishedAt: nullableString(
                    publicDirectory.publishedAt,
                    "admin user collector directory.publishedAt",
                  ),
                  eligible: Boolean(publicDirectory.eligible),
                  eligibilityReason:
                    typeof publicDirectory.eligibilityReason === "string"
                      ? publicDirectory.eligibilityReason
                      : "Eligibility unavailable",
                  publicAssetCount: Number(publicDirectory.publicAssetCount ?? 0),
                }
              : null,
            subscription: subscription
              ? {
                  plan: stringField(subscription.plan, "admin user subscription.plan"),
                  status: stringField(subscription.status, "admin user subscription.status"),
                  currentPeriodEnd: nullableString(
                    subscription.currentPeriodEnd,
                    "admin user subscription.currentPeriodEnd",
                  ),
                  cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
                }
              : null,
            activeIntakes: Number(collector.activeIntakes ?? 0),
          };
        })()
      : null,
    identity: {
      phone: nullableString(identity.phone, "admin user identity.phone"),
      country: nullableString(identity.country, "admin user identity.country"),
      discord: {
        connected: Boolean(discord.connected),
        username: nullableString(discord.username, "admin user discord.username"),
        displayName: nullableString(discord.displayName, "admin user discord.displayName"),
        linkedAt: nullableString(discord.linkedAt, "admin user discord.linkedAt"),
      },
      twoFactorEnabled: Boolean(identity.twoFactorEnabled),
      emailVerified: Boolean(identity.emailVerified),
      phoneVerified: Boolean(identity.phoneVerified),
      activeSessionCount:
        identity.activeSessionCount === null || identity.activeSessionCount === undefined
          ? null
          : Number(identity.activeSessionCount),
    },
    complianceSummary: {
      kycStatus: stringField(
        complianceSummary.kycStatus ?? "Unknown",
        "admin user compliance.kycStatus",
      ),
      kytStatus: stringField(
        complianceSummary.kytStatus ?? "Unknown",
        "admin user compliance.kytStatus",
      ),
      provider: nullableString(complianceSummary.provider, "admin user compliance.provider"),
      lastReviewAt: nullableString(
        complianceSummary.lastReviewAt,
        "admin user compliance.lastReviewAt",
      ),
      caseCount: Number(complianceSummary.caseCount ?? 0),
    },
    portfolioSummary: {
      totalValueMinor: mapNullableMoney(portfolioSummary, "totalValueMinor"),
      totalInvestedMinor: mapNullableMoney(portfolioSummary, "totalInvestedMinor"),
      totalWithdrawnMinor: mapNullableMoney(portfolioSummary, "totalWithdrawnMinor"),
      totalAssets: Number(portfolioSummary.totalAssets ?? 0),
      activeListings: Number(portfolioSummary.activeListings ?? 0),
      openOrders: Number(portfolioSummary.openOrders ?? 0),
      currency: stringField(portfolioSummary.currency ?? "GBP", "admin user portfolio.currency"),
    },
    walletSummary: walletSummary
      ? {
          availableMinor: mapMoney(walletSummary, "availableMinor"),
          reservedMinor: mapMoney(walletSummary, "reservedMinor"),
          pendingMinor: mapMoney(walletSummary, "pendingMinor"),
          totalMinor: mapMoney(walletSummary, "totalMinor"),
          currency: stringField(walletSummary.currency ?? "GBP", "admin user wallet.currency"),
        }
      : null,
    recentOrders: Array.isArray(value.recentOrders)
      ? value.recentOrders.map((rawOrder) => {
          const order = objectField(rawOrder, "admin user order");
          return {
            id: stringField(order.id, "admin user order.id"),
            side: stringField(order.side, "admin user order.side"),
            assetTitle: stringField(order.assetTitle, "admin user order.assetTitle"),
            units: stringField(order.units, "admin user order.units"),
            limitPriceMinor: stringField(order.limitPriceMinor, "admin user order.limitPriceMinor"),
            currency: stringField(order.currency, "admin user order.currency"),
            status: stringField(order.status, "admin user order.status"),
            updatedAt: stringField(order.updatedAt, "admin user order.updatedAt"),
          };
        })
      : [],
    collectorOverview: collectorOverview
      ? {
          assets: Array.isArray(collectorOverview.assets)
            ? collectorOverview.assets.map((rawAsset) => {
                const asset = objectField(rawAsset, "admin user collector asset");
                return {
                  id: stringField(asset.id, "admin user collector asset.id"),
                  title: stringField(asset.title, "admin user collector asset.title"),
                  slug: stringField(asset.slug, "admin user collector asset.slug"),
                  units: stringField(asset.units, "admin user collector asset.units"),
                };
              })
            : [],
          additionalAssets: Number(collectorOverview.additionalAssets ?? 0),
          activeIntakes: Number(collectorOverview.activeIntakes ?? 0),
          submissions: Number(collectorOverview.submissions ?? 0),
        }
      : null,
    permissions: {
      finance: Boolean(permissions.finance),
      compliance: Boolean(permissions.compliance),
      manageRoles: Boolean(permissions.manageRoles),
      manageStatus: Boolean(permissions.manageStatus),
      manageProfile: Boolean(permissions.manageProfile),
      manageSecurity: Boolean(permissions.manageSecurity),
      manageRestrictions: Boolean(permissions.manageRestrictions),
      manageNotes: Boolean(permissions.manageNotes),
      canUseRecovery: Boolean(permissions.canUseRecovery),
      canUseBreakGlassOverride: Boolean(permissions.canUseBreakGlassOverride),
      canManageFinancialAccess: Boolean(permissions.canManageFinancialAccess),
      canManageCompliance: Boolean(permissions.canManageCompliance),
      canManageCollector: Boolean(permissions.canManageCollector),
      canManageInvestor: Boolean(permissions.canManageInvestor),
      canManageProvider: Boolean(permissions.canManageProvider),
    },
    financialDetails: financialDetails
      ? {
          state: stringField(financialDetails.state ?? "UNAVAILABLE", "financialDetails.state"),
          availableMinor: nullableString(
            financialDetails.availableMinor,
            "financialDetails.availableMinor",
          ),
          reservedMinor: nullableString(
            financialDetails.reservedMinor,
            "financialDetails.reservedMinor",
          ),
          pendingMinor: nullableString(
            financialDetails.pendingMinor,
            "financialDetails.pendingMinor",
          ),
          totalMinor: nullableString(financialDetails.totalMinor, "financialDetails.totalMinor"),
          bacsHeldMinor: nullableString(
            financialDetails.bacsHeldMinor,
            "financialDetails.bacsHeldMinor",
          ),
          deficitMinor: nullableString(
            financialDetails.deficitMinor,
            "financialDetails.deficitMinor",
          ),
          deficitStatus: nullableString(
            financialDetails.deficitStatus,
            "financialDetails.deficitStatus",
          ),
          withdrawalHoldUntil: nullableString(
            financialDetails.withdrawalHoldUntil,
            "financialDetails.withdrawalHoldUntil",
          ),
          returnedDepositCount: Number(financialDetails.returnedDepositCount ?? 0),
          manualReviewDepositCount: Number(financialDetails.manualReviewDepositCount ?? 0),
        }
      : null,
    payoutDetails: payoutDetails
      ? {
          state: stringField(payoutDetails.state ?? "SETUP_REQUIRED", "payoutDetails.state"),
          status: nullableString(payoutDetails.status, "payoutDetails.status"),
          detailsSubmitted: Boolean(payoutDetails.detailsSubmitted),
          payoutsEnabled: Boolean(payoutDetails.payoutsEnabled),
          transfersCapability: nullableString(
            payoutDetails.transfersCapability,
            "payoutDetails.transfersCapability",
          ),
          lastSyncedAt: nullableString(payoutDetails.lastSyncedAt, "payoutDetails.lastSyncedAt"),
        }
      : null,
    activeHolds: Array.isArray(value.activeHolds)
      ? value.activeHolds.map((rawHold) => {
          const hold = objectField(rawHold, "admin user hold");
          return {
            id: stringField(hold.id, "admin user hold.id"),
            scope: stringField(hold.scope, "admin user hold.scope"),
            reasonCode: stringField(hold.reasonCode, "admin user hold.reasonCode"),
            source: stringField(hold.source, "admin user hold.source"),
            status: stringField(hold.status, "admin user hold.status"),
            createdAt: stringField(hold.createdAt, "admin user hold.createdAt"),
            releasedAt: nullableString(hold.releasedAt, "admin user hold.releasedAt"),
          };
        })
      : [],
    capabilitySummary: capabilitySummary.map((rawDecision) => {
      const decision = objectField(rawDecision, "admin user capability");
      return {
        capability: stringField(decision.capability, "admin user capability.capability"),
        allowed: Boolean(decision.allowed),
        status: stringField(decision.status, "admin user capability.status"),
        reason: nullableString(decision.reason, "admin user capability.reason"),
        nextAction: nullableString(decision.nextAction, "admin user capability.nextAction"),
      };
    }),
    activitySnapshot: Array.isArray(value.activitySnapshot)
      ? value.activitySnapshot.map((rawActivity) => {
          const activity = objectField(rawActivity, "admin user activity");
          return {
            id: stringField(activity.id, "admin user activity.id"),
            action: stringField(activity.action, "admin user activity.action"),
            resourceType: stringField(activity.resourceType, "admin user activity.resourceType"),
            resourceId: nullableString(activity.resourceId, "admin user activity.resourceId"),
            actor: nullableString(activity.actor, "admin user activity.actor"),
            actorType: stringField(activity.actorType ?? "USER", "admin user activity.actorType"),
            result: stringField(activity.result ?? "SUCCESS", "admin user activity.result"),
            occurredAt: stringField(activity.occurredAt, "admin user activity.occurredAt"),
          };
        })
      : [],
  };
};

const mapAdminComplianceCase = (raw: unknown): AdminComplianceCase => {
  const value = objectField(raw, "admin compliance case");
  const user = objectField(value.user, "admin compliance case.user");
  return {
    id: stringField(value.id, "complianceCase.id"),
    provider: stringField(value.provider, "complianceCase.provider"),
    type: stringField(value.type, "complianceCase.type"),
    status: stringField(value.status, "complianceCase.status"),
    createdAt: stringField(value.createdAt, "complianceCase.createdAt"),
    updatedAt: stringField(value.updatedAt, "complianceCase.updatedAt"),
    user: {
      id: stringField(user.id, "complianceCase.user.id"),
      displayName: stringField(user.displayName, "complianceCase.user.displayName"),
      username: nullableString(user.username, "complianceCase.user.username"),
    },
  };
};

const mapAdminIntake = (raw: unknown): AdminIntakeRow => {
  const value = objectField(raw, "admin intake row");
  const collector = objectField(value.collector, "admin intake collector");
  const vault = value.vault === null ? null : objectField(value.vault, "admin intake vault");
  const shipment =
    value.shipment === null ? null : objectField(value.shipment, "admin intake shipment");
  const receipt =
    value.receipt === null ? null : objectField(value.receipt, "admin intake receipt");
  return {
    id: stringField(value.id, "admin intake.id"),
    submissionId: stringField(value.submissionId, "admin intake.submissionId"),
    assetId: nullableString(value.assetId, "admin intake.assetId"),
    intakeReference:
      value.intakeReference === null
        ? null
        : nullableString(value.intakeReference, "admin intake.intakeReference"),
    title: stringField(value.title, "admin intake.title"),
    thumbnailUrl: nullableString(value.thumbnailUrl, "admin intake.thumbnailUrl"),
    category:
      value.category === null ? null : nullableString(value.category, "admin intake.category"),
    variant: value.variant === null ? null : nullableString(value.variant, "admin intake.variant"),
    grader: value.grader === null ? null : nullableString(value.grader, "admin intake.grader"),
    grade: value.grade === null ? null : nullableString(value.grade, "admin intake.grade"),
    itemCount: Number(value.itemCount ?? 0),
    collector: {
      id: stringField(collector.id, "admin intake.collector.id"),
      displayName: stringField(collector.displayName, "admin intake.collector.displayName"),
      username: nullableString(collector.username, "admin intake.collector.username"),
    },
    membership:
      value.membership === null
        ? null
        : nullableString(value.membership, "admin intake.membership"),
    submissionStatus: stringField(value.submissionStatus, "admin intake.submissionStatus"),
    stage: stringField(value.stage, "admin intake.stage"),
    stageLabel: stringField(value.stageLabel, "admin intake.stageLabel"),
    stageReason: stringField(value.stageReason, "admin intake.stageReason"),
    deliveryMethod:
      value.deliveryMethod === "SHIPMENT" || value.deliveryMethod === "IN_PERSON"
        ? value.deliveryMethod
        : null,
    currentStageSince: stringField(value.currentStageSince, "admin intake.currentStageSince"),
    vault: vault
      ? {
          id: stringField(vault.id, "admin intake.vault.id"),
          displayName: stringField(vault.displayName, "admin intake.vault.displayName"),
          region: stringField(vault.region, "admin intake.vault.region"),
          countryCode: stringField(vault.countryCode, "admin intake.vault.countryCode"),
          code: vault.code === null ? null : nullableString(vault.code, "admin intake.vault.code"),
        }
      : null,
    shipment: shipment
      ? {
          carrier: stringField(shipment.carrier, "admin intake.shipment.carrier"),
          trackingNumber: stringField(
            shipment.trackingNumber,
            "admin intake.shipment.trackingNumber",
          ),
          status: stringField(shipment.status, "admin intake.shipment.status"),
          shippedAt: stringField(shipment.shippedAt, "admin intake.shipment.shippedAt"),
          deliveredAt: nullableString(shipment.deliveredAt, "admin intake.shipment.deliveredAt"),
        }
      : null,
    receipt: receipt
      ? {
          confirmedAt: stringField(receipt.confirmedAt, "admin intake.receipt.confirmedAt"),
          confirmedById: stringField(receipt.confirmedById, "admin intake.receipt.confirmedById"),
        }
      : null,
    updatedAt: stringField(value.updatedAt, "admin intake.updatedAt"),
    nextAction: stringField(value.nextAction, "admin intake.nextAction"),
    nextActor: stringField(
      value.nextActor,
      "admin intake.nextActor",
    ) as AdminIntakeRow["nextActor"],
    needsStaffAction: Boolean(value.needsStaffAction),
    allowedActions: Array.isArray(value.allowedActions)
      ? value.allowedActions.map((item) => String(item))
      : [],
    workType: stringField(value.workType, "admin intake.workType") as AdminIntakeRow["workType"],
    issues: Array.isArray(value.issues)
      ? value.issues.map((item) => {
          const issue = objectField(item, "admin intake issue");
          return {
            code: stringField(issue.code, "admin intake issue.code"),
            label: stringField(issue.label, "admin intake issue.label"),
            severity: stringField(issue.severity, "admin intake issue.severity") as
              "LOW" | "MEDIUM" | "HIGH",
          };
        })
      : [],
    testFixture: Boolean(value.testFixture),
    carrierState:
      value.carrierState === null || value.carrierState === undefined
        ? null
        : (() => {
            const carrierState = objectField(value.carrierState, "admin intake carrierState");
            return {
              status: stringField(carrierState.status, "admin intake carrierState.status"),
              lastUpdatedAt: nullableString(
                carrierState.lastUpdatedAt,
                "admin intake carrierState.lastUpdatedAt",
              ),
              source: stringField(carrierState.source, "admin intake carrierState.source") as
                "MANUAL" | "PROVIDER",
            };
          })(),
    verification:
      value.verification === null || value.verification === undefined
        ? null
        : (() => {
            const verification = objectField(value.verification, "admin intake verification");
            return {
              status: stringField(verification.status, "admin intake verification.status"),
              identityMatch:
                verification.identityMatch === null ? null : Boolean(verification.identityMatch),
              certificationMatch:
                verification.certificationMatch === null
                  ? null
                  : Boolean(verification.certificationMatch),
              gradeMatch:
                verification.gradeMatch === null ? null : Boolean(verification.gradeMatch),
              variantMatch:
                verification.variantMatch === null ? null : Boolean(verification.variantMatch),
              startedAt: nullableString(
                verification.startedAt,
                "admin intake verification.startedAt",
              ),
              completedAt: nullableString(
                verification.completedAt,
                "admin intake verification.completedAt",
              ),
              note: nullableString(verification.note, "admin intake verification.note"),
            };
          })(),
    custodyHistory: Array.isArray(value.custodyHistory)
      ? value.custodyHistory.map((item) => {
          const event = objectField(item, "admin intake custody history");
          return {
            action: stringField(event.action, "admin intake custody history.action"),
            occurredAt: stringField(event.occurredAt, "admin intake custody history.occurredAt"),
            actorUserId: nullableString(
              event.actorUserId,
              "admin intake custody history.actorUserId",
            ),
            metadata: event.metadata,
          };
        })
      : [],
    valuationStatus:
      value.valuationStatus === null
        ? null
        : nullableString(value.valuationStatus, "admin intake.valuationStatus"),
    custodyStatus:
      value.custodyStatus === null
        ? null
        : nullableString(value.custodyStatus, "admin intake.custodyStatus"),
    demoIntake:
      value.demoIntake === null || value.demoIntake === undefined
        ? null
        : (() => {
            const demo = objectField(value.demoIntake, "admin intake demo intake");
            return {
              id: stringField(demo.id, "admin intake demo intake.id"),
              status: stringField(demo.status, "admin intake demo intake.status"),
              destinationLabel: stringField(
                demo.destinationLabel,
                "admin intake demo intake.destinationLabel",
              ),
              simulatedReceiptAt: stringField(
                demo.simulatedReceiptAt,
                "admin intake demo intake.simulatedReceiptAt",
              ),
              verifiedAt: stringField(demo.verifiedAt, "admin intake demo intake.verifiedAt"),
              custodyAt: stringField(demo.custodyAt, "admin intake demo intake.custodyAt"),
            };
          })(),
    exception:
      value.exception === null
        ? null
        : (() => {
            const exception = objectField(value.exception, "admin intake.exception");
            return {
              code: stringField(exception.code, "admin intake.exception.code"),
              label: stringField(exception.label, "admin intake.exception.label"),
              severity: stringField(exception.severity, "admin intake.exception.severity") as
                "LOW" | "MEDIUM" | "HIGH",
            };
          })(),
  };
};

const mapAdminIntakeDetail = (raw: unknown): AdminIntakeDetail => {
  const value = objectField(raw, "admin intake detail");
  const intake =
    value.intake === null ? null : objectField(value.intake, "admin intake detail.intake");
  const custody =
    value.custody === null ? null : objectField(value.custody, "admin intake detail.custody");
  const nullableBoolean = (item: Record<string, unknown>, key: string) =>
    item[key] === null || item[key] === undefined ? null : Boolean(item[key]);
  return {
    row: mapAdminIntake(value.row),
    intake: intake
      ? {
          id: stringField(intake.id, "admin intake detail.intake.id"),
          reference: stringField(intake.reference, "admin intake detail.intake.reference"),
          status: stringField(intake.status, "admin intake detail.intake.status"),
          deliveryMethod: intake.deliveryMethod === "IN_PERSON" ? "IN_PERSON" : "SHIPMENT",
          selectedAt: stringField(intake.selectedAt, "admin intake detail.intake.selectedAt"),
          shippedAt: nullableString(intake.shippedAt, "admin intake detail.intake.shippedAt"),
          deliveredAt: nullableString(intake.deliveredAt, "admin intake detail.intake.deliveredAt"),
          receivedAt: nullableString(intake.receivedAt, "admin intake detail.intake.receivedAt"),
          updatedAt: stringField(intake.updatedAt, "admin intake detail.intake.updatedAt"),
          destination: (() => {
            const destination = objectField(intake.destination, "admin intake detail.destination");
            return {
              id: stringField(destination.id, "admin intake detail.destination.id"),
              displayName: stringField(
                destination.displayName,
                "admin intake detail.destination.displayName",
              ),
              region: stringField(destination.region, "admin intake detail.destination.region"),
              countryCode: stringField(
                destination.countryCode,
                "admin intake detail.destination.countryCode",
              ),
              active: Boolean(destination.active),
              intakeAvailable: Boolean(destination.intakeAvailable),
              operationallyApproved: Boolean(destination.operationallyApproved),
              acceptingShipments: Boolean(destination.acceptingShipments),
              acceptingInPerson: Boolean(destination.acceptingInPerson),
              locationType: stringField(
                destination.locationType,
                "admin intake detail.destination.locationType",
              ),
              environment: stringField(
                destination.environment,
                "admin intake detail.destination.environment",
              ),
            };
          })(),
          shipment:
            intake.shipment === null
              ? null
              : (() => {
                  const shipment = objectField(intake.shipment, "admin intake detail.shipment");
                  return {
                    carrier: stringField(shipment.carrier, "admin intake detail.shipment.carrier"),
                    trackingNumber: stringField(
                      shipment.trackingNumber,
                      "admin intake detail.shipment.trackingNumber",
                    ),
                    status: stringField(shipment.status, "admin intake detail.shipment.status"),
                    shippedAt: stringField(
                      shipment.shippedAt,
                      "admin intake detail.shipment.shippedAt",
                    ),
                    deliveredAt: nullableString(
                      shipment.deliveredAt,
                      "admin intake detail.shipment.deliveredAt",
                    ),
                    lastCheckedAt: nullableString(
                      shipment.lastCheckedAt,
                      "admin intake detail.shipment.lastCheckedAt",
                    ),
                    notes: nullableString(shipment.notes, "admin intake detail.shipment.notes"),
                  };
                })(),
          receipt:
            intake.receipt === null
              ? null
              : (() => {
                  const receipt = objectField(intake.receipt, "admin intake detail.receipt");
                  return {
                    id: stringField(receipt.id, "admin intake detail.receipt.id"),
                    confirmedAt: stringField(
                      receipt.confirmedAt,
                      "admin intake detail.receipt.confirmedAt",
                    ),
                    confirmedBy: stringField(
                      receipt.confirmedBy,
                      "admin intake detail.receipt.confirmedBy",
                    ),
                    packageCondition: nullableString(
                      receipt.packageCondition,
                      "admin intake detail.receipt.packageCondition",
                    ),
                    checklist: receipt.checklist,
                    notes: nullableString(receipt.notes, "admin intake detail.receipt.notes"),
                  };
                })(),
          verification:
            intake.verification === null
              ? null
              : (() => {
                  const verification = objectField(
                    intake.verification,
                    "admin intake detail.verification",
                  );
                  return {
                    id: stringField(verification.id, "admin intake detail.verification.id"),
                    status: stringField(
                      verification.status,
                      "admin intake detail.verification.status",
                    ),
                    identityMatch: nullableBoolean(verification, "identityMatch"),
                    certificationMatch: nullableBoolean(verification, "certificationMatch"),
                    gradeMatch: nullableBoolean(verification, "gradeMatch"),
                    variantMatch: nullableBoolean(verification, "variantMatch"),
                    note: nullableString(
                      verification.note,
                      "admin intake detail.verification.note",
                    ),
                    startedAt: nullableString(
                      verification.startedAt,
                      "admin intake detail.verification.startedAt",
                    ),
                    completedAt: nullableString(
                      verification.completedAt,
                      "admin intake detail.verification.completedAt",
                    ),
                  };
                })(),
          exceptions: Array.isArray(intake.exceptions)
            ? intake.exceptions.map((rawException) => {
                const exception = objectField(rawException, "admin intake detail.exception");
                return {
                  id: stringField(exception.id, "admin intake detail.exception.id"),
                  code: stringField(exception.code, "admin intake detail.exception.code"),
                  severity: stringField(
                    exception.severity,
                    "admin intake detail.exception.severity",
                  ) as "LOW" | "MEDIUM" | "HIGH",
                  notes: stringField(exception.notes, "admin intake detail.exception.notes"),
                  createdAt: stringField(
                    exception.createdAt,
                    "admin intake detail.exception.createdAt",
                  ),
                  resolvedAt: nullableString(
                    exception.resolvedAt,
                    "admin intake detail.exception.resolvedAt",
                  ),
                  resolutionNote: nullableString(
                    exception.resolutionNote,
                    "admin intake detail.exception.resolutionNote",
                  ),
                };
              })
            : [],
        }
      : null,
    custody: custody
      ? {
          status: stringField(custody.status, "admin intake detail.custody.status"),
          receivedAt: nullableString(custody.receivedAt, "admin intake detail.custody.receivedAt"),
          securedAt: nullableString(custody.securedAt, "admin intake detail.custody.securedAt"),
          updatedAt: stringField(custody.updatedAt, "admin intake detail.custody.updatedAt"),
        }
      : null,
    history: Array.isArray(value.history)
      ? value.history.map((rawEvent) => {
          const event = objectField(rawEvent, "admin intake detail.history");
          return {
            id: stringField(event.id, "admin intake detail.history.id"),
            source: stringField(event.source, "admin intake detail.history.source") as
              "INTAKE" | "CUSTODY",
            action: stringField(event.action, "admin intake detail.history.action"),
            occurredAt: stringField(event.occurredAt, "admin intake detail.history.occurredAt"),
            actor: nullableString(event.actor, "admin intake detail.history.actor"),
          };
        })
      : [],
  };
};

const intakeLocationType = (value: unknown, label: string): AdminIntakeLocation["locationType"] => {
  if (
    ["SLICE_VAULT", "SLICE_INTAKE", "PARTNER_STORE", "PARTNER_INTAKE", "DEMO_TEST"].includes(
      String(value),
    )
  )
    return value as AdminIntakeLocation["locationType"];
  throw new Error(`${label} is invalid.`);
};
const intakeLocationStatus = (value: unknown, label: string): AdminIntakeLocation["status"] => {
  if (["ACTIVE", "TEMPORARILY_UNAVAILABLE", "INACTIVE"].includes(String(value)))
    return value as AdminIntakeLocation["status"];
  throw new Error(`${label} is invalid.`);
};
const mapAdminIntakeLocation = (raw: unknown): AdminIntakeLocation => {
  const value = objectField(raw, "admin intake location");
  return {
    id: stringField(value.id, "admin intake location.id"),
    displayName: stringField(value.displayName, "admin intake location.displayName"),
    locationType: intakeLocationType(value.locationType, "admin intake location.locationType"),
    environment: value.environment === "production" ? "production" : "beta",
    status: intakeLocationStatus(value.status, "admin intake location.status"),
    active: Boolean(value.active),
    intakeAvailable: Boolean(value.intakeAvailable),
    operationallyApproved: Boolean(value.operationallyApproved),
    acceptingShipments: Boolean(value.acceptingShipments),
    acceptingInPerson: Boolean(value.acceptingInPerson),
    region: stringField(value.region, "admin intake location.region"),
    countryCode: stringField(value.countryCode, "admin intake location.countryCode"),
    city: nullableString(value.city, "admin intake location.city"),
    activeIntakes: Number(value.activeIntakes ?? 0),
    updatedAt: stringField(value.updatedAt, "admin intake location.updatedAt"),
  };
};
const mapAdminIntakeLocationDetail = (raw: unknown): AdminIntakeLocationDetail => {
  const value = objectField(raw, "admin intake location detail");
  const locationRaw = objectField(value.location, "admin intake location detail.location");
  const location = {
    ...mapAdminIntakeLocation(locationRaw),
    acceptingNewIntakes: Boolean(locationRaw.acceptingNewIntakes),
    receiverName: nullableString(locationRaw.receiverName, "intake location.receiverName"),
    addressLine1: nullableString(locationRaw.addressLine1, "intake location.addressLine1"),
    addressLine2: nullableString(locationRaw.addressLine2, "intake location.addressLine2"),
    postalCode: nullableString(locationRaw.postalCode, "intake location.postalCode"),
    shippingInstructions: stringField(
      locationRaw.shippingInstructions,
      "intake location.shippingInstructions",
    ),
    inPersonInstructions: nullableString(
      locationRaw.inPersonInstructions,
      "intake location.inPersonInstructions",
    ),
    customerSafeAddress: stringField(
      locationRaw.customerSafeAddress,
      "intake location.customerSafeAddress",
    ),
    supportedCategories: Array.isArray(locationRaw.supportedCategories)
      ? locationRaw.supportedCategories.map((item) => {
          const category = objectField(item, "intake location category");
          return {
            id: stringField(category.id, "intake location category.id"),
            name: stringField(category.name, "intake location category.name"),
          };
        })
      : [],
    createdAt: stringField(locationRaw.createdAt, "intake location.createdAt"),
  };
  return {
    location,
    intakes: Array.isArray(value.intakes)
      ? value.intakes.map((item) => {
          const intake = objectField(item, "intake location intake");
          return {
            id: stringField(intake.id, "intake location intake.id"),
            submissionId: stringField(intake.submissionId, "intake location intake.submissionId"),
            reference: stringField(intake.reference, "intake location intake.reference"),
            title: stringField(intake.title, "intake location intake.title"),
            collector: stringField(intake.collector, "intake location intake.collector"),
            deliveryMethod: intake.deliveryMethod === "IN_PERSON" ? "IN_PERSON" : "SHIPMENT",
            stage: stringField(intake.stage, "intake location intake.stage"),
            updatedAt: stringField(intake.updatedAt, "intake location intake.updatedAt"),
            issue:
              intake.issue === null
                ? null
                : (() => {
                    const issue = objectField(intake.issue, "intake location issue");
                    return {
                      code: stringField(issue.code, "intake location issue.code"),
                      severity: stringField(issue.severity, "intake location issue.severity"),
                    };
                  })(),
          };
        })
      : [],
    counts:
      value.counts && typeof value.counts === "object"
        ? Object.fromEntries(
            Object.entries(value.counts as Record<string, unknown>).map(([key, count]) => [
              key,
              Number(count ?? 0),
            ]),
          )
        : {},
    history: Array.isArray(value.history)
      ? value.history.map((item) => {
          const event = objectField(item, "intake location history");
          return {
            id: stringField(event.id, "intake location history.id"),
            action: stringField(event.action, "intake location history.action"),
            actor: stringField(event.actor, "intake location history.actor"),
            occurredAt: stringField(event.occurredAt, "intake location history.occurredAt"),
          };
        })
      : [],
  };
};

const mapIntakeLocationMutation = (value: Record<string, unknown>) => ({
  id: stringField(value.id, "intake location mutation.id"),
  displayName: stringField(value.displayName, "intake location mutation.displayName"),
  status: intakeLocationStatus(value.status, "intake location mutation.status"),
  active: Boolean(value.active),
  acceptingNewIntakes: Boolean(value.acceptingNewIntakes),
  acceptingShipments: Boolean(value.acceptingShipments),
  acceptingInPerson: Boolean(value.acceptingInPerson),
  updatedAt: stringField(value.updatedAt, "intake location mutation.updatedAt"),
  audited: Boolean(value.audited),
});

const mapAdminMembership = (raw: unknown): AdminMembershipRow => {
  const value = objectField(raw, "admin membership row");
  const collector = objectField(value.collector, "admin membership collector");
  const plan = objectField(value.plan, "admin membership plan");
  return {
    id: stringField(value.id, "admin membership.id"),
    collector: {
      id: stringField(collector.id, "admin membership.collector.id"),
      displayName: stringField(collector.displayName, "admin membership.collector.displayName"),
      username: nullableString(collector.username, "admin membership.collector.username"),
      email: stringField(collector.email, "admin membership.collector.email"),
    },
    plan: {
      code: stringField(plan.code, "admin membership.plan.code"),
      displayName: stringField(plan.displayName, "admin membership.plan.displayName"),
      monthlyPriceMinor: stringField(
        plan.monthlyPriceMinor,
        "admin membership.plan.monthlyPriceMinor",
      ),
      currency: stringField(plan.currency, "admin membership.plan.currency"),
    },
    membership: (() => {
      const membership = objectField(value.membership, "admin membership.membership");
      return {
        planId: stringField(membership.planId, "admin membership.membership.planId"),
        planName: stringField(membership.planName, "admin membership.membership.planName"),
        status: stringField(membership.status, "admin membership.membership.status"),
        source: stringField(membership.source, "admin membership.membership.source"),
        currentPeriodStart: nullableString(
          membership.currentPeriodStart,
          "admin membership.membership.currentPeriodStart",
        ),
        currentPeriodEnd: nullableString(
          membership.currentPeriodEnd,
          "admin membership.membership.currentPeriodEnd",
        ),
        cancelAtPeriodEnd: Boolean(membership.cancelAtPeriodEnd),
        trialEnd: nullableString(membership.trialEnd, "admin membership.membership.trialEnd"),
        providerConfigured: Boolean(membership.providerConfigured),
        billingState: stringField(
          membership.billingState,
          "admin membership.membership.billingState",
        ),
        betaEntitlement: Boolean(membership.betaEntitlement),
      };
    })(),
    usage: (() => {
      const usage = objectField(value.usage, "admin membership.usage");
      return {
        activeCollectibles: Number(usage.activeCollectibles ?? 0),
        activeCollectiblesLimit:
          typeof usage.activeCollectiblesLimit === "number" ? usage.activeCollectiblesLimit : null,
        activeCollectiblesPercent:
          typeof usage.activeCollectiblesPercent === "number"
            ? usage.activeCollectiblesPercent
            : null,
        monthlySubmissions: Number(usage.monthlySubmissions ?? 0),
        monthlySubmissionsLimit:
          typeof usage.monthlySubmissionsLimit === "number" ? usage.monthlySubmissionsLimit : null,
        monthlySubmissionsPercent:
          typeof usage.monthlySubmissionsPercent === "number"
            ? usage.monthlySubmissionsPercent
            : null,
        concurrentIntake: Number(usage.concurrentIntake ?? 0),
        concurrentIntakeLimit:
          typeof usage.concurrentIntakeLimit === "number" ? usage.concurrentIntakeLimit : null,
        concurrentIntakeAtLimit: Boolean(usage.concurrentIntakeAtLimit),
        billingPeriodStart: stringField(
          usage.billingPeriodStart,
          "admin membership.usage.billingPeriodStart",
        ),
        billingPeriodEnd: stringField(
          usage.billingPeriodEnd,
          "admin membership.usage.billingPeriodEnd",
        ),
      };
    })(),
    billing: (() => {
      const billing = objectField(value.billing, "admin membership.billing");
      return {
        nextBillingDate: nullableString(
          billing.nextBillingDate,
          "admin membership.billing.nextBillingDate",
        ),
        health: stringField(billing.health, "admin membership.billing.health"),
        configured: Boolean(billing.configured),
        provider: nullableString(billing.provider, "admin membership.billing.provider"),
        lastSyncAt: nullableString(billing.lastSyncAt, "admin membership.billing.lastSyncAt"),
      };
    })(),
    entitlements: (() => {
      const entitlements = value.entitlements;
      return entitlements && typeof entitlements === "object" && !Array.isArray(entitlements)
        ? (entitlements as Record<string, unknown>)
        : {};
    })(),
    overLimit: Boolean(value.overLimit),
    warnings: Array.isArray(value.warnings) ? value.warnings.map((entry) => String(entry)) : [],
    eligibleActions: Array.isArray(value.eligibleActions)
      ? value.eligibleActions.map((entry) => String(entry))
      : [],
    usageHealth: ["NORMAL", "AT_LIMIT", "OVER_LIMIT"].includes(String(value.usageHealth))
      ? (String(value.usageHealth) as "NORMAL" | "AT_LIMIT" | "OVER_LIMIT")
      : "NORMAL",
    needsAction: Boolean(value.needsAction),
    nextChange: (() => {
      const next = objectField(value.nextChange ?? {}, "admin membership.nextChange");
      return {
        kind: stringField(next.kind, "admin membership.nextChange.kind"),
        at: nullableString(next.at, "admin membership.nextChange.at"),
        label: stringField(next.label, "admin membership.nextChange.label"),
      };
    })(),
    testFixture: Boolean(value.testFixture),
    events: Array.isArray(value.events)
      ? value.events.map((entry) => {
          const event = objectField(entry, "admin membership event");
          return {
            id: stringField(event.id, "admin membership event.id"),
            fromStatus: nullableString(event.fromStatus, "admin membership event.fromStatus"),
            toStatus: stringField(event.toStatus, "admin membership event.toStatus"),
            source: stringField(event.source, "admin membership event.source"),
            occurredAt: stringField(event.occurredAt, "admin membership event.occurredAt"),
          };
        })
      : [],
    updatedAt: stringField(value.updatedAt, "admin membership.updatedAt"),
  };
};

const mapAdminMembershipDirectory = (raw: unknown): AdminMembershipDirectoryResponse => {
  const value = objectField(raw, "admin memberships");
  const pagination = objectField(value.pagination, "admin memberships.pagination");
  const kpis = objectField(value.kpis, "admin memberships.kpis");
  const numericRecord = (input: unknown) => {
    if (!input || typeof input !== "object" || Array.isArray(input)) return {};
    return Object.fromEntries(
      Object.entries(input).map(([key, entry]) => [key, Number(entry ?? 0)]),
    );
  };
  return {
    items: Array.isArray(value.items) ? value.items.map(mapAdminMembership) : [],
    pagination: {
      page: Number(pagination.page ?? 1),
      pageSize: Number(pagination.pageSize ?? 10),
      total: Number(pagination.total ?? 0),
      totalPages: Number(pagination.totalPages ?? 0),
    },
    kpis: {
      active: Number(kpis.active ?? 0),
      starter: Number(kpis.starter ?? 0),
      pro: Number(kpis.pro ?? 0),
      elite: Number(kpis.elite ?? 0),
      pastDue: Number(kpis.pastDue ?? 0),
      trialing: Number(kpis.trialing ?? 0),
      total: Number(kpis.total ?? 0),
    },
    statusOverview: numericRecord(value.statusOverview),
    planDistribution: numericRecord(value.planDistribution),
    capabilities: (() => {
      const capabilities = objectField(value.capabilities ?? {}, "admin membership capabilities");
      return {
        providerConfigured: Boolean(capabilities.providerConfigured),
        provider: nullableString(capabilities.provider, "admin membership capabilities.provider"),
        canExport: Boolean(capabilities.canExport),
        usageThresholds:
          capabilities.usageThresholds === "AT_LIMIT_ONLY"
            ? ("AT_LIMIT_ONLY" as const)
            : ("EXACT_ONLY" as const),
      };
    })(),
    recentActivity: Array.isArray(value.recentActivity)
      ? value.recentActivity.map((entry) => {
          const activity = objectField(entry, "admin membership activity");
          return {
            id: stringField(activity.id, "admin membership activity.id"),
            title: stringField(activity.title, "admin membership activity.title"),
            reference: nullableString(activity.reference, "admin membership activity.reference"),
            occurredAt: stringField(activity.occurredAt, "admin membership activity.occurredAt"),
          };
        })
      : [],
  };
};

const mapAdminMembershipDetail = (raw: unknown): AdminMembershipDetailResponse => {
  const value = objectField(raw, "admin membership detail");
  const collector = objectField(value.collector, "admin membership detail.collector");
  const membership = objectField(value.membership, "admin membership detail.membership");
  const source = objectField(membership.source, "admin membership detail.membership.source");
  const plan = objectField(value.plan, "admin membership detail.plan");
  const period = objectField(value.period, "admin membership detail.period");
  const nextChange = objectField(value.nextChange, "admin membership detail.nextChange");
  const billing = objectField(value.billing, "admin membership detail.billing");
  const entitlements = objectField(value.entitlements, "admin membership detail.entitlements");
  const overrides = objectField(
    entitlements.overrides,
    "admin membership detail.entitlements.overrides",
  );
  const usage = objectField(value.usage, "admin membership detail.usage");
  const account = objectField(value.account, "admin membership detail.account");
  const capabilities = objectField(value.capabilities, "admin membership detail.capabilities");
  const mapLimit = (rawLimit: unknown) => {
    const limit = objectField(rawLimit, "admin membership detail entitlement limit");
    return {
      key: stringField(limit.key, "membership detail entitlement.key"),
      label: stringField(limit.label, "membership detail entitlement.label"),
      limit: Number(limit.limit),
      used: typeof limit.used === "number" ? limit.used : null,
      remaining: typeof limit.remaining === "number" ? limit.remaining : null,
      tracking: stringField(limit.tracking, "membership detail entitlement.tracking"),
    };
  };
  return {
    id: stringField(value.id, "admin membership detail.id"),
    collector: {
      id: stringField(collector.id, "membership detail.collector.id"),
      displayName: stringField(collector.displayName, "membership detail.collector.displayName"),
      username: nullableString(collector.username, "membership detail.collector.username"),
      email: stringField(collector.email, "membership detail.collector.email"),
      accountStatus: stringField(
        collector.accountStatus,
        "membership detail.collector.accountStatus",
      ),
      joinedAt: stringField(collector.joinedAt, "membership detail.collector.joinedAt"),
      lastLoginAt: nullableString(collector.lastLoginAt, "membership detail.collector.lastLoginAt"),
    },
    membership: {
      status: stringField(membership.status, "membership detail.membership.status"),
      source: {
        kind: stringField(source.kind, "membership detail.source.kind"),
        label: stringField(source.label, "membership detail.source.label"),
        detail: nullableString(source.detail, "membership detail.source.detail"),
      },
      createdAt: stringField(membership.createdAt, "membership detail.membership.createdAt"),
      memberSince: stringField(membership.memberSince, "membership detail.membership.memberSince"),
      testFixture: Boolean(membership.testFixture),
      cancelAtPeriodEnd: Boolean(membership.cancelAtPeriodEnd),
    },
    plan: {
      id: stringField(plan.id, "membership detail.plan.id"),
      code: stringField(plan.code, "membership detail.plan.code"),
      displayName: stringField(plan.displayName, "membership detail.plan.displayName"),
      description: stringField(plan.description, "membership detail.plan.description"),
      monthlyPriceMinor: stringField(
        plan.monthlyPriceMinor,
        "membership detail.plan.monthlyPriceMinor",
      ),
      currency: stringField(plan.currency, "membership detail.plan.currency"),
      billingInterval: stringField(plan.billingInterval, "membership detail.plan.billingInterval"),
      versionUpdatedAt: stringField(
        plan.versionUpdatedAt,
        "membership detail.plan.versionUpdatedAt",
      ),
      active: Boolean(plan.active),
    },
    period: {
      start: nullableString(period.start, "membership detail.period.start"),
      end: nullableString(period.end, "membership detail.period.end"),
      daysRemaining: typeof period.daysRemaining === "number" ? period.daysRemaining : null,
      source: stringField(period.source, "membership detail.period.source"),
      label: stringField(period.label, "membership detail.period.label"),
    },
    nextChange: {
      kind: stringField(nextChange.kind, "membership detail.nextChange.kind"),
      label: stringField(nextChange.label, "membership detail.nextChange.label"),
      at: nullableString(nextChange.at, "membership detail.nextChange.at"),
    },
    billing: {
      provider: nullableString(billing.provider, "membership detail.billing.provider"),
      providerLabel: stringField(billing.providerLabel, "membership detail.billing.providerLabel"),
      configured: Boolean(billing.configured),
      state: stringField(billing.state, "membership detail.billing.state"),
      paymentSetup: stringField(billing.paymentSetup, "membership detail.billing.paymentSetup"),
      paymentSetupLabel: stringField(
        billing.paymentSetupLabel,
        "membership detail.billing.paymentSetupLabel",
      ),
      lastSyncAt: nullableString(billing.lastSyncAt, "membership detail.billing.lastSyncAt"),
      syncState: stringField(billing.syncState, "membership detail.billing.syncState"),
      providerReferenceAvailable: Boolean(billing.providerReferenceAvailable),
    },
    entitlements: {
      source: stringField(entitlements.source, "membership detail.entitlements.source"),
      sourceLabel: stringField(
        entitlements.sourceLabel,
        "membership detail.entitlements.sourceLabel",
      ),
      features: Array.isArray(entitlements.features)
        ? entitlements.features.map((entry) => {
            const feature = objectField(entry, "membership detail feature");
            return {
              key: stringField(feature.key, "membership detail feature.key"),
              label: stringField(feature.label, "membership detail feature.label"),
              enabled: Boolean(feature.enabled),
            };
          })
        : [],
      limits: Array.isArray(entitlements.limits) ? entitlements.limits.map(mapLimit) : [],
      overrides: {
        supported: Boolean(overrides.supported),
        items: Array.isArray(overrides.items) ? overrides.items : [],
        message: stringField(overrides.message, "membership detail overrides.message"),
      },
    },
    usage: {
      health: ["NORMAL", "AT_LIMIT", "OVER_LIMIT"].includes(String(usage.health))
        ? (String(usage.health) as "NORMAL" | "AT_LIMIT" | "OVER_LIMIT")
        : "NORMAL",
      billingPeriodStart: stringField(
        usage.billingPeriodStart,
        "membership detail.usage.billingPeriodStart",
      ),
      billingPeriodEnd: stringField(
        usage.billingPeriodEnd,
        "membership detail.usage.billingPeriodEnd",
      ),
      tracked: Array.isArray(usage.tracked) ? usage.tracked.map(mapLimit) : [],
      unavailable: Array.isArray(usage.unavailable) ? usage.unavailable.map(String) : [],
    },
    account: {
      status: stringField(account.status, "membership detail.account.status"),
      testFixture: Boolean(account.testFixture),
      financeState: stringField(account.financeState, "membership detail.account.financeState"),
      complianceState: stringField(
        account.complianceState,
        "membership detail.account.complianceState",
      ),
    },
    issues: Array.isArray(value.issues)
      ? value.issues.map((entry) => {
          const issue = objectField(entry, "membership detail issue");
          return {
            code: stringField(issue.code, "membership detail issue.code"),
            severity: ["INFO", "WARNING", "ERROR"].includes(String(issue.severity))
              ? (String(issue.severity) as "INFO" | "WARNING" | "ERROR")
              : "INFO",
            label: stringField(issue.label, "membership detail issue.label"),
            detail: stringField(issue.detail, "membership detail issue.detail"),
          };
        })
      : [],
    allowedActions: Array.isArray(value.allowedActions) ? value.allowedActions.map(String) : [],
    history: Array.isArray(value.history)
      ? value.history.map((entry) => {
          const event = objectField(entry, "membership detail history");
          return {
            id: stringField(event.id, "membership detail history.id"),
            category: stringField(event.category, "membership detail history.category"),
            event: stringField(event.event, "membership detail history.event"),
            detail: stringField(event.detail, "membership detail history.detail"),
            performedBy: stringField(event.performedBy, "membership detail history.performedBy"),
            occurredAt: stringField(event.occurredAt, "membership detail history.occurredAt"),
          };
        })
      : [],
    capabilities: {
      billingConfigured: Boolean(capabilities.billingConfigured),
      auditAvailable: Boolean(capabilities.auditAvailable),
      overridesSupported: Boolean(capabilities.overridesSupported),
    },
  };
};

const mapAdminRiskOperations = (raw: unknown): AdminRiskOperations => {
  const value = objectField(raw, "admin risk operations");
  const finance = objectField(value.finance, "admin finance operations");
  const mapUser = (rawUser: unknown) => {
    const user = objectField(rawUser, "admin finance user");
    return {
      displayName: stringField(user.displayName, "admin finance user.displayName"),
      username: nullableString(user.username, "admin finance user.username"),
    };
  };
  return {
    finance: {
      movements: Array.isArray(finance.movements)
        ? finance.movements.map((rawMovement) => {
            const item = objectField(rawMovement, "admin movement");
            return {
              id: stringField(item.id, "movement.id"),
              user: mapUser(item.user),
              type: stringField(item.type, "movement.type"),
              amountMinor: stringField(item.amountMinor, "movement.amountMinor"),
              currency: stringField(item.currency, "movement.currency"),
              provider: stringField(item.provider, "movement.provider"),
              status: stringField(item.status, "movement.status"),
              referenceAvailable: Boolean(item.referenceAvailable),
              createdAt: stringField(item.createdAt, "movement.createdAt"),
              updatedAt: stringField(item.updatedAt, "movement.updatedAt"),
            };
          })
        : [],
      wallets: Array.isArray(finance.wallets)
        ? finance.wallets.map((rawWallet) => {
            const item = objectField(rawWallet, "admin wallet");
            return {
              id: stringField(item.id, "wallet.id"),
              owner: stringField(item.owner, "wallet.owner"),
              availableMinor: stringField(item.availableMinor, "wallet.availableMinor"),
              reservedMinor: stringField(item.reservedMinor, "wallet.reservedMinor"),
              currency: stringField(item.currency, "wallet.currency"),
              status: stringField(item.status, "wallet.status"),
              updatedAt: stringField(item.updatedAt, "wallet.updatedAt"),
            };
          })
        : [],
      reservations: Array.isArray(finance.reservations)
        ? finance.reservations.map((rawReservation) => {
            const item = objectField(rawReservation, "admin reservation");
            return {
              id: stringField(item.id, "reservation.id"),
              owner: stringField(item.owner, "reservation.owner"),
              amountMinor: stringField(item.amountMinor, "reservation.amountMinor"),
              currency: stringField(item.currency, "reservation.currency"),
              purposeType: stringField(item.purposeType, "reservation.purposeType"),
              status: stringField(item.status, "reservation.status"),
              createdAt: stringField(item.createdAt, "reservation.createdAt"),
            };
          })
        : [],
      reconciliation: Array.isArray(finance.reconciliation)
        ? finance.reconciliation.map((rawRun) => {
            const item = objectField(rawRun, "admin reconciliation");
            return {
              id: stringField(item.id, "reconciliation.id"),
              scope: stringField(item.scope, "reconciliation.scope"),
              status: stringField(item.status, "reconciliation.status"),
              currency: stringField(item.currency, "reconciliation.currency"),
              debitMinor: stringField(item.debitMinor, "reconciliation.debitMinor"),
              creditMinor: stringField(item.creditMinor, "reconciliation.creditMinor"),
              mismatchCodes: Array.isArray(item.mismatchCodes)
                ? item.mismatchCodes.filter((code): code is string => typeof code === "string")
                : [],
              createdAt: stringField(item.createdAt, "reconciliation.createdAt"),
            };
          })
        : [],
    },
    system: Array.isArray(value.system)
      ? value.system.map((rawSystem) => {
          const item = objectField(rawSystem, "admin system health");
          return {
            name: stringField(item.name, "system.name"),
            status: stringField(
              item.status,
              "system.status",
            ) as AdminRiskOperations["system"][number]["status"],
            summary: stringField(item.summary, "system.summary"),
            lastCheckedAt: stringField(item.lastCheckedAt, "system.lastCheckedAt"),
          };
        })
      : [],
    audit: Array.isArray(value.audit)
      ? value.audit.map((rawAudit) => {
          const item = objectField(rawAudit, "admin audit");
          return {
            id: stringField(item.id, "audit.id"),
            actor: stringField(item.actor, "audit.actor"),
            action: stringField(item.action, "audit.action"),
            resourceType: stringField(item.resourceType, "audit.resourceType"),
            resourceId: nullableString(item.resourceId, "audit.resourceId"),
            result: stringField(item.result, "audit.result"),
            createdAt: stringField(item.createdAt, "audit.createdAt"),
          };
        })
      : [],
    integrations: Array.isArray(value.integrations)
      ? value.integrations.map((rawIntegration) => {
          const item = objectField(rawIntegration, "admin integration");
          return {
            name: stringField(item.name, "integration.name"),
            status: stringField(
              item.status,
              "integration.status",
            ) as AdminRiskOperations["integrations"][number]["status"],
            configured: Boolean(item.configured),
            summary: stringField(item.summary, "integration.summary"),
            failedEvents: Number(item.failedEvents ?? 0),
          };
        })
      : [],
    webhooks: Array.isArray(value.webhooks)
      ? value.webhooks.map((rawWebhook) => {
          const item = objectField(rawWebhook, "admin webhook");
          return {
            id: stringField(item.id, "webhook.id"),
            provider: stringField(item.provider, "webhook.provider"),
            eventType: stringField(item.eventType, "webhook.eventType"),
            status: stringField(item.status, "webhook.status"),
            attempts: Number(item.attempts ?? 0),
            receivedAt: stringField(item.receivedAt, "webhook.receivedAt"),
            updatedAt: stringField(item.updatedAt, "webhook.updatedAt"),
            error: nullableString(item.error, "webhook.error"),
          };
        })
      : [],
  };
};

const mapAdminPlatformDashboard = (raw: unknown): AdminPlatformDashboard => {
  const value = objectField(raw, "admin platform dashboard");
  const kpis = objectField(value.kpis, "admin platform kpis");
  const mapSystem = (entry: unknown) => {
    const item = objectField(entry, "admin platform system health");
    return {
      name: stringField(item.name, "platform.system.name"),
      status: stringField(
        item.status,
        "platform.system.status",
      ) as AdminPlatformDashboard["systemHealth"][number]["status"],
      summary: stringField(item.summary, "platform.system.summary"),
      lastCheckedAt: stringField(item.lastCheckedAt, "platform.system.lastCheckedAt"),
    };
  };
  const mapProvider = (entry: unknown) => {
    const item = objectField(entry, "admin platform provider");
    return {
      name: stringField(item.name, "platform.provider.name"),
      status: stringField(
        item.status,
        "platform.provider.status",
      ) as AdminPlatformDashboard["providers"][number]["status"],
      configured: Boolean(item.configured),
      summary: stringField(item.summary, "platform.provider.summary"),
      failedEvents: Number(item.failedEvents ?? 0),
    };
  };
  const mapAudit = (entry: unknown) => {
    const item = objectField(entry, "admin platform activity");
    return {
      id: stringField(item.id, "platform.activity.id"),
      actor: stringField(item.actor, "platform.activity.actor"),
      action: stringField(item.action, "platform.activity.action"),
      resourceType: stringField(item.resourceType, "platform.activity.resourceType"),
      resourceId: nullableString(item.resourceId, "platform.activity.resourceId"),
      result: stringField(item.result, "platform.activity.result"),
      createdAt: stringField(item.createdAt, "platform.activity.createdAt"),
    };
  };
  return {
    generatedAt: stringField(value.generatedAt, "platform.generatedAt"),
    overallHealth: stringField(
      value.overallHealth,
      "platform.overallHealth",
    ) as AdminPlatformDashboard["overallHealth"],
    kpis: {
      failedJobs: Number(kpis.failedJobs ?? 0),
      webhookFailures: Number(kpis.webhookFailures ?? 0),
      degradedProviders: Number(kpis.degradedProviders ?? 0),
      pendingChanges: kpis.pendingChanges === null ? null : Number(kpis.pendingChanges ?? 0),
    },
    systemHealth: Array.isArray(value.systemHealth) ? value.systemHealth.map(mapSystem) : [],
    providers: Array.isArray(value.providers) ? value.providers.map(mapProvider) : [],
    resources: Array.isArray(value.resources)
      ? value.resources.map((entry) => {
          const item = objectField(entry, "admin platform resource");
          return {
            label: stringField(item.label, "resource.label"),
            value: stringField(item.value, "resource.value"),
            status: stringField(item.status, "resource.status"),
          };
        })
      : [],
    alerts: Array.isArray(value.alerts)
      ? value.alerts.map((entry) => {
          const item = objectField(entry, "admin platform alert");
          return {
            id: stringField(item.id, "alert.id"),
            title: stringField(item.title, "alert.title"),
            detail: stringField(item.detail, "alert.detail"),
            severity: stringField(item.severity, "alert.severity"),
            occurredAt: stringField(item.occurredAt, "alert.occurredAt"),
          };
        })
      : [],
    recentActivity: Array.isArray(value.recentActivity) ? value.recentActivity.map(mapAudit) : [],
    featureFlags: {
      available: Boolean(objectField(value.featureFlags, "platform.featureFlags").available),
      message: stringField(
        objectField(value.featureFlags, "platform.featureFlags").message,
        "featureFlags.message",
      ),
    },
    settings: {
      available: Boolean(objectField(value.settings, "platform.settings").available),
      message: stringField(
        objectField(value.settings, "platform.settings").message,
        "settings.message",
      ),
    },
  };
};

const mapAdminPlatformRecords = (raw: unknown): AdminPlatformRecordsResponse => {
  const value = objectField(raw, "admin platform records");
  const pagination = objectField(value.pagination, "admin platform records.pagination");
  return {
    tab: stringField(value.tab, "platform records.tab"),
    supported: Boolean(value.supported),
    message: nullableString(value.message, "platform records.message"),
    items: Array.isArray(value.items)
      ? value.items.map(
          (entry) => objectField(entry, "admin platform record") as AdminPlatformRecord,
        )
      : [],
    pagination: {
      page: Number(pagination.page ?? 1),
      pageSize: Number(pagination.pageSize ?? 10),
      total: Number(pagination.total ?? 0),
      totalPages: Number(pagination.totalPages ?? 0),
    },
  };
};

const mapAdminFinanceDashboard = (raw: unknown): AdminFinanceDashboard => {
  const value = objectField(raw, "admin finance dashboard");
  const kpis = objectField(value.kpis, "admin finance dashboard.kpis");
  const overview = objectField(value.overview, "admin finance dashboard.overview");
  const orderSummary = objectField(value.orderSummary, "admin finance dashboard.orderSummary");
  const executionSummary = objectField(
    value.executionSummary,
    "admin finance dashboard.executionSummary",
  );
  const mapMinor = (entry: unknown, field: string) => stringField(entry, field);
  return {
    currency: "GBP",
    kpis: {
      totalCustomerCashMinor: mapMinor(
        kpis.totalCustomerCashMinor,
        "finance.kpis.totalCustomerCashMinor",
      ),
      availableCustomerCashMinor: mapMinor(
        kpis.availableCustomerCashMinor,
        "finance.kpis.availableCustomerCashMinor",
      ),
      reservedFundsMinor: mapMinor(kpis.reservedFundsMinor, "finance.kpis.reservedFundsMinor"),
      pendingDepositsMinor: mapMinor(
        kpis.pendingDepositsMinor,
        "finance.kpis.pendingDepositsMinor",
      ),
      pendingWithdrawalsMinor: mapMinor(
        kpis.pendingWithdrawalsMinor,
        "finance.kpis.pendingWithdrawalsMinor",
      ),
      openOrders: Number(kpis.openOrders ?? 0),
      executionsToday: Number(kpis.executionsToday ?? 0),
      platformGrossRevenueMinor:
        kpis.platformGrossRevenueMinor === undefined
          ? undefined
          : mapMinor(kpis.platformGrossRevenueMinor, "finance.kpis.platformGrossRevenueMinor"),
      platformProviderExpensesMinor:
        kpis.platformProviderExpensesMinor === undefined
          ? undefined
          : mapMinor(
              kpis.platformProviderExpensesMinor,
              "finance.kpis.platformProviderExpensesMinor",
            ),
      platformEstimatedNetContributionMinor:
        kpis.platformEstimatedNetContributionMinor === undefined
          ? undefined
          : mapMinor(
              kpis.platformEstimatedNetContributionMinor,
              "finance.kpis.platformEstimatedNetContributionMinor",
            ),
      platformEligibleSettlementMinor:
        kpis.platformEligibleSettlementMinor === undefined
          ? undefined
          : mapMinor(
              kpis.platformEligibleSettlementMinor,
              "finance.kpis.platformEligibleSettlementMinor",
            ),
      providerCostsPendingEvidence:
        kpis.providerCostsPendingEvidence === undefined
          ? undefined
          : Number(kpis.providerCostsPendingEvidence ?? 0),
    },
    platformRevenue:
      value.platformRevenue &&
      typeof value.platformRevenue === "object" &&
      !Array.isArray(value.platformRevenue)
        ? (() => {
            const revenue = objectField(value.platformRevenue, "admin platform revenue");
            const external =
              revenue.externalSettlement &&
              typeof revenue.externalSettlement === "object" &&
              !Array.isArray(revenue.externalSettlement)
                ? objectField(revenue.externalSettlement, "admin external settlement")
                : { status: "NOT_CONFIGURED", destination: null };
            return {
              grossRevenueMinor: mapMinor(
                revenue.grossRevenueMinor,
                "admin revenue.grossRevenueMinor",
              ),
              providerExpensesMinor: mapMinor(
                revenue.providerExpensesMinor,
                "admin revenue.providerExpensesMinor",
              ),
              estimatedNetContributionMinor: mapMinor(
                revenue.estimatedNetContributionMinor,
                "admin revenue.estimatedNetContributionMinor",
              ),
              eligibleSettlementMinor: mapMinor(
                revenue.eligibleSettlementMinor,
                "admin revenue.eligibleSettlementMinor",
              ),
              knownProviderCostsMinor: mapMinor(
                revenue.knownProviderCostsMinor,
                "admin revenue.knownProviderCostsMinor",
              ),
              pendingProviderCostCount: Number(revenue.pendingProviderCostCount ?? 0),
              externalSettlement: {
                status: stringField(external.status, "admin external settlement.status"),
                destination: nullableString(
                  external.destination,
                  "admin external settlement.destination",
                ),
              },
            };
          })()
        : undefined,
    payoutLiquidity:
      value.payoutLiquidity &&
      typeof value.payoutLiquidity === "object" &&
      !Array.isArray(value.payoutLiquidity)
        ? (() => {
            const liquidity = objectField(value.payoutLiquidity, "admin payout liquidity");
            const status = String(liquidity.providerLiquidityStatus);
            if (!["AVAILABLE", "INSUFFICIENT", "UNAVAILABLE", "NOT_APPLICABLE"].includes(status)) {
              throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid payout liquidity status.");
            }
            const source = String(liquidity.liquiditySource);
            if (!["STRIPE_PLATFORM_PAYMENTS_BALANCE", "NOT_APPLICABLE"].includes(source)) {
              throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid payout liquidity source.");
            }
            return {
              currency: "GBP" as const,
              providerMode: stringField(liquidity.providerMode, "payout liquidity.providerMode"),
              liquiditySource: source as "STRIPE_PLATFORM_PAYMENTS_BALANCE" | "NOT_APPLICABLE",
              providerAvailableMinor: nullableString(
                liquidity.providerAvailableMinor,
                "payout liquidity.providerAvailableMinor",
              ),
              providerPendingMinor: nullableString(
                liquidity.providerPendingMinor,
                "payout liquidity.providerPendingMinor",
              ),
              availableAfterReservationsMinor: nullableString(
                liquidity.availableAfterReservationsMinor,
                "payout liquidity.availableAfterReservationsMinor",
              ),
              customerCashLiabilityMinor: mapMinor(
                liquidity.customerCashLiabilityMinor,
                "payout liquidity.customerCashLiabilityMinor",
              ),
              withdrawalEligibleLiabilityMinor: mapMinor(
                liquidity.withdrawalEligibleLiabilityMinor,
                "payout liquidity.withdrawalEligibleLiabilityMinor",
              ),
              settlingMinor: mapMinor(liquidity.settlingMinor, "payout liquidity.settlingMinor"),
              activeReservationMinor: mapMinor(
                liquidity.activeReservationMinor,
                "payout liquidity.activeReservationMinor",
              ),
              payoutLiquidityCoverageBps:
                liquidity.payoutLiquidityCoverageBps === null ||
                liquidity.payoutLiquidityCoverageBps === undefined
                  ? null
                  : Number(liquidity.payoutLiquidityCoverageBps),
              providerLiquidityStatus: status as
                "AVAILABLE" | "INSUFFICIENT" | "UNAVAILABLE" | "NOT_APPLICABLE",
              nextAvailabilityAt: nullableString(
                liquidity.nextAvailabilityAt,
                "payout liquidity.nextAvailabilityAt",
              ),
              checkedAt: stringField(liquidity.checkedAt, "payout liquidity.checkedAt"),
              warning: Boolean(liquidity.warning),
            };
          })()
        : undefined,
    overview: {
      totalVolumeMinor: mapMinor(overview.totalVolumeMinor, "finance.overview.totalVolumeMinor"),
      buyVolumeMinor: mapMinor(overview.buyVolumeMinor, "finance.overview.buyVolumeMinor"),
      sellVolumeMinor: mapMinor(overview.sellVolumeMinor, "finance.overview.sellVolumeMinor"),
      totalFeesMinor: mapMinor(overview.totalFeesMinor, "finance.overview.totalFeesMinor"),
      netFeesMinor: mapMinor(overview.netFeesMinor, "finance.overview.netFeesMinor"),
      history: Array.isArray(overview.history)
        ? overview.history.map((entry) => {
            const item = objectField(entry, "finance overview history");
            return {
              date: stringField(item.date, "finance history.date"),
              volumeMinor: mapMinor(item.volumeMinor, "finance history.volumeMinor"),
            };
          })
        : [],
    },
    orderSummary: {
      total: Number(orderSummary.total ?? 0),
      buy: Number(orderSummary.buy ?? 0),
      sell: Number(orderSummary.sell ?? 0),
      open: Number(orderSummary.open ?? 0),
    },
    executionSummary: {
      total: Number(executionSummary.total ?? 0),
      buyInitiated: Number(executionSummary.buyInitiated ?? 0),
      sellInitiated: Number(executionSummary.sellInitiated ?? 0),
    },
    reconciliationSummary: Array.isArray(value.reconciliationSummary)
      ? value.reconciliationSummary.map((entry) => {
          const item = objectField(entry, "finance reconciliation summary");
          return {
            status: stringField(item.status, "finance reconciliation.status"),
            amountMinor: mapMinor(item.amountMinor, "finance reconciliation.amountMinor"),
            count: Number(item.count ?? 0),
          };
        })
      : [],
    recentActivity: Array.isArray(value.recentActivity)
      ? value.recentActivity.map((entry) => {
          const item = objectField(entry, "finance activity");
          return {
            id: stringField(item.id, "finance activity.id"),
            type: stringField(item.type, "finance activity.type"),
            title: stringField(item.title, "finance activity.title"),
            detail: stringField(item.detail, "finance activity.detail"),
            amountMinor: nullableString(item.amountMinor, "finance activity.amountMinor"),
            occurredAt: stringField(item.occurredAt, "finance activity.occurredAt"),
          };
        })
      : [],
  };
};

const mapAdminFinanceRecords = (raw: unknown): AdminFinanceRecordsResponse => {
  const value = objectField(raw, "admin finance records");
  const pagination = objectField(value.pagination, "admin finance records.pagination");
  return {
    tab: stringField(value.tab, "admin finance records.tab"),
    items: Array.isArray(value.items)
      ? value.items.map((entry) => objectField(entry, "admin finance record") as AdminFinanceRecord)
      : [],
    pagination: {
      page: Number(pagination.page ?? 1),
      pageSize: Number(pagination.pageSize ?? 10),
      total: Number(pagination.total ?? 0),
      totalPages: Number(pagination.totalPages ?? 0),
    },
  };
};

const mapAdminTrustSupportDashboard = (raw: unknown): AdminTrustSupportDashboard => {
  const value = objectField(raw, "admin trust support dashboard");
  const kpis = objectField(value.kpis, "admin trust support dashboard.kpis");
  const overview = objectField(value.overview, "admin trust support dashboard.overview");
  return {
    kpis: {
      openComplianceCases: Number(kpis.openComplianceCases ?? 0),
      restrictedAccounts: Number(kpis.restrictedAccounts ?? 0),
      openTickets: Number(kpis.openTickets ?? 0),
      unassignedTickets: Number(kpis.unassignedTickets ?? 0),
      escalations: Number(kpis.escalations ?? 0),
    },
    overview: {
      complianceCases: Number(overview.complianceCases ?? 0),
      restrictedAccounts: Number(overview.restrictedAccounts ?? 0),
      openTickets: Number(overview.openTickets ?? 0),
      unassignedTickets: Number(overview.unassignedTickets ?? 0),
      escalations: Number(overview.escalations ?? 0),
    },
    recentActivity: Array.isArray(value.recentActivity)
      ? value.recentActivity.map((entry) => {
          const item = objectField(entry, "admin trust support activity");
          return {
            id: stringField(item.id, "trust activity.id"),
            type: stringField(item.type, "trust activity.type"),
            title: stringField(item.title, "trust activity.title"),
            detail: stringField(item.detail, "trust activity.detail"),
            occurredAt: stringField(item.occurredAt, "trust activity.occurredAt"),
          };
        })
      : [],
  };
};

const mapAdminTrustSupportRecords = (raw: unknown): AdminTrustSupportRecordsResponse => {
  const value = objectField(raw, "admin trust support records");
  const pagination = objectField(value.pagination, "admin trust support records.pagination");
  return {
    tab: stringField(value.tab, "trust records.tab"),
    items: Array.isArray(value.items)
      ? value.items.map(
          (entry) => objectField(entry, "admin trust support record") as AdminTrustSupportRecord,
        )
      : [],
    pagination: {
      page: Number(pagination.page ?? 1),
      pageSize: Number(pagination.pageSize ?? 10),
      total: Number(pagination.total ?? 0),
      totalPages: Number(pagination.totalPages ?? 0),
    },
  };
};

const mapAdminComplianceDetail = (raw: unknown): AdminComplianceDetail => {
  const value = objectField(raw, "admin compliance detail");
  const user = objectField(value.user, "admin compliance detail.user");
  return {
    id: stringField(value.id, "compliance.id"),
    provider: stringField(value.provider, "compliance.provider"),
    type: stringField(value.type, "compliance.type"),
    status: stringField(value.status, "compliance.status"),
    createdAt: stringField(value.createdAt, "compliance.createdAt"),
    updatedAt: stringField(value.updatedAt, "compliance.updatedAt"),
    user: {
      id: stringField(user.id, "compliance.user.id"),
      displayName: stringField(user.displayName, "compliance.user.displayName"),
      username: nullableString(user.username, "compliance.user.username"),
    },
    providerStatus: stringField(value.providerStatus, "compliance.providerStatus"),
    identity:
      value.identity && typeof value.identity === "object"
        ? (() => {
            const identity = objectField(value.identity, "compliance.identity");
            return {
              state: stringField(identity.state, "compliance.identity.state"),
              provider: stringField(identity.provider, "compliance.identity.provider"),
              verifiedAt: nullableString(identity.verifiedAt, "compliance.identity.verifiedAt"),
              safeFailureCode: nullableString(
                identity.safeFailureCode,
                "compliance.identity.safeFailureCode",
              ),
            };
          })()
        : undefined,
    riskReview:
      value.riskReview && typeof value.riskReview === "object"
        ? (() => {
            const riskReview = objectField(value.riskReview, "compliance.riskReview");
            return {
              status: stringField(riskReview.status, "compliance.riskReview.status"),
              activeHoldCount: Number(riskReview.activeHoldCount ?? 0),
            };
          })()
        : undefined,
    connectPayoutReadiness: Array.isArray(value.connectPayoutReadiness)
      ? value.connectPayoutReadiness.map((rawAccount) => {
          const account = objectField(rawAccount, "compliance.connectPayoutReadiness");
          return {
            provider: stringField(account.provider, "connect.provider"),
            environment: stringField(account.environment, "connect.environment"),
            status: stringField(account.status, "connect.status"),
            requirementsSummary: account.requirementsSummary ?? null,
            detailsSubmitted: Boolean(account.detailsSubmitted),
            payoutsEnabled: Boolean(account.payoutsEnabled),
            transfersCapability: nullableString(
              account.transfersCapability,
              "connect.transfersCapability",
            ),
            lastSyncedAt: nullableString(account.lastSyncedAt, "connect.lastSyncedAt"),
          };
        })
      : [],
    decisions: Array.isArray(value.decisions)
      ? value.decisions.map((rawDecision) => {
          const item = objectField(rawDecision, "compliance decision");
          return {
            status: stringField(item.status, "decision.status"),
            reasonCode: stringField(item.reasonCode, "decision.reasonCode"),
            actorUserId: nullableString(item.actorUserId, "decision.actorUserId"),
            createdAt: stringField(item.createdAt, "decision.createdAt"),
          };
        })
      : [],
    restrictions: Array.isArray(value.restrictions)
      ? value.restrictions.map((rawRestriction) => {
          const item = objectField(rawRestriction, "compliance restriction");
          return {
            scope: stringField(item.scope, "restriction.scope"),
            reasonCode: stringField(item.reasonCode, "restriction.reasonCode"),
            source: stringField(item.source, "restriction.source"),
            status: stringField(item.status, "restriction.status"),
            createdAt: stringField(item.createdAt, "restriction.createdAt"),
            releasedAt: nullableString(item.releasedAt, "restriction.releasedAt"),
          };
        })
      : [],
    audit: Array.isArray(value.audit)
      ? value.audit.map((rawAudit) => {
          const item = objectField(rawAudit, "compliance audit");
          return {
            action: stringField(item.action, "compliance audit.action"),
            result: stringField(item.result, "compliance audit.result"),
            createdAt: stringField(item.createdAt, "compliance audit.createdAt"),
          };
        })
      : [],
  };
};

const adminRepository = (client: ApiClient): AdminRepository => {
  const idempotencyKey = () => crypto.randomUUID();
  return {
    async getOverview() {
      const value = objectField(await client.get<unknown>("/admin/overview"), "admin overview");
      const users = objectField(value.users, "admin overview.users");
      const reviews = objectField(value.reviews, "admin overview.reviews");
      const assets = objectField(value.assets, "admin overview.assets");
      return {
        users: { active: Number(users.active ?? 0) },
        reviews: {
          pending: Number(reviews.pending ?? 0),
          changesRequested: Number(reviews.changesRequested ?? 0),
        },
        assets: {
          valuationPending: Number(assets.valuationPending ?? 0),
          custodyActions: Number(assets.custodyActions ?? 0),
          vaultReady: Number(assets.vaultReady ?? 0),
        },
        complianceCases: Number(value.complianceCases ?? 0),
        paymentExceptions: Number(value.paymentExceptions ?? 0),
        providerAlerts: Number(value.providerAlerts ?? 0),
        generatedAt: stringField(value.generatedAt, "admin overview.generatedAt"),
      } satisfies AdminOverview;
    },
    async getRiskOperations() {
      return mapAdminRiskOperations(await client.get<unknown>("/admin/risk-operations"));
    },
    async getPlatformDashboard() {
      return mapAdminPlatformDashboard(await client.get<unknown>("/admin/platform/dashboard"));
    },
    async listPlatformRecords(input) {
      return mapAdminPlatformRecords(await client.get<unknown>("/admin/platform/records", input));
    },
    async listCatalogueAssets(input) {
      const value = objectField(
        await client.get<unknown>("/admin/collectibles", input),
        "admin collectibles catalogue",
      );
      const pagination = objectField(value.pagination, "admin collectibles pagination");
      return {
        items: Array.isArray(value.items)
          ? value.items.map((raw) => {
              const item = objectField(raw, "admin catalogue item");
              const identity = objectField(item.identity, "admin catalogue identity");
              const ownership = objectField(item.ownership, "admin catalogue ownership");
              const provenance =
                item.provenance === null
                  ? null
                  : objectField(item.provenance, "admin catalogue provenance");
              const grading =
                identity.grading === null
                  ? null
                  : objectField(identity.grading, "admin catalogue grading");
              return {
                id: stringField(item.id, "admin catalogue.id"),
                publicId: stringField(item.publicId, "admin catalogue.publicId"),
                slug: stringField(item.slug, "admin catalogue.slug"),
                title: stringField(item.title, "admin catalogue.title"),
                status: stringField(item.status, "admin catalogue.status"),
                testFixture: Boolean(item.testFixture),
                workType: ["PRODUCTION", "OWNER_DEMO", "CONTROLLED_QA", "AUTOMATED_TEST"].includes(
                  String(item.workType),
                )
                  ? (String(item.workType) as AdminCatalogueResponse["items"][number]["workType"])
                  : "PRODUCTION",
                thumbnailUrl: nullableString(item.thumbnailUrl, "admin catalogue.thumbnailUrl"),
                identity: {
                  category: stringField(identity.category, "admin catalogue.identity.category"),
                  year: identity.year == null ? null : Number(identity.year),
                  manufacturer: nullableString(
                    identity.manufacturer,
                    "admin catalogue.identity.manufacturer",
                  ),
                  set: nullableString(identity.set, "admin catalogue.identity.set"),
                  cardNumber: nullableString(
                    identity.cardNumber,
                    "admin catalogue.identity.cardNumber",
                  ),
                  edition: nullableString(identity.edition, "admin catalogue.identity.edition"),
                  grading: grading
                    ? {
                        company: stringField(grading.company, "admin catalogue.grading.company"),
                        code: stringField(grading.code, "admin catalogue.grading.code"),
                        grade: stringField(grading.grade, "admin catalogue.grading.grade"),
                        label: stringField(grading.label, "admin catalogue.grading.label"),
                        certStatus: stringField(
                          grading.certStatus,
                          "admin catalogue.grading.certStatus",
                        ),
                      }
                    : null,
                },
                provenance: provenance
                  ? {
                      submissionId: stringField(
                        provenance.submissionId,
                        "admin catalogue.provenance.submissionId",
                      ),
                      submissionStatus: stringField(
                        provenance.submissionStatus,
                        "admin catalogue.provenance.submissionStatus",
                      ),
                      submittedAt: nullableString(
                        provenance.submittedAt,
                        "admin catalogue.provenance.submittedAt",
                      ),
                      collector: stringField(
                        provenance.collector,
                        "admin catalogue.provenance.collector",
                      ),
                      username: nullableString(
                        provenance.username,
                        "admin catalogue.provenance.username",
                      ),
                      collectorId: stringField(
                        provenance.collectorId,
                        "admin catalogue.provenance.collectorId",
                      ),
                    }
                  : null,
                lineage: item.lineage
                  ? {
                      submissionId: nullableString(
                        objectField(item.lineage, "admin catalogue.lineage").submissionId,
                        "admin catalogue.lineage.submissionId",
                      ),
                      intakeId: nullableString(
                        objectField(item.lineage, "admin catalogue.lineage").intakeId,
                        "admin catalogue.lineage.intakeId",
                      ),
                      reviewState: nullableString(
                        objectField(item.lineage, "admin catalogue.lineage").reviewState,
                        "admin catalogue.lineage.reviewState",
                      ),
                    }
                  : { submissionId: null, intakeId: null, reviewState: null },
                mediaState: stringField(item.mediaState, "admin catalogue.mediaState"),
                physicalState: stringField(item.physicalState, "admin catalogue.physicalState"),
                verificationState: stringField(
                  item.verificationState,
                  "admin catalogue.verificationState",
                ),
                valuationState: stringField(item.valuationState, "admin catalogue.valuationState"),
                custodyState: stringField(item.custodyState, "admin catalogue.custodyState"),
                ownershipState: stringField(item.ownershipState, "admin catalogue.ownershipState"),
                valuation: item.valuation
                  ? {
                      minor: stringField(
                        objectField(item.valuation, "admin catalogue.valuation").minor,
                        "admin catalogue.valuation.minor",
                      ),
                      currency: stringField(
                        objectField(item.valuation, "admin catalogue.valuation").currency,
                        "admin catalogue.valuation.currency",
                      ),
                      decidedAt: stringField(
                        objectField(item.valuation, "admin catalogue.valuation").decidedAt,
                        "admin catalogue.valuation.decidedAt",
                      ),
                    }
                  : null,
                attention: (() => {
                  const attention = objectField(item.attention ?? {}, "admin catalogue.attention");
                  return {
                    required: Boolean(attention.required),
                    reasons: Array.isArray(attention.reasons)
                      ? attention.reasons.map((reason) => String(reason))
                      : [],
                  };
                })(),
                nextAction: (() => {
                  const nextAction = objectField(item.nextAction, "admin catalogue.nextAction");
                  const actor = String(nextAction.actor);
                  const target = String(nextAction.target);
                  return {
                    label: stringField(nextAction.label, "admin catalogue.nextAction.label"),
                    actor: ["COLLECTOR", "STAFF", "SYSTEM", "NONE"].includes(actor)
                      ? (actor as AdminCatalogueResponse["items"][number]["nextAction"]["actor"])
                      : "STAFF",
                    target: ["COLLECTIBLE", "INTAKE", "VALUATION", "OWNERSHIP", "MARKET"].includes(
                      target,
                    )
                      ? (target as AdminCatalogueResponse["items"][number]["nextAction"]["target"])
                      : "COLLECTIBLE",
                  };
                })(),
                blockers: Array.isArray(item.blockers)
                  ? item.blockers.map((value) => String(value))
                  : [],
                marketReadiness: stringField(
                  item.marketReadiness,
                  "admin catalogue.marketReadiness",
                ),
                publicationState: stringField(
                  item.publicationState,
                  "admin catalogue.publicationState",
                ),
                ownership: {
                  ownerCount: Number(ownership.ownerCount ?? 0),
                  totalUnits: nullableString(
                    ownership.totalUnits,
                    "admin catalogue.ownership.totalUnits",
                  ),
                  issuedUnits: nullableString(
                    ownership.issuedUnits,
                    "admin catalogue.ownership.issuedUnits",
                  ),
                },
                updatedAt: stringField(item.updatedAt, "admin catalogue.updatedAt"),
              } satisfies AdminCatalogueResponse["items"][number];
            })
          : [],
        pagination: {
          page: Number(pagination.page ?? 1),
          pageSize: Number(pagination.pageSize ?? 25),
          total: Number(pagination.total ?? 0),
          totalPages: Number(pagination.totalPages ?? 1),
        },
        summary: (() => {
          const summary = objectField(value.summary ?? {}, "admin collectibles summary");
          return {
            total: Number(summary.total ?? 0),
            needsAttention: Number(summary.needsAttention ?? 0),
            inPhysicalIntake: Number(summary.inPhysicalIntake ?? 0),
            verified: Number(summary.verified ?? 0),
            inCustody: Number(summary.inCustody ?? 0),
            verificationPending: Number(summary.verificationPending ?? 0),
            valuationPending: Number(summary.valuationPending ?? 0),
            marketLive: Number(summary.marketLive ?? 0),
            exceptions: Number(summary.exceptions ?? 0),
            ownerPositions: Number(summary.ownerPositions ?? 0),
          };
        })(),
      };
    },
    async getComplianceCase(id) {
      return mapAdminComplianceDetail(await client.get<unknown>(`/admin/compliance/cases/${id}`));
    },
    async getOperationsOverview() {
      const value = objectField(
        await client.get<unknown>("/admin/operations/overview"),
        "admin operations overview",
      );
      const counts = objectField(value.counts, "admin operations counts");
      const kpis = objectField(value.kpis, "admin operations kpis");
      const accountMix = objectField(value.accountMix, "admin operations account mix");
      const memberships = objectField(value.memberships, "admin operations memberships");
      const support = objectField(value.support, "admin operations support");
      const rawControlCenter =
        value.controlCenter && typeof value.controlCenter === "object"
          ? objectField(value.controlCenter, "admin control center")
          : null;
      const controlCenter = rawControlCenter
        ? (() => {
            const summary = objectField(rawControlCenter.summary, "admin control center summary");
            const mapSummary = (key: string) => {
              const item = objectField(summary[key], `admin control center summary.${key}`);
              return {
                count: typeof item.count === "number" ? item.count : null,
                subtitle: stringField(
                  item.subtitle,
                  `admin control center summary.${key}.subtitle`,
                ),
                severity: stringField(
                  item.severity,
                  `admin control center summary.${key}.severity`,
                ),
                target: stringField(item.target, `admin control center summary.${key}.target`),
                ...(key === "financialRisk"
                  ? {
                      access: stringField(
                        item.access,
                        "admin control center summary.financialRisk.access",
                      ) as "FULL" | "LIMITED",
                    }
                  : {}),
              };
            };
            const financial = objectField(
              rawControlCenter.financialOperations,
              "admin control center financial operations",
            );
            const nullableMinor = (value: unknown, field: string) => nullableString(value, field);
            return {
              summary: {
                needsAction: mapSummary(
                  "needsAction",
                ) as AdminControlCenter["summary"]["needsAction"],
                financialRisk: mapSummary(
                  "financialRisk",
                ) as AdminControlCenter["summary"]["financialRisk"],
                staffDecisions: mapSummary(
                  "staffDecisions",
                ) as AdminControlCenter["summary"]["staffDecisions"],
                platformIncidents: mapSummary(
                  "platformIncidents",
                ) as AdminControlCenter["summary"]["platformIncidents"],
              },
              priorityWork: Array.isArray(rawControlCenter.priorityWork)
                ? rawControlCenter.priorityWork.map((raw) => {
                    const item = objectField(raw, "admin control center priority work");
                    return {
                      id: stringField(item.id, "admin control center priority work.id"),
                      severity: stringField(
                        item.severity,
                        "admin control center priority work.severity",
                      ),
                      type: stringField(item.type, "admin control center priority work.type"),
                      title: stringField(item.title, "admin control center priority work.title"),
                      context: stringField(
                        item.context,
                        "admin control center priority work.context",
                      ),
                      age: stringField(item.age, "admin control center priority work.age"),
                      owner: nullableString(item.owner, "admin control center priority work.owner"),
                      actionLabel: stringField(
                        item.actionLabel,
                        "admin control center priority work.actionLabel",
                      ),
                      target: stringField(item.target, "admin control center priority work.target"),
                      reference: nullableString(
                        item.reference,
                        "admin control center priority work.reference",
                      ),
                    };
                  })
                : [],
              platformHealth: Array.isArray(rawControlCenter.platformHealth)
                ? rawControlCenter.platformHealth.map((raw) => {
                    const item = objectField(raw, "admin control center platform health");
                    return {
                      name: stringField(item.name, "admin control center platform health.name"),
                      status: stringField(
                        item.status,
                        "admin control center platform health.status",
                      ),
                      summary: stringField(
                        item.summary,
                        "admin control center platform health.summary",
                      ),
                      lastCheckedAt: nullableString(
                        item.lastCheckedAt,
                        "admin control center platform health.lastCheckedAt",
                      ),
                    };
                  })
                : [],
              financialOperations: {
                available: booleanField(
                  financial.available,
                  "admin control center financial operations.available",
                ),
                access: stringField(
                  financial.access,
                  "admin control center financial operations.access",
                ) as "FULL" | "LIMITED",
                message: nullableString(
                  financial.message,
                  "admin control center financial operations.message",
                ),
                currency: "GBP",
                customerCashLiabilityMinor: nullableMinor(
                  financial.customerCashLiabilityMinor,
                  "admin control center financial operations.customerCashLiabilityMinor",
                ),
                bacsRiskHeldMinor: nullableMinor(
                  financial.bacsRiskHeldMinor,
                  "admin control center financial operations.bacsRiskHeldMinor",
                ),
                withdrawalEligibleMinor: nullableMinor(
                  financial.withdrawalEligibleMinor,
                  "admin control center financial operations.withdrawalEligibleMinor",
                ),
                providerAvailableMinor: nullableMinor(
                  financial.providerAvailableMinor,
                  "admin control center financial operations.providerAvailableMinor",
                ),
                providerPendingMinor: nullableMinor(
                  financial.providerPendingMinor,
                  "admin control center financial operations.providerPendingMinor",
                ),
                payoutLiquidityCoverageBps:
                  typeof financial.payoutLiquidityCoverageBps === "number"
                    ? financial.payoutLiquidityCoverageBps
                    : null,
                openDeficitsCount:
                  typeof financial.openDeficitsCount === "number"
                    ? financial.openDeficitsCount
                    : null,
                openDeficitsMinor: nullableMinor(
                  financial.openDeficitsMinor,
                  "admin control center financial operations.openDeficitsMinor",
                ),
                returnsManualReviewCount:
                  typeof financial.returnsManualReviewCount === "number"
                    ? financial.returnsManualReviewCount
                    : null,
                dualControlApprovals:
                  typeof financial.dualControlApprovals === "number"
                    ? financial.dualControlApprovals
                    : null,
                providerLiquidityStatus: nullableString(
                  financial.providerLiquidityStatus,
                  "admin control center financial operations.providerLiquidityStatus",
                ),
                warning: typeof financial.warning === "boolean" ? financial.warning : null,
              },
              pipeline: Array.isArray(rawControlCenter.pipeline)
                ? rawControlCenter.pipeline.map((raw) => {
                    const item = objectField(raw, "admin control center pipeline");
                    return {
                      id: stringField(item.id, "admin control center pipeline.id"),
                      label: stringField(item.label, "admin control center pipeline.label"),
                      count: Number(item.count ?? 0),
                      oldestAt: nullableString(
                        item.oldestAt,
                        "admin control center pipeline.oldestAt",
                      ),
                      oldestAge: nullableString(
                        item.oldestAge,
                        "admin control center pipeline.oldestAge",
                      ),
                      overdueCount:
                        typeof item.overdueCount === "number" ? item.overdueCount : null,
                      target: stringField(item.target, "admin control center pipeline.target"),
                    };
                  })
                : [],
              importantActivity: Array.isArray(rawControlCenter.importantActivity)
                ? rawControlCenter.importantActivity.map((raw) => {
                    const item = objectField(raw, "admin control center activity");
                    return {
                      id: stringField(item.id, "admin control center activity.id"),
                      title: stringField(item.title, "admin control center activity.title"),
                      summary: stringField(item.summary, "admin control center activity.summary"),
                      actor: nullableString(item.actor, "admin control center activity.actor"),
                      occurredAt: stringField(
                        item.occurredAt,
                        "admin control center activity.occurredAt",
                      ),
                      target: stringField(item.target, "admin control center activity.target"),
                    };
                  })
                : [],
              openCases: Array.isArray(rawControlCenter.openCases)
                ? rawControlCenter.openCases.map((raw) => {
                    const item = objectField(raw, "admin control center case");
                    return {
                      id: stringField(item.id, "admin control center case.id"),
                      type: stringField(item.type, "admin control center case.type"),
                      severity: stringField(item.severity, "admin control center case.severity"),
                      subject: stringField(item.subject, "admin control center case.subject"),
                      age: stringField(item.age, "admin control center case.age"),
                      owner: nullableString(item.owner, "admin control center case.owner"),
                      nextAction: stringField(
                        item.nextAction,
                        "admin control center case.nextAction",
                      ),
                    };
                  })
                : [],
              lastRefreshedAt: stringField(
                rawControlCenter.lastRefreshedAt,
                "admin control center.lastRefreshedAt",
              ),
            } satisfies AdminControlCenter;
          })()
        : undefined;
      return {
        kpis: {
          totalUsers: Number(kpis.totalUsers ?? 0),
          collectors: Number(kpis.collectors ?? 0),
          investors: Number(kpis.investors ?? 0),
          activeListings: Number(kpis.activeListings ?? 0),
          openOrders: Number(kpis.openOrders ?? 0),
          needsAttention: Number(kpis.needsAttention ?? 0),
        },
        pipeline: Array.isArray(value.pipeline)
          ? value.pipeline.map((raw) => {
              const item = objectField(raw, "admin pipeline");
              return {
                id: stringField(item.id, "admin pipeline.id"),
                label: stringField(item.label, "admin pipeline.label"),
                count: Number(item.count ?? 0),
              };
            })
          : [],
        attentionGroups: Array.isArray(value.attentionGroups)
          ? value.attentionGroups.map((raw) => {
              const item = objectField(raw, "admin attention group");
              return {
                id: stringField(item.id, "admin attention group.id"),
                label: stringField(item.label, "admin attention group.label"),
                count: Number(item.count ?? 0),
                description: stringField(item.description, "admin attention group.description"),
                severity: stringField(item.severity, "admin attention group.severity"),
                section: stringField(item.section, "admin attention group.section"),
              };
            })
          : [],
        recentActivity: Array.isArray(value.recentActivity)
          ? value.recentActivity.map((raw) => {
              const item = objectField(raw, "admin recent activity");
              return {
                id: stringField(item.id, "admin recent activity.id"),
                title: stringField(item.title, "admin recent activity.title"),
                context: stringField(item.context, "admin recent activity.context"),
                occurredAt: stringField(item.occurredAt, "admin recent activity.occurredAt"),
              };
            })
          : [],
        systemHealth: Array.isArray(value.systemHealth)
          ? value.systemHealth.map((raw) => {
              const item = objectField(raw, "admin system health");
              return {
                name: stringField(item.name, "admin system health.name"),
                status: stringField(item.status, "admin system health.status"),
                summary: stringField(item.summary, "admin system health.summary"),
              };
            })
          : [],
        accountMix: {
          collectors: Number(accountMix.collectors ?? 0),
          investors: Number(accountMix.investors ?? 0),
          staff: Number(accountMix.staff ?? 0),
          admins: Number(accountMix.admins ?? 0),
          overlapping: Boolean(accountMix.overlapping),
        },
        memberships: {
          starter: Number(memberships.starter ?? 0),
          pro: Number(memberships.pro ?? 0),
          elite: Number(memberships.elite ?? 0),
          trialing: Number(memberships.trialing ?? 0),
          pastDue: Number(memberships.pastDue ?? 0),
          mrrMinor: stringField(memberships.mrrMinor, "admin operations memberships.mrrMinor"),
        },
        support: {
          available: Boolean(support.available),
          message: stringField(support.message, "admin operations support.message"),
          ...(typeof support.open === "number" ? { open: support.open } : {}),
        },
        counts: {
          pendingReviews: Number(counts.pendingReviews ?? 0),
          collectorActionsWaiting: Number(counts.collectorActionsWaiting ?? 0),
          acceptedAwaitingVault: Number(counts.acceptedAwaitingVault ?? 0),
          shipmentsInTransit: Number(counts.shipmentsInTransit ?? 0),
          deliveredAwaitingReceipt: Number(counts.deliveredAwaitingReceipt ?? 0),
          verificationQueue: Number(counts.verificationQueue ?? 0),
          valuationQueue: Number(counts.valuationQueue ?? 0),
          vaultReady: Number(counts.vaultReady ?? 0),
          marketplaceReady: Number(counts.marketplaceReady ?? 0),
          compliance: Number(counts.compliance ?? 0),
          payments: Number(counts.payments ?? 0),
          alerts: Number(counts.alerts ?? 0),
        },
        needsAttention: Array.isArray(value.needsAttention)
          ? value.needsAttention.map((raw) => {
              const item = objectField(raw, "admin attention");
              return {
                id: stringField(item.id, "admin attention.id"),
                type: stringField(item.type, "admin attention.type"),
                subject: stringField(item.subject, "admin attention.subject"),
                collector: stringField(item.collector, "admin attention.collector"),
                stage: stringField(item.stage, "admin attention.stage"),
                reason: stringField(item.reason, "admin attention.reason"),
                age: stringField(item.age, "admin attention.age"),
                severity: stringField(
                  item.severity,
                  "admin attention.severity",
                ) as AdminOperationsOverview["needsAttention"][number]["severity"],
                waitingOn: stringField(
                  item.waitingOn,
                  "admin attention.waitingOn",
                ) as AdminOperationsOverview["needsAttention"][number]["waitingOn"],
                target: stringField(
                  item.target,
                  "admin attention.target",
                ) as AdminOperationsOverview["needsAttention"][number]["target"],
              };
            })
          : [],
        ...(controlCenter ? { controlCenter } : {}),
        generatedAt: stringField(value.generatedAt, "admin operations generatedAt"),
      } satisfies AdminOperationsOverview;
    },
    async listIntake(input) {
      const value = objectField(await client.get<unknown>("/admin/intake", input), "admin intake");
      const pagination = objectField(value.pagination, "admin intake.pagination");
      const mapInt = (key: string) =>
        Number(objectField(value.counts, "admin intake.counts")[key] ?? 0);
      const filters = objectField(value.filters, "admin intake.filters");
      return {
        items: Array.isArray(value.items) ? value.items.map(mapAdminIntake) : [],
        pagination: {
          page: Number(pagination.page),
          pageSize: Number(pagination.pageSize),
          total: Number(pagination.total),
          totalPages: Number(pagination.totalPages),
        },
        counts: {
          all: mapInt("all"),
          awaitingDestination: mapInt("awaitingDestination"),
          accepted: mapInt("accepted"),
          shipped: mapInt("shipped"),
          delivered: mapInt("delivered"),
          received: mapInt("received"),
          verification: mapInt("verification"),
          verified: mapInt("verified"),
          readyForVault: mapInt("readyForVault"),
          exceptions: mapInt("exceptions"),
          needsAction: mapInt("needsAction"),
          oldestAt:
            objectField(value.counts, "admin intake.counts").oldestAt === null
              ? null
              : nullableString(
                  objectField(value.counts, "admin intake.counts").oldestAt,
                  "admin intake.counts.oldestAt",
                ),
          oldestAtByStage:
            objectField(value.counts, "admin intake.counts").oldestAtByStage &&
            typeof objectField(value.counts, "admin intake.counts").oldestAtByStage === "object"
              ? Object.fromEntries(
                  Object.entries(
                    objectField(value.counts, "admin intake.counts").oldestAtByStage as Record<
                      string,
                      unknown
                    >,
                  ).map(([key, item]) => [
                    key,
                    item === null
                      ? null
                      : nullableString(item, `admin intake.counts.oldestAtByStage.${key}`),
                  ]),
                )
              : {},
        },
        overview: {
          all: mapInt("all"),
          awaitingDestination: mapInt("awaitingDestination"),
          accepted: mapInt("accepted"),
          shipped: mapInt("shipped"),
          delivered: mapInt("delivered"),
          received: mapInt("received"),
          verification: mapInt("verification"),
          verified: mapInt("verified"),
          readyForVault: mapInt("readyForVault"),
          exceptions: mapInt("exceptions"),
          needsAction: mapInt("needsAction"),
          oldestAt:
            objectField(value.overview ?? value.counts, "admin intake.overview").oldestAt === null
              ? null
              : nullableString(
                  objectField(value.overview ?? value.counts, "admin intake.overview").oldestAt,
                  "admin intake.overview.oldestAt",
                ),
          oldestAtByStage:
            objectField(value.overview ?? value.counts, "admin intake.overview").oldestAtByStage &&
            typeof objectField(value.overview ?? value.counts, "admin intake.overview")
              .oldestAtByStage === "object"
              ? Object.fromEntries(
                  Object.entries(
                    objectField(value.overview ?? value.counts, "admin intake.overview")
                      .oldestAtByStage as Record<string, unknown>,
                  ).map(([key, item]) => [
                    key,
                    item === null
                      ? null
                      : nullableString(item, `admin intake.overview.oldestAtByStage.${key}`),
                  ]),
                )
              : {},
        },
        recentActivity: Array.isArray(value.recentActivity)
          ? (value.recentActivity as Array<{
              id: string;
              type: string;
              title: string;
              reference: string;
              occurredAt: string;
            }>)
          : [],
        filters: {
          vaults: Array.isArray(filters.vaults)
            ? (filters.vaults as Array<{
                id: string;
                displayName: string;
                code: string | null;
                operationallyApproved?: boolean;
                acceptingShipments?: boolean;
                acceptingInPerson?: boolean;
                locationType?: string;
                environment?: string;
                region?: string;
                countryCode?: string;
              }>)
            : [],
          carriers: Array.isArray(filters.carriers) ? (filters.carriers as string[]) : [],
          fixtureModes: ["NORMAL", "TEST", "ALL"],
        },
      };
    },
    async getIntakeDetail(submissionId) {
      return mapAdminIntakeDetail(
        await client.get<unknown>(`/admin/intake/submissions/${encodeURIComponent(submissionId)}`),
      );
    },
    async listIntakeLocations(input) {
      const value = objectField(
        await client.get<unknown>("/admin/intake/locations", input),
        "admin intake locations",
      );
      const summary = objectField(value.summary, "admin intake locations.summary");
      const pagination = objectField(value.pagination, "admin intake locations.pagination");
      return {
        summary: {
          activeLocations: Number(summary.activeLocations ?? 0),
          shippingEnabled: Number(summary.shippingEnabled ?? 0),
          inPersonEnabled: Number(summary.inPersonEnabled ?? 0),
          partnerLocations: Number(summary.partnerLocations ?? 0),
          unavailable: Number(summary.unavailable ?? 0),
        },
        items: Array.isArray(value.items) ? value.items.map(mapAdminIntakeLocation) : [],
        pagination: {
          page: Number(pagination.page ?? 1),
          pageSize: Number(pagination.pageSize ?? 20),
          total: Number(pagination.total ?? 0),
          totalPages: Number(pagination.totalPages ?? 1),
        },
      } satisfies AdminIntakeLocationsResponse;
    },
    async getIntakeLocation(id) {
      return mapAdminIntakeLocationDetail(
        await client.get<unknown>(`/admin/intake/locations/${encodeURIComponent(id)}`),
      );
    },
    async createIntakeLocation(input) {
      const value = objectField(
        await client.request<unknown>("/admin/intake/locations", {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey() },
          body: JSON.stringify(input),
        }),
        "intake location create",
      );
      return mapIntakeLocationMutation(value);
    },
    async updateIntakeLocation(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/intake/locations/${encodeURIComponent(id)}`, {
          method: "PATCH",
          headers: { "content-type": "application/json", "Idempotency-Key": idempotencyKey() },
          body: JSON.stringify(input),
        }),
        "intake location update",
      );
      return mapIntakeLocationMutation(value);
    },
    async confirmIntakeReceipt(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/intake/${id}/receipt`, {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(input ?? {}),
        }),
        "intake receipt",
      );
      return {
        intakeId: stringField(value.intakeId, "intake receipt.intakeId"),
        status: stringField(value.status, "intake receipt.status"),
        confirmedAt: stringField(value.confirmedAt, "intake receipt.confirmedAt"),
      };
    },
    async completeStagingDemoPhysicalIntake(submissionId, input) {
      const value = objectField(
        await client.request<unknown>(
          `/admin/submissions/${encodeURIComponent(submissionId)}/staging-demo/physical-intake`,
          {
            method: "POST",
            headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
            body: JSON.stringify({
              assetId: input.assetId,
              fixtureKey: "PIKACHU_OWNER_DEMO_2026",
              confirmation: "COMPLETE_STAGING_DEMO_INTAKE",
              reason: input.reason,
            }),
          },
        ),
        "staging demo physical intake",
      );
      return {
        demoIntakeId: stringField(value.demoIntakeId, "staging demo intake.id"),
        status: stringField(value.status, "staging demo intake.status"),
        replayed: Boolean(value.replayed),
      };
    },
    async startIntakeVerification(id) {
      const value = objectField(
        await client.request<unknown>(`/admin/intake/${id}/verification/start`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        }),
        "intake verification start",
      );
      return {
        intakeId: stringField(value.intakeId, "intake verification.intakeId"),
        status: stringField(value.status, "intake verification.status"),
        startedAt: stringField(value.startedAt, "intake verification.startedAt"),
      };
    },
    async completeIntakeVerification(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/intake/${id}/verification/complete`, {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(input),
        }),
        "intake verification complete",
      );
      return {
        intakeId: stringField(value.intakeId, "intake verification.intakeId"),
        status: stringField(value.status, "intake verification.status"),
        completedAt: stringField(value.completedAt, "intake verification.completedAt"),
      };
    },
    async createIntakeException(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/intake/${id}/exceptions`, {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(input),
        }),
        "intake exception",
      );
      return {
        id: stringField(value.id, "intake exception.id"),
        code: stringField(value.code, "intake exception.code"),
        severity: stringField(value.severity, "intake exception.severity"),
      };
    },
    async resolveIntakeException(id, exceptionId, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/intake/${id}/exceptions/${exceptionId}/resolve`, {
          method: "POST",
          headers: { "content-type": "application/json", "Idempotency-Key": crypto.randomUUID() },
          body: JSON.stringify(input),
        }),
        "intake exception resolution",
      );
      return {
        id: stringField(value.id, "intake exception.id"),
        resolvedAt: stringField(value.resolvedAt, "intake exception.resolvedAt"),
      };
    },
    async listMemberships(input) {
      const value = objectField(
        await client.get<unknown>("/admin/memberships", input),
        "admin memberships",
      );
      return mapAdminMembershipDirectory(value);
    },
    async getMembershipDetail(id) {
      return mapAdminMembershipDetail(
        await client.get<unknown>(`/admin/memberships/${encodeURIComponent(id)}`),
      );
    },
    async listUsers(input) {
      const value = objectField(await client.get<unknown>("/admin/users", input), "admin users");
      const summary =
        value.summary && typeof value.summary === "object" && !Array.isArray(value.summary)
          ? objectField(value.summary, "admin users summary")
          : {};
      return {
        items: Array.isArray(value.items) ? value.items.map(mapAdminUser) : [],
        nextCursor: nullableString(value.nextCursor, "admin users.nextCursor"),
        total: Number(value.total ?? 0),
        summary: {
          totalUsers: Number(summary.totalUsers ?? 0),
          collectors: Number(summary.collectors ?? 0),
          investors: Number(summary.investors ?? 0),
          staff: Number(summary.staff ?? 0),
          admins: Number(summary.admins ?? 0),
          suspended: Number(summary.suspended ?? 0),
          needsReview: Number(summary.needsReview ?? 0),
          activeUsers: Number(summary.activeUsers ?? 0),
          restricted: Number(summary.restricted ?? 0),
          financialExceptions:
            summary.financialExceptions === null || summary.financialExceptions === undefined
              ? null
              : Number(summary.financialExceptions),
          pastDueMemberships: Number(summary.pastDueMemberships ?? 0),
          trialingMemberships: Number(summary.trialingMemberships ?? 0),
        },
      };
    },
    async getUser(id) {
      return mapAdminUserDetail(await client.get<unknown>(`/admin/users/${id}`));
    },
    async getUserHistory(input): Promise<AdminAccountHistoryResponse> {
      const { id, ...query } = input;
      const value = objectField(
        await client.get<unknown>(`/admin/users/${encodeURIComponent(id)}/history`, query),
        "admin user history",
      );
      return {
        items: Array.isArray(value.items)
          ? value.items.map((rawActivity) => {
              const activity = objectField(rawActivity, "admin user history item");
              return {
                id: stringField(activity.id, "admin user history.id"),
                action: stringField(activity.action, "admin user history.action"),
                resourceType: stringField(activity.resourceType, "admin user history.resourceType"),
                resourceId: nullableString(activity.resourceId, "admin user history.resourceId"),
                actor: nullableString(activity.actor, "admin user history.actor"),
                actorType: stringField(
                  activity.actorType ?? "USER",
                  "admin user history.actorType",
                ),
                result: stringField(activity.result ?? "SUCCESS", "admin user history.result"),
                occurredAt: stringField(activity.occurredAt, "admin user history.occurredAt"),
              };
            })
          : [],
        page: Number(value.page ?? 1),
        pageSize: Number(value.pageSize ?? 20),
        total: Number(value.total ?? 0),
        totalPages: Number(value.totalPages ?? 1),
      };
    },
    async transitionUserStatus(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/users/${id}/status`, {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        }),
        "account status transition",
      );
      return {
        userId: stringField(value.userId, "account status.userId"),
        accountStatus: stringField(value.accountStatus, "account status.accountStatus"),
      };
    },
    async grantUserRole(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/users/${id}/roles`, {
          method: "POST",
          body: { scopeType: "GLOBAL", scopeId: "*", ...input },
          headers: { "Idempotency-Key": idempotencyKey() },
        }),
        "role grant",
      );
      return {
        assignmentId: stringField(value.assignmentId, "role grant.assignmentId"),
        userId: stringField(value.userId, "role grant.userId"),
        role: stringField(value.role, "role grant.role"),
      };
    },
    async revokeUserRole(id, assignmentId) {
      await client.request<unknown>(`/admin/users/${id}/roles/${assignmentId}`, {
        method: "DELETE",
        headers: { "Idempotency-Key": idempotencyKey() },
      });
      return {
        assignmentId,
        userId: id,
        revoked: true,
      };
    },
    async updateUserProfile(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/users/${encodeURIComponent(id)}/profile`, {
          method: "PATCH",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        }),
        "account profile update",
      );
      return {
        userId: stringField(value.userId, "account profile.userId"),
        revision: stringField(value.revision, "account profile.revision"),
        changedFields: Array.isArray(value.changedFields)
          ? value.changedFields.filter((field): field is string => typeof field === "string")
          : [],
      };
    },
    async revokeUserSessions(id, input) {
      const value = objectField(
        await client.request<unknown>(
          `/admin/users/${encodeURIComponent(id)}/security/revoke-sessions`,
          {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          },
        ),
        "account session revocation",
      );
      return {
        userId: stringField(value.userId, "account sessions.userId"),
        revision: stringField(value.revision, "account sessions.revision"),
        revokedSessionCount: Number(value.revokedSessionCount ?? 0),
      };
    },
    async resetUserTwoFactor(id, input) {
      const value = objectField(
        await client.request<unknown>(
          `/admin/users/${encodeURIComponent(id)}/security/reset-two-factor`,
          {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          },
        ),
        "account two-factor reset",
      );
      return {
        userId: stringField(value.userId, "account twoFactor.userId"),
        revision: stringField(value.revision, "account twoFactor.revision"),
        removedMethods: Number(value.removedMethods ?? 0),
        revokedSessionCount: Number(value.revokedSessionCount ?? 0),
      };
    },
    async createUserRestriction(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/users/${encodeURIComponent(id)}/restrictions`, {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        }),
        "account restriction",
      );
      const hold = objectField(value.hold, "account restriction.hold");
      return {
        userId: stringField(value.userId, "account restriction.userId"),
        revision: stringField(value.revision, "account restriction.revision"),
        hold: {
          id: stringField(hold.id, "account restriction.hold.id"),
          scope: stringField(hold.scope, "account restriction.hold.scope"),
          status: stringField(hold.status, "account restriction.hold.status"),
        },
      };
    },
    async releaseUserRestriction(id, holdId, input) {
      const value = objectField(
        await client.request<unknown>(
          `/admin/users/${encodeURIComponent(id)}/restrictions/${encodeURIComponent(holdId)}/release`,
          { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey() } },
        ),
        "account restriction release",
      );
      const hold = objectField(value.hold, "account restriction release.hold");
      return {
        userId: stringField(value.userId, "account restriction release.userId"),
        revision: stringField(value.revision, "account restriction release.revision"),
        hold: {
          id: stringField(hold.id, "account restriction release.hold.id"),
          status: stringField(hold.status, "account restriction release.hold.status"),
        },
      };
    },
    async addUserNote(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/users/${encodeURIComponent(id)}/notes`, {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        }),
        "account note",
      );
      return {
        userId: stringField(value.userId, "account note.userId"),
        revision: stringField(value.revision, "account note.revision"),
        recorded: Boolean(value.recorded),
      };
    },
    async runUserRecoveryCommand(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/users/${encodeURIComponent(id)}/recovery/commands`, {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        }),
        "account recovery command",
      );
      return {
        userId: stringField(value.userId, "account recovery.userId"),
        revision: stringField(value.revision, "account recovery.revision"),
        command: stringField(value.command, "account recovery.command"),
        affected: Array.isArray(value.affected)
          ? value.affected.filter((item): item is string => typeof item === "string")
          : [],
      };
    },
    async forceSetUserState(id, input) {
      const value = objectField(
        await client.request<unknown>(
          `/admin/users/${encodeURIComponent(id)}/recovery/force-state`,
          {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          },
        ),
        "forced account state",
      );
      return {
        userId: stringField(value.userId, "forced account state.userId"),
        revision: stringField(value.revision, "forced account state.revision"),
        accountStatus: stringField(value.accountStatus, "forced account state.accountStatus"),
      };
    },
    async forceClearUserRestriction(id, holdId, input) {
      const value = objectField(
        await client.request<unknown>(
          `/admin/users/${encodeURIComponent(id)}/restrictions/${encodeURIComponent(holdId)}/force-clear`,
          { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey() } },
        ),
        "forced restriction clear",
      );
      const hold = objectField(value.hold, "forced restriction clear.hold");
      return {
        userId: stringField(value.userId, "forced restriction clear.userId"),
        revision: stringField(value.revision, "forced restriction clear.revision"),
        hold: {
          id: stringField(hold.id, "forced restriction clear.hold.id"),
          status: stringField(hold.status, "forced restriction clear.hold.status"),
        },
      };
    },
    async overrideUserCapability(id, input) {
      const value = objectField(
        await client.request<unknown>(
          `/admin/users/${encodeURIComponent(id)}/capability-overrides`,
          {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          },
        ),
        "capability override",
      );
      return {
        userId: stringField(value.userId, "capability override.userId"),
        revision: stringField(value.revision, "capability override.revision"),
        overrideId: stringField(value.overrideId, "capability override.overrideId"),
        capability: stringField(value.capability, "capability override.capability"),
        forcedState: stringField(value.forcedState, "capability override.forcedState"),
      };
    },
    async setCollectorFeatured(slug, featured) {
      const value = objectField(
        await client.request<unknown>(`/admin/collectors/${encodeURIComponent(slug)}/featured`, {
          method: "POST",
          body: { featured },
          headers: { "Idempotency-Key": idempotencyKey() },
        }),
        "collector featured state",
      );
      return {
        slug: stringField(value.slug, "collector featured.slug"),
        isFeatured: Boolean(value.isFeatured),
        featuredAt: nullableString(value.featuredAt, "collector featured.featuredAt"),
      };
    },
    async updateCollectorDirectory(slug, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/collectors/${encodeURIComponent(slug)}/directory`, {
          method: "PATCH",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        }),
        "collector directory controls",
      );
      return {
        slug: stringField(value.slug, "collector directory.slug"),
        isPublic: Boolean(value.isPublic),
        isFeatured: Boolean(value.isFeatured),
        featurePriority: Number(value.featurePriority ?? 0),
        featuredCaption: nullableString(
          value.featuredCaption,
          "collector directory.featuredCaption",
        ),
        featuredAt: nullableString(value.featuredAt, "collector directory.featuredAt"),
        eligible: Boolean(value.eligible),
        eligibilityReason: stringField(
          value.eligibilityReason,
          "collector directory.eligibilityReason",
        ),
        publicAssetCount: Number(value.publicAssetCount ?? 0),
      };
    },
    async listComplianceCases(input) {
      const value = objectField(
        await client.get<unknown>("/admin/compliance/cases", input),
        "admin compliance cases",
      );
      return {
        items: Array.isArray(value.items) ? value.items.map(mapAdminComplianceCase) : [],
      };
    },
    async getFinanceSummary() {
      const value = objectField(
        await client.get<unknown>("/admin/finance/summary"),
        "admin finance summary",
      );
      return {
        currency: "GBP",
        pendingMovements: Number(value.pendingMovements ?? 0),
        exceptions: Number(value.exceptions ?? 0),
        reconciliationMismatches: Number(value.reconciliationMismatches ?? 0),
      } satisfies AdminFinanceSummary;
    },
    async getFinanceDashboard() {
      return mapAdminFinanceDashboard(await client.get<unknown>("/admin/finance/dashboard"));
    },
    async listFinanceRecords(input) {
      return mapAdminFinanceRecords(await client.get<unknown>("/admin/finance/records", input));
    },
    async getTrustSupportDashboard() {
      return mapAdminTrustSupportDashboard(
        await client.get<unknown>("/admin/trust-support/dashboard"),
      );
    },
    async listTrustSupportRecords(input) {
      return mapAdminTrustSupportRecords(
        await client.get<unknown>("/admin/trust-support/records", input),
      );
    },
    async getIntegrations() {
      const value = objectField(
        await client.get<unknown>("/admin/integrations"),
        "admin integrations",
      );
      return {
        providerIncidents: Number(value.providerIncidents ?? 0),
        failedWebhooks: Number(value.failedWebhooks ?? 0),
        secrets: "redacted",
      } satisfies AdminIntegrationsSummary;
    },
    async search(query, limit) {
      const value = objectField(
        await client.get<unknown>("/admin/search", { q: query, limit }),
        "admin search",
      );
      return {
        items: Array.isArray(value.items)
          ? value.items.map((raw) => {
              const item = objectField(raw, "admin search result");
              return {
                entityType: stringField(
                  item.entityType,
                  "admin search.entityType",
                ) as AdminSearchResult["entityType"],
                id: stringField(item.id, "admin search.id"),
                title: stringField(item.title, "admin search.title"),
                subtitle: stringField(item.subtitle, "admin search.subtitle"),
                target: stringField(item.target, "admin search.target"),
              };
            })
          : [],
      };
    },
    async getCollectibleDetail(id, tab) {
      return client.get<import("@/data/repositories").AdminCollectibleDetail>(
        `/admin/assets/${encodeURIComponent(id)}`,
        tab ? { tab } : undefined,
      );
    },
    async refreshMarketData(id) {
      return client.request<{
        assetId: string;
        queued: number;
        cooldownUntil: string | null;
      }>(`/admin/market-data/refresh/${encodeURIComponent(id)}`, {
        method: "POST",
      });
    },
    async proposeOwnershipSupply(id, input) {
      return client.request<{
        assetId: string;
        status: string;
        units: string;
        pricePerUnitMinor: string;
        remainderMinor: string;
      }>(`/admin/assets/${encodeURIComponent(id)}/ownership/supply-policy/proposals`, {
        method: "POST",
        body: input,
        headers: { "Idempotency-Key": idempotencyKey() },
      });
    },
    async approveOwnershipSupply(id, reason) {
      return client.request<{
        assetId: string;
        status: string;
        units: string;
        pricePerUnitMinor: string;
        remainderMinor: string;
      }>(`/admin/assets/${encodeURIComponent(id)}/ownership/supply-policy/approve`, {
        method: "POST",
        body: { reason },
        headers: { "Idempotency-Key": idempotencyKey() },
      });
    },
    async issueOwnership(id, totalUnits) {
      return client.request<{
        assetId: string;
        status: string;
        totalUnits: string;
        issuedUnits: string;
        availableUnits: string;
        issuedAt: string;
        sequence: string;
      }>(`/admin/assets/${encodeURIComponent(id)}/ownership/issue`, {
        method: "POST",
        body: { totalUnits },
        headers: { "Idempotency-Key": idempotencyKey() },
      });
    },
    async activateTradingMarket(id) {
      return client.request<{ assetId: string; status: string }>(
        `/admin/trading/markets/${encodeURIComponent(id)}/activate`,
        { method: "POST", headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async approveInitialOffering(id, reason) {
      return client.request<InitialOfferingProjection>(
        `/admin/initial-offerings/${encodeURIComponent(id)}/approve`,
        { method: "POST", body: { reason }, headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async requestInitialOfferingChanges(id, reason) {
      return client.request<InitialOfferingProjection>(
        `/admin/initial-offerings/${encodeURIComponent(id)}/request-changes`,
        { method: "POST", body: { reason }, headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async openInitialOffering(id) {
      return client.request<InitialOfferingProjection>(
        `/admin/initial-offerings/${encodeURIComponent(id)}/open`,
        { method: "POST", headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async pauseInitialOffering(id, input) {
      return client.request<InitialOfferingProjection>(
        `/admin/initial-offerings/${encodeURIComponent(id)}/pause`,
        { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async resumeInitialOffering(id, input) {
      return client.request<InitialOfferingProjection>(
        `/admin/initial-offerings/${encodeURIComponent(id)}/open`,
        { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async cancelInitialOffering(id, input) {
      return client.request<InitialOfferingProjection>(
        `/admin/initial-offerings/${encodeURIComponent(id)}/cancel`,
        { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async haltTradingMarket(id, input) {
      return client.request<{ assetId: string; status: string }>(
        `/admin/trading/markets/${encodeURIComponent(id)}/halt`,
        { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async resumeTradingMarket(id, input) {
      return client.request<{ assetId: string; status: string }>(
        `/admin/trading/markets/${encodeURIComponent(id)}/resume`,
        { method: "POST", body: input, headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
  };
};

export function createHttpRepositories(client = new ApiClient()): AppRepositories {
  const idempotencyKey = () => crypto.randomUUID();
  const assets: AssetRepository = {
    async listAssets(input) {
      const { signal, ...query } = input ?? {};
      const body = await client.get<MarketAssetPageDto>("/market/assets", query, signal);
      return {
        items: body.items.map(mapMarketAsset),
        hasMore: body.hasMore,
        nextCursor: body.nextCursor,
      };
    },
    async getAssetById(id) {
      try {
        return mapMarketAsset(await client.get<MarketAssetDto>(`/market/assets/${id}`));
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
    async searchAssets(query) {
      return (await this.listAssets({ query })).items;
    },
    async getFeaturedAssets() {
      return (await this.listAssets({ limit: 6 })).items;
    },
    async getTrendingAssets() {
      return (await this.listAssets({ sort: "change24h", limit: 6 })).items;
    },
  };

  return {
    admin: adminRepository(client),
    assets,
    catalogue: {
      async listSubmissionCategories() {
        const body = await client.get<{
          items: Array<{ id: string; slug: string; name: string; description: string | null }>;
        }>("/categories");
        return body.items.map((item): SubmissionCategory => ({
          id: stringField(item.id, "category.id"),
          slug: stringField(item.slug, "category.slug"),
          name: stringField(item.name, "category.name"),
          description:
            item.description === null
              ? null
              : stringField(item.description, "category.description"),
        }));
      },
      async listGradingCompanies() {
        const body = await client.get<{
          items: Array<{
            code: string;
            name: string;
            displayName?: string;
            verificationMode?: string;
            supportsCertVerification?: boolean;
            supportsAutomatedVerification?: boolean;
            officialVerificationUrl?: string | null;
            certificationFormat?: string | null;
            gradeScaleVersion?: string;
          }>;
        }>("/grading-companies");
        return body.items.map((item) => ({
          code: stringField(item.code, "gradingCompany.code"),
          name: stringField(item.name, "gradingCompany.name"),
          displayName: typeof item.displayName === "string" ? item.displayName : item.name,
          verificationMode:
            typeof item.verificationMode === "string"
              ? item.verificationMode
              : "MANUAL_OFFICIAL_LOOKUP",
          supportsCertVerification: item.supportsCertVerification !== false,
          supportsAutomatedVerification: item.supportsAutomatedVerification === true,
          officialVerificationUrl: item.officialVerificationUrl ?? null,
          certificationFormat: item.certificationFormat ?? null,
          gradeScaleVersion: item.gradeScaleVersion ?? "unconfirmed-v1",
        }));
      },
      async listGrades(companyCode) {
        const body = await client.get<{
          items: Array<{
            id: string;
            grade: string;
            label: string;
            conditionLabel: string | null;
            designation?: string | null;
            legacy?: boolean;
            gradeEra?: string | null;
            scaleVersion?: string | null;
          }>;
        }>(`/grading-companies/${encodeURIComponent(companyCode)}/grades`);
        return body.items.map((item) => ({
          id: stringField(item.id, "grade.id"),
          grade: stringField(item.grade, "grade.grade"),
          label: stringField(item.label, "grade.label"),
          conditionLabel:
            item.conditionLabel === null
              ? null
              : stringField(item.conditionLabel, "grade.conditionLabel"),
          designation: item.designation ?? null,
          legacy: item.legacy === true,
          gradeEra: item.gradeEra ?? null,
          scaleVersion: item.scaleVersion ?? null,
        }));
      },
    },
    submissions: {
      async importReference(input) {
        const value = objectField(
          await client.request<unknown>("/collectibles/import-reference", {
            method: "POST",
            body: input,
          }),
          "collectible reference import",
        );
        const status = stringField(value.status, "referenceImport.status");
        if (
          ![
            "MATCH_FOUND",
            "PARTIAL_MATCH",
            "COULD_NOT_IDENTIFY",
            "UNSUPPORTED",
            "PROVIDER_UNAVAILABLE",
          ].includes(status)
        )
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid reference import response.");
        const identity = objectField(value.identity, "referenceImport.identity");
        const rawReference = value.customerReference;
        const customerReference =
          rawReference === null
            ? null
            : (() => {
                const reference = objectField(rawReference, "referenceImport.customerReference");
                const price = reference.observedAskingPrice;
                return {
                  provider: stringField(reference.provider, "referenceImport.provider"),
                  externalReferenceId: nullableString(
                    reference.externalReferenceId,
                    "referenceImport.externalReferenceId",
                  ),
                  normalizedUrl: stringField(
                    reference.normalizedUrl,
                    "referenceImport.normalizedUrl",
                  ),
                  originalTitle: nullableString(
                    reference.originalTitle,
                    "referenceImport.originalTitle",
                  ),
                  ...(typeof reference.imageUrl === "string"
                    ? { imageUrl: reference.imageUrl }
                    : {}),
                  ...(price
                    ? {
                        observedAskingPrice: (() => {
                          const value = objectField(price, "referenceImport.observedAskingPrice");
                          return {
                            amountMinor: stringField(
                              value.amountMinor,
                              "referenceImport.askingPrice.amountMinor",
                            ),
                            currency: stringField(
                              value.currency,
                              "referenceImport.askingPrice.currency",
                            ),
                          };
                        })(),
                      }
                    : {}),
                  importedAt: stringField(
                    reference.importedAt,
                    "referenceImport.importedAt",
                  ) as ISODateTime,
                  matchQuality: stringField(
                    reference.matchQuality,
                    "referenceImport.matchQuality",
                  ) as "MATCH_FOUND" | "PARTIAL_MATCH",
                  extractedIdentity: Object.fromEntries(
                    Object.entries(identity).filter(([, entry]) => typeof entry === "string"),
                  ) as Record<string, string>,
                };
              })();
        return {
          status: status as CollectibleReferenceImport["status"],
          message: stringField(value.message, "referenceImport.message"),
          provider: nullableString(value.provider, "referenceImport.provider"),
          identity: Object.fromEntries(
            Object.entries(identity).filter(([, entry]) => typeof entry === "string"),
          ) as Record<string, string>,
          customerReference,
        };
      },
      async checkMarket(input) {
        return mapMarketResearch(
          await client.request<unknown>("/submissions/market-research", {
            method: "POST",
            body: input,
          }),
        );
      },
      async createDraft(input) {
        return mapSubmission(
          await client.request<unknown>("/submissions", {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async listOwn(input) {
        const body = objectField(
          await client.get<unknown>("/submissions", input),
          "submissions page",
        );
        if (!Array.isArray(body.items))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid submissions page from service.");
        return {
          items: body.items.map(mapSubmission),
          nextCursor: nullableString(body.nextCursor, "submissions.nextCursor"),
        };
      },
      async getOwn(id) {
        return mapSubmissionDetail(await client.get<unknown>(`/submissions/${id}`));
      },
      async updateDraft(id, input) {
        return mapSubmissionDetail(
          await client.request<unknown>(`/submissions/${id}`, {
            method: "PATCH",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async verifyCertification(id, certificationNumber) {
        return mapSubmissionDetail(
          await client.request<unknown>(`/submissions/${id}/certification/verify`, {
            method: "POST",
            body: { certificationNumber },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async createMediaIntent(id, input) {
        const response = objectField(
          await client.request<unknown>(`/submissions/${id}/media/upload-intents`, {
            method: "POST",
            body: {
              slot: input.slot,
              mimeType: input.file.type,
              sizeBytes: input.file.size,
              originalFilename: input.file.name,
            },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "submission upload intent",
        );
        const media = mapSubmissionMedia(response.media);
        const upload = objectField(response.upload, "submission upload target");
        const url = stringField(upload.url, "submission upload url");
        const headers = objectField(upload.headers, "submission upload headers");
        const result = await fetch(url, {
          method: stringField(upload.method, "submission upload method"),
          headers: Object.fromEntries(
            Object.entries(headers).map(([key, value]) => [
              key,
              stringField(value, `upload header ${key}`),
            ]),
          ),
          body: input.file,
        });
        if (!result.ok)
          throw new ApiError(
            "MEDIA_UPLOAD_FAILED",
            "Evidence upload was not accepted by the approved storage service.",
          );
        const sha256 = await sha256Hex(input.file);
        await client.request<unknown>(`/submissions/${id}/media/${media.id}/complete`, {
          method: "POST",
          body: { sha256, version: (await this.getOwn(id)).version },
          headers: { "Idempotency-Key": idempotencyKey() },
        });
        return this.getOwn(id);
      },
      async removeMedia(id, mediaId, version) {
        await client.request<unknown>(`/submissions/${id}/media/${mediaId}?version=${version}`, {
          method: "DELETE",
          headers: { "Idempotency-Key": idempotencyKey() },
        });
        return this.getOwn(id);
      },
      async submit(id, version) {
        return mapSubmissionDetail(
          await client.request<unknown>(`/submissions/${id}/submit`, {
            method: "POST",
            body: { version },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async cancel(id, version) {
        return mapSubmissionDetail(
          await client.request<unknown>(`/submissions/${id}/cancel`, {
            method: "POST",
            body: { version },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async getPreGrade(id) {
        return mapRawCardPreGradeResponse(
          await client.get<unknown>(`/submissions/${id}/pre-grade`),
        );
      },
      async runPreGrade(id) {
        const response = await client.request<unknown>(`/submissions/${id}/pre-grade`, {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey() },
        });
        return mapRawCardPreGrade(response);
      },
    },
    reviews: {
      async listQueue(input) {
        return mapReviewQueue(await client.get<unknown>("/reviews/submissions", input));
      },
      async getDetail(id) {
        return mapReviewDetail(await client.get<unknown>(`/reviews/submissions/${id}`));
      },
      async listEligibleReviewers(id) {
        const value = await client.get<unknown>(`/reviews/submissions/${id}/reviewers`);
        if (!Array.isArray(value))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid eligible reviewer list.");
        return value.map((raw) => {
          const item = objectField(raw, "eligible reviewer");
          return {
            id: stringField(item.id, "eligible reviewer.id"),
            displayName: stringField(item.displayName, "eligible reviewer.displayName"),
            username: nullableString(item.username, "eligible reviewer.username"),
            roles: Array.isArray(item.roles) ? item.roles.map(String) : [],
          };
        });
      },
      async assignReviewer(id, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/assignment`, {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review assignment",
        );
        return {
          submissionId: stringField(response.submissionId, "assignment.submissionId"),
          status: stringField(response.status, "assignment.status"),
          reviewerId: nullableString(response.reviewerId, "assignment.reviewerId"),
          version: Number(response.version),
        };
      },
      async claim(id, version) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/claim`, {
            method: "POST",
            body: { version },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review claim",
        );
        return {
          submissionId: stringField(response.submissionId, "claim.submissionId"),
          status: stringField(response.status, "claim.status"),
        };
      },
      async release(id, version) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/release`, {
            method: "POST",
            body: { version },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review release",
        );
        return {
          submissionId: stringField(response.submissionId, "release.submissionId"),
          status: stringField(response.status, "release.status"),
          version: Number(response.version),
        };
      },
      async recalculateReadiness(id, input) {
        const response = objectField(
          await client.request<unknown>(
            `/reviews/submissions/${id}/recovery/recalculate-readiness`,
            {
              method: "POST",
              body: input,
              headers: { "Idempotency-Key": idempotencyKey() },
            },
          ),
          "review readiness recovery",
        );
        return {
          submissionId: stringField(response.submissionId, "readiness recovery.submissionId"),
          status: stringField(response.status, "readiness recovery.status"),
          version: Number(response.version),
          recalculatedAt: stringField(response.recalculatedAt, "readiness recovery.recalculatedAt"),
        };
      },
      async saveCondition(id, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/condition`, {
            method: "PATCH",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "staff condition",
        );
        return {
          submissionId: stringField(response.submissionId, "condition.submissionId"),
          staffCondition: stringField(response.staffCondition, "condition.staffCondition"),
          updatedAt: stringField(response.updatedAt, "condition.updatedAt"),
        };
      },
      async saveValuation(id, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/valuation`, {
            method: "PATCH",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "staff valuation",
        );
        return {
          submissionId: stringField(response.submissionId, "valuation.submissionId"),
          valueMinor:
            response.valueMinor == null
              ? null
              : stringField(response.valueMinor, "valuation.valueMinor"),
          updatedAt: stringField(response.updatedAt, "valuation.updatedAt"),
        };
      },
      async decide(id, decision, input) {
        const action =
          decision === "CHANGES_REQUESTED"
            ? "request-changes"
            : decision === "APPROVED"
              ? "approve"
              : "reject";
        return mapSubmission(
          await client.request<unknown>(`/reviews/submissions/${id}/${action}`, {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async saveNote(id, note) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/notes`, {
            method: "POST",
            body: note,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review note",
        );
        return {
          submissionId: stringField(response.submissionId, "review note.submissionId"),
          updatedAt: stringField(response.updatedAt, "review note.updatedAt"),
        };
      },
      async saveIdentity(id, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/identity`, {
            method: "PATCH",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review identity",
        );
        return {
          submissionId: stringField(response.submissionId, "review identity.submissionId"),
          version: Number(response.version),
        };
      },
      async createFinding(id, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/findings`, {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review finding",
        );
        return {
          findingId: stringField(response.findingId, "review finding.findingId"),
          submissionId: stringField(response.submissionId, "review finding.submissionId"),
          version: Number(response.version),
        };
      },
      async updateFinding(id, findingId, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/findings/${findingId}`, {
            method: "PATCH",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review finding update",
        );
        return {
          findingId: stringField(response.findingId, "review finding update.findingId"),
          submissionId: stringField(response.submissionId, "review finding update.submissionId"),
          status: stringField(response.status, "review finding update.status"),
          version: Number(response.version),
        };
      },
      async acceptEvidence(id, mediaId, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/evidence/${mediaId}/accept`, {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "evidence acceptance",
        );
        return {
          submissionId: stringField(response.submissionId, "evidence acceptance.submissionId"),
          mediaId: stringField(response.mediaId, "evidence acceptance.mediaId"),
          reviewState: stringField(response.reviewState, "evidence acceptance.reviewState"),
          version: Number(response.version),
        };
      },
      async flagEvidence(id, mediaId, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/evidence/${mediaId}/flag`, {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "evidence flag",
        );
        return {
          submissionId: stringField(response.submissionId, "evidence flag.submissionId"),
          mediaId: stringField(response.mediaId, "evidence flag.mediaId"),
          reviewState: stringField(response.reviewState, "evidence flag.reviewState"),
          findingId: stringField(response.findingId, "evidence flag.findingId"),
          version: Number(response.version),
        };
      },
      async addResearchReference(id, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/research/references`, {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "research reference",
        );
        return {
          submissionId: stringField(response.submissionId, "research reference.submissionId"),
          referenceId: stringField(response.referenceId, "research reference.referenceId"),
          version: Number(response.version),
        };
      },
      async removeResearchReference(id, referenceId, input) {
        const response = objectField(
          await client.request<unknown>(
            `/reviews/submissions/${id}/research/references/${referenceId}/remove`,
            {
              method: "PATCH",
              body: input,
              headers: { "Idempotency-Key": idempotencyKey() },
            },
          ),
          "research reference removal",
        );
        return {
          submissionId: stringField(
            response.submissionId,
            "research reference removal.submissionId",
          ),
          referenceId: stringField(response.referenceId, "research reference removal.referenceId"),
          version: Number(response.version),
        };
      },
      async addResearchNote(id, input) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/research/notes`, {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "research note",
        );
        return {
          submissionId: stringField(response.submissionId, "research note.submissionId"),
          version: Number(response.version),
        };
      },
      async manualVerifyCertification(id, input) {
        return client.request<unknown>(`/reviews/submissions/${id}/certification/manual-verify`, {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async canonicalize(id, version) {
        const response = objectField(
          await client.request<unknown>(`/admin/submissions/${id}/canonicalize`, {
            method: "POST",
            body: { version },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "canonical collectible",
        );
        return {
          submissionId: stringField(response.submissionId, "canonical collectible.submissionId"),
          assetId: stringField(response.assetId, "canonical collectible.assetId"),
          publicId: stringField(response.publicId, "canonical collectible.publicId"),
          slug: stringField(response.slug, "canonical collectible.slug"),
          title: stringField(response.title, "canonical collectible.title"),
          replayed: Boolean(response.replayed),
        };
      },
    },
    lifecycle: {
      async listOperations() {
        const value = objectField(
          await client.get<unknown>("/admin/assets/operations", { legacy: true }),
          "asset operations",
        );
        if (!Array.isArray(value.items))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid asset operations from service.");
        return value.items.map(mapOperation);
      },
      async getOperationsBoard(input) {
        return mapOperationsBoard(await client.get<unknown>("/admin/assets/operations", input));
      },
      async getOperationDetail(assetId) {
        return client.get<import("@/data/repositories").AssetOperationDetailProjection>(
          `/admin/assets/${encodeURIComponent(assetId)}/operations`,
        );
      },
      async setOperationalControl(assetId, input) {
        return client.request(`/admin/assets/${encodeURIComponent(assetId)}/operational-control`, {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async handoff(assetId, input) {
        return client.request(`/admin/assets/${assetId}/handoff`, {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async transitionCustody(assetId, toStatus, providerRef) {
        return client.request(`/admin/assets/${assetId}/custody/transitions`, {
          method: "POST",
          body: { toStatus, ...(providerRef ? { providerRef } : {}) },
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async recordValuation(assetId, input) {
        return client.request(`/admin/assets/${assetId}/valuations/decisions`, {
          method: "POST",
          body: { ...input, currency: "GBP" },
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async recordCoverage(assetId, input) {
        return client.request(`/admin/assets/${assetId}/insurance/coverage`, {
          method: "POST",
          body: { ...input, currency: "GBP" },
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async getReadiness(assetId) {
        const value = objectField(
          await client.get<unknown>(`/admin/assets/${assetId}/publication-readiness`),
          "publication readiness",
        );
        if (
          (value.status !== "READY" && value.status !== "BLOCKED") ||
          !Array.isArray(value.blockingCodes)
        )
          throw new ApiError(
            "CLIENT_CONTRACT_ERROR",
            "Invalid publication readiness from service.",
          );
        return {
          assetId: stringField(value.assetId, "readiness.assetId"),
          status: value.status,
          blockingCodes: stringArrayField(value.blockingCodes, "readiness.blockingCodes"),
        } as PublicationReadiness;
      },
      async publish(assetId) {
        return client.request(`/admin/assets/${assetId}/publish`, {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
    },
    market: {
      async getMarketSummary() {
        const value = await client.get<{
          totalEstimatedMarketValue: { minor: string; currency: "GBP" } | null;
          volume24h: { minor: string; currency: "GBP" } | null;
          activeAssetCount: number;
          collectorCount: number;
        }>("/market/summary");
        const empty = { amount: minorUnits(0), currency: "GBP" as const };
        return {
          totalMarketValue: value.totalEstimatedMarketValue
            ? { amount: safeMinor(value.totalEstimatedMarketValue.minor), currency: "GBP" as const }
            : empty,
          volume24h: value.volume24h
            ? { amount: safeMinor(value.volume24h.minor), currency: "GBP" as const }
            : empty,
          activeAssets: value.activeAssetCount,
          verifiedAssets: value.activeAssetCount,
          activeCollectors: value.collectorCount,
        } satisfies MarketSummary;
      },
      async getMarketSnapshot() {
        return mapMarketSnapshot(await client.get<MarketSnapshotDto>("/market/snapshot"));
      },
      async getSimilarAssets(assetId, limit = 8) {
        const body = await client.get<{ items: SimilarAssetDto[] }>(
          `/market/assets/${encodeURIComponent(assetId)}/similar`,
          { limit },
        );
        return body.items.map(
          (item) =>
            ({
              assetId: item.assetId as AssetId,
              slug: item.slug,
              title: item.title,
              category: item.category,
              ...(item.setName ? { setName: item.setName } : {}),
              ...(item.cardNumber ? { cardNumber: item.cardNumber } : {}),
              ...(item.thumbnail ? { thumbnail: item.thumbnail } : {}),
              marketState: item.marketState,
              displayPrice: {
                type: item.displayPrice.type,
                amount: item.displayPrice.amount
                  ? {
                      amount: safeMinor(item.displayPrice.amount.minor),
                      currency: item.displayPrice.amount.currency,
                    }
                  : null,
                observedAt: item.displayPrice.observedAt as ISODateTime | null,
              },
              movement24hBps: item.movement24hBps ?? null,
            }) satisfies SimilarAsset,
        );
      },
      async getPriceHistory(assetId, range) {
        const body = await client.get<{
          source: "PRICECHARTING" | "SLICE_VALUATION";
          series?: import("@/domain/market").ReferenceSeries;
          availableSeries?: import("@/domain/market").ReferenceSeries[];
          currency: SupportedCurrency | null;
          movementBps: number | null;
          percentageChangeBps: number | null;
          movementAvailability: "AVAILABLE" | "UNAVAILABLE";
          movementUnavailableReason: string | null;
          startingValue: { minor: string; currency: SupportedCurrency } | null;
          latestValue: { minor: string; currency: SupportedCurrency } | null;
          absoluteChange: { minor: string; currency: SupportedCurrency } | null;
          highValue: { minor: string; currency: SupportedCurrency } | null;
          lowValue: { minor: string; currency: SupportedCurrency } | null;
          historyPointCount: number;
          displayedPointCount: number;
          rangeStart: string | null;
          rangeEnd: string | null;
          actualCoverageSeconds: number;
          lastRefreshedAt: string | null;
          points: Array<{
            id: string;
            observedAt: string;
            estimatedMarketValue: { minor: string; currency: SupportedCurrency };
            source: string;
            dataStatus: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
            changeFromPrevious: { minor: string; currency: SupportedCurrency } | null;
            changeFromPreviousBps: number | null;
            changeFromRangeStart: { minor: string; currency: SupportedCurrency } | null;
            changeFromRangeStartBps: number | null;
          }>;
        }>(`/market/assets/${assetId}/history`, { range });
        const points = body.points.map((point) => ({
          id: point.id,
          timestamp: point.observedAt as ISODateTime,
          value: {
            amount: safeMinor(point.estimatedMarketValue.minor),
            currency: point.estimatedMarketValue.currency,
          },
          source: point.source,
          dataStatus: point.dataStatus,
          changeFromPrevious: point.changeFromPrevious
            ? {
                amount: safeMinor(point.changeFromPrevious.minor),
                currency: point.changeFromPrevious.currency,
              }
            : null,
          changeFromPreviousBps: point.changeFromPreviousBps,
          changeFromRangeStart: point.changeFromRangeStart
            ? {
                amount: safeMinor(point.changeFromRangeStart.minor),
                currency: point.changeFromRangeStart.currency,
              }
            : null,
          changeFromRangeStartBps: point.changeFromRangeStartBps,
        }));
        return Object.assign(points, {
          source: body.source,
          series: body.series,
          availableSeries: body.availableSeries,
          movementBps: body.movementBps,
          range,
          selectedRange: range,
          currency: body.currency,
          startingValue: body.startingValue
            ? {
                amount: safeMinor(body.startingValue.minor),
                currency: body.startingValue.currency,
              }
            : null,
          latestValue: body.latestValue
            ? {
                amount: safeMinor(body.latestValue.minor),
                currency: body.latestValue.currency,
              }
            : null,
          absoluteChange: body.absoluteChange
            ? {
                amount: safeMinor(body.absoluteChange.minor),
                currency: body.absoluteChange.currency,
              }
            : null,
          percentageChangeBps: body.percentageChangeBps,
          highValue: body.highValue
            ? {
                amount: safeMinor(body.highValue.minor),
                currency: body.highValue.currency,
              }
            : null,
          lowValue: body.lowValue
            ? {
                amount: safeMinor(body.lowValue.minor),
                currency: body.lowValue.currency,
              }
            : null,
          historyPointCount: body.historyPointCount,
          displayedPointCount: body.displayedPointCount,
          rangeStart: body.rangeStart as ISODateTime | null,
          rangeEnd: body.rangeEnd as ISODateTime | null,
          actualCoverageSeconds: body.actualCoverageSeconds,
          lastRefreshedAt: body.lastRefreshedAt as ISODateTime | null,
          movementAvailability: body.movementAvailability,
          movementUnavailableReason: body.movementUnavailableReason,
        });
      },
      async getMarketMovers() {
        return (await client.get<{ items: MarketAssetDto[] }>("/market/movers")).items.map(
          mapMarketAsset,
        );
      },
      async getRecentTrades(assetId) {
        const body = await client.get<{
          items: Array<{
            priceMinor: string;
            units: string;
            executedAt: string;
            marketSequence: string;
          }>;
        }>(`/market/assets/${assetId}/recent-trades`);
        return body.items.map((item, index) => ({
          id: item.marketSequence,
          orderId: item.marketSequence as never,
          assetId,
          units: item.units as never,
          pricePerUnit: { amount: safeMinor(item.priceMinor), currency: "GBP" },
          status: "completed" as const,
          executedAt: item.executedAt as ISODateTime,
        }));
      },
      async getOrderBook(assetId) {
        const body = await client.get<{
          bids: Array<{ priceMinor: string; units: string }>;
          asks: Array<{ priceMinor: string; units: string }>;
          asOf: string;
        }>(`/market/assets/${assetId}/order-book`);
        return {
          assetId,
          bids: body.bids.map((item) => ({
            pricePerUnit: { amount: safeMinor(item.priceMinor), currency: "GBP" },
            units: safeUnitCount(item.units),
            orderCount: 1,
          })),
          asks: body.asks.map((item) => ({
            pricePerUnit: { amount: safeMinor(item.priceMinor), currency: "GBP" },
            units: safeUnitCount(item.units),
            orderCount: 1,
          })),
          updatedAt: body.asOf as ISODateTime,
        };
      },
    },
    portfolio: createFinanceApiRepository(client),
    collectors: {
      async listCollectors() {
        return (await this.listPublicCollectors()).items;
      },
      async listPublicCollectors(input) {
        const { signal, ...query } = input ?? {};
        const body = await client.get<{
          items: CollectorDto[];
          featured?: CollectorDto[];
          specialties?: Array<string | { name: string; count?: number }>;
          stats?: CollectorDirectoryPage["stats"];
          nextCursor: string | null;
          pagination?: CollectorDirectoryPage["pagination"];
        }>("/collectors", query, signal);
        return mapCollectorPage(body);
      },
      async getCollector(id, input) {
        const value = await client.get<CollectorDto | { error: string }>(
          `/collectors/${id}`,
          input,
        );
        return "error" in value ? null : mapCollector(value);
      },
      async followCollector(id) {
        await client.request(`/collectors/${id}/follow`, { method: "PUT" });
      },
      async unfollowCollector(id) {
        await client.request(`/collectors/${id}/follow`, { method: "DELETE" });
      },
    },
    collectorWorkspace: {
      async getOverview() {
        return client.get<import("@/domain").CollectorWorkspaceOverview>(
          "/collector-workspace/overview",
        );
      },
      async getCollectibles() {
        return client.get<import("@/domain").CollectorWorkspaceAsset[]>(
          "/collector-workspace/collectibles",
        );
      },
      async getCollectibleDetail(id) {
        return client.get<{
          asset: import("@/domain").CollectorWorkspaceAsset;
          requests: import("@/data/repositories").CollectorWorkspaceRequest[];
          lifecycle: import("@/domain").CollectorWorkspaceLifecycle;
          activity: Array<{
            id: string;
            type: string;
            title: string;
            detail: string;
            occurredAt: string;
          }>;
        }>(`/collector-workspace/collectibles/${encodeURIComponent(id)}`);
      },
      async getInitialOfferingPreview(assetId, percentageBps) {
        return client.get<InitialOfferingPreview>(
          `/collector/assets/${encodeURIComponent(assetId)}/offering/preview`,
          { percentageBps },
        );
      },
      async getInitialOffering(assetId) {
        return client.get<InitialOfferingProjection>(
          `/collector/assets/${encodeURIComponent(assetId)}/offering`,
        );
      },
      async proposeInitialOffering(assetId, offeredUnits) {
        return client.request<InitialOfferingProjection>(
          `/collector/assets/${encodeURIComponent(assetId)}/offering`,
          {
            method: "POST",
            body: { offeredUnits },
            headers: { "Idempotency-Key": idempotencyKey() },
          },
        );
      },
      async updateInitialOffering(offeringId, offeredUnits) {
        return client.request<InitialOfferingProjection>(
          `/collector/initial-offerings/${encodeURIComponent(offeringId)}`,
          {
            method: "PATCH",
            body: { offeredUnits },
            headers: { "Idempotency-Key": idempotencyKey() },
          },
        );
      },
      async getRequests() {
        return client.get<import("@/data/repositories").CollectorWorkspaceRequest[]>(
          "/collector-workspace/requests",
        );
      },
      async getDocuments() {
        return client.get<import("@/data/repositories").CollectorWorkspaceDocument[]>(
          "/collector-workspace/documents",
        );
      },
      async search(query) {
        return client.get<{
          items: Array<{ entityType: string; title: string; subtitle: string; route: string }>;
        }>("/collector-workspace/search", { query });
      },
      async updatePublicProfile(input) {
        return client.request<{
          slug: string;
          headline: string | null;
          specialism: string | null;
          isPublic: boolean;
        }>("/collector-workspace/profile", { method: "PATCH", body: input });
      },
      async getSubscription() {
        return client.get<import("@/data/repositories").CollectorSubscriptionProjection>(
          "/collector-workspace/subscription",
        );
      },
      async getPlans() {
        return client.get<import("@/data/repositories").CollectorPlanProjection[]>(
          "/collector-workspace/plans",
        );
      },
      async subscriptionAction(action, planCode) {
        const paths = {
          CHECKOUT: "checkout",
          PORTAL: "portal",
          CHANGE_PLAN: "change-plan",
          CANCEL: "cancel",
          RESUME: "resume",
        } as const;
        return client.request<import("@/data/repositories").CollectorMembershipActionResult>(
          `/collector-workspace/subscription/${paths[action]}`,
          {
            method: "POST",
            body: planCode ? { planCode } : undefined,
            headers: { "Idempotency-Key": crypto.randomUUID() },
          },
        );
      },
      async listVaults() {
        return client.get<import("@/data/repositories").CollectorVaultProjection[]>(
          "/collector-workspace/vaults",
        );
      },
      async selectVault(submissionId, vaultId, deliveryMethod) {
        return client.request(
          `/collector-workspace/collectibles/${encodeURIComponent(submissionId)}/vault`,
          { method: "POST", body: { vaultId, deliveryMethod } },
        );
      },
      async addShipment(submissionId, input) {
        return client.request(
          `/collector-workspace/collectibles/${encodeURIComponent(submissionId)}/shipment`,
          { method: "POST", body: input },
        );
      },
      async deleteDraft(submissionId, version) {
        return client.request<{ submissionId: string; deleted: boolean }>(
          `/collector-workspace/collectibles/${encodeURIComponent(submissionId)}/delete-draft`,
          { method: "POST", body: { version } },
        );
      },
    },
    ownership: {
      async getWatchlist(userId) {
        const body = await client.get<{ items: Array<{ assetId: string }> }>("/me/watchlist");
        return { userId, assetIds: body.items.map((item) => item.assetId as AssetId) };
      },
      async toggleWatchlistAsset(userId, assetId) {
        const current = await client.get<{ items: Array<{ assetId: string }> }>("/me/watchlist");
        const watched = current.items.some((item) => item.assetId === assetId);
        await client.request(`/me/watchlist/${assetId}`, {
          method: watched ? "DELETE" : "PUT",
          headers: { "Idempotency-Key": idempotencyKey() },
        });
        return {
          userId,
          assetIds: watched
            ? current.items
                .filter((item) => item.assetId !== assetId)
                .map((item) => item.assetId as AssetId)
            : [...current.items.map((item) => item.assetId as AssetId), assetId],
        };
      },
      async getPublicIssuance(assetSlug) {
        const body = await client.get<{
          status: string;
          totalUnits?: string;
          issuedUnits?: string;
          issuedAt?: string | null;
        }>(`/market/assets/${assetSlug}/ownership/issuance`);
        if (body.status !== "ACTIVE" || !body.totalUnits || !body.issuedUnits) return null;
        return {
          status: body.status,
          totalUnits: body.totalUnits,
          issuedUnits: body.issuedUnits,
          issuedAt: body.issuedAt ?? null,
        };
      },
      async getOwnMarketPosition(assetSlug) {
        try {
          return await client.get<{
            settledUnits: string;
            reservedUnits: string;
            availableUnits: string;
          }>(`/me/market/assets/${assetSlug}/ownership`);
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }
      },
    },
    trading: {
      async getOwnershipMarketSummary(assetSlug) {
        return mapOwnershipMarketSummary(
          await client.get<unknown>(
            `/market/assets/${encodeURIComponent(assetSlug)}/ownership/market-summary`,
          ),
        );
      },
      async previewOrder(input) {
        return mapTradingPreview(
          await client.request<unknown>("/trading/orders/preview", { method: "POST", body: input }),
        );
      },
      async previewOwnershipOrder(input) {
        return mapOwnershipPreview(
          await client.request<unknown>("/trading/orders/ownership-preview", {
            method: "POST",
            body: input,
          }),
        );
      },
      async previewPublicOwnershipOrder(input) {
        return mapOwnershipPreview(
          await client.request<unknown>(
            `/market/assets/${encodeURIComponent(input.assetId)}/ownership/preview`,
            { method: "POST", body: input },
          ),
        );
      },
      async placeOrder(input) {
        return mapTradingOrder(
          await client.request<unknown>("/trading/orders", {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async cancelOrder(orderId) {
        return mapTradingOrder(
          await client.request<unknown>(`/trading/orders/${orderId}`, {
            method: "DELETE",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async listOwnOrders(input) {
        return mapTradingPage(await client.get<unknown>("/trading/orders", input));
      },
      async listOwnExecutions(input) {
        return mapExecutionPage(await client.get<unknown>("/trading/executions", input));
      },
      previewBuyOrder: unsupported("Trading"),
      previewSellOrder: unsupported("Trading"),
      createDemoOrder: unsupported("Trading"),
      cancelDemoOrder: unsupported("Trading"),
      listOrders: unsupported("Trading"),
    },
    vault: {
      getVaultAssetStatus: unsupported("Vault status"),
      async getPublicEvents(input) {
        const { signal, ...query } = input ?? {};
        return client.get<{
          items: Array<{
            id: string;
            type: string;
            occurredAt: string;
            publicSummary: string;
            assetSlug: string;
          }>;
          nextCursor: string | null;
        }>("/vault/events", query, signal);
      },
      async getPublicSummary() {
        return client.get<{ authority: string; eventCount: number }>("/vault/summary");
      },
      async getPublicLive() {
        return client.get<import("@/data/repositories").VaultLiveProjection>("/vault/live");
      },
    },
    wallet: { getBalances: unsupported("Wallet"), getTransactions: unsupported("Wallet") },
    providers: {
      async getCompliance() {
        return mapCompliance(await client.get<unknown>("/me/compliance"));
      },
      async getIdentityDetails() {
        return mapIdentityDetails(await client.get<unknown>("/me/compliance/identity-details"));
      },
      async startCompliance() {
        const value = objectField(
          await client.request<unknown>("/compliance/verification-sessions", {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "compliance session",
        );
        if (
          !["NOT_STARTED", "PENDING", "APPROVED", "REVIEW", "REJECTED"].includes(
            String(value.status),
          ) ||
          !["LOCAL_TEST", "STRIPE_SANDBOX", "STRIPE_LIVE"].includes(String(value.provider))
        )
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid compliance session from service.");
        return {
          status: value.status as ComplianceSession["status"],
          identityState: [
            "NOT_STARTED",
            "REQUIRES_INPUT",
            "PROCESSING",
            "VERIFIED",
            "FAILED",
            "CANCELED",
          ].includes(String(value.identityState))
            ? (value.identityState as ComplianceSession["identityState"])
            : undefined,
          provider: value.provider as ComplianceSession["provider"],
          sessionUrl: nullableString(value.sessionUrl, "compliance.sessionUrl"),
          capability:
            value.capability === "NOT_REQUIRED_IN_CURRENT_BETA" ||
            value.capability === "NOT_CONFIGURED"
              ? value.capability
              : undefined,
        };
      },
      async createBankLinkCheckout() {
        const value = objectField(
          await client.request<unknown>("/wallet/bank-link/checkout", {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "bank connection checkout",
        );
        return {
          checkoutSessionId: stringField(
            value.checkoutSessionId,
            "bankConnection.checkoutSessionId",
          ),
          checkoutUrl: stringField(value.checkoutUrl, "bankConnection.checkoutUrl"),
          expiration: stringField(value.expiration, "bankConnection.expiration") as ISODateTime,
          paymentMethodType:
            value.paymentMethodType === "bacs_debit"
              ? "bacs_debit"
              : (() => {
                  throw new ApiError(
                    "CLIENT_CONTRACT_ERROR",
                    "Unsupported bank funding method from service.",
                  );
                })(),
          replayed: typeof value.replayed === "boolean" ? value.replayed : false,
        };
      },
      async completeBankLink(input) {
        const value = objectField(
          await client.request<unknown>("/wallet/bank-link/complete", {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "bank connection exchange",
        );
        if (!Array.isArray(value.connections) || typeof value.replayed !== "boolean")
          throw new ApiError(
            "CLIENT_CONTRACT_ERROR",
            "Invalid bank connection exchange from service.",
          );
        return { connections: value.connections.map(mapBankConnection), replayed: value.replayed };
      },
      async listBankConnections() {
        const value = objectField(
          await client.get<unknown>("/wallet/bank-accounts"),
          "bank connections",
        );
        if (!Array.isArray(value.items))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid bank connections from service.");
        return value.items.map(mapBankConnection);
      },
      async requestBankDisconnectChallenge(id) {
        const value = objectField(
          await client.request<unknown>(
            `/wallet/bank-accounts/${encodeURIComponent(id)}/disconnect/challenge`,
            {
              method: "POST",
            },
          ),
          "bank disconnect challenge",
        );
        return {
          required: Boolean(value.required),
          method: value.method === "TOTP" || value.method === "SMS" ? value.method : null,
          challenge: nullableString(value.challenge, "bankDisconnect.challenge"),
          phone: nullableString(value.phone, "bankDisconnect.phone"),
          expiresAt: nullableString(value.expiresAt, "bankDisconnect.expiresAt"),
        };
      },
      async disconnectBankConnection(input) {
        const value = objectField(
          await client.request<unknown>(`/wallet/bank-accounts/${encodeURIComponent(input.id)}`, {
            method: "DELETE",
            body: { confirmed: true, mfaCode: input.mfaCode, mfaChallenge: input.mfaChallenge },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "bank disconnect",
        );
        return {
          disconnected: Boolean(value.disconnected),
          replayed: Boolean(value.replayed),
          pendingMovementCount:
            value.pendingMovementCount === undefined
              ? undefined
              : Number(value.pendingMovementCount),
        };
      },
      async setDefaultBankConnection(id) {
        const value = objectField(
          await client.request<unknown>(`/wallet/bank-accounts/${encodeURIComponent(id)}/default`, {
            method: "PATCH",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "bank selection",
        );
        return { selected: Boolean(value.selected) };
      },
      async getConnectPayoutSetup() {
        return mapConnectPayoutSetup(await client.get<unknown>("/wallet/payouts/connect"));
      },
      async getFeePolicy() {
        return mapFeePolicy(await client.get<unknown>("/fees"));
      },
      async createConnectOnboarding() {
        return mapConnectPayoutSetup(
          await client.request<unknown>("/wallet/payouts/connect/onboarding", {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async refreshConnectOnboarding() {
        return mapConnectPayoutSetup(
          await client.request<unknown>("/wallet/payouts/connect/refresh", {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async listMovements(input) {
        return mapMovementPage(await client.get<unknown>("/wallet/movements", input));
      },
      async getWithdrawalPreflight(input) {
        return mapWithdrawalPreflight(
          await client.get<unknown>("/wallet/withdrawal-preflight", {
            amountMinor: input?.amountMinor ?? "0",
          }),
        );
      },
      async createDeposit(amountMinor) {
        return mapMovement(
          await client.request<unknown>("/wallet/deposits", {
            method: "POST",
            body: { amountMinor },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async createWithdrawal(input) {
        return mapMovement(
          await client.request<unknown>("/wallet/withdrawals", {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
    },
    notifications: {
      async listNotifications(userId) {
        const body = await client.get<{
          items: Array<{
            id: string;
            topic: string;
            title: string;
            body: string;
            createdAt: string;
            readAt: string | null;
          }>;
        }>("/me/notifications");
        return body.items.map((item) => ({
          id: item.id,
          userId,
          type: item.topic as never,
          title: item.title,
          body: item.body,
          createdAt: item.createdAt as ISODateTime,
          readAt: item.readAt as ISODateTime | undefined,
        }));
      },
      async getUnreadCount() {
        const body = await client.get<{ unreadCount: unknown }>("/me/notifications/unread-count");
        if (
          typeof body.unreadCount !== "number" ||
          !Number.isSafeInteger(body.unreadCount) ||
          body.unreadCount < 0
        )
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid unread count from service.");
        return body.unreadCount;
      },
      async markRead(id) {
        await client.request(`/me/notifications/${id}/read`, {
          method: "POST",
        });
      },
      async markAllRead() {
        await client.request("/me/notifications/read-all", {
          method: "POST",
        });
      },
    },
    discussions: {
      listDiscussions: unsupported("Discussions"),
      reactToDiscussion: unsupported("Discussions"),
    },
    proposals: {
      async getSaleProposal(id) {
        try {
          return mapSaleProposal(await client.get<unknown>(`/sale-proposals/${id}`));
        } catch (error) {
          if (error instanceof ApiError && error.status === 404) return null;
          throw error;
        }
      },
      async listSaleProposals(input) {
        return mapSaleProposalPage(await client.get<unknown>("/sale-proposals", input));
      },
      async createSaleProposal(assetId, offerMinor) {
        const value = objectField(
          await client.request<unknown>(`/assets/${assetId}/sale-proposals`, {
            method: "POST",
            body: { offerMinor },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "sale proposal creation",
        );
        return mapProposalMutation(value, "sale proposal creation");
      },
      async openSaleProposal(id) {
        const value = objectField(
          await client.request<unknown>(`/admin/sale-proposals/${id}/open`, {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "sale proposal open",
        );
        return mapProposalMutation(value, "sale proposal open");
      },
      async closeSaleProposal(id) {
        const value = objectField(
          await client.request<unknown>(`/admin/sale-proposals/${id}/close`, {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "sale proposal close",
        );
        return mapProposalMutation(value, "sale proposal close");
      },
      async vote(id, choice) {
        const value = objectField(
          await client.request<unknown>(`/sale-proposals/${id}/votes`, {
            method: "POST",
            body: { choice },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "sale proposal vote",
        );
        if (typeof value.replayed !== "boolean")
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid sale proposal vote from service.");
        return { replayed: value.replayed };
      },
    },
    auth: {
      async getSignupPolicy() {
        const value = objectField(
          await client.get<unknown>("/auth/signup-policy"),
          "signup policy",
        );
        const captcha = objectField(value.captcha, "signupPolicy.captcha");
        const consent = objectField(value.consent, "signupPolicy.consent");
        return {
          captcha: {
            required: booleanField(captcha.required, "signupPolicy.captcha.required"),
            siteKey: nullableString(captcha.siteKey, "signupPolicy.captcha.siteKey"),
            localTest: booleanField(captcha.localTest, "signupPolicy.captcha.localTest"),
          },
          consent: {
            required: booleanField(consent.required, "signupPolicy.consent.required"),
            termsVersion: nullableString(consent.termsVersion, "signupPolicy.consent.termsVersion"),
            privacyVersion: nullableString(
              consent.privacyVersion,
              "signupPolicy.consent.privacyVersion",
            ),
          },
        };
      },
      async signup(input, key) {
        const value = objectField(
          await client.request<unknown>("/auth/signup", {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": key ?? idempotencyKey() },
          }),
          "signup",
        );
        return { accessToken: stringField(value.accessToken, "signup.accessToken") };
      },
      async usernameAvailability(username) {
        const value = objectField(
          await client.get<unknown>("/auth/usernames/availability", { username }),
          "username availability",
        );
        return {
          username: stringField(value.username, "usernameAvailability.username"),
          available: booleanField(value.available, "usernameAvailability.available"),
        };
      },
    },
    users: {
      async getCurrentUser() {
        const value = objectField(await client.get<unknown>("/me"), "current user");
        const verification = value.emailVerificationStatus;
        if (verification !== "VERIFIED" && verification !== "UNVERIFIED")
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid current user from service.");
        return {
          id: stringField(value.id, "user.id"),
          email: stringField(value.email, "user.email"),
          createdAt: stringField(value.createdAt, "user.createdAt"),
          accountStatus: stringField(value.accountStatus, "user.accountStatus"),
          emailVerificationStatus: verification,
          roles: stringArrayField(value.roles, "user.roles"),
          profile: (() => {
            const profile = objectField(value.profile, "user.profile");
            const preferredCurrency = profile.preferredCurrency;
            if (
              preferredCurrency !== "GBP" &&
              preferredCurrency !== "USD" &&
              preferredCurrency !== "CAD" &&
              preferredCurrency !== "EUR"
            )
              throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid profile currency from service.");
            return {
              displayName: stringField(profile.displayName, "profile.displayName"),
              username: nullableString(profile.username, "profile.username"),
              usernameChangedAt: nullableString(
                profile.usernameChangedAt,
                "profile.usernameChangedAt",
              ),
              avatarReference: nullableString(profile.avatarReference, "profile.avatarReference"),
              countryCode: stringField(profile.countryCode, "profile.countryCode"),
              preferredCurrency,
              timezone: stringField(profile.timezone, "profile.timezone"),
            };
          })(),
        };
      },
      async updateCurrentProfile(input) {
        await client.request<unknown>("/me/profile", {
          method: "PATCH",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async getDiscordLink() {
        return client.get("/me/integrations/discord");
      },
      async beginDiscordLink() {
        return client.request("/me/integrations/discord/authorize", { method: "POST" });
      },
      async consumeDiscordBotLink(challenge) {
        return client.request("/me/integrations/discord/bot-link", {
          method: "POST",
          body: { challenge },
        });
      },
      async disconnectDiscordLink() {
        return client.request("/me/integrations/discord", { method: "DELETE" });
      },
    },
    account: {
      async getCapabilities() {
        const value = objectField(
          await client.get<unknown>("/me/capabilities"),
          "account capabilities",
        );
        if (!Array.isArray(value.capabilities))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid account capabilities from service.");
        return {
          capabilities: value.capabilities.map((raw): AccountCapability => {
            const item = objectField(raw, "account capability");
            const reason = nullableString(item.reason, "accountCapability.reason");
            if (!Array.isArray(item.requirements))
              throw new ApiError(
                "CLIENT_CONTRACT_ERROR",
                "Invalid account capability requirements from service.",
              );
            return {
              capability: stringField(
                item.capability,
                "accountCapability.capability",
              ) as AccountCapability["capability"],
              allowed: booleanField(item.allowed, "accountCapability.allowed"),
              status: (typeof item.status === "string"
                ? item.status
                : fallbackCapabilityStatus(
                    Boolean(item.allowed),
                    reason as AccountCapability["reason"],
                  )) as AccountCapability["status"],
              reason: reason as AccountCapability["reason"],
              nextAction:
                item.nextAction === undefined
                  ? null
                  : (nullableString(
                      item.nextAction,
                      "accountCapability.nextAction",
                    ) as AccountCapability["nextAction"]),
              requirements: item.requirements.map((requirement) => {
                const requirementValue = objectField(requirement, "account capability requirement");
                return {
                  type: stringField(requirementValue.type, "accountCapability.requirement.type"),
                  satisfied: booleanField(
                    requirementValue.satisfied,
                    "accountCapability.requirement.satisfied",
                  ),
                };
              }),
            };
          }),
        };
      },
      async grantCollectorBeta() {
        const value = objectField(
          await client.request<unknown>("/me/collector-beta-access", {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "collector beta access",
        );
        if (value.status !== "APPROVED" || value.role !== "COLLECTOR") {
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid collector beta access response.");
        }
        return {
          status: "APPROVED" as const,
          role: "COLLECTOR" as const,
          granted: booleanField(value.granted, "collectorBeta.granted"),
          assignmentId:
            nullableString(value.assignmentId, "collectorBeta.assignmentId") ?? undefined,
        };
      },
      async getEmailVerification() {
        const value = objectField(
          await client.get<unknown>("/me/email-verification/status"),
          "email verification",
        );
        return {
          verified: booleanField(value.verified, "emailVerification.verified"),
          verifiedAt: nullableString(value.verifiedAt, "emailVerification.verifiedAt"),
        };
      },
      async sendEmailVerification() {
        const value = objectField(
          await client.request<unknown>("/me/email-verification/send", { method: "POST" }),
          "email verification send",
        );
        return {
          alreadyVerified: booleanField(value.alreadyVerified, "emailVerification.alreadyVerified"),
          resendAvailableAt: nullableString(
            value.resendAvailableAt,
            "emailVerification.resendAvailableAt",
          ),
        };
      },
      async confirmEmailVerification(token) {
        const value = objectField(
          await client.request<unknown>("/auth/email-verification/confirm", {
            method: "POST",
            body: { token },
          }),
          "email verification confirmation",
        );
        return {
          verified: booleanField(value.verified, "emailVerification.verified"),
          verifiedAt: stringField(value.verifiedAt, "emailVerification.verifiedAt"),
        };
      },
      async getPhoneVerification() {
        const value = objectField(
          await client.get<unknown>("/me/phone-verification/status"),
          "phone verification",
        );
        return {
          phone: nullableString(value.phone, "phoneVerification.phone"),
          pendingPhone: nullableString(value.pendingPhone, "phoneVerification.pendingPhone"),
          verified: booleanField(value.verified, "phoneVerification.verified"),
          verifiedAt: nullableString(value.verifiedAt, "phoneVerification.verifiedAt"),
          canResend:
            value.canResend === undefined
              ? undefined
              : booleanField(value.canResend, "phoneVerification.canResend"),
          resendAvailableAt: nullableString(
            value.resendAvailableAt,
            "phoneVerification.resendAvailableAt",
          ),
        };
      },
      async sendPhoneVerification(phone, country) {
        const value = objectField(
          await client.request<unknown>("/me/phone-verification/send", {
            method: "POST",
            body: { phone, ...(country ? { country } : {}) },
          }),
          "phone verification send",
        );
        return {
          alreadyVerified: booleanField(value.alreadyVerified, "phoneVerification.alreadyVerified"),
          resendAvailableAt: nullableString(
            value.resendAvailableAt,
            "phoneVerification.resendAvailableAt",
          ),
        };
      },
      async confirmPhoneVerification(code) {
        const value = objectField(
          await client.request<unknown>("/me/phone-verification/confirm", {
            method: "POST",
            body: { code },
          }),
          "phone verification confirmation",
        );
        return {
          verified: booleanField(value.verified, "phoneVerification.verified"),
          verifiedAt: stringField(value.verifiedAt, "phoneVerification.verifiedAt"),
          phone: stringField(value.phone, "phoneVerification.phone"),
        };
      },
      async removePhoneVerification() {
        const value = objectField(
          await client.request<unknown>("/me/phone-verification", { method: "DELETE" }),
          "phone verification removal",
        );
        return { removed: booleanField(value.removed, "phoneVerification.removed") };
      },
      async getTwoFactor() {
        const value = objectField(await client.get<unknown>("/me/2fa/status"), "two-factor status");
        return {
          enabled: booleanField(value.enabled, "twoFactor.enabled"),
          enabledAt: nullableString(value.enabledAt, "twoFactor.enabledAt"),
          method:
            value.method === null || value.method === undefined
              ? null
              : (stringField(value.method, "twoFactor.method") as "TOTP" | "SMS"),
          methods: Array.isArray(value.methods)
            ? value.methods.map(
                (method) => stringField(method, "twoFactor.methods") as "TOTP" | "SMS",
              )
            : undefined,
          phoneVerified:
            value.phoneVerified === undefined
              ? undefined
              : booleanField(value.phoneVerified, "twoFactor.phoneVerified"),
          phone: nullableString(value.phone, "twoFactor.phone"),
        };
      },
      async beginTwoFactorEnrollment() {
        const value = objectField(
          await client.request<unknown>("/me/2fa/enroll", { method: "POST" }),
          "two-factor enrollment",
        );
        return {
          issuer: stringField(value.issuer, "twoFactor.issuer"),
          accountLabel: stringField(value.accountLabel, "twoFactor.accountLabel"),
          manualEntryKey: stringField(value.manualEntryKey, "twoFactor.manualEntryKey"),
          otpauthUri: stringField(value.otpauthUri, "twoFactor.otpauthUri"),
          expiresAt: stringField(value.expiresAt, "twoFactor.expiresAt"),
        };
      },
      async confirmTwoFactorEnrollment(code) {
        const value = objectField(
          await client.request<unknown>("/me/2fa/confirm", { method: "POST", body: { code } }),
          "two-factor confirmation",
        );
        return { recoveryCodes: stringArrayField(value.recoveryCodes, "twoFactor.recoveryCodes") };
      },
      async beginSmsTwoFactorEnrollment() {
        const value = objectField(
          await client.request<unknown>("/me/2fa/sms/enroll", { method: "POST" }),
          "SMS two-factor enrollment",
        );
        return {
          phone: stringField(value.phone, "twoFactor.phone"),
          resendAvailableAt: stringField(value.resendAvailableAt, "twoFactor.resendAvailableAt"),
        };
      },
      async confirmSmsTwoFactorEnrollment(code) {
        const value = objectField(
          await client.request<unknown>("/me/2fa/sms/confirm", { method: "POST", body: { code } }),
          "SMS two-factor confirmation",
        );
        return { recoveryCodes: stringArrayField(value.recoveryCodes, "twoFactor.recoveryCodes") };
      },
      async regenerateRecoveryCodes() {
        const value = objectField(
          await client.request<unknown>("/me/2fa/recovery-codes/regenerate", { method: "POST" }),
          "recovery-code regeneration",
        );
        return { recoveryCodes: stringArrayField(value.recoveryCodes, "twoFactor.recoveryCodes") };
      },
      async disableTwoFactor(input) {
        const value = objectField(
          await client.request<unknown>("/me/2fa/disable", { method: "POST", body: input }),
          "two-factor disable",
        );
        return { disabled: booleanField(value.disabled, "twoFactor.disabled") };
      },
      async confirmRecentAuth(password) {
        const value = objectField(
          await client.request<unknown>("/me/security/recent-auth", {
            method: "POST",
            body: { password },
          }),
          "recent authentication",
        );
        return { confirmedAt: stringField(value.confirmedAt, "recentAuth.confirmedAt") };
      },
      async listSessions() {
        const value = objectField(await client.get<unknown>("/me/sessions"), "sessions");
        if (!Array.isArray(value.sessions))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid sessions from service.");
        return {
          sessions: value.sessions.map((raw) => {
            const item = objectField(raw, "session");
            return {
              reference: stringField(item.reference, "session.reference"),
              currentSession: booleanField(item.currentSession, "session.currentSession"),
              createdAt: stringField(item.createdAt, "session.createdAt"),
              lastUsedAt: stringField(item.lastUsedAt, "session.lastUsedAt"),
              expiresAt: stringField(item.expiresAt, "session.expiresAt"),
              deviceLabel: nullableString(item.deviceLabel, "session.deviceLabel"),
            };
          }),
        };
      },
      async revokeSession(reference) {
        await client.request<void>(`/me/sessions/${encodeURIComponent(reference)}`, {
          method: "DELETE",
        });
        return { currentSessionRevoked: false };
      },
      async revokeOtherSessions() {
        const value = objectField(
          await client.request<unknown>("/me/sessions/revoke-others", { method: "POST" }),
          "other-session revoke",
        );
        if (typeof value.revokedSessionCount !== "number")
          throw new ApiError(
            "CLIENT_CONTRACT_ERROR",
            "Invalid session revoke result from service.",
          );
        return { revokedSessionCount: value.revokedSessionCount };
      },
      async getPreferences() {
        const value = objectField(await client.get<unknown>("/me/preferences"), "preferences");
        const locale = value.locale;
        if (locale !== "en-GB" && locale !== "en-US")
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid locale from service.");
        const preferredCurrency = value.preferredCurrency;
        if (
          preferredCurrency !== "GBP" &&
          preferredCurrency !== "USD" &&
          preferredCurrency !== "CAD" &&
          preferredCurrency !== "EUR"
        )
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid preferred currency from service.");
        return {
          timezone: stringField(value.timezone, "preferences.timezone"),
          locale,
          preferredCurrency,
        };
      },
      async updatePreferences(input) {
        const value = objectField(
          await client.request<unknown>("/me/preferences", {
            method: "PATCH",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "preferences",
        );
        const locale = value.locale;
        if (locale !== "en-GB" && locale !== "en-US")
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid locale from service.");
        const preferredCurrency = value.preferredCurrency;
        if (
          preferredCurrency !== "GBP" &&
          preferredCurrency !== "USD" &&
          preferredCurrency !== "CAD" &&
          preferredCurrency !== "EUR"
        )
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid preferred currency from service.");
        return {
          timezone: stringField(value.timezone, "preferences.timezone"),
          locale,
          preferredCurrency,
        };
      },
      async getNotificationPreferences() {
        return mapNotificationPreferences(
          await client.get<unknown>("/me/notifications/preferences"),
        );
      },
      async updateNotificationPreferences(preferences) {
        return mapNotificationPreferences(
          await client.request<unknown>("/me/notifications/preferences", {
            method: "PATCH",
            body: { preferences },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
      async getActivity(input) {
        const params = new URLSearchParams();
        if (input?.cursor) params.set("cursor", input.cursor);
        if (input?.limit) params.set("limit", String(input.limit));
        const value = objectField(
          await client.get<unknown>(`/me/activity${params.size ? `?${params}` : ""}`),
          "account activity",
        );
        if (!Array.isArray(value.items))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid account activity from service.");
        return {
          items: value.items.map((raw) => {
            const item = objectField(raw, "activity");
            return {
              reference: stringField(item.reference, "activity.reference"),
              type: stringField(item.type, "activity.type"),
              title: stringField(item.title, "activity.title"),
              description: stringField(item.description, "activity.description"),
              createdAt: stringField(item.createdAt, "activity.createdAt"),
            };
          }),
          nextCursor: nullableString(value.nextCursor, "activity.nextCursor"),
        };
      },
      async requestDataExport() {
        const value = objectField(
          await client.request<unknown>("/me/data-export", {
            method: "POST",
            body: { confirmation: "EXPORT_MY_DATA" },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "data export",
        );
        if (value.format !== "JSON")
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid data export from service.");
        return {
          exportedAt: stringField(value.exportedAt, "dataExport.exportedAt"),
          format: "JSON" as const,
          data: value.data,
        };
      },
      async getDeletionRequest() {
        const raw = await client.get<unknown>("/me/deletion-request");
        if (raw === null) return null;
        const value = objectField(raw, "deletion request");
        return {
          status: stringField(value.status, "deletionRequest.status"),
          requestedAt: stringField(value.requestedAt, "deletionRequest.requestedAt"),
          updatedAt: stringField(value.updatedAt, "deletionRequest.updatedAt"),
          cancelledAt: nullableString(value.cancelledAt, "deletionRequest.cancelledAt"),
          blockedReason: nullableString(value.blockedReason, "deletionRequest.blockedReason"),
          canCancel: booleanField(value.canCancel, "deletionRequest.canCancel"),
        };
      },
      async requestDeletion(input) {
        return client.request("/me/deletion-request", {
          method: "POST",
          body: { confirmation: "DELETE_MY_ACCOUNT", ...input },
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async cancelDeletion() {
        return client.request("/me/deletion-request/cancel", {
          method: "POST",
          body: {},
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async deactivate(input) {
        return client.request("/me/deactivate", {
          method: "POST",
          body: { confirmation: "DEACTIVATE_MY_ACCOUNT", ...input },
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async changePassword(input) {
        return client.request("/me/security/password", {
          method: "POST",
          body: input,
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
    },
    currency: {
      async getRates() {
        const value = objectField(await client.get<unknown>("/currency/rates"), "currency rates");
        const rates = objectField(value.rates, "currency rates.rates");
        const readRate = (currency: "GBP" | "USD" | "CAD" | "EUR") => {
          const rate = rates[currency];
          if (typeof rate !== "number" || !Number.isFinite(rate) || rate <= 0)
            throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid currency rate from service.");
          return rate;
        };
        if (value.baseCurrency !== "GBP")
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid FX base currency from service.");
        return {
          baseCurrency: "GBP" as const,
          rates: {
            GBP: readRate("GBP"),
            USD: readRate("USD"),
            CAD: readRate("CAD"),
            EUR: readRate("EUR"),
          },
          asOf: stringField(value.asOf, "currencyRates.asOf"),
          fetchedAt: stringField(value.fetchedAt, "currencyRates.fetchedAt"),
          source: stringField(value.source, "currencyRates.source"),
          cached: booleanField(value.cached, "currencyRates.cached"),
        };
      },
    },
  };
}

function fallbackCapabilityStatus(
  allowed: boolean,
  reason: AccountCapability["reason"],
): AccountCapability["status"] {
  if (allowed) return "AVAILABLE";
  if (
    reason === "FEATURE_DISABLED" ||
    reason === "TRADING_UNAVAILABLE" ||
    reason === "DEPOSITS_UNAVAILABLE" ||
    reason === "WITHDRAWALS_UNAVAILABLE"
  ) {
    return "TEMPORARILY_UNAVAILABLE";
  }
  if (
    reason === "ACCOUNT_RESTRICTED" ||
    reason === "ACCOUNT_DEACTIVATED" ||
    reason === "ACCOUNT_DELETION_PENDING" ||
    reason === "COLLECTOR_PAYOUTS_REQUIRED"
  ) {
    return "BLOCKED";
  }
  return "ACTION_REQUIRED";
}
