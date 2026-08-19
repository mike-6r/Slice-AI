import { ApiClient, ApiError } from "@/api/http-client";
import type {
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
  AdminIntakeRow,
  AdminMembershipDirectoryResponse,
  AdminMembershipRow,
  AdminRiskOperations,
  AdminComplianceDetail,
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
} from "@/data/repositories";
import type {
  Asset,
  AssetId,
  SliceGrade,
  CollectorProfile,
  GradingCompany,
  ISODateTime,
  Money,
  ComplianceSession,
  ComplianceSummary,
  ConnectPayoutSetup,
  TradingExecution,
  TradingExecutionPage,
  TradingOrderInput,
  TradingOrderPage,
  TradingOrderPreview,
  OwnershipOrderPreview,
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
  SubmissionReviewDetail,
  SubmissionReviewQueueResponse,
  SubmissionReviewSummary,
  MarketResearchSnapshot,
  CollectibleReferenceImport,
  PublicationReadiness,
  AccountCapability,
  MarketSummary,
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
type CollectorDto = {
  slug: string;
  headline: string | null;
  specialism: string | null;
  displayName: string | null;
  publishedListingCount?: number;
  publishedListings?: Array<{
    publicId: string;
    slug: string;
    title: string;
    category: string;
    market: {
      estimatedValueMinor: string;
      currency: "GBP";
      asOf: string;
      dataStatus: "DEMO" | "DELAYED" | "LIVE" | "UNAVAILABLE";
    } | null;
  }>;
};
const mapCollector = (value: CollectorDto): CollectorProfile => ({
  userId: value.slug as UserId,
  handle: value.slug,
  displayName: value.displayName ?? value.slug,
  focus: value.specialism ?? value.headline ?? "Collector profile",
  category: "mixed",
  publishedListingCount: value.publishedListingCount ?? 0,
  publishedListings: (value.publishedListings ?? []).map((listing) => ({
    assetId: listing.publicId as AssetId,
    slug: listing.slug,
    title: listing.title,
    category: listing.category,
    estimatedMarketValue: listing.market
      ? { amount: safeMinor(listing.market.estimatedValueMinor), currency: listing.market.currency }
      : undefined,
    asOf: listing.market?.asOf,
    dataStatus: listing.market?.dataStatus,
  })),
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
  status: "listed",
  media: (value.media ?? []).map((item, index) => ({
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
  };
};
const mapTradingPage = (raw: unknown): TradingOrderPage => {
  const value = objectField(raw, "orders page");
  if (!Array.isArray(value.items))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid orders page from service.");
  return {
    items: value.items.map(mapTradingOrder),
    nextCursor: nullableString(value.nextCursor, "orders.nextCursor"),
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
      side: item.side,
      units: stringField(item.units, "execution.units"),
      priceMinor: stringField(item.priceMinor, "execution.priceMinor"),
      feeMinor: stringField(item.feeMinor, "execution.feeMinor"),
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
const mapMovement = (raw: unknown): WalletMovementView => {
  const value = objectField(raw, "wallet movement");
  if (
    (value.type !== "DEPOSIT" && value.type !== "WITHDRAWAL") ||
    ![
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
    currency: "GBP",
    status: value.status as WalletMovementView["status"],
    createdAt: stringField(value.createdAt, "movement.createdAt") as ISODateTime,
    updatedAt: stringField(value.updatedAt, "movement.updatedAt") as ISODateTime,
    replayed: value.replayed,
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
    expiresAt: nullableString(value.expiresAt, "connect.expiresAt") as ISODateTime | null,
  };
};
const mapSubmission = (raw: unknown): AssetSubmission => {
  const value = objectField(raw, "submission");
  const metadata = value.declaredMetadata;
  if (metadata !== null && (typeof metadata !== "object" || Array.isArray(metadata)))
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid submission metadata from service.");
  if (!Number.isSafeInteger(value.version) || (value.version as number) < 1)
    throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid submission version from service.");
  return {
    id: stringField(value.id, "submission.id"),
    status: stringField(value.status, "submission.status"),
    version: value.version as number,
    categoryId: stringField(value.categoryId, "submission.categoryId"),
    setId: nullableString(value.setId, "submission.setId"),
    gradeScaleEntryId: nullableString(value.gradeScaleEntryId, "submission.gradeScaleEntryId"),
    declaredMetadata: metadata as Record<string, unknown> | null,
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
      const priority = stringField(item.priority, "review queue priority");
      const evidenceStatus = stringField(evidence.status, "review queue evidence.status");
      const researchStatus = stringField(research.status, "review queue research.status");
      if (!["HIGH", "MEDIUM", "LOW"].includes(priority))
        throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review queue priority.");
      if (!["COMPLETE", "PARTIAL", "MISSING_REQUIRED"].includes(evidenceStatus))
        throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review queue evidence status.");
      if (
        !["COMPLETED", "IN_PROGRESS", "PENDING", "UNAVAILABLE", "NOT_REQUESTED"].includes(
          researchStatus,
        )
      )
        throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review queue research status.");
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
        },
        research: {
          status:
            researchStatus as SubmissionReviewQueueResponse["items"][number]["research"]["status"],
          observedAt: nullableString(research.observedAt, "review queue research.observedAt"),
        },
        priority: priority as SubmissionReviewQueueResponse["items"][number]["priority"],
        submittedAt: stringField(item.submittedAt, "review queue item.submittedAt") as ISODateTime,
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
      highPriority: mapCount(counts, "highPriority"),
      awaitingEvidence: mapCount(counts, "awaitingEvidence"),
      researchPending: mapCount(counts, "researchPending"),
      readyToReview: mapCount(counts, "readyToReview"),
    },
    summary: {
      highPriority: mapCount(summary, "highPriority"),
      awaitingEvidence: mapCount(summary, "awaitingEvidence"),
      researchPending: mapCount(summary, "researchPending"),
      readyToReview: mapCount(summary, "readyToReview"),
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
        completedAt: nullableString(
          review.completedAt,
          "review history.completedAt",
        ) as ISODateTime | null,
      };
    }),
    marketResearch: value.marketResearch ? mapMarketResearch(value.marketResearch) : null,
    preGrade: value.preGrade ? mapRawCardPreGrade(value.preGrade) : null,
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
    relatedItems: Array.isArray(value.relatedItems) ? (value.relatedItems as never) : undefined,
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
  return {
    id: stringField(value.id, "admin user.id"),
    displayName: stringField(value.displayName, "admin user.displayName"),
    username: nullableString(value.username, "admin user.username"),
    email: stringField(value.email, "admin user.email"),
    primaryType,
    accountStatus: stringField(value.accountStatus, "admin user.accountStatus"),
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
  const mapMoney = (source: Record<string, unknown>, field: string) =>
    stringField(source[field] ?? "0", `admin user ${field}`);
  const mapNullableMoney = (source: Record<string, unknown>, field: string) =>
    nullableString(source[field], `admin user ${field}`);
  return {
    ...user,
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
          return {
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
      totalInvestedMinor: mapMoney(portfolioSummary, "totalInvestedMinor"),
      totalWithdrawnMinor: mapMoney(portfolioSummary, "totalWithdrawnMinor"),
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
    activitySnapshot: Array.isArray(value.activitySnapshot)
      ? value.activitySnapshot.map((rawActivity) => {
          const activity = objectField(rawActivity, "admin user activity");
          return {
            id: stringField(activity.id, "admin user activity.id"),
            action: stringField(activity.action, "admin user activity.action"),
            resourceType: stringField(activity.resourceType, "admin user activity.resourceType"),
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
    valuationStatus:
      value.valuationStatus === null
        ? null
        : nullableString(value.valuationStatus, "admin intake.valuationStatus"),
    custodyStatus:
      value.custodyStatus === null
        ? null
        : nullableString(value.custodyStatus, "admin intake.custodyStatus"),
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
    },
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
                    }
                  : null,
                mediaState: stringField(item.mediaState, "admin catalogue.mediaState"),
                verificationState: stringField(
                  item.verificationState,
                  "admin catalogue.verificationState",
                ),
                valuationState: stringField(item.valuationState, "admin catalogue.valuationState"),
                custodyState: stringField(item.custodyState, "admin catalogue.custodyState"),
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
          accepted: mapInt("accepted"),
          shipped: mapInt("shipped"),
          delivered: mapInt("delivered"),
          received: mapInt("received"),
          verified: mapInt("verified"),
          readyForVault: mapInt("readyForVault"),
          exceptions: mapInt("exceptions"),
        },
        overview: {
          all: mapInt("all"),
          accepted: mapInt("accepted"),
          shipped: mapInt("shipped"),
          delivered: mapInt("delivered"),
          received: mapInt("received"),
          verified: mapInt("verified"),
          readyForVault: mapInt("readyForVault"),
          exceptions: mapInt("exceptions"),
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
                environment?: string;
                region?: string;
                countryCode?: string;
              }>)
            : [],
          carriers: Array.isArray(filters.carriers) ? (filters.carriers as string[]) : [],
        },
      };
    },
    async setIntakeDestinationApproval(id, input) {
      const value = objectField(
        await client.request<unknown>(`/admin/intake/destinations/${id}/approval`, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "Idempotency-Key": idempotencyKey(),
          },
          body: JSON.stringify(input),
        }),
        "intake destination approval",
      );
      return {
        id: stringField(value.id, "intake destination.id"),
        displayName: stringField(value.displayName, "intake destination.displayName"),
        operationallyApproved: Boolean(value.operationallyApproved),
        acceptingShipments: Boolean(value.acceptingShipments),
        audited: Boolean(value.audited),
      };
    },
    async confirmIntakeReceipt(id) {
      const value = objectField(
        await client.request<unknown>(`/admin/intake/${id}/receipt`, {
          method: "POST",
          headers: { "Idempotency-Key": crypto.randomUUID() },
        }),
        "intake receipt",
      );
      return {
        intakeId: stringField(value.intakeId, "intake receipt.intakeId"),
        status: stringField(value.status, "intake receipt.status"),
        confirmedAt: stringField(value.confirmedAt, "intake receipt.confirmedAt"),
      };
    },
    async listMemberships(input) {
      const value = objectField(
        await client.get<unknown>("/admin/memberships", input),
        "admin memberships",
      );
      return mapAdminMembershipDirectory(value);
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
          activeUsers: Number(summary.activeUsers ?? 0),
          restricted: Number(summary.restricted ?? 0),
          pastDueMemberships: Number(summary.pastDueMemberships ?? 0),
          trialingMemberships: Number(summary.trialingMemberships ?? 0),
        },
      };
    },
    async getUser(id) {
      return mapAdminUserDetail(await client.get<unknown>(`/admin/users/${id}`));
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
    async pauseInitialOffering(id) {
      return client.request<InitialOfferingProjection>(
        `/admin/initial-offerings/${encodeURIComponent(id)}/pause`,
        { method: "POST", headers: { "Idempotency-Key": idempotencyKey() } },
      );
    },
    async cancelInitialOffering(id) {
      return client.request<InitialOfferingProjection>(
        `/admin/initial-offerings/${encodeURIComponent(id)}/cancel`,
        { method: "POST", headers: { "Idempotency-Key": idempotencyKey() } },
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
      async claim(id) {
        const response = objectField(
          await client.request<unknown>(`/reviews/submissions/${id}/claim`, {
            method: "POST",
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review claim",
        );
        return {
          submissionId: stringField(response.submissionId, "claim.submissionId"),
          status: stringField(response.status, "claim.status"),
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
            body: { note },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "review note",
        );
        return {
          submissionId: stringField(response.submissionId, "review note.submissionId"),
          updatedAt: stringField(response.updatedAt, "review note.updatedAt"),
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
      async getPriceHistory(assetId, range) {
        const backendRange = (
          { "24H": "1D", "7D": "7D", "30D": "30D", "90D": "3M", "1Y": "1Y", ALL: "ALL" } as const
        )[range];
        const body = await client.get<{
          points: Array<{
            observedAt: string;
            estimatedMarketValue: { minor: string; currency: "GBP" };
          }>;
        }>(`/market/assets/${assetId}/history`, { range: backendRange });
        return body.points.map((point) => ({
          timestamp: point.observedAt as ISODateTime,
          value: {
            amount: safeMinor(point.estimatedMarketValue.minor),
            currency: point.estimatedMarketValue.currency,
          },
        }));
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
        const body = await client.get<{ items: CollectorDto[]; nextCursor: string | null }>(
          "/collectors",
          query,
          signal,
        );
        return { items: body.items.map(mapCollector), nextCursor: body.nextCursor };
      },
      async getCollector(id) {
        const value = await client.get<CollectorDto | { error: string }>(`/collectors/${id}`);
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
        return client.request<never>(`/collector-workspace/subscription/${paths[action]}`, {
          method: "POST",
          body: planCode ? { planCode } : undefined,
        });
      },
      async listVaults() {
        return client.get<import("@/data/repositories").CollectorVaultProjection[]>(
          "/collector-workspace/vaults",
        );
      },
      async selectVault(submissionId, vaultId) {
        return client.request(
          `/collector-workspace/collectibles/${encodeURIComponent(submissionId)}/vault`,
          { method: "POST", body: { vaultId } },
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
      async disconnectBankConnection(id) {
        const value = objectField(
          await client.request<unknown>(`/wallet/bank-accounts/${encodeURIComponent(id)}`, {
            method: "DELETE",
          }),
          "bank disconnect",
        );
        return { disconnected: Boolean(value.disconnected), replayed: Boolean(value.replayed) };
      },
      async setDefaultBankConnection(id) {
        const value = objectField(
          await client.request<unknown>(`/wallet/bank-accounts/${encodeURIComponent(id)}/default`, {
            method: "PATCH",
          }),
          "bank selection",
        );
        return { selected: Boolean(value.selected) };
      },
      async getConnectPayoutSetup() {
        return mapConnectPayoutSetup(await client.get<unknown>("/wallet/payouts/connect"));
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
              reason: reason as AccountCapability["reason"],
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
          verified: booleanField(value.verified, "phoneVerification.verified"),
          verifiedAt: nullableString(value.verifiedAt, "phoneVerification.verifiedAt"),
        };
      },
      async sendPhoneVerification(phone) {
        const value = objectField(
          await client.request<unknown>("/me/phone-verification/send", {
            method: "POST",
            body: { phone },
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
      async confirmPhoneVerification(phone, code) {
        const value = objectField(
          await client.request<unknown>("/me/phone-verification/confirm", {
            method: "POST",
            body: { phone, code },
          }),
          "phone verification confirmation",
        );
        return {
          verified: booleanField(value.verified, "phoneVerification.verified"),
          verifiedAt: stringField(value.verifiedAt, "phoneVerification.verifiedAt"),
          phone: stringField(value.phone, "phoneVerification.phone"),
        };
      },
      async getTwoFactor() {
        const value = objectField(await client.get<unknown>("/me/2fa/status"), "two-factor status");
        return {
          enabled: booleanField(value.enabled, "twoFactor.enabled"),
          enabledAt: nullableString(value.enabledAt, "twoFactor.enabledAt"),
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
        };
      },
      async confirmTwoFactorEnrollment(code) {
        const value = objectField(
          await client.request<unknown>("/me/2fa/confirm", { method: "POST", body: { code } }),
          "two-factor confirmation",
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
