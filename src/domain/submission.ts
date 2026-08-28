import type { ISODateTime } from "./common";

/** Safe owner-facing projection of a Document 010 asset submission. */
export interface AssetSubmission {
  id: string;
  status: string;
  version: number;
  currentStep: number;
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
  previewUrl?: string | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
}

export interface SubmissionDetail extends AssetSubmission {
  media: SubmissionMedia[];
  marketResearch: MarketResearchSnapshot | null;
  preGrade?: RawCardPreGrade | null;
  certificationVerification?: CertificationVerification | null;
}

export interface CertificationVerification {
  id: string;
  companyCode: string;
  certificationNumber: string;
  normalizedCertificationNumber: string;
  status: "MANUAL_REVIEW_REQUIRED" | "VERIFIED" | "MISMATCH" | "CERT_NOT_FOUND" | string;
  verificationMode:
    "OFFICIAL_API" | "APPROVED_MACHINE_LOOKUP" | "MANUAL_OFFICIAL_LOOKUP" | "UNSUPPORTED" | string;
  officialVerificationUrl: string | null;
  verifiedGrade: string | null;
  verifiedLabel: string | null;
  designation: string | null;
  gradeEra: string | null;
  verifiedAt: ISODateTime | null;
  createdAt: ISODateTime;
}

export type RawCardPreGradeStatus =
  "IN_PROGRESS" | "SUCCEEDED" | "FAILED" | "TEMPORARILY_UNAVAILABLE" | "NOT_CONFIGURED" | "STALE";

export interface RawCardVisualization {
  side: "FRONT" | "BACK";
  type: "overview" | "centering";
  url: string | null;
  centering: Record<string, number> | null;
}

export interface RawCardPreGrade {
  id: string;
  submissionId: string;
  provider: string;
  status: RawCardPreGradeStatus;
  providerRequestId: string | null;
  overallEstimate: number | null;
  overallMin: number | null;
  overallMax: number | null;
  frontDetected: boolean | null;
  backDetected: boolean | null;
  centeringScore: number | null;
  cornerScore: number | null;
  edgeScore: number | null;
  surfaceScore: number | null;
  confidence: number | null;
  conditionLabel: string | null;
  autographDetected: boolean | null;
  categoryDetected: string | null;
  warnings: string[];
  analysisFingerprint: string;
  analyzedAt: ISODateTime | null;
  providerVersion: string | null;
  errorCode: string | null;
  supersededAt: ISODateTime | null;
  createdAt: ISODateTime;
  updatedAt: ISODateTime;
  visualizations: RawCardVisualization[];
}

export interface RawCardPreGradeResponse {
  current: RawCardPreGrade | null;
  history: RawCardPreGrade[];
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
    priceGuides?: MarketResearchRange | null;
    referenceImageUrl?: string | null;
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
  assetId: string | null;
  status: string;
  submittedAt: ISODateTime;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
}

export type ReviewQueueEvidenceStatus = "COMPLETE" | "PARTIAL" | "MISSING_REQUIRED";
export type ReviewQueueResearchStatus =
  "COMPLETED" | "IN_PROGRESS" | "PENDING" | "UNAVAILABLE" | "NOT_REQUESTED";
export type ReviewQueueReadinessState = "READY" | "NEEDS_EVIDENCE" | "MANUAL_REVIEW" | "BLOCKED";
export type ReviewQueueReviewerState =
  "UNCLAIMED" | "CLAIMED_BY_ME" | "CLAIMED_BY_OTHER" | "SELF_REVIEW_RESTRICTED";

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
    year: string | null;
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
    certificationStatus: string | null;
  };
  research: {
    status: ReviewQueueResearchStatus;
    observedAt: string | null;
  };
  reviewer: {
    state: ReviewQueueReviewerState;
    displayName: string | null;
  };
  submittedAt: ISODateTime;
  readinessState: ReviewQueueReadinessState;
  readinessReason: string;
  ageHours: number;
  overdue: boolean | null;
  testFixture: boolean;
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
    awaitingEvidence: number;
    researchPending: number;
    readyToReview: number;
    blocked: number;
    claimed: number;
    unclaimed: number;
  };
  summary: {
    awaitingEvidence: number;
    researchPending: number;
    readyToReview: number;
    blocked: number;
    claimed: number;
    unclaimed: number;
  };
  nextCursor: string | null;
}

export interface SubmissionReviewDetail extends SubmissionReviewSummary {
  version: number;
  declaredMetadata: Record<string, unknown> | null;
  media: SubmissionMedia[];
  reviews: Array<{
    id?: string;
    status: string;
    decision: string | null;
    reasonCode: string | null;
    note?: string | null;
    actor?: { displayName: string; username: string | null } | null;
    createdAt: ISODateTime;
    completedAt: ISODateTime | null;
  }>;
  marketResearch: MarketResearchSnapshot | null;
  preGrade?: RawCardPreGrade | null;
  collectorSummary?: {
    userId: string;
    displayName: string;
    username: string | null;
    membership: string | null;
    memberSince: ISODateTime;
    submissionCount: number;
    acceptedCount: number;
  };
  submissionDetails?: {
    source: string;
    itemCount: number;
    assignedTo: { id: string; displayName: string; username: string | null } | null;
  };
  collectible?: {
    title: string;
    category: string;
    set: string | null;
    variant: string | null;
    cardNumber: string | null;
    grader: string | null;
    grade: string | null;
    certificationNumber: string | null;
    year: string | null;
    manufacturer: string | null;
    thumbnailUrl: string | null;
  };
  evidenceSummary?: {
    required: number;
    presentRequired: number;
    optional: number;
    presentOptional: number;
    missingRequired: number;
    percent: number;
    status: "COMPLETE" | "PARTIAL" | "MISSING_REQUIRED";
    items: Array<{
      id: string;
      slot: string;
      status: SubmissionMedia["status"];
      required: boolean;
      mimeType: string;
      sizeBytes: number;
      uploadedAt: ISODateTime;
      thumbnailUrl: string | null;
    }>;
  };
  condition?: { overallGrade: string | null; fields: Record<string, string> };
  notableDetails?: Array<{ label: string; value: string }>;
  customerReference?: Record<string, unknown> | null;
  reviewChecklist?: Array<{ key: string; label: string; required: boolean; satisfied: boolean }>;
  activity?: Array<{
    id: string;
    action: string;
    actor: string;
    detail: string | null;
    occurredAt: ISODateTime;
  }>;
  notes?: {
    current: string | null;
    history: Array<{ id: string; author: string; note: string; createdAt: ISODateTime }>;
  };
  relatedItems?: Array<{
    id: string;
    status: string;
    title: string;
    submittedAt: ISODateTime | null;
  }>;
  certificationVerification?: {
    status: string;
    companyCode: string;
    certificationNumber: string;
    verificationMode: string;
    officialVerificationUrl: string | null;
    verifiedGrade: string | null;
    verifiedLabel: string | null;
    designation: string | null;
    verifiedAt: ISODateTime | null;
  } | null;
  reviewAssignment?: {
    state: "UNCLAIMED" | "CLAIMED_BY_ME" | "CLAIMED_BY_OTHER" | "RELEASED" | "COMPLETED";
    reviewer: { id: string; displayName: string; username: string | null } | null;
    claimedAt: ISODateTime | null;
    lastActivity: ISODateTime;
  };
  staffReview?: {
    condition: string | null;
    conditionNote: string | null;
    valuation: {
      valueMinor: string;
      currency: string;
      basis: string | null;
      confidence: number | null;
      note: string | null;
      updatedAt: ISODateTime;
    } | null;
  };
  readiness?: {
    state:
      | "READY_FOR_DECISION"
      | "CLAIM_REVIEW"
      | "REVIEWER_REQUIRED"
      | "REVIEWER_ASSIGNED"
      | "REQUIRED_ITEMS_REMAIN"
      | "WAITING_FOR_COLLECTOR"
      | "APPROVED"
      | "REJECTED";
    blockers: string[];
    requiredBlockers: string[];
    advisoryItems: Array<{ key: string; label: string; satisfied: boolean }>;
    decisionEligible: boolean;
    nextAction:
      | "CLAIM_REVIEW"
      | "WAIT_FOR_REVIEWER"
      | "COMPLETE_REQUIRED_REVIEW"
      | "READY_FOR_DECISION"
      | "WAIT_FOR_COLLECTOR"
      | "CREATE_CANONICAL_ASSET"
      | "OPEN_PHYSICAL_INTAKE"
      | "COMPLETE";
    progress: Array<{
      key: "identity" | "evidence" | "certification" | "research" | "assessment" | "decision";
      label: string;
      status: "COMPLETE" | "NEEDS_REVIEW" | "BLOCKED" | "OPTIONAL" | "NOT_APPLICABLE";
      required: boolean;
      summary: string;
    }>;
    checklist: Array<{ key: string; label: string; required: boolean; satisfied: boolean }>;
    currentValuation: string | null;
  };
  allowedActions?: {
    canClaim: boolean;
    canRelease: boolean;
    canEdit: boolean;
    canAccept: boolean;
    canRequestChanges: boolean;
    canReject: boolean;
    selfReviewForbidden: boolean;
  };
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

export interface GradingCompanyOption {
  code: string;
  name: string;
  displayName?: string;
  verificationMode?: string;
  supportsCertVerification?: boolean;
  supportsAutomatedVerification?: boolean;
  officialVerificationUrl?: string | null;
  certificationFormat?: string | null;
  gradeScaleVersion?: string;
}

export interface GradeOption {
  id?: string;
  grade: string;
  label: string;
  conditionLabel: string | null;
  designation?: string | null;
  legacy?: boolean;
  gradeEra?: string | null;
  scaleVersion?: string | null;
}

export interface CreateSubmissionDraft {
  categoryId: string;
  gradeScaleEntryId?: string | null;
  currentStep?: number;
  declaredMetadata: {
    name: string;
    manufacturer?: string;
    set?: string;
    year?: string;
    cardNumber?: string;
    edition?: string;
    language?: string;
    condition?: string;
    grader?: string;
    grade?: string;
    designation?: string;
    certificationNumber?: string;
    details?: string;
    playerOrCharacter?: string;
    variant?: string;
    inPossession?: boolean;
    provenanceNotes?: string;
    knownDefects?: string;
    termsAcknowledged?: boolean;
    marketCheckStatus?: MarketResearchSnapshot["state"];
    marketCheckAcknowledged?: boolean;
    offerIntentMode?: "25" | "50" | "75" | "100" | "CUSTOM";
    offerIntentPercent?: string;
    collectorExpectedValueMinor?: string;
    collectorExpectedCurrency?: string;
    collectorReviewerNotes?: string;
    aiReviewStatus?: "AI_REVIEW_SKIPPED";
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
  imageUrl?: string | null;
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
