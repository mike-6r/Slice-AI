import {
  ConflictException,
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from '@nestjs/common';

export const REQUIRED_MEDIA_SLOTS = [
  'front',
  'back',
  'top-edge',
  'bottom-edge',
  'left-edge',
  'right-edge',
] as const;
export const AI_REQUIRED_MEDIA_SLOTS = ['front', 'back'] as const;
export const OPTIONAL_MEDIA_SLOTS = [
  'grading-label',
  'condition-detail',
  'additional-image',
] as const;
export const MEDIA_SLOTS = new Set<string>([
  ...REQUIRED_MEDIA_SLOTS,
  ...OPTIONAL_MEDIA_SLOTS,
]);
export const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 40_000_000;

export function assertMediaSlot(slot: string) {
  if (!MEDIA_SLOTS.has(slot)) {
    throw new UnprocessableEntityException({
      code: 'MEDIA_SLOT_INVALID',
      message: 'That evidence role is not supported.',
    });
  }
}

export function assertEditableStatus(status: string) {
  if (status !== 'DRAFT' && status !== 'CHANGES_REQUESTED') {
    throw new ConflictException({
      code: 'SUBMISSION_STATE_CONFLICT',
      message: 'This submission can no longer be edited.',
    });
  }
}

export function assertExpectedVersion(actual: number, expected: number) {
  if (actual !== expected) {
    throw new ConflictException({
      code: 'SUBMISSION_VERSION_CONFLICT',
      message: 'This submission has been updated. Refresh and try again.',
    });
  }
}

export function assertRequiredSafeMedia(
  media: ReadonlyArray<{
    slot: string;
    status: string;
    deletedAt?: Date | null;
  }>,
) {
  for (const slot of REQUIRED_MEDIA_SLOTS) {
    if (
      !media.some(
        (item) =>
          item.slot === slot &&
          item.status === 'SAFE' &&
          (item.deletedAt === undefined || item.deletedAt === null),
      )
    ) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_SLOT_REQUIRED',
        message: 'Required submission evidence is incomplete.',
      });
    }
  }
}

export function assertSubmissionMediaReady(
  media: ReadonlyArray<{ status: string; deletedAt?: Date | null }>,
) {
  if (
    media.some(
      (item) =>
        item.status !== 'SAFE' &&
        item.status !== 'DELETED' &&
        (item.deletedAt === undefined || item.deletedAt === null),
    )
  ) {
    throw new UnprocessableEntityException({
      code: 'MEDIA_PROCESSING',
      message: 'One uploaded photo is still processing or needs attention.',
    });
  }
}

export function assertSubmissionTerms(metadata: unknown) {
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata) ||
    (metadata as Record<string, unknown>).termsAcknowledged !== true
  ) {
    throw new UnprocessableEntityException({
      code: 'SUBMISSION_TERMS_REQUIRED',
      message:
        'Confirm the submission terms before sending this asset for review.',
    });
  }
}

export function assertSubmissionDetails(metadata: unknown) {
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata) ||
    typeof (metadata as Record<string, unknown>).name !== 'string' ||
    !(metadata as Record<string, string>).name.trim()
  ) {
    throw new UnprocessableEntityException({
      code: 'SUBMISSION_DETAILS_REQUIRED',
      message: 'Add an asset title before sending this asset for review.',
    });
  }
  assertGradeMetadata(metadata);
}

/**
 * Final server-side gate for the collector's review screen. Draft saves are
 * intentionally allowed to be incomplete; this policy is only called by the
 * submit transition so the UI can never bypass a required step.
 */
export function assertSubmissionReady(
  metadata: unknown,
  currentPreGrade?: { status: string } | null,
) {
  assertSubmissionDetails(metadata);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    throw new UnprocessableEntityException({
      code: 'SUBMISSION_DETAILS_REQUIRED',
      message: 'Complete the collectible details before sending it for review.',
    });
  }
  const value = metadata as Record<string, unknown>;
  const requiredText = ['year', 'set', 'cardNumber'] as const;
  if (
    requiredText.some(
      (key) => typeof value[key] !== 'string' || !value[key].trim(),
    )
  ) {
    throw new UnprocessableEntityException({
      code: 'SUBMISSION_DETAILS_REQUIRED',
      message:
        'Add the year, set, and card number before sending it for review.',
    });
  }
  if (
    value.marketCheckAcknowledged !== true ||
    !['FOUND', 'LIMITED', 'NO_MATCHES', 'UNAVAILABLE'].includes(
      String(value.marketCheckStatus),
    )
  ) {
    throw new UnprocessableEntityException({
      code: 'MARKET_CHECK_REQUIRED',
      message:
        'Complete the market step or acknowledge the manual-review fallback.',
    });
  }
  const offer =
    typeof value.offerIntentPercent === 'number'
      ? String(value.offerIntentPercent)
      : typeof value.offerIntentPercent === 'string'
        ? value.offerIntentPercent.trim()
        : '';
  if (
    !/^\d+(?:\.\d+)?$/.test(offer) ||
    Number(offer) <= 0 ||
    Number(offer) > 100
  ) {
    throw new UnprocessableEntityException({
      code: 'OFFER_INTENT_REQUIRED',
      message: 'Choose a valid offer percentage before sending it for review.',
    });
  }
  const grader = typeof value.grader === 'string' ? value.grader.trim() : '';
  const rawCard = !grader || grader === 'Ungraded';
  if (!rawCard && (typeof value.grade !== 'string' || !value.grade.trim())) {
    throw new UnprocessableEntityException({
      code: 'GRADE_REQUIRED',
      message:
        'Add the assigned grade before sending this collectible for review.',
    });
  }
  if (
    rawCard &&
    value.aiReviewStatus !== 'AI_REVIEW_SKIPPED' &&
    currentPreGrade?.status !== 'SUCCEEDED'
  ) {
    throw new UnprocessableEntityException({
      code: 'AI_REVIEW_REQUIRED',
      message:
        'Complete the optional AI review or choose to continue without it.',
    });
  }
}

export function assertGradeMetadata(metadata: unknown) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata))
    return;
  const value = (metadata as Record<string, unknown>).grade;
  if (
    value === undefined ||
    value === null ||
    value === '' ||
    value === 'Ungraded'
  )
    return;
  const grade = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(grade) || grade < 1 || grade > 10) {
    throw new UnprocessableEntityException({
      code: 'GRADE_INVALID',
      message: 'Enter a grading score between 1 and 10.',
    });
  }
}

export function assertMediaProperties(input: {
  mimeType: string;
  sizeBytes: number;
  magicMimeType?: string | null;
  width?: number | null;
  height?: number | null;
}) {
  if (!ALLOWED_MEDIA_TYPES.has(input.mimeType)) {
    throw new UnsupportedMediaTypeException({
      code: 'MEDIA_TYPE_UNSUPPORTED',
      message: 'That media type is not supported.',
    });
  }
  if (!Number.isSafeInteger(input.sizeBytes) || input.sizeBytes < 1) {
    throw new UnprocessableEntityException({
      code: 'MEDIA_TYPE_UNSUPPORTED',
      message: 'Media metadata is invalid.',
    });
  }
  if (input.sizeBytes > MAX_MEDIA_BYTES) {
    throw new PayloadTooLargeException({
      code: 'MEDIA_TOO_LARGE',
      message: 'The media file is too large.',
    });
  }
  if (
    input.magicMimeType !== undefined &&
    input.magicMimeType !== input.mimeType
  ) {
    throw new UnprocessableEntityException({
      code: 'MEDIA_TYPE_UNSUPPORTED',
      message: 'The uploaded media content does not match its declared type.',
    });
  }
  if (input.width !== undefined || input.height !== undefined) {
    if (
      !Number.isSafeInteger(input.width) ||
      !Number.isSafeInteger(input.height) ||
      !input.width ||
      !input.height ||
      input.width * input.height > MAX_MEDIA_PIXELS
    ) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_TYPE_UNSUPPORTED',
        message: 'The uploaded image dimensions are not supported.',
      });
    }
  }
}

/** Content inspection values are required after the object has been uploaded. */
export function assertVerifiedMediaContent(input: {
  mimeType: string;
  sizeBytes: number;
  magicMimeType: string | null;
  width: number | null;
  height: number | null;
}) {
  if (input.magicMimeType !== input.mimeType) {
    throw new UnprocessableEntityException({
      code: 'MEDIA_TYPE_UNSUPPORTED',
      message: 'The uploaded media content does not match its declared type.',
    });
  }
  assertMediaProperties(input);
}

export function assertReviewerIsNotOwner(
  ownerUserId: string,
  reviewerId: string,
) {
  if (ownerUserId === reviewerId) {
    throw new ForbiddenException({
      code: 'REVIEW_SELF_FORBIDDEN',
      message: 'A reviewer cannot review their own submission.',
    });
  }
}
