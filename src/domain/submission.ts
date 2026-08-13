import type { ISODateTime } from "./common";

/** Safe owner-facing projection of a Document 010 asset submission. */
export interface AssetSubmission {
  id: string;
  status: string;
  version: number;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
  declaredMetadata: Record<string, unknown> | null;
  submittedAt: ISODateTime | null;
  reviewedAt: ISODateTime | null;
  decisionCode: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

/** Owner-safe media state. Storage keys, scanner internals and URLs never enter this model. */
export interface SubmissionMedia {
  id: string;
  slot: string;
  mimeType: string;
  sizeBytes: number;
  status: "PENDING_UPLOAD" | "UPLOADED" | "SCANNING" | "SAFE" | "REJECTED" | "DELETED";
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SubmissionDetail extends AssetSubmission {
  media: SubmissionMedia[];
  marketResearch: MarketResearchSnapshot | null;
}

export interface MarketResearchSnapshot {
  id: string;
  state: "FOUND" | "LIMITED" | "NO_MATCHES" | "UNAVAILABLE";
  dataQuality: "HIGH" | "MEDIUM" | "LOW" | null;
  identity: Record<string, unknown>;
  sourceCoverage: { available: number; unavailable: number };
  providerFailures: Array<{ provider: string; reason: string }>;
  snapshot: {
    sales: MarketResearchRange | null;
    listings: MarketResearchRange | null;
    exactCompCount: number;
    strongCompCount: number;
    rejectedCompCount: number;
    updatedAt?: string;
  };
  collectedAt: ISODateTime;
  observations: MarketResearchObservation[];
}
export interface MarketResearchRange {
  count: number;
  currency?: string;
  lowMinor?: string;
  highMinor?: string;
  medianMinor?: string;
  latestMinor?: string;
  latestAt?: string;
  mixedCurrency?: boolean;
}
export interface MarketResearchObservation {
  providerCode: string;
  externalReferenceId: string;
  externalUrl: string | null;
  observationType: "SALE" | "LISTING" | "PRICE_GUIDE";
  originalTitle: string;
  amountMinor: string;
  currency: string;
  observedAt: ISODateTime;
  soldAt: ISODateTime | null;
  grader: string | null;
  grade: string | null;
  variant: string | null;
  matchQuality: "EXACT" | "STRONG" | "WEAK" | "REJECTED";
  exclusionReason: string | null;
  includedInSnapshot: boolean;
}

export interface SubmissionReviewSummary {
  id: string;
  status: string;
  submittedAt: ISODateTime;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
}

export type ReviewQueuePriority = "HIGH" | "MEDIUM" | "LOW";
export type ReviewQueueEvidenceStatus = "COMPLETE" | "PARTIAL" | "MISSING_REQUIRED";
export type ReviewQueueResearchStatus =
  "COMPLETED" | "IN_PROGRESS" | "PENDING" | "UNAVAILABLE" | "NOT_REQUESTED";

export interface SubmissionReviewQueueItem {
  id: string;
  submissionReference: string;
  reviewState: string;
  category: string;
  collector: {
    displayName: string;
    username: string | null;
    membership: string | null;
  };
  collectible: {
    title: string;
    variant: string | null;
    set: string | null;
    grader: string | null;
    grade: string | null;
    cardNumber: string | null;
  };
  thumbnailUrl: string | null;
  evidence: {
    percent: number;
    status: ReviewQueueEvidenceStatus;
    missingRequired: number;
    presentRequired: number;
    required: number;
    itemCount: number;
  };
  research: {
    status: ReviewQueueResearchStatus;
    observedAt: string | null;
  };
  priority: ReviewQueuePriority;
  submittedAt: ISODateTime;
}

export interface SubmissionReviewQueueResponse {
  items: SubmissionReviewQueueItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  counts: {
    all: number;
    highPriority: number;
    awaitingEvidence: number;
    researchPending: number;
    readyToReview: number;
  };
  summary: {
    highPriority: number;
    awaitingEvidence: number;
    researchPending: number;
    readyToReview: number;
  };
  nextCursor: string | null;
}

export interface SubmissionReviewDetail extends SubmissionReviewSummary {
  version: number;
  declaredMetadata: Record<string, unknown> | null;
  media: SubmissionMedia[];
  reviews: Array<{
    status: string;
    decision: string | null;
    reasonCode: string | null;
    createdAt: ISODateTime;
    completedAt: ISODateTime | null;
  }>;
  marketResearch: MarketResearchSnapshot | null;
}

export interface AssetOperationSummary {
  id: string;
  publicId: string;
  title: string;
  catalogueStatus: string;
  valuationStatus: "ACTIVE" | "MISSING";
  custodyStatus: string;
  coverageStatus: "ACTIVE" | "MISSING";
  publicationStatus: string;
  updatedAt: ISODateTime;
}

export interface PublicationReadiness {
  assetId: string;
  status: "READY" | "BLOCKED";
  blockingCodes: string[];
}

export interface SubmissionCategory {
  id: string;
  slug: string;
  name: string;
  description: string | null;
}

export interface CreateSubmissionDraft {
  categoryId: string;
  declaredMetadata: {
    name: string;
    manufacturer?: string;
    set?: string;
    year?: string;
    cardNumber?: string;
    language?: string;
    condition?: string;
    grader?: string;
    grade?: string;
    certificationNumber?: string;
    details?: string;
    playerOrCharacter?: string;
    variant?: string;
    inPossession?: boolean;
    provenanceNotes?: string;
    knownDefects?: string;
    termsAcknowledged?: boolean;
    customerReference?: CustomerReference;
  };
  marketResearchId?: string;
}

/** A customer-supplied source is supporting context only. It is never a Slice valuation. */
export interface CustomerReference {
  provider: string;
  externalReferenceId: string | null;
  normalizedUrl: string;
  originalTitle: string | null;
  observedAskingPrice?: { amountMinor: string; currency: string };
  importedAt: ISODateTime;
  matchQuality: "MATCH_FOUND" | "PARTIAL_MATCH";
  extractedIdentity: Record<string, string>;
}

export interface CollectibleReferenceImport {
  status:
    "MATCH_FOUND" | "PARTIAL_MATCH" | "COULD_NOT_IDENTIFY" | "UNSUPPORTED" | "PROVIDER_UNAVAILABLE";
  message: string;
  provider: string | null;
  identity: Record<string, string>;
  customerReference: CustomerReference | null;
}

export interface UpdateSubmissionDraft extends CreateSubmissionDraft {
  version: number;
}
