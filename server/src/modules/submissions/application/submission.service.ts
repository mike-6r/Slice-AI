import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { AccountCapabilityService } from '../../identity/access/account-capability.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import type { IdempotencyIdentity } from '../../identity/ports/repositories';
import {
  MALWARE_SCANNER,
  OBJECT_STORAGE,
  type MalwareScannerPort,
  type ObjectStoragePort,
} from '../ports/submission-storage.ports';
import { Inject } from '@nestjs/common';
import { marketResearchIdentityHash } from '../../market-research/market-research.service';
import {
  activeCollectorSubmissionStatuses,
  billingPeriod,
  numberEntitlement,
  openCollectorSubmissionStatuses,
} from '../../collector-workspace/collector-entitlements';
import {
  assertEditableStatus,
  assertExpectedVersion,
  assertMediaProperties,
  assertRequiredSafeMedia,
  assertSubmissionDetails,
  assertSubmissionTerms,
  assertReviewerIsNotOwner,
  assertVerifiedMediaContent,
} from '../domain/submission.policy';

type Db = Prisma.TransactionClient;
type DraftInput = {
  categoryId: string;
  setId?: string | null;
  gradeScaleEntryId?: string | null;
  declaredMetadata?: Record<string, unknown> | null;
  marketResearchId?: string;
};
type UpdateInput = DraftInput & { version: number };

const metadataAllowedKeys = new Set([
  'name',
  'manufacturer',
  'set',
  'year',
  'cardNumber',
  'language',
  'condition',
  'grader',
  'grade',
  'certificationNumber',
  'details',
  'playerOrCharacter',
  'variant',
  'inPossession',
  'provenanceNotes',
  'knownDefects',
  'termsAcknowledged',
  'customerReference',
]);

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScannerPort,
    @Optional() private readonly capabilities?: AccountCapabilityService,
  ) {}

  async create(
    actor: Actor,
    input: DraftInput,
    requestId: string,
    key: string,
  ) {
    await this.capabilities?.require(actor, 'LIST_ASSET');
    await this.assertCollectorCapacity(actor);
    return this.mutate(
      actor,
      'submission.create',
      'POST',
      '/v1/submissions',
      input,
      requestId,
      key,
      async (db, audit) => {
        await this.assertReferences(db, input);
        const submission = await db.assetSubmission.create({
          data: {
            id: randomUUID(),
            ownerUserId: actor.userId,
            categoryId: input.categoryId,
            setId: input.setId ?? null,
            gradeScaleEntryId: input.gradeScaleEntryId ?? null,
            declaredMetadata: jsonMetadata(input.declaredMetadata),
          },
          include: { media: true },
        });
        if (input.marketResearchId) {
          const research = await db.submissionMarketResearch.findFirst({
            where: {
              id: input.marketResearchId,
              ownerUserId: actor.userId,
              submissionId: null,
            },
            select: { id: true, identityHash: true, submissionId: true },
          });
          if (
            !research ||
            research.identityHash !==
              marketResearchIdentityHash({
                categoryId: input.categoryId,
                declaredMetadata: input.declaredMetadata ?? {},
              })
          )
            throw new UnprocessableEntityException({
              code: 'MARKET_RESEARCH_UNAVAILABLE',
              message:
                'Refresh market research after changing the collectible identity.',
            });
          const attached = await db.submissionMarketResearch.updateMany({
            where: {
              id: input.marketResearchId,
              ownerUserId: actor.userId,
              submissionId: null,
            },
            data: { submissionId: submission.id },
          });
          if (attached.count !== 1)
            throw new UnprocessableEntityException({
              code: 'MARKET_RESEARCH_UNAVAILABLE',
              message: 'The selected market research is no longer available.',
            });
          await audit(
            'MARKET_RESEARCH_ATTACHED_TO_SUBMISSION',
            'submission',
            submission.id,
            {
              marketResearchId: input.marketResearchId,
            },
          );
        }
        await audit('SUBMISSION_DRAFT_CREATED', 'submission', submission.id, {
          version: submission.version,
        });
        return ownerProjection(submission);
      },
    );
  }

  private async assertCollectorCapacity(actor: Actor) {
    if (!actor.roles.includes('COLLECTOR') || actor.roles.includes('ADMIN'))
      return;
    const subscription = await this.prisma.collectorSubscription.findFirst({
      where: {
        userId: actor.userId,
        status: { in: ['TRIALING', 'ACTIVE', 'CANCEL_AT_PERIOD_END'] },
      },
      include: { plan: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!subscription) {
      throw new ConflictException({
        code: 'COLLECTOR_PLAN_REQUIRED',
        message:
          'An active Collector plan is required before creating a submission.',
      });
    }
    const entitlements = subscription.plan.entitlements;
    const maxActive = numberEntitlement(entitlements, 'maxActiveCollectibles');
    const maxDrafts = numberEntitlement(entitlements, 'maxOpenDrafts');
    const maxOpenSubmissions = numberEntitlement(entitlements, 'maxOpenSubmissions');
    const maxConcurrentIntake = numberEntitlement(entitlements, 'maxConcurrentIntake');
    const monthlyLimit = numberEntitlement(
      entitlements,
      'monthlySubmissionLimit',
    );
    const period = billingPeriod();
    const [active, drafts, monthly, openSubmissions, concurrentIntake] = await Promise.all([
      this.prisma.assetSubmission.count({
        where: {
          ownerUserId: actor.userId,
          status: { in: [...activeCollectorSubmissionStatuses] },
        },
      }),
      this.prisma.assetSubmission.count({
        where: { ownerUserId: actor.userId, status: { in: [...openCollectorSubmissionStatuses] } },
      }),
      this.prisma.submissionIntake.count({
        where: {
          submission: { ownerUserId: actor.userId },
          status: { in: ['VAULT_SELECTED', 'SHIPPING_REQUIRED', 'IN_TRANSIT', 'DELIVERED'] },
        },
      }),
      this.prisma.assetSubmission.count({
        where: { ownerUserId: actor.userId, status: 'DRAFT' },
      }),
      this.prisma.assetSubmission.count({
        where: {
          ownerUserId: actor.userId,
          createdAt: { gte: period.start, lt: period.end },
          status: { not: 'CANCELLED' },
        },
      }),
    ]);
    if (maxActive !== null && active >= maxActive) {
      throw new ConflictException({
        code: 'PLAN_LIMIT_REACHED',
        limitType: 'ACTIVE_COLLECTIBLES',
        current: active,
        maximum: maxActive,
        plan: subscription.plan.code,
        message: `You've reached your ${subscription.plan.displayName} catalogue limit. ${active} of ${maxActive} active collectible slots are currently in use.`,
      });
    }
    if (maxDrafts !== null && drafts >= maxDrafts) {
      throw new ConflictException({
        code: 'PLAN_LIMIT_REACHED',
        limitType: 'OPEN_DRAFTS',
        current: drafts,
        maximum: maxDrafts,
        plan: subscription.plan.code,
        message: `You've reached your ${subscription.plan.displayName} open draft limit.`,
      });
    }
    if (monthlyLimit !== null && monthly >= monthlyLimit) {
      throw new ConflictException({
        code: 'PLAN_LIMIT_REACHED',
        limitType: 'MONTHLY_SUBMISSIONS',
        current: monthly,
        maximum: monthlyLimit,
        plan: subscription.plan.code,
        message: `You've reached your ${subscription.plan.displayName} monthly submission allowance.`,
      });
    }
    if (maxOpenSubmissions !== null && openSubmissions >= maxOpenSubmissions) {
      throw new ConflictException({
        code: 'PLAN_LIMIT_REACHED',
        limitType: 'OPEN_SUBMISSIONS',
        current: openSubmissions,
        maximum: maxOpenSubmissions,
        plan: subscription.plan.code,
        message: `You've reached your ${subscription.plan.displayName} open submission limit.`,
      });
    }
    if (maxConcurrentIntake !== null && concurrentIntake >= maxConcurrentIntake) {
      throw new ConflictException({
        code: 'PLAN_LIMIT_REACHED',
        limitType: 'CONCURRENT_INTAKE',
        current: concurrentIntake,
        maximum: maxConcurrentIntake,
        plan: subscription.plan.code,
        message: `You've reached your ${subscription.plan.displayName} concurrent intake limit.`,
      });
    }
  }

  async getOwned(actor: Actor, id: string) {
    const submission = await this.prisma.assetSubmission.findFirst({
      where: { id, ownerUserId: actor.userId },
      include: {
        media: { orderBy: { slot: 'asc' } },
        marketResearch: {
          orderBy: { collectedAt: 'desc' },
          include: { observations: { orderBy: { observedAt: 'desc' } } },
        },
      },
    });
    if (!submission) this.notFound();
    return ownerProjection(submission!);
  }

  /**
   * Binds an approved submission to the catalogue asset that was created for
   * it.  This is the narrow hand-off between D10 review and D11 lifecycle;
   * publication never infers ownership from an arbitrary catalogue row.
   *
   * It is intentionally service-only for now: the staging fixture and future
   * staff workflow use the same durable, audited transition rather than
   * writing AssetSubmission.assetId directly.
   */
  linkApprovedAsset(
    actor: Actor,
    submissionId: string,
    assetId: string,
    requestId: string,
    key: string,
  ) {
    if (
      !actor.roles.some((role) => role === 'ADMIN' || role === 'ASSET_REVIEWER')
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to link an approved submission.',
      });
    }
    return this.mutate(
      actor,
      `submission.asset-link:${submissionId}`,
      'POST',
      `/v1/admin/submissions/${submissionId}/asset-link`,
      { assetId },
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "AssetSubmission" WHERE id = ${submissionId} FOR UPDATE`;
        await db.$queryRaw`SELECT id FROM "Asset" WHERE id = ${assetId} FOR UPDATE`;
        const submission = await db.assetSubmission.findUnique({
          where: { id: submissionId },
          select: { id: true, status: true, assetId: true, ownerUserId: true },
        });
        if (!submission) this.notFound();
        if (submission!.status !== 'APPROVED') {
          throw new ConflictException({
            code: 'SUBMISSION_STATE_CONFLICT',
            message: 'Only an approved submission can start asset lifecycle.',
          });
        }
        const asset = await db.asset.findUnique({
          where: { id: assetId },
          select: { id: true },
        });
        if (!asset) this.notFound();
        if (submission!.assetId && submission!.assetId !== assetId) {
          throw new ConflictException({
            code: 'SUBMISSION_STATE_CONFLICT',
            message:
              'The approved submission is already linked to another asset.',
          });
        }
        const existing = await db.assetSubmission.findFirst({
          where: { assetId, id: { not: submissionId } },
          select: { id: true },
        });
        if (existing) {
          throw new ConflictException({
            code: 'ASSET_SUBMISSION_CONFLICT',
            message: 'The asset is already linked to another submission.',
          });
        }
        const updated = await db.assetSubmission.update({
          where: { id: submissionId },
          data: { assetId },
          select: { id: true, assetId: true, ownerUserId: true },
        });
        await audit(
          'SUBMISSION_APPROVED_ASSET_LINKED',
          'submission',
          submissionId,
          {
            assetId,
            ownerUserId: updated.ownerUserId,
          },
        );
        return { submissionId: updated.id, assetId: updated.assetId! };
      },
    );
  }

  async listOwned(actor: Actor, cursor: string | undefined, limit: number) {
    const before = decodeCursor(cursor, 'submission-owner');
    const rows = await this.prisma.assetSubmission.findMany({
      where: {
        ownerUserId: actor.userId,
        ...(before
          ? {
              OR: [
                { createdAt: { lt: before.at } },
                { createdAt: before.at, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      include: {
        media: { orderBy: { slot: 'asc' } },
        marketResearch: {
          orderBy: { collectedAt: 'desc' },
          include: { observations: { orderBy: { observedAt: 'desc' } } },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const final = rows[limit - 1];
    return {
      items: rows.slice(0, limit).map(ownerProjection),
      nextCursor:
        rows.length > limit && final
          ? encodeCursor('submission-owner', final.createdAt, final.id)
          : null,
    };
  }

  update(
    actor: Actor,
    id: string,
    input: UpdateInput,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `submission.update:${id}`,
      'PATCH',
      `/v1/submissions/${id}`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const current = await this.ownerForUpdate(db, actor.userId, id);
        assertEditableStatus(current.status);
        assertExpectedVersion(current.version, input.version);
        await this.assertReferences(db, input);
        if (input.marketResearchId) {
          const research = await db.submissionMarketResearch.findFirst({
            where: {
              id: input.marketResearchId,
              ownerUserId: actor.userId,
              OR: [{ submissionId: null }, { submissionId: id }],
            },
            select: { id: true, identityHash: true, submissionId: true },
          });
          if (
            !research ||
            research.identityHash !==
              marketResearchIdentityHash({
                categoryId: input.categoryId,
                declaredMetadata: input.declaredMetadata ?? {},
              })
          )
            throw new UnprocessableEntityException({
              code: 'MARKET_RESEARCH_UNAVAILABLE',
              message:
                'Refresh market research after changing the collectible identity.',
            });
          // The record was just verified for this owner and draft above. Use a
          // single-record update here: it preserves an already-attached
          // matching snapshot and avoids a bulk relation write in the draft
          // transaction.
          if (research.submissionId === null) {
            await db.submissionMarketResearch.update({
              where: { id: research.id },
              data: { submissionId: id },
            });
          }
        }
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            categoryId: input.categoryId,
            setId: input.setId ?? null,
            gradeScaleEntryId: input.gradeScaleEntryId ?? null,
            declaredMetadata: jsonMetadata(input.declaredMetadata),
            version: { increment: 1 },
          },
          include: {
            media: { orderBy: { slot: 'asc' } },
            marketResearch: {
              orderBy: { collectedAt: 'desc' },
              include: { observations: { orderBy: { observedAt: 'desc' } } },
            },
          },
        });
        await audit('SUBMISSION_DRAFT_UPDATED', 'submission', id, {
          version: updated.version,
          ...(input.marketResearchId
            ? { marketResearchId: input.marketResearchId }
            : {}),
        });
        return ownerProjection(updated);
      },
    );
  }

  uploadIntent(
    actor: Actor,
    id: string,
    input: {
      slot: string;
      mimeType: string;
      sizeBytes: number;
      originalFilename: string;
    },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `submission.media.intent:${id}`,
      'POST',
      `/v1/submissions/${id}/media/upload-intents`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const submission = await this.ownerForUpdate(db, actor.userId, id);
        assertEditableStatus(submission.status);
        assertMediaProperties(input);
        const existing = await db.submissionMedia.findUnique({
          where: { submissionId_slot: { submissionId: id, slot: input.slot } },
        });
        if (existing && existing.status !== 'DELETED') {
          throw new ConflictException({
            code: 'SUBMISSION_STATE_CONFLICT',
            message: 'Evidence already exists for that slot.',
          });
        }
        const mediaId = existing?.id ?? randomUUID();
        const objectKey = `submissions/${actor.userId}/${id}/${randomUUID()}`;
        const expiresAt = new Date(Date.now() + 5 * 60_000);
        const intent = await this.storage.createUploadIntent({
          objectKey,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          expiresAt,
        });
        const media = existing
          ? await db.submissionMedia.update({
              where: { id: existing.id },
              data: {
                objectKey,
                originalFilename: sanitizedFilename(input.originalFilename),
                mimeType: input.mimeType,
                sizeBytes: input.sizeBytes,
                sha256: null,
                status: 'PENDING_UPLOAD',
                deletedAt: null,
                scanResultCode: null,
              },
            })
          : await db.submissionMedia.create({
              data: {
                id: mediaId,
                submissionId: id,
                slot: input.slot,
                objectKey,
                originalFilename: sanitizedFilename(input.originalFilename),
                mimeType: input.mimeType,
                sizeBytes: input.sizeBytes,
                status: 'PENDING_UPLOAD',
              },
            });
        await audit(
          'SUBMISSION_MEDIA_INTENT_CREATED',
          'submission-media',
          media.id,
          { submissionId: id, slot: media.slot },
        );
        return {
          media: mediaProjection(media),
          upload: {
            method: intent.method,
            url: intent.url,
            headers: intent.headers,
            objectKey,
            expiresAt: intent.expiresAt.toISOString(),
          },
        };
      },
    );
  }

  completeMedia(
    actor: Actor,
    id: string,
    mediaId: string,
    input: { sha256: string; version: number },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `submission.media.complete:${id}:${mediaId}`,
      'POST',
      `/v1/submissions/${id}/media/${mediaId}/complete`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const submission = await this.ownerForUpdate(db, actor.userId, id);
        assertEditableStatus(submission.status);
        assertExpectedVersion(submission.version, input.version);
        const media = await db.submissionMedia.findFirst({
          where: { id: mediaId, submissionId: id, deletedAt: null },
        });
        if (!media) this.notFound();
        if (media!.status !== 'PENDING_UPLOAD') this.stateConflict();
        const stored = await this.storage.head(media!.objectKey);
        if (!stored)
          throw new ServiceUnavailableException({
            code: 'STORAGE_UNAVAILABLE',
            message: 'Uploaded media could not be verified.',
          });
        assertVerifiedMediaContent(stored);
        if (
          stored.mimeType !== media!.mimeType ||
          stored.sizeBytes !== media!.sizeBytes ||
          stored.sha256 !== input.sha256
        ) {
          throw new UnprocessableEntityException({
            code: 'MEDIA_CHECKSUM_MISMATCH',
            message: 'Uploaded media could not be verified.',
          });
        }
        const duplicate = await db.submissionMedia.findFirst({
          where: {
            submissionId: id,
            sha256: input.sha256,
            deletedAt: null,
            id: { not: mediaId },
          },
          select: { id: true },
        });
        if (duplicate) {
          throw new ConflictException({
            code: 'SUBMISSION_STATE_CONFLICT',
            message: 'Duplicate media evidence is not permitted.',
          });
        }
        const scan = await this.scanner.scan(stored).catch(() => {
          throw new ServiceUnavailableException({
            code: 'SCANNER_UNAVAILABLE',
            message: 'Media scanning is temporarily unavailable.',
          });
        });
        const updated = await db.submissionMedia.update({
          where: { id: mediaId },
          data: {
            sha256: input.sha256,
            status: scan.safe ? 'SAFE' : 'REJECTED',
            scanResultCode: scan.reasonCode ?? null,
          },
        });
        await audit('SUBMISSION_MEDIA_COMPLETED', 'submission-media', mediaId, {
          submissionId: id,
          slot: updated.slot,
          status: updated.status,
        });
        return {
          media: mediaProjection(updated),
          submissionVersion: submission.version,
        };
      },
    );
  }

  deleteMedia(
    actor: Actor,
    id: string,
    mediaId: string,
    version: number,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `submission.media.delete:${id}:${mediaId}`,
      'DELETE',
      `/v1/submissions/${id}/media/${mediaId}`,
      { version },
      requestId,
      key,
      async (db, audit) => {
        const submission = await this.ownerForUpdate(db, actor.userId, id);
        assertEditableStatus(submission.status);
        assertExpectedVersion(submission.version, version);
        const media = await db.submissionMedia.findFirst({
          where: { id: mediaId, submissionId: id, deletedAt: null },
        });
        if (!media) this.notFound();
        const updated = await db.submissionMedia.update({
          where: { id: mediaId },
          data: { status: 'DELETED', deletedAt: new Date() },
        });
        await db.assetSubmission.update({
          where: { id },
          data: { version: { increment: 1 } },
        });
        await audit('SUBMISSION_MEDIA_DELETED', 'submission-media', mediaId, {
          submissionId: id,
          slot: media!.slot,
        });
        try {
          await this.storage.delete(media!.objectKey);
        } catch {
          /* retained DB state is authoritative; cleanup may be retried. */
        }
        return { media: mediaProjection(updated), deleted: true };
      },
    );
  }

  submit(
    actor: Actor,
    id: string,
    version: number,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `submission.submit:${id}`,
      'POST',
      `/v1/submissions/${id}/submit`,
      { version },
      requestId,
      key,
      async (db, audit) => {
        await this.ownerForUpdate(db, actor.userId, id);
        const submission = await db.assetSubmission.findUniqueOrThrow({
          where: { id },
          include: { media: true },
        });
        assertEditableStatus(submission.status);
        assertExpectedVersion(submission.version, version);
        assertSubmissionDetails(submission.declaredMetadata);
        assertSubmissionTerms(submission.declaredMetadata);
        assertRequiredSafeMedia(submission.media);
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            status: 'SUBMITTED',
            submittedAt: new Date(),
            reviewerId: null,
            decisionCode: null,
            decisionNote: null,
            version: { increment: 1 },
          },
          include: { media: { orderBy: { slot: 'asc' } } },
        });
        await audit('SUBMISSION_SUBMITTED', 'submission', id, {
          version: updated.version,
        });
        return ownerProjection(updated);
      },
    );
  }

  cancel(
    actor: Actor,
    id: string,
    version: number,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `submission.cancel:${id}`,
      'POST',
      `/v1/submissions/${id}/cancel`,
      { version },
      requestId,
      key,
      async (db, audit) => {
        const submission = await this.ownerForUpdate(db, actor.userId, id);
        if (
          !['DRAFT', 'CHANGES_REQUESTED', 'SUBMITTED'].includes(
            submission.status,
          )
        )
          this.stateConflict();
        assertExpectedVersion(submission.version, version);
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            status: 'CANCELLED',
            cancelledAt: new Date(),
            version: { increment: 1 },
          },
          include: { media: { orderBy: { slot: 'asc' } } },
        });
        await audit('SUBMISSION_CANCELLED', 'submission', id, {
          version: updated.version,
        });
        return ownerProjection(updated);
      },
    );
  }

  async queue(actor: Actor, cursor: string | undefined, limit: number) {
    const before = decodeCursor(cursor, 'review-queue');
    const isAdmin = actor.roles.includes('ADMIN');
    const rows = await this.prisma.assetSubmission.findMany({
      where: {
        ...(isAdmin
          ? { status: { in: ['SUBMITTED', 'IN_REVIEW'] } }
          : {
              OR: [
                { status: 'SUBMITTED', reviewerId: null },
                { status: 'IN_REVIEW', reviewerId: actor.userId },
              ],
            }),
        ...(before
          ? {
              OR: [
                { submittedAt: { lt: before.at } },
                { submittedAt: before.at, id: { lt: before.id } },
              ],
            }
          : {}),
      },
      orderBy: [{ submittedAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const items = rows.slice(0, limit).map(reviewProjection);
    const final = rows[limit - 1];
    return {
      items,
      nextCursor:
        rows.length > limit && final
          ? encodeCursor(
              'review-queue',
              final.submittedAt ?? final.createdAt,
              final.id,
            )
          : null,
    };
  }

  async reviewDetail(actor: Actor, id: string) {
    const submission = await this.prisma.assetSubmission.findUnique({
      where: { id },
      include: {
        media: { orderBy: { slot: 'asc' } },
        reviews: { orderBy: { createdAt: 'asc' } },
        marketResearch: {
          orderBy: { collectedAt: 'desc' },
          include: { observations: { orderBy: { observedAt: 'desc' } } },
        },
      },
    });
    if (!submission) this.notFound();
    if (
      !actor.roles.includes('ADMIN') &&
      submission!.status === 'IN_REVIEW' &&
      submission!.reviewerId !== actor.userId
    ) {
      this.notFound();
    }
    return reviewDetailProjection(submission!);
  }

  claim(actor: Actor, id: string, requestId: string, key: string) {
    return this.mutate(
      actor,
      `review.claim:${id}`,
      'POST',
      `/v1/reviews/submissions/${id}/claim`,
      {},
      requestId,
      key,
      async (db, audit) => {
        const submission = await db.assetSubmission.findUnique({
          where: { id },
        });
        if (!submission) this.notFound();
        assertReviewerIsNotOwner(submission!.ownerUserId, actor.userId);
        const claim = await db.assetSubmission.updateMany({
          where: { id, status: 'SUBMITTED', reviewerId: null },
          data: {
            status: 'IN_REVIEW',
            reviewerId: actor.userId,
            version: { increment: 1 },
          },
        });
        if (claim.count !== 1)
          throw new ConflictException({
            code: 'REVIEW_ALREADY_CLAIMED',
            message: 'This submission has already been claimed.',
          });
        const review = await db.verificationReview.create({
          data: {
            id: randomUUID(),
            submissionId: id,
            reviewerId: actor.userId,
            status: 'CLAIMED',
          },
        });
        await audit('SUBMISSION_REVIEW_CLAIMED', 'submission', id, {
          reviewId: review.id,
        });
        return { submissionId: id, reviewId: review.id, status: 'IN_REVIEW' };
      },
    );
  }

  decide(
    actor: Actor,
    id: string,
    decision: 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED',
    input: { reasonCode: string; note?: string },
    requestId: string,
    key: string,
  ) {
    const action =
      decision === 'CHANGES_REQUESTED'
        ? 'request-changes'
        : decision.toLowerCase();
    return this.mutate(
      actor,
      `review.${action}:${id}`,
      'POST',
      `/v1/reviews/submissions/${id}/${action}`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const submission = await db.assetSubmission.findUnique({
          where: { id },
          include: { media: true },
        });
        if (!submission) this.notFound();
        assertReviewerIsNotOwner(submission!.ownerUserId, actor.userId);
        if (
          submission!.status !== 'IN_REVIEW' ||
          submission!.reviewerId !== actor.userId
        )
          this.stateConflict();
        if (decision === 'APPROVED') assertRequiredSafeMedia(submission!.media);
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            status: decision,
            reviewedAt: new Date(),
            reviewerId: decision === 'CHANGES_REQUESTED' ? null : actor.userId,
            decisionCode: input.reasonCode,
            decisionNote: input.note ? redactNote(input.note) : null,
            version: { increment: 1 },
          },
          include: { media: { orderBy: { slot: 'asc' } } },
        });
        const review = await db.verificationReview.create({
          data: {
            id: randomUUID(),
            submissionId: id,
            reviewerId: actor.userId,
            status: 'COMPLETED',
            decision,
            reasonCode: input.reasonCode,
            note: input.note ? redactNote(input.note) : null,
            completedAt: new Date(),
          },
        });
        await db.notification.create({
          data: {
            id: randomUUID(),
            userId: submission!.ownerUserId,
            type: `SUBMISSION_${decision}`,
            title: 'Submission review update',
            body: 'Your submission review status has changed.',
            resourceType: 'submission',
            resourceId: id,
          },
        });
        const auditAction =
          decision === 'CHANGES_REQUESTED'
            ? 'SUBMISSION_CHANGES_REQUESTED'
            : decision === 'APPROVED'
              ? 'SUBMISSION_APPROVED'
              : 'SUBMISSION_REJECTED';
        await audit(auditAction, 'submission', id, {
          reviewId: review.id,
          reasonCode: input.reasonCode,
          version: updated.version,
        });
        return ownerProjection(updated);
      },
    );
  }

  private async mutate<T extends Record<string, unknown>>(
    actor: Actor,
    scope: string,
    method: string,
    path: string,
    body: unknown,
    requestId: string,
    key: string,
    work: (
      db: Db,
      audit: (
        action: string,
        resourceType: string,
        resourceId: string,
        metadata: Record<string, unknown>,
      ) => Promise<void>,
    ) => Promise<T>,
  ) {
    const identity: IdempotencyIdentity = {
      actorScope: `user:${actor.userId}`,
      scope,
      key,
    };
    const requestHash = createHash('sha256')
      .update(`${method}\n${path}\n${JSON.stringify(body)}`)
      .digest('hex');
    try {
      return await this.prisma.$transaction(async (db) => {
        const identityTx = createIdentityTransaction(db);
        const acquired = await identityTx.idempotency.acquire(
          identity,
          requestHash,
          new Date(Date.now() + 86_400_000),
        );
        if (acquired.state === 'FINGERPRINT_CONFLICT')
          throw new ConflictException({
            code: 'IDEMPOTENCY_KEY_CONFLICT',
            message: 'The request key cannot be reused for this operation.',
          });
        if (acquired.state === 'EXISTING_IN_PROGRESS')
          throw new ConflictException({
            code: 'PERSISTENCE_CONFLICT',
            message: 'The request is already in progress. Please retry.',
          });
        if (acquired.state === 'EXISTING_COMPLETED')
          return acquired.record.response!.body as T;
        const audit = (
          action: string,
          resourceType: string,
          resourceId: string,
          metadata: Record<string, unknown>,
        ) =>
          identityTx.audit.append({
            id: randomUUID(),
            actorUserId: actor.userId,
            actorType: 'USER',
            action,
            resourceType,
            resourceId,
            requestId,
            sessionId: actor.sessionId as never,
            result: 'SUCCESS',
            metadata,
            createdAt: new Date(),
          });
        const result = await work(db, audit);
        await identityTx.idempotency.complete(
          identity,
          { status: 200, body: result },
          new Date(),
        );
        return result;
      });
    } catch (error) {
      // Overlapping PATCH writes can make PostgreSQL abort one transaction.
      // This is an expected optimistic-concurrency outcome, not a 500.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2034'
      )
        throw new ConflictException({
          code: 'SUBMISSION_VERSION_CONFLICT',
          message: 'This submission has been updated. Refresh and try again.',
        });
      throw error;
    }
  }

  private async ownerForUpdate(
    db: Db,
    ownerUserId: string,
    id: string,
    include?: Prisma.AssetSubmissionInclude,
  ) {
    const rows = await db.$queryRaw<
      Array<{ id: string }>
    >`SELECT id FROM "AssetSubmission" WHERE id = ${id} AND "ownerUserId" = ${ownerUserId} FOR UPDATE`;
    if (rows.length !== 1) this.notFound();
    return db.assetSubmission.findUniqueOrThrow({ where: { id }, include });
  }

  private async assertReferences(db: Db, input: DraftInput) {
    const category = await db.category.findFirst({
      where: { id: input.categoryId, status: 'ACTIVE' },
    });
    if (!category)
      throw new UnprocessableEntityException({
        code: 'SUBMISSION_STATE_CONFLICT',
        message: 'The selected category is unavailable.',
      });
    if (input.setId) {
      const set = await db.collectibleSet.findFirst({
        where: {
          id: input.setId,
          categoryId: input.categoryId,
          status: 'ACTIVE',
        },
      });
      if (!set)
        throw new UnprocessableEntityException({
          code: 'SUBMISSION_STATE_CONFLICT',
          message: 'The selected set is unavailable.',
        });
    }
    if (input.gradeScaleEntryId) {
      const grade = await db.gradeScaleEntry.findFirst({
        where: {
          id: input.gradeScaleEntryId,
          active: true,
          company: { status: 'ACTIVE' },
        },
      });
      if (!grade)
        throw new UnprocessableEntityException({
          code: 'SUBMISSION_STATE_CONFLICT',
          message: 'The selected grade is unavailable.',
        });
    }
  }

  private notFound(): never {
    throw new NotFoundException({
      code: 'SUBMISSION_NOT_FOUND',
      message: 'Submission not found.',
    });
  }
  private stateConflict(): never {
    throw new ConflictException({
      code: 'SUBMISSION_STATE_CONFLICT',
      message: 'This action is not allowed for the current submission state.',
    });
  }
}

function jsonMetadata(
  value: Record<string, unknown> | null | undefined,
): Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | undefined {
  if (value === undefined) return undefined;
  if (value === null) return Prisma.JsonNull;
  for (const [key, item] of Object.entries(value)) {
    if (
      !metadataAllowedKeys.has(key) ||
      (key === 'customerReference'
        ? !isSafeCustomerReference(item)
        : !isSafeMetadata(item))
    )
      throw new UnprocessableEntityException({
        code: 'VALIDATION_FAILED',
        message: 'Submission metadata is invalid.',
      });
  }
  return value as Prisma.InputJsonValue;
}
function isSafeCustomerReference(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  const allowed = new Set([
    'provider',
    'externalReferenceId',
    'normalizedUrl',
    'originalTitle',
    'observedAskingPrice',
    'importedAt',
    'matchQuality',
    'extractedIdentity',
  ]);
  if (Object.keys(reference).some((key) => !allowed.has(key))) return false;
  return (
    typeof reference.provider === 'string' &&
    reference.provider.length <= 80 &&
    (typeof reference.externalReferenceId === 'string' ||
      reference.externalReferenceId === null) &&
    typeof reference.normalizedUrl === 'string' &&
    reference.normalizedUrl.length <= 2048 &&
    (typeof reference.originalTitle === 'string' ||
      reference.originalTitle === null) &&
    typeof reference.importedAt === 'string' &&
    (reference.matchQuality === 'MATCH_FOUND' ||
      reference.matchQuality === 'PARTIAL_MATCH') &&
    isSafeMetadata(reference.extractedIdentity) &&
    (reference.observedAskingPrice === undefined ||
      isSafeMetadata(reference.observedAskingPrice))
  );
}
function isSafeMetadata(value: unknown): boolean {
  if (typeof value === 'string') return value.length <= 500;
  if (typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (value && typeof value === 'object' && !Array.isArray(value))
    return Object.values(value as Record<string, unknown>).every(
      isSafeMetadata,
    );
  return false;
}
function sanitizedFilename(value: string) {
  return value.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 128) || 'upload';
}
function redactNote(value: string) {
  return value.trim().slice(0, 2000);
}
function mediaProjection(media: {
  id: string;
  slot: string;
  mimeType: string;
  sizeBytes: number;
  status: string;
  scanResultCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: media.id,
    slot: media.slot,
    mimeType: media.mimeType,
    sizeBytes: media.sizeBytes,
    status: media.status,
    scanResultCode: media.scanResultCode,
    createdAt: media.createdAt.toISOString(),
    updatedAt: media.updatedAt.toISOString(),
  };
}
function ownerProjection(submission: {
  id: string;
  status: string;
  version: number;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
  declaredMetadata: Prisma.JsonValue | null;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  decisionCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  media: Array<{
    id: string;
    slot: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    scanResultCode: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  marketResearch?: ResearchRow[];
}) {
  return {
    id: submission.id,
    status: submission.status,
    version: submission.version,
    categoryId: submission.categoryId,
    setId: submission.setId,
    gradeScaleEntryId: submission.gradeScaleEntryId,
    declaredMetadata: submission.declaredMetadata,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    reviewedAt: submission.reviewedAt?.toISOString() ?? null,
    decisionCode: submission.decisionCode,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    media: submission.media.map(mediaProjection),
    marketResearch: submission.marketResearch?.[0]
      ? marketResearchProjection(submission.marketResearch[0])
      : null,
  };
}
function reviewProjection(submission: {
  id: string;
  status: string;
  submittedAt: Date | null;
  createdAt: Date;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
}) {
  return {
    id: submission.id,
    status: submission.status,
    submittedAt: (submission.submittedAt ?? submission.createdAt).toISOString(),
    categoryId: submission.categoryId,
    setId: submission.setId,
    gradeScaleEntryId: submission.gradeScaleEntryId,
  };
}
type ReviewDetailRow = {
  id: string;
  status: string;
  submittedAt: Date | null;
  createdAt: Date;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
  version: number;
  declaredMetadata: Prisma.JsonValue | null;
  media: Array<{
    id: string;
    slot: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    scanResultCode: string | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  reviews: Array<{
    id: string;
    status: string;
    decision: string | null;
    reasonCode: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }>;
  marketResearch: ResearchRow[];
};
function reviewDetailProjection(submission: ReviewDetailRow) {
  return {
    ...reviewProjection(submission),
    version: submission.version,
    declaredMetadata: submission.declaredMetadata,
    media: submission.media.map(mediaProjection),
    marketResearch: submission.marketResearch[0]
      ? marketResearchProjection(submission.marketResearch[0])
      : null,
    reviews: submission.reviews.map((review) => ({
      id: review.id,
      status: review.status,
      decision: review.decision,
      reasonCode: review.reasonCode,
      createdAt: review.createdAt.toISOString(),
      completedAt: review.completedAt?.toISOString() ?? null,
    })),
  };
}
type ResearchRow = {
  id: string;
  state: string;
  dataQuality: string | null;
  identity: Prisma.JsonValue;
  sourceCoverage: Prisma.JsonValue;
  providerFailures: Prisma.JsonValue;
  snapshot: Prisma.JsonValue;
  collectedAt: Date;
  observations: Array<{
    providerCode: string;
    externalReferenceId: string;
    externalUrl: string | null;
    observationType: string;
    originalTitle: string;
    amountMinor: bigint;
    currency: string;
    observedAt: Date;
    soldAt: Date | null;
    grader: string | null;
    grade: string | null;
    variant: string | null;
    matchQuality: string;
    exclusionReason: string | null;
    includedInSnapshot: boolean;
  }>;
};
function marketResearchProjection(research: ResearchRow) {
  return {
    id: research.id,
    state: research.state,
    dataQuality: research.dataQuality,
    identity: research.identity,
    sourceCoverage: research.sourceCoverage,
    providerFailures: research.providerFailures,
    snapshot: research.snapshot,
    collectedAt: research.collectedAt.toISOString(),
    observations: research.observations.map((item) => ({
      ...item,
      amountMinor: item.amountMinor.toString(),
      observedAt: item.observedAt.toISOString(),
      soldAt: item.soldAt?.toISOString() ?? null,
    })),
  };
}
function encodeCursor(scope: string, at: Date, id: string) {
  return Buffer.from(
    JSON.stringify({ scope, at: at.toISOString(), id }),
  ).toString('base64url');
}
function decodeCursor(
  cursor: string | undefined,
  scope: string,
): { at: Date; id: string } | undefined {
  if (!cursor) return undefined;
  try {
    const value = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    const at = new Date(value.at);
    if (value.scope !== scope || !value.id || Number.isNaN(at.getTime()))
      throw new Error();
    return { at, id: String(value.id) };
  } catch {
    throw new UnprocessableEntityException({
      code: 'VALIDATION_FAILED',
      message: 'The cursor is invalid.',
    });
  }
}
