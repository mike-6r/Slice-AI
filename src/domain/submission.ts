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
    year?: string;
    cardNumber?: string;
    language?: string;
    condition?: string;
    grader?: string;
    grade?: string;
    certificationNumber?: string;
    details?: string;
  };
}

export interface UpdateSubmissionDraft extends CreateSubmissionDraft {
  version: number;
}
