import {
  ConflictException,
  ForbiddenException,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
  UnprocessableEntityException,
} from '@nestjs/common';

export const REQUIRED_MEDIA_SLOTS = ['front', 'back'] as const;
export const ALLOWED_MEDIA_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
]);
export const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
export const MAX_MEDIA_PIXELS = 40_000_000;

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
  media: ReadonlyArray<{ slot: string; status: string }>,
) {
  for (const slot of REQUIRED_MEDIA_SLOTS) {
    if (!media.some((item) => item.slot === slot && item.status === 'SAFE')) {
      throw new UnprocessableEntityException({
        code: 'MEDIA_SLOT_REQUIRED',
        message: 'Required submission evidence is incomplete.',
      });
    }
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
