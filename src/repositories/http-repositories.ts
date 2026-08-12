import { ApiClient, ApiError } from "@/api/http-client";
import type { AppRepositories, AssetRepository } from "@/data/repositories";
import type {
  Asset,
  AssetId,
  CollectorProfile,
  GradingCompany,
  ISODateTime,
  Money,
  ComplianceSession,
  ComplianceSummary,
  TradingExecution,
  TradingExecutionPage,
  TradingOrderInput,
  TradingOrderPage,
  TradingOrderPreview,
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
  SubmissionMedia,
  SubmissionReviewDetail,
  SubmissionReviewSummary,
  MarketResearchSnapshot,
  PublicationReadiness,
  AccountCapability,
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
  certificationNumber?: string;
  category: { slug: string; name: string };
  collectibleSet: { slug: string; name: string } | null;
  // The public API serializes decimal grades as strings to preserve their
  // canonical precision (for example, "10.00").
  grading: { companyCode: string; grade: string; label: string } | null;
  estimatedMarketValue: { minor: string; currency: "GBP" } | null;
  change24hBps: number | null;
  availabilityBps: number | null;
  ownersCount?: number | null;
  confidence: number | null;
  source: string | null;
  dataStatus: "DEMO" | "DELAYED" | "LIVE" | null;
  asOf: string | null;
  marketReference: {
    currentListing?: ExternalMarketObservationDto;
    recentCompletedSale?: ExternalMarketObservationDto;
  } | null;
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
      dataStatus: "DEMO" | "DELAYED" | "LIVE";
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
  status: "listed",
  media: [],
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
  market: {
    estimatedMarketValue: value.estimatedMarketValue
      ? {
          amount: safeMinor(value.estimatedMarketValue.minor),
          currency: value.estimatedMarketValue.currency,
        }
      : undefined,
    source: value.source ?? undefined,
    asOf: (value.asOf ?? undefined) as ISODateTime | undefined,
    confidence: value.confidence === null ? undefined : percentage(value.confidence),
    dataStatus: value.dataStatus ?? undefined,
    change24hBps: value.change24hBps ?? undefined,
    availabilityBps:
      value.availabilityBps === null || value.availabilityBps === undefined
        ? undefined
        : basisPoints(value.availabilityBps),
    ownersCount: value.ownersCount ?? undefined,
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
});

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
    expiresAt: nullableString(value.expiresAt, "compliance.expiresAt") as ISODateTime | null,
    updatedAt: nullableString(value.updatedAt, "compliance.updatedAt") as ISODateTime | null,
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
    updatedAt: stringField(value.updatedAt, "bankConnection.updatedAt") as ISODateTime,
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
    item === null ? null : objectField(item, "market research range");
  const sales = range(snapshot.sales);
  const listings = range(snapshot.listings);
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
        status: stringField(review.status, "review history.status"),
        decision: nullableString(review.decision, "review history.decision"),
        reasonCode: nullableString(review.reasonCode, "review history.reasonCode"),
        createdAt: stringField(review.createdAt, "review history.createdAt") as ISODateTime,
        completedAt: nullableString(
          review.completedAt,
          "review history.completedAt",
        ) as ISODateTime | null,
      };
    }),
    marketResearch: value.marketResearch ? mapMarketResearch(value.marketResearch) : null,
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
    },
    reviews: {
      async listQueue(input) {
        const page = objectField(
          await client.get<unknown>("/reviews/submissions", input),
          "review queue",
        );
        if (!Array.isArray(page.items))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid review queue from service.");
        return {
          items: page.items.map(mapReviewSummary),
          nextCursor: nullableString(page.nextCursor, "review queue.nextCursor"),
        };
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
          decision === "CHANGES_REQUESTED" ? "request-changes" : decision.toLowerCase();
        return mapSubmission(
          await client.request<unknown>(`/reviews/submissions/${id}/${action}`, {
            method: "POST",
            body: input,
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
        );
      },
    },
    lifecycle: {
      async listOperations() {
        const value = objectField(
          await client.get<unknown>("/admin/assets/operations"),
          "asset operations",
        );
        if (!Array.isArray(value.items))
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid asset operations from service.");
        return value.items.map(mapOperation);
      },
      async handoff(assetId) {
        return client.request(`/admin/assets/${assetId}/handoff`, {
          method: "POST",
          headers: { "Idempotency-Key": idempotencyKey() },
        });
      },
      async transitionCustody(assetId, toStatus) {
        return client.request(`/admin/assets/${assetId}/custody/transitions`, {
          method: "POST",
          body: { toStatus },
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
      getMarketSummary: unsupported("Market summary"),
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
      async updatePublicProfile(input) {
        return client.request<{
          slug: string;
          headline: string | null;
          specialism: string | null;
          isPublic: boolean;
        }>("/collector-workspace/profile", { method: "PATCH", body: input });
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
      async previewOrder(input) {
        return mapTradingPreview(
          await client.request<unknown>("/trading/orders/preview", { method: "POST", body: input }),
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
          (value.provider !== "LOCAL_TEST" && value.provider !== "PLAID")
        )
          throw new ApiError("CLIENT_CONTRACT_ERROR", "Invalid compliance session from service.");
        return {
          status: value.status as ComplianceSession["status"],
          provider: value.provider,
          sessionUrl: nullableString(value.sessionUrl, "compliance.sessionUrl"),
        };
      },
      async createBankLinkToken() {
        const value = objectField(
          await client.request<unknown>("/wallet/bank-link/token", { method: "POST" }),
          "Plaid Link token",
        );
        return {
          linkToken: stringField(value.linkToken, "plaid.linkToken"),
          expiration: stringField(value.expiration, "plaid.expiration") as ISODateTime,
        };
      },
      async exchangeBankLinkPublicToken(publicToken) {
        const value = objectField(
          await client.request<unknown>("/wallet/bank-link/exchange", {
            method: "POST",
            body: { publicToken },
            headers: { "Idempotency-Key": idempotencyKey() },
          }),
          "Plaid Link exchange",
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
            if (profile.preferredCurrency !== "GBP")
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
              preferredCurrency: "GBP" as const,
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
        return { timezone: stringField(value.timezone, "preferences.timezone"), locale };
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
        return { timezone: stringField(value.timezone, "preferences.timezone"), locale };
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
  };
}
