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
  };
  marketResearchId?: string;
}

export interface UpdateSubmissionDraft extends CreateSubmissionDraft {
  version: number;
}
