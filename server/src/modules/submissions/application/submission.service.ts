import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma, RawCardPreGradeStatus } from '@prisma/client';
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
import { collectorUsageFor } from '../../collector-workspace/collector-entitlements';
import { preGradeProjection } from './raw-card-pregrade.service';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { OutboxWriter } from '../../outbox/application/outbox-writer.service';
import { AuthorizationService } from '../../identity/access/authorization.service';
import { slugify } from '../../catalogue/domain/catalogue.types';
import {
  customerResourceEvent,
  eventType,
} from '../../outbox/domain/domain-event';
import {
  assertEditableStatus,
  assertMediaSlot,
  assertExpectedVersion,
  assertMediaProperties,
  assertRequiredSafeMedia,
  assertSubmissionMediaReady,
  assertGradeMetadata,
  assertSubmissionDetails,
  assertSubmissionReady,
  assertSubmissionTerms,
  assertReviewerIsNotOwner,
  assertVerifiedMediaContent,
  REQUIRED_MEDIA_SLOTS,
} from '../domain/submission.policy';
import {
  assertCertificationNumber,
  compareCertificationIdentity,
  normalizeCertificationNumber,
} from '../domain/grading-certification';

type Db = Prisma.TransactionClient;
type DraftInput = {
  categoryId: string;
  currentStep?: number;
  setId?: string | null;
  gradeScaleEntryId?: string | null;
  declaredMetadata?: Record<string, unknown> | null;
  marketResearchId?: string;
  preferredIntakeLocationId?: string | null;
  preferredDeliveryMethod?: 'SHIPMENT' | 'IN_PERSON' | null;
};
type UpdateInput = DraftInput & { version: number };
type IdentityCorrectionInput = {
  version: number;
  name: string;
  year: string;
  note: string;
};
type ReviewIdentityInput = {
  version: number;
  name: string;
  year?: string;
  set?: string;
  cardNumber?: string;
  variant?: string;
  note: string;
};
type ReviewFindingInput = {
  version: number;
  section: string;
  title: string;
  detail?: string;
  severity: 'ADVISORY' | 'BLOCKING';
  customerAction?: boolean;
};
type ReviewFindingStatusInput = {
  version: number;
  status: 'RESOLVED' | 'DISMISSED' | 'OPEN';
  resolutionNote?: string;
};

const metadataAllowedKeys = new Set([
  'name',
  'manufacturer',
  'set',
  'year',
  'cardNumber',
  'edition',
  'language',
  'condition',
  'grader',
  'grade',
  'certificationNumber',
  'designation',
  'certificationVerificationStatus',
  'certificationVerificationMode',
  'officialVerificationUrl',
  'certificationVerifiedGrade',
  'certificationVerifiedLabel',
  'certificationDesignation',
  'certificationVerifiedAt',
  'details',
  'playerOrCharacter',
  'variant',
  'inPossession',
  'provenanceNotes',
  'knownDefects',
  'termsAcknowledged',
  'marketCheckStatus',
  'marketCheckAcknowledged',
  'offerIntentMode',
  'offerIntentPercent',
  'collectorExpectedValueMinor',
  'collectorExpectedCurrency',
  'collectorReviewerNotes',
  'aiReviewStatus',
  'customerReference',
]);

@Injectable()
export class SubmissionService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStoragePort,
    @Inject(MALWARE_SCANNER) private readonly scanner: MalwareScannerPort,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Optional() private readonly capabilities?: AccountCapabilityService,
    private readonly outbox: OutboxWriter = new OutboxWriter(),
    @Optional() private readonly authorization?: AuthorizationService,
  ) {}

  async create(
    actor: Actor,
    input: DraftInput,
    requestId: string,
    key: string,
  ) {
    await this.capabilities?.require(actor, 'LIST_ASSET');
    return this.mutate(
      actor,
      'submission.create',
      'POST',
      '/v1/submissions',
      input,
      requestId,
      key,
      async (db, audit) => {
        // Serialize capacity checks per collector inside the write transaction.
        // This prevents two concurrent creates from both observing the same
        // remaining slot and exceeding the authoritative plan limit.
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`collector-capacity:${actor.userId}`}))`;
        await this.assertCollectorCapacity(actor, db);
        assertGradeMetadata(input.declaredMetadata);
        await this.assertReferences(db, input);
        await this.assertIntakePreference(db, input);
        const gradeReference = await this.assertGradeReference(
          db,
          input.declaredMetadata,
          input.gradeScaleEntryId,
        );
        const normalizedCertificationNumber =
          gradeReference && isRecord(input.declaredMetadata)
            ? input.declaredMetadata.certificationNumber
              ? assertCertificationNumber(
                  input.declaredMetadata.certificationNumber,
                )
              : null
            : null;
        const submission = await db.assetSubmission.create({
          data: {
            id: randomUUID(),
            ownerUserId: actor.userId,
            categoryId: input.categoryId,
            currentStep: input.currentStep ?? 1,
            setId: input.setId ?? null,
            gradeScaleEntryId: input.gradeScaleEntryId ?? null,
            normalizedCertificationNumber,
            preferredIntakeLocationId: input.preferredIntakeLocationId ?? null,
            preferredDeliveryMethod: input.preferredDeliveryMethod ?? null,
            declaredMetadata: jsonMetadata(input.declaredMetadata),
          },
          include: { media: true },
        });
        if (gradeReference && normalizedCertificationNumber) {
          await this.claimCertification(
            db,
            gradeReference.company.code,
            normalizedCertificationNumber,
            submission.id,
            null,
          );
        }
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

  private async assertCollectorCapacity(actor: Actor, db: Db) {
    if (!actor.roles.includes('COLLECTOR') || actor.roles.includes('ADMIN'))
      return;
    const subscription = await db.collectorSubscription.findFirst({
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
    const usage = await collectorUsageFor(db, actor.userId, entitlements);
    const maxActive = usage.maxActiveCollectibles;
    const maxDrafts = usage.maxOpenDrafts;
    const maxOpenSubmissions = usage.maxOpenSubmissions;
    const maxConcurrentIntake = usage.maxConcurrentIntake;
    const monthlyLimit = usage.maxMonthlySubmissions;
    const active = usage.activeCollectibles;
    const drafts = usage.openDrafts;
    const monthly = usage.monthlySubmissionsUsed;
    const openSubmissions = usage.openSubmissions;
    const concurrentIntake = usage.concurrentIntake;
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
    if (
      maxConcurrentIntake !== null &&
      concurrentIntake >= maxConcurrentIntake
    ) {
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
        certificationVerifications: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        marketResearch: {
          orderBy: { collectedAt: 'desc' },
          include: { observations: { orderBy: { observedAt: 'desc' } } },
        },
        reviewFindings: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      },
    });
    if (!submission) this.notFound();
    const projected = ownerProjection(submission!);
    const mediaById = new Map(
      submission!.media.map((media) => [media.id, media]),
    );
    return {
      ...projected,
      media: await Promise.all(
        projected.media.map(async (media) => ({
          ...media,
          previewUrl:
            media.status === 'SAFE'
              ? await this.storage
                  .createPrivateDownloadUrl(
                    mediaById.get(media.id)!.objectKey,
                    new Date(Date.now() + 5 * 60_000),
                  )
                  .catch(() => null)
              : null,
        })),
      ),
    };
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
          select: {
            id: true,
            status: true,
            assetId: true,
            ownerUserId: true,
            normalizedCertificationNumber: true,
          },
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
          select: {
            id: true,
            certificationNumber: true,
            normalizedCertificationNumber: true,
            gradeScaleEntry: {
              select: { company: { select: { code: true } } },
            },
          },
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
        if (
          asset!.certificationNumber &&
          asset!.gradeScaleEntry?.company.code
        ) {
          const normalized =
            asset!.normalizedCertificationNumber ??
            normalizeCertificationNumber(asset!.certificationNumber);
          await this.claimCertification(
            db,
            asset!.gradeScaleEntry.company.code,
            normalized,
            submission!.id,
            asset!.id,
          );
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

  /**
   * Model C canonicalization: an explicitly authorised staff action creates a
   * draft Asset and binds it to exactly one approved submission atomically.
   * It deliberately does not create custody, valuation, ownership, offering,
   * publication, or market records.
   */
  async createAndLinkCanonicalAsset(
    actor: Actor,
    submissionId: string,
    requestId: string,
    key: string,
  ) {
    await this.authorization?.authorize(actor, 'catalogue.manage');
    return this.mutate(
      actor,
      `submission.canonicalize:${submissionId}`,
      'POST',
      `/v1/admin/submissions/${submissionId}/canonicalize`,
      {},
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw`SELECT id FROM "AssetSubmission" WHERE id = ${submissionId} FOR UPDATE`;
        const submission = await db.assetSubmission.findUnique({
          where: { id: submissionId },
          select: {
            id: true,
            status: true,
            assetId: true,
            ownerUserId: true,
            categoryId: true,
            setId: true,
            gradeScaleEntryId: true,
            declaredMetadata: true,
            reviewMetadata: true,
            normalizedCertificationNumber: true,
          },
        });
        if (!submission) this.notFound();
        if (submission!.status !== 'APPROVED') {
          throw new ConflictException({
            code: 'SUBMISSION_STATE_CONFLICT',
            message:
              'Approve the submission before creating its collectible record.',
          });
        }
        if (submission!.assetId) {
          const asset = await db.asset.findUnique({
            where: { id: submission!.assetId },
            select: { id: true, publicId: true, slug: true, title: true },
          });
          if (!asset) {
            throw new ConflictException({
              code: 'CANONICAL_LINK_INTEGRITY_CONFLICT',
              message:
                'This submission has an unresolved collectible link. Resolve it before creating another record.',
            });
          }
          return {
            submissionId: submission!.id,
            assetId: asset.id,
            publicId: asset.publicId,
            slug: asset.slug,
            title: asset.title,
            replayed: true,
          };
        }
        const metadata = reviewedMetadata(submission!);
        const title =
          stringMetadata(metadata.name) ??
          stringMetadata(metadata.playerOrCharacter);
        if (!title) {
          throw new UnprocessableEntityException({
            code: 'CANONICAL_IDENTITY_INCOMPLETE',
            message:
              'Add the collectible title in review before creating its record.',
          });
        }
        const certificationNumber = stringMetadata(
          metadata.certificationNumber,
        );
        if (submission!.gradeScaleEntryId && certificationNumber) {
          const duplicate = await db.asset.findFirst({
            where: {
              gradeScaleEntryId: submission!.gradeScaleEntryId,
              certificationNumber,
            },
            select: { id: true },
          });
          if (duplicate) {
            throw new ConflictException({
              code: 'DUPLICATE_CERTIFICATION',
              message:
                'A collectible with this grading certificate already exists.',
            });
          }
        }
        const id = randomUUID();
        const publicId = `ast_${randomUUID().replace(/-/g, '')}`;
        const asset = await db.asset.create({
          data: {
            id,
            publicId,
            slug: slugify(`${title}-${id.slice(0, 8)}`) as string,
            categoryId: submission!.categoryId,
            setId: submission!.setId,
            gradeScaleEntryId: submission!.gradeScaleEntryId,
            title,
            year: numberMetadata(metadata.year),
            manufacturer: stringMetadata(metadata.manufacturer),
            edition:
              stringMetadata(metadata.variant) ??
              stringMetadata(metadata.edition),
            cardNumber: stringMetadata(metadata.cardNumber),
            certificationNumber,
            normalizedCertificationNumber: certificationNumber
              ? normalizeCertificationNumber(certificationNumber)
              : null,
            status: 'DRAFT',
          },
          select: { id: true, publicId: true, slug: true, title: true },
        });
        if (certificationNumber && submission!.gradeScaleEntryId) {
          const grade = await db.gradeScaleEntry.findUnique({
            where: { id: submission!.gradeScaleEntryId },
            select: { company: { select: { code: true } } },
          });
          if (grade)
            await this.claimCertification(
              db,
              grade.company.code,
              normalizeCertificationNumber(certificationNumber),
              submission!.id,
              asset.id,
            );
        }
        await db.assetSubmission.update({
          where: { id: submission!.id },
          data: { assetId: asset.id },
        });
        await audit(
          'CANONICAL_ASSET_CREATED_AND_LINKED',
          'submission',
          submission!.id,
          {
            assetId: asset.id,
            publicId: asset.publicId,
            ownerUserId: submission!.ownerUserId,
            source: 'EXPLICIT_STAFF_CANONICALIZATION',
          },
        );
        return {
          submissionId: submission!.id,
          assetId: asset.id,
          publicId: asset.publicId,
          slug: asset.slug,
          title: asset.title,
          replayed: false,
        };
      },
    );
  }

  async listOwned(actor: Actor, cursor: string | undefined, limit: number) {
    const before = decodeCursor(cursor, 'submission-owner');
    const rows = await this.prisma.assetSubmission.findMany({
      where: {
        ownerUserId: actor.userId,
        // Cancelled drafts remain in the database and audit log, but are
        // retired from the ordinary customer-facing listing projection.
        status: { not: 'CANCELLED' },
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
      // Beta fixture submissions are filtered below using their explicit
      // STG-* certification provenance; they are retained for audit history.
      take: Math.max(limit + 1, 100),
    });
    const visible = rows.filter(
      (row) =>
        !isBetaFixtureSubmission(
          row.declaredMetadata,
          this.config.isBeta === true,
        ),
    );
    const final = visible[limit - 1];
    return {
      items: visible.slice(0, limit).map(ownerProjection),
      nextCursor:
        visible.length > limit && final
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
        if (current.version !== input.version) {
          const sameDraft =
            current.categoryId === input.categoryId &&
            (input.currentStep === undefined ||
              current.currentStep === input.currentStep) &&
            JSON.stringify(current.declaredMetadata) ===
              JSON.stringify(input.declaredMetadata ?? null);
          if (sameDraft) {
            const latest = await db.assetSubmission.findUniqueOrThrow({
              where: { id },
              include: {
                media: { orderBy: { slot: 'asc' } },
                marketResearch: {
                  orderBy: { collectedAt: 'desc' },
                  include: {
                    observations: { orderBy: { observedAt: 'desc' } },
                  },
                },
              },
            });
            return ownerProjection(latest);
          }
          assertExpectedVersion(current.version, input.version);
        }
        assertGradeMetadata(input.declaredMetadata);
        await this.assertReferences(db, input);
        const gradeReference = await this.assertGradeReference(
          db,
          input.declaredMetadata,
          input.gradeScaleEntryId,
        );
        const normalizedCertificationNumber =
          gradeReference && isRecord(input.declaredMetadata)
            ? input.declaredMetadata.certificationNumber
              ? assertCertificationNumber(
                  input.declaredMetadata.certificationNumber,
                )
              : null
            : null;
        await db.gradingCertificationClaim.updateMany({
          where: {
            submissionId: id,
            status: 'SUBMISSION',
            ...(normalizedCertificationNumber
              ? {
                  normalizedCertificationNumber: {
                    not: normalizedCertificationNumber,
                  },
                }
              : {}),
          },
          data: { status: 'RELEASED', submissionId: null },
        });
        if (gradeReference && normalizedCertificationNumber) {
          await this.claimCertification(
            db,
            gradeReference.company.code,
            normalizedCertificationNumber,
            id,
            null,
          );
        }
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
        const wasAiReviewSkipped = isAiReviewSkipped(current.declaredMetadata);
        await this.assertIntakePreference(db, input);
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            categoryId: input.categoryId,
            ...(input.currentStep === undefined
              ? {}
              : { currentStep: input.currentStep }),
            setId: input.setId ?? null,
            gradeScaleEntryId: input.gradeScaleEntryId ?? null,
            normalizedCertificationNumber,
            preferredIntakeLocationId: input.preferredIntakeLocationId ?? null,
            preferredDeliveryMethod: input.preferredDeliveryMethod ?? null,
            declaredMetadata: jsonMetadata(input.declaredMetadata),
            version: { increment: 1 },
          },
          include: {
            media: { orderBy: { slot: 'asc' } },
            certificationVerifications: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            },
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
        if (
          input.declaredMetadata?.aiReviewStatus === 'AI_REVIEW_SKIPPED' &&
          !wasAiReviewSkipped
        ) {
          await audit('RAW_CARD_PREGRADE_SKIPPED', 'submission', id, {
            reason: 'collector_selected_skip',
          });
        }
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
        assertMediaSlot(input.slot);
        assertMediaProperties(input);
        const existing =
          input.slot === 'additional-image'
            ? null
            : await db.submissionMedia.findFirst({
                where: { submissionId: id, slot: input.slot, deletedAt: null },
                orderBy: { createdAt: 'desc' },
              });
        // A signed upload intent can expire, or completion can reject an invalid
        // file (for example duplicate evidence). In either case the media row is
        // left non-safe and must be reusable so the collector can correct the
        // evidence without staff intervention. Only accepted evidence locks a
        // required slot.
        if (existing?.status === 'SAFE') {
          throw new ConflictException({
            code: 'SUBMISSION_STATE_CONFLICT',
            message: 'Evidence already exists for that slot.',
          });
        }
        const mediaId = existing?.id ?? randomUUID();
        // Opaque deterministic key: no email, username, filename, or card metadata.
        const objectKey = `submissions/${id}/media/${mediaId}/original`;
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
        if (media!.status !== 'PENDING_UPLOAD') {
          // Upload completion can be retried after a client timeout. Treat the
          // same already-safe checksum as a successful no-op.
          if (media!.status === 'SAFE' && media!.sha256 === input.sha256) {
            return {
              media: mediaProjection(media!),
              submissionVersion: submission.version,
            };
          }
          this.stateConflict();
        }
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
        if (media!.slot === 'front' || media!.slot === 'back') {
          const stale = await db.rawCardPreGrade.updateMany({
            where: {
              submissionId: id,
              supersededAt: null,
              status: { in: ['IN_PROGRESS', 'SUCCEEDED'] },
            },
            data: { status: 'STALE' },
          });
          if (stale.count) {
            await audit('RAW_CARD_PREGRADE_INVALIDATED', 'submission', id, {
              changedSlot: media!.slot,
              invalidatedCount: stale.count,
            });
          }
        }
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

  async submit(
    actor: Actor,
    id: string,
    version: number,
    requestId: string,
    key: string,
  ) {
    await this.capabilities?.require(actor, 'LIST_ASSET');
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
          include: {
            media: true,
            preGrades: {
              where: { supersededAt: null },
              orderBy: { createdAt: 'desc' },
              take: 1,
              select: { status: true },
            },
          },
        });
        assertEditableStatus(submission.status);
        assertExpectedVersion(submission.version, version);
        const gradeReference = await this.assertGradeReference(
          db,
          submission.declaredMetadata,
          submission.gradeScaleEntryId,
          true,
        );
        assertSubmissionReady(
          submission.declaredMetadata,
          submission.preGrades[0] ?? null,
        );
        assertSubmissionTerms(submission.declaredMetadata);
        assertRequiredSafeMedia(
          submission.media,
          gradeReference
            ? [...REQUIRED_MEDIA_SLOTS, 'grading-label']
            : REQUIRED_MEDIA_SLOTS,
        );
        assertSubmissionMediaReady(submission.media);
        if (gradeReference) {
          const verification =
            await db.gradingCertificationVerification.findFirst({
              where: { submissionId: id },
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            });
          if (verification?.status !== 'VERIFIED')
            throw new UnprocessableEntityException({
              code: 'CERTIFICATION_VERIFICATION_REQUIRED',
              message:
                'Verify the slab certification through the official lookup before submitting this graded card.',
            });
          const metadata = isRecord(submission.declaredMetadata)
            ? submission.declaredMetadata
            : {};
          const normalized = normalizeCertificationNumber(
            String(metadata.certificationNumber ?? ''),
          );
          if (
            !normalized ||
            normalized !== submission.normalizedCertificationNumber
          )
            throw new ConflictException({
              code: 'CERTIFICATION_STATE_CONFLICT',
              message:
                'Refresh the certification verification before submitting.',
            });
          await this.claimCertification(
            db,
            gradeReference.company.code,
            normalized,
            id,
            null,
          );
        }
        await this.assertReferences(db, { categoryId: submission.categoryId });
        await this.assertIntakePreference(db, {
          categoryId: submission.categoryId,
          preferredIntakeLocationId: submission.preferredIntakeLocationId,
          preferredDeliveryMethod: submission.preferredDeliveryMethod,
        });
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
        await this.outbox.append(
          db,
          customerResourceEvent({
            eventType: eventType.submissionSubmitted,
            submissionId: id,
            status: 'SUBMITTED',
            actorUserId: actor.userId,
            correlationId: requestId,
            occurredAt: updated.submittedAt ?? new Date(),
          }),
        );
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
        await db.gradingCertificationClaim.updateMany({
          where: { submissionId: id, status: { not: 'ACTIVE' } },
          data: { status: 'RELEASED', submissionId: null },
        });
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

  async operationalQueue(
    actor: Actor,
    input: {
      q?: string;
      status?: 'SUBMITTED' | 'IN_REVIEW';
      evidence?: 'complete' | 'missing' | 'partial';
      research?:
        | 'completed'
        | 'in_progress'
        | 'pending'
        | 'unavailable'
        | 'not_requested';
      readiness?: 'READY' | 'NEEDS_EVIDENCE' | 'MANUAL_REVIEW' | 'BLOCKED';
      priority?: 'high' | 'medium' | 'low';
      reviewer?: 'unclaimed' | 'mine' | 'claimed';
      testFixture?: 'include' | 'only' | 'exclude';
      grader?: string;
      submittedFrom?: string;
      submittedTo?: string;
      sort?: 'submitted';
      sortDirection?: 'asc' | 'desc';
      page?: number;
      pageSize?: number;
    },
  ) {
    const isAdmin = actor.roles.includes('ADMIN');
    const submittedFrom = parseDateBoundary(input.submittedFrom, false);
    const submittedTo = parseDateBoundary(input.submittedTo, true);
    const search = input.q?.trim();
    const retiredFixture: Prisma.AssetSubmissionWhereInput = {
      declaredMetadata: { path: ['betaFixtureRetired'], equals: true },
    };
    const stagingFixtureCertification: Prisma.AssetSubmissionWhereInput = {
      declaredMetadata: {
        path: ['certificationNumber'],
        string_starts_with: 'STG-',
      },
    };
    const fixtureWhere: Prisma.AssetSubmissionWhereInput = {
      OR: [retiredFixture, stagingFixtureCertification],
    };
    // PostgreSQL JSON predicates evaluate a missing path as NULL. A bare
    // `NOT fixtureWhere` therefore excludes ordinary submissions that do not
    // carry fixture-only metadata. Treat a missing marker as non-fixture
    // explicitly, then exclude only the positive staging fixture markers.
    const nonFixtureWhere: Prisma.AssetSubmissionWhereInput = {
      AND: [
        {
          OR: [
            {
              declaredMetadata: {
                path: ['betaFixtureRetired'],
                equals: Prisma.AnyNull,
              },
            },
            { NOT: retiredFixture },
          ],
        },
        {
          OR: [
            {
              declaredMetadata: {
                path: ['certificationNumber'],
                equals: Prisma.AnyNull,
              },
            },
            { NOT: stagingFixtureCertification },
          ],
        },
      ],
    };
    const completeEvidence: Prisma.AssetSubmissionWhereInput = {
      AND: REQUIRED_MEDIA_SLOTS.map((slot) => ({
        media: { some: { slot, status: 'SAFE', deletedAt: null } },
      })),
    };
    const researchPending: Prisma.AssetSubmissionWhereInput = {
      marketResearch: {
        some: { state: { in: ['PENDING', 'IN_PROGRESS', 'PROCESSING'] } },
      },
    };
    const certificationResolved: Prisma.AssetSubmissionWhereInput = {
      OR: [
        { gradeScaleEntryId: null, normalizedCertificationNumber: null },
        {
          certificationVerifications: {
            some: { status: { in: ['VERIFIED', 'MANUAL_REVIEW'] } },
          },
        },
      ],
    };
    // Priority is projected from workflow authority rather than customer input:
    // blocked eligibility/certification or two days in queue is high priority.
    const priorityCutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const blockedForPriority: Prisma.AssetSubmissionWhereInput = {
      OR: [
        { owner: { accountStatus: { not: 'ACTIVE' } } },
        {
          AND: [
            {
              OR: [
                { gradeScaleEntryId: { not: null } },
                { normalizedCertificationNumber: { not: null } },
              ],
            },
            { NOT: certificationResolved },
          ],
        },
      ],
    };
    const highPriority: Prisma.AssetSubmissionWhereInput = {
      OR: [blockedForPriority, { submittedAt: { lte: priorityCutoff } }],
    };
    const mediumPriority: Prisma.AssetSubmissionWhereInput = {
      AND: [
        { NOT: highPriority },
        {
          OR: [
            { NOT: completeEvidence },
            researchPending,
            { status: 'IN_REVIEW' },
          ],
        },
      ],
    };
    const requestedBase: Prisma.AssetSubmissionWhereInput[] = [
      isAdmin
        ? { status: { in: ['SUBMITTED', 'IN_REVIEW'] } }
        : {
            OR: [
              { status: 'SUBMITTED', reviewerId: null },
              { status: 'IN_REVIEW', reviewerId: actor.userId },
            ],
          },
      ...(input.status ? [{ status: input.status }] : []),
      ...(submittedFrom || submittedTo
        ? [
            {
              submittedAt: {
                ...(submittedFrom ? { gte: submittedFrom } : {}),
                ...(submittedTo ? { lt: submittedTo } : {}),
              },
            },
          ]
        : []),
      ...(input.testFixture === 'only' ? [fixtureWhere] : []),
      ...(input.testFixture === 'exclude' ? [nonFixtureWhere] : []),
      ...(search
        ? [
            {
              OR: [
                { id: { contains: search, mode: 'insensitive' as const } },
                {
                  normalizedCertificationNumber: {
                    contains: search,
                    mode: 'insensitive' as const,
                  },
                },
                {
                  owner: {
                    email: { contains: search, mode: 'insensitive' as const },
                  },
                },
                {
                  owner: {
                    profile: {
                      OR: [
                        {
                          displayName: {
                            contains: search,
                            mode: 'insensitive' as const,
                          },
                        },
                        {
                          publicUsername: {
                            contains: search,
                            mode: 'insensitive' as const,
                          },
                        },
                      ],
                    },
                  },
                },
                {
                  asset: {
                    title: { contains: search, mode: 'insensitive' as const },
                  },
                },
                {
                  asset: {
                    cardNumber: {
                      contains: search,
                      mode: 'insensitive' as const,
                    },
                  },
                },
                {
                  category: {
                    name: { contains: search, mode: 'insensitive' as const },
                  },
                },
                {
                  collectibleSet: {
                    name: { contains: search, mode: 'insensitive' as const },
                  },
                },
              ],
            },
          ]
        : []),
      ...(input.grader
        ? [
            {
              OR: [
                {
                  gradeScaleEntry: {
                    company: {
                      code: {
                        contains: input.grader,
                        mode: 'insensitive' as const,
                      },
                    },
                  },
                },
                {
                  asset: {
                    gradeScaleEntry: {
                      company: {
                        code: {
                          contains: input.grader,
                          mode: 'insensitive' as const,
                        },
                      },
                    },
                  },
                },
              ],
            },
          ]
        : []),
      ...(input.reviewer === 'unclaimed'
        ? [{ status: 'SUBMITTED' as const, reviewerId: null }]
        : []),
      ...(input.reviewer === 'mine'
        ? [{ status: 'IN_REVIEW' as const, reviewerId: actor.userId }]
        : []),
      ...(input.reviewer === 'claimed'
        ? [{ status: 'IN_REVIEW' as const, reviewerId: { not: null } }]
        : []),
      ...(input.priority === 'high'
        ? [highPriority]
        : input.priority === 'medium'
          ? [mediumPriority]
          : input.priority === 'low'
            ? [{ NOT: { OR: [highPriority, mediumPriority] } }]
            : []),
    ];
    const baseWhere: Prisma.AssetSubmissionWhereInput = { AND: requestedBase };
    const withRules = (...rules: Prisma.AssetSubmissionWhereInput[]) => ({
      AND: [...requestedBase, ...rules],
    });
    const readinessRules: Record<string, Prisma.AssetSubmissionWhereInput> = {
      READY: {
        AND: [
          completeEvidence,
          certificationResolved,
          { status: 'SUBMITTED' },
          { owner: { accountStatus: 'ACTIVE' } },
        ],
      },
      NEEDS_EVIDENCE: { NOT: completeEvidence },
      MANUAL_REVIEW: { status: 'IN_REVIEW' },
      BLOCKED: {
        OR: [
          { owner: { accountStatus: { not: 'ACTIVE' } } },
          {
            AND: [
              {
                OR: [
                  { gradeScaleEntryId: { not: null } },
                  { normalizedCertificationNumber: { not: null } },
                ],
              },
              { NOT: certificationResolved },
            ],
          },
        ],
      },
    };
    const rowRules: Prisma.AssetSubmissionWhereInput[] = [];
    if (input.readiness && readinessRules[input.readiness])
      rowRules.push(readinessRules[input.readiness]);
    const rowWhere = withRules(...rowRules);
    const [
      total,
      awaitingEvidence,
      researchPendingCount,
      readyToReview,
      blocked,
      highPriorityCount,
      claimed,
      totalFiltered,
      rows,
    ] = await Promise.all([
      this.prisma.assetSubmission.count({ where: baseWhere }),
      this.prisma.assetSubmission.count({
        where: withRules({ NOT: completeEvidence }),
      }),
      this.prisma.assetSubmission.count({ where: withRules(researchPending) }),
      this.prisma.assetSubmission.count({
        where: withRules(readinessRules.READY),
      }),
      this.prisma.assetSubmission.count({
        where: withRules(readinessRules.BLOCKED),
      }),
      this.prisma.assetSubmission.count({ where: withRules(highPriority) }),
      this.prisma.assetSubmission.count({
        where: withRules({ status: 'IN_REVIEW', reviewerId: { not: null } }),
      }),
      this.prisma.assetSubmission.count({ where: rowWhere }),
      this.prisma.assetSubmission.findMany({
        where: rowWhere,
        orderBy: [
          { submittedAt: input.sortDirection === 'desc' ? 'desc' : 'asc' },
          { id: 'asc' },
        ],
        skip: Math.max(0, ((input.page ?? 1) - 1) * (input.pageSize ?? 10)),
        take: input.pageSize ?? 10,
        include: {
          owner: {
            select: {
              email: true,
              accountStatus: true,
              profile: { select: { displayName: true, publicUsername: true } },
              collectorSubscriptions: {
                where: { status: 'ACTIVE' },
                orderBy: { updatedAt: 'desc' },
                take: 1,
                select: { plan: { select: { displayName: true } } },
              },
            },
          },
          category: { select: { name: true } },
          asset: {
            select: {
              title: true,
              year: true,
              edition: true,
              cardNumber: true,
              collectibleSet: { select: { name: true } },
              gradeScaleEntry: {
                select: { label: true, company: { select: { code: true } } },
              },
            },
          },
          collectibleSet: { select: { name: true } },
          gradeScaleEntry: {
            select: { label: true, company: { select: { code: true } } },
          },
          certificationVerifications: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { status: true },
          },
          media: {
            select: {
              slot: true,
              status: true,
              deletedAt: true,
              objectKey: true,
            },
          },
          marketResearch: {
            orderBy: [{ collectedAt: 'desc' }, { id: 'desc' }],
            take: 1,
            select: { state: true, collectedAt: true },
          },
        },
      }),
    ]);
    const reviewerIds = [
      ...new Set(
        rows.flatMap((row) => (row.reviewerId ? [row.reviewerId] : [])),
      ),
    ];
    const reviewers = reviewerIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: reviewerIds } },
          select: {
            id: true,
            email: true,
            profile: { select: { displayName: true } },
          },
        })
      : [];
    const reviewerById = new Map(
      reviewers.map((reviewer) => [
        reviewer.id,
        reviewer.profile?.displayName ?? reviewer.email,
      ]),
    );
    const projected = await Promise.all(
      rows.map(async (row) => {
        const item = reviewQueueProjection(row, {
          actorUserId: actor.userId,
          reviewerDisplayName: row.reviewerId
            ? (reviewerById.get(row.reviewerId) ?? null)
            : null,
        });
        const front = row.media.find(
          (media) =>
            media.slot === 'front' &&
            media.status === 'SAFE' &&
            media.deletedAt === null,
        );
        return {
          ...item,
          thumbnailUrl: front
            ? await this.storage
                .createPrivateDownloadUrl(
                  front.objectKey,
                  new Date(Date.now() + 5 * 60_000),
                )
                .catch(() => null)
            : null,
        };
      }),
    );
    const page = input.page ?? 1;
    const pageSize = input.pageSize ?? 10;
    return {
      items: projected,
      pagination: {
        page,
        pageSize,
        total: totalFiltered,
        totalPages: Math.max(1, Math.ceil(totalFiltered / pageSize)),
      },
      counts: {
        all: total,
        awaitingEvidence,
        researchPending: researchPendingCount,
        readyToReview,
        blocked,
        highPriority: highPriorityCount,
        claimed,
        unclaimed: total - claimed,
      },
      summary: {
        awaitingEvidence,
        researchPending: researchPendingCount,
        readyToReview,
        blocked,
        highPriority: highPriorityCount,
        claimed,
        unclaimed: total - claimed,
      },
      nextCursor: projected.length
        ? encodeCursor(
            'review-queue',
            new Date(projected[projected.length - 1].submittedAt),
            projected[projected.length - 1].id,
          )
        : null,
    };
  }

  async reviewDetail(actor: Actor, id: string) {
    const submission = await this.prisma.assetSubmission.findUnique({
      where: { id },
      include: {
        media: { orderBy: { slot: 'asc' } },
        certificationVerifications: {
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        },
        preGrades: { orderBy: { createdAt: 'desc' }, take: 20 },
        reviews: {
          orderBy: { createdAt: 'asc' },
          include: {
            reviewer: {
              select: {
                id: true,
                profile: { select: { displayName: true, publicUsername: true } },
              },
            },
          },
        },
        marketResearch: {
          orderBy: { collectedAt: 'desc' },
          include: { observations: { orderBy: { observedAt: 'desc' } } },
        },
        reviewFindings: { orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] },
      },
    });
    if (!submission) this.notFound();
    const [context, reviewer, activity, related] = await Promise.all([
      this.prisma.assetSubmission.findUnique({
        where: { id },
        select: {
          owner: {
            select: {
              id: true,
              createdAt: true,
              profile: { select: { displayName: true, publicUsername: true } },
              collectorSubscriptions: {
                where: { status: 'ACTIVE' },
                orderBy: { updatedAt: 'desc' },
                take: 1,
                select: { plan: { select: { displayName: true } } },
              },
              _count: { select: { submissions: true } },
              submissions: {
                where: { status: 'APPROVED' },
                select: { id: true },
              },
            },
          },
          category: { select: { name: true } },
          collectibleSet: { select: { name: true, manufacturer: true } },
          gradeScaleEntry: {
            select: { label: true, company: { select: { code: true } } },
          },
          asset: {
            select: {
              title: true,
              year: true,
              manufacturer: true,
              edition: true,
              cardNumber: true,
              certificationNumber: true,
              collectibleSet: { select: { name: true, manufacturer: true } },
              gradeScaleEntry: {
                select: { label: true, company: { select: { code: true } } },
              },
            },
          },
        },
      }),
      submission!.reviewerId
        ? this.prisma.user.findUnique({
            where: { id: submission!.reviewerId },
            select: {
              id: true,
              profile: { select: { displayName: true, publicUsername: true } },
            },
          })
        : Promise.resolve(null),
      this.prisma.auditEvent.findMany({
        where: { resourceType: 'submission', resourceId: id },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 30,
        select: {
          id: true,
          action: true,
          actorType: true,
          metadata: true,
          createdAt: true,
          actor: {
            select: {
              profile: { select: { displayName: true, publicUsername: true } },
            },
          },
        },
      }),
      this.prisma.assetSubmission.findMany({
        where: { ownerUserId: submission!.ownerUserId, id: { not: id } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          status: true,
          submittedAt: true,
          declaredMetadata: true,
        },
      }),
    ]);
    const response = {
      ...reviewDetailProjection(submission!),
      ...reviewDetailContextProjection(
        submission!,
        context,
        reviewer,
        activity,
        related,
      ),
    };
    const currentPreGrade = submission!.preGrades.find(
      (item) => !item.supersededAt,
    );
    const safeReviewMedia = submission!.media.filter(
      (media) => media.status === 'SAFE' && media.deletedAt === null,
    );
    const signedMedia = new Map(
      await Promise.all(
        safeReviewMedia.map(
          async (media) =>
            [
              media.id,
              await this.storage
                .createPrivateDownloadUrl(
                  media.objectKey,
                  new Date(Date.now() + 5 * 60_000),
                )
                .catch(() => null),
            ] as const,
        ),
      ),
    );
    const frontMedia = safeReviewMedia.find((media) => media.slot === 'front');
    response.collectible = response.collectible
      ? {
          ...response.collectible,
          thumbnailUrl: frontMedia
            ? (signedMedia.get(frontMedia.id) ?? null)
            : null,
        }
      : response.collectible;
    response.evidenceSummary = response.evidenceSummary
      ? {
          ...response.evidenceSummary,
          items: response.evidenceSummary.items.map((item) => ({
            ...item,
            thumbnailUrl: signedMedia.get(item.id) ?? null,
          })),
        }
      : response.evidenceSummary;
    if (response.preGrade && currentPreGrade) {
      response.preGrade.visualizations = await Promise.all(
        (Array.isArray(currentPreGrade.visualizations)
          ? currentPreGrade.visualizations
          : []
        )
          .filter(isPersistedPreGradeVisualization)
          .map(async (visualization) => ({
            side: visualization.side,
            type: visualization.type,
            url: await this.storage
              .createPrivateDownloadUrl(
                visualization.objectKey,
                new Date(Date.now() + 5 * 60_000),
              )
              .catch(() => null),
            centering: visualization.centering ?? null,
          })),
      );
    }
    const latestConditionReview = [...submission!.reviews]
      .reverse()
      .find((review) => Boolean(review.staffCondition));
    const latestValuationReview = [...submission!.reviews]
      .reverse()
      .find((review) => Boolean(review.valuationMinor));
    const primaryAssignmentReview = submission!.reviewerId
      ? [...submission!.reviews]
          .reverse()
          .find(
            (review) =>
              review.reviewerId === submission!.reviewerId &&
              review.status === 'CLAIMED',
          )
      : null;
    const contributors = Array.from(
      new Map(
        submission!.reviews.map((review) => [
          review.reviewerId,
          {
            id: review.reviewerId,
            displayName: review.reviewer.profile?.displayName ?? 'Reviewer',
            username: review.reviewer.profile?.publicUsername ?? null,
            lastContributedAt: review.updatedAt.toISOString(),
          },
        ]),
      ).values(),
    );
    const safeMediaCount = submission!.media.filter(
      (media) =>
        REQUIRED_MEDIA_SLOTS.includes(media.slot as never) &&
        media.status === 'SAFE' &&
        media.deletedAt === null,
    ).length;
    const certification = submission!.certificationVerifications[0] ?? null;
    const identityConfirmed = Boolean(
      response.collectible?.title &&
      response.collectible.title !== 'Untitled submission',
    );
    const evidenceComplete = safeMediaCount === REQUIRED_MEDIA_SLOTS.length;
    const certificationResolved =
      !response.collectible?.grader ||
      !response.collectible.certificationNumber ||
      certification?.status === 'VERIFIED' ||
      certification?.status === 'MANUAL_REVIEW';
    const openFindings = submission!.reviewFindings.filter(
      (finding) => finding.status === 'OPEN',
    );
    const blockingFindings = openFindings.filter(
      (finding) => finding.severity === 'BLOCKING',
    );
    const blockers = [
      ...(identityConfirmed ? [] : ['Collectible identity is incomplete.']),
      ...(evidenceComplete
        ? []
        : [
            `${REQUIRED_MEDIA_SLOTS.length - safeMediaCount} required evidence item(s) missing.`,
          ]),
      ...(certificationResolved
        ? []
        : ['Certification verification requires review.']),
      ...blockingFindings.map((finding) => finding.title),
    ];
    const selfReviewForbidden = submission!.ownerUserId === actor.userId;
    const canContribute =
      !selfReviewForbidden && submission!.status === 'IN_REVIEW';
    const decisionEligible = canContribute && blockers.length === 0;
    const advisoryItems = [
      {
        key: 'research',
        label: 'Market research reference',
        satisfied:
          !response.marketResearch ||
          !['PENDING', 'IN_PROGRESS'].includes(response.marketResearch.state),
      },
      {
        key: 'condition',
        label: 'Staff condition recorded',
        satisfied: Boolean(latestConditionReview?.staffCondition),
      },
      {
        key: 'valuation',
        label: 'Staff valuation recorded',
        satisfied: Boolean(latestValuationReview?.valuationMinor),
      },
    ];
    const reviewAssignmentState =
      submission!.status === 'IN_REVIEW'
        ? submission!.reviewerId === actor.userId
          ? 'CLAIMED_BY_ME'
          : submission!.reviewerId
            ? 'CLAIMED_BY_OTHER'
            : 'UNCLAIMED'
        : submission!.reviewerId
          ? 'COMPLETED'
          : 'UNCLAIMED';
    const readinessState =
      submission!.status === 'APPROVED'
        ? 'APPROVED'
        : submission!.status === 'REJECTED'
          ? 'REJECTED'
          : submission!.status === 'CHANGES_REQUESTED'
            ? 'WAITING_FOR_COLLECTOR'
            : selfReviewForbidden
              ? 'REVIEWER_REQUIRED'
              : submission!.status === 'SUBMITTED'
                ? 'CLAIM_REVIEW'
                : blockers.length
                  ? 'REQUIRED_ITEMS_REMAIN'
                  : 'READY_FOR_DECISION';
    const nextAction =
      submission!.status === 'APPROVED'
        ? submission!.assetId
          ? 'OPEN_PHYSICAL_INTAKE'
          : 'CREATE_CANONICAL_ASSET'
        : submission!.status === 'REJECTED'
          ? 'COMPLETE'
          : submission!.status === 'CHANGES_REQUESTED'
            ? 'WAIT_FOR_COLLECTOR'
            : selfReviewForbidden
              ? 'WAIT_FOR_REVIEWER'
              : submission!.status === 'SUBMITTED'
                ? 'CLAIM_REVIEW'
                : blockers.length
                  ? 'COMPLETE_REQUIRED_REVIEW'
                  : 'READY_FOR_DECISION';
    const requiredChecklist = [
      {
        key: 'identity',
        label: 'Identity confirmed',
        required: true,
        satisfied: identityConfirmed,
      },
      {
        key: 'evidence',
        label: 'Required evidence accepted',
        required: true,
        satisfied: evidenceComplete,
      },
      {
        key: 'certification',
        label: 'Grade & certification resolved',
        required: Boolean(response.collectible?.grader),
        satisfied: certificationResolved,
      },
    ];
    const requiredComplete = requiredChecklist.filter(
      (item) => item.required && item.satisfied,
    ).length;
    const requiredTotal = requiredChecklist.filter(
      (item) => item.required,
    ).length;
    const advisoryComplete = advisoryItems.filter(
      (item) => item.satisfied,
    ).length;
    return {
      ...response,
      reviewAssignment: {
        state: reviewAssignmentState,
        reviewer: reviewer
          ? {
              id: reviewer.id,
              displayName: reviewer.profile?.displayName ?? 'Reviewer',
              username: reviewer.profile?.publicUsername ?? null,
            }
          : null,
        claimedAt: primaryAssignmentReview?.createdAt.toISOString() ?? null,
        lastActivity: submission!.updatedAt.toISOString(),
        contributors,
      },
      reviewFindings: submission!.reviewFindings.map((finding) => ({
        id: finding.id,
        section: finding.section,
        title: finding.title,
        detail: finding.detail,
        severity: finding.severity,
        status: finding.status,
        customerAction: finding.customerAction,
        createdByUserId: finding.createdByUserId,
        resolvedByUserId: finding.resolvedByUserId,
        resolutionNote: finding.resolutionNote,
        createdAt: finding.createdAt.toISOString(),
        updatedAt: finding.updatedAt.toISOString(),
        resolvedAt: finding.resolvedAt?.toISOString() ?? null,
      })),
      staffReview: {
        condition: latestConditionReview?.staffCondition ?? null,
        conditionNote: latestConditionReview?.staffConditionNote ?? null,
        valuation: latestValuationReview?.valuationMinor
          ? {
              valueMinor: latestValuationReview.valuationMinor.toString(),
              currency: latestValuationReview.valuationCurrency ?? 'GBP',
              basis: latestValuationReview.valuationBasis ?? null,
              confidence: latestValuationReview.valuationConfidence,
              note: latestValuationReview.valuationNote ?? null,
              updatedAt: latestValuationReview.updatedAt.toISOString(),
            }
          : null,
      },
      readiness: {
        state: readinessState,
        blockers,
        requiredBlockers: blockers,
        advisoryItems,
        decisionEligible,
        nextAction,
        progress: [
          {
            key: 'identity',
            label: 'Identity',
            status: identityConfirmed ? 'COMPLETE' : 'NEEDS_REVIEW',
            required: true,
            summary: identityConfirmed
              ? 'Identity confirmed'
              : 'Confirm collectible identity',
          },
          {
            key: 'evidence',
            label: 'Evidence',
            status: evidenceComplete ? 'COMPLETE' : 'BLOCKED',
            required: true,
            summary: evidenceComplete
              ? `${safeMediaCount} of ${REQUIRED_MEDIA_SLOTS.length} required images accepted`
              : `${REQUIRED_MEDIA_SLOTS.length - safeMediaCount} required image(s) missing`,
          },
          {
            key: 'certification',
            label: 'Grade & certification',
            status: !response.collectible?.grader
              ? 'NOT_APPLICABLE'
              : certificationResolved
                ? 'COMPLETE'
                : 'BLOCKED',
            required: Boolean(response.collectible?.grader),
            summary: !response.collectible?.grader
              ? 'Raw / ungraded — certification not required'
              : certificationResolved
                ? 'Certification resolved'
                : 'Certification requires review',
          },
          {
            key: 'research',
            label: 'Market research',
            status: 'OPTIONAL',
            required: false,
            summary: response.marketResearch
              ? 'Optional — reference available'
              : 'Optional — not recorded',
          },
          {
            key: 'assessment',
            label: 'Staff assessment',
            status: 'OPTIONAL',
            required: false,
            summary:
              advisoryItems[1].satisfied || advisoryItems[2].satisfied
                ? 'Optional — staff assessment recorded'
                : 'Optional — not recorded',
          },
          {
            key: 'decision',
            label: 'Decision',
            status: ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'].includes(
              submission!.status,
            )
              ? 'COMPLETE'
              : decisionEligible
                ? 'NEEDS_REVIEW'
                : 'BLOCKED',
            required: true,
            summary:
              submission!.status === 'APPROVED'
                ? 'Submission approved'
                : submission!.status === 'REJECTED'
                  ? 'Submission rejected'
                  : submission!.status === 'CHANGES_REQUESTED'
                    ? 'Waiting for collector changes'
                    : decisionEligible
                      ? 'Ready for staff decision'
                      : 'Complete required review first',
          },
        ],
        checklist: [
          ...requiredChecklist,
          ...advisoryItems.map((item) => ({ ...item, required: false })),
        ],
        currentValuation: latestValuationReview?.valuationMinor?.toString() ?? null,
      },
      // A compact, server-authoritative presentation summary for the reviewer
      // workspace. It deliberately mirrors, rather than replaces, readiness
      // so clients never infer access or decision eligibility from display text.
      reviewPresentation: {
        access: selfReviewForbidden
          ? 'SELF_REVIEW_BLOCKED'
          : reviewAssignmentState === 'CLAIMED_BY_ME'
            ? 'CLAIMED_BY_ME'
            : reviewAssignmentState === 'CLAIMED_BY_OTHER'
              ? 'CLAIMED_BY_OTHER'
              : 'UNCLAIMED',
        required: {
          complete: requiredComplete,
          total: requiredTotal,
          blockers: blockers.length,
        },
        advisory: {
          complete: advisoryComplete,
          total: advisoryItems.length,
        },
      },
      allowedActions: {
        canClaim:
          !selfReviewForbidden &&
          ['SUBMITTED', 'IN_REVIEW'].includes(submission!.status),
        canRelease:
          !selfReviewForbidden &&
          submission!.status === 'IN_REVIEW' &&
          Boolean(submission!.reviewerId),
        canEdit: canContribute,
        canAccept: decisionEligible,
        canRequestChanges: canContribute,
        canReject: canContribute,
        selfReviewForbidden,
      },
      reviewWorkspace: {
        requiredItems: requiredChecklist.filter((item) => item.required),
        optionalItems: advisoryItems,
        requiredComplete,
        requiredTotal,
        optionalRecorded: advisoryComplete,
        optionalTotal: advisoryItems.length,
        blockingIssues: blockers,
        primaryBlocker:
          submission!.status === 'APPROVED' || submission!.status === 'REJECTED'
            ? null
            : selfReviewForbidden
              ? 'Self-review is prohibited for this submission.'
              : (blockers[0] ?? null),
        claimState: reviewAssignmentState,
        reviewer: reviewer
          ? {
              id: reviewer.id,
              displayName: reviewer.profile?.displayName ?? 'Reviewer',
              username: reviewer.profile?.publicUsername ?? null,
            }
          : null,
        selfReviewBlocked: selfReviewForbidden,
        contributors,
        nextAction,
        nextActionLabel: readinessState,
        lastUpdated: submission!.updatedAt.toISOString(),
        canClaim:
          !selfReviewForbidden &&
          ['SUBMITTED', 'IN_REVIEW'].includes(submission!.status),
        canRelease:
          !selfReviewForbidden &&
          submission!.status === 'IN_REVIEW' &&
          Boolean(submission!.reviewerId),
        canEdit: canContribute,
        canApprove: decisionEligible,
        canRequestChanges: canContribute,
        canReject: canContribute,
        canCanonicalize:
          submission!.status === 'APPROVED' && !submission!.assetId,
        canOpenPhysicalIntake:
          submission!.status === 'APPROVED' && Boolean(submission!.assetId),
      },
    };
  }

  claim(
    actor: Actor,
    id: string,
    input: { version: number },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `review.claim:${id}`,
      'POST',
      `/v1/reviews/submissions/${id}/claim`,
      input,
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "AssetSubmission" WHERE id = ${id} FOR UPDATE
        `;
        const submission = await db.assetSubmission.findUnique({
          where: { id },
        });
        if (!submission) this.notFound();
        assertReviewerIsNotOwner(submission!.ownerUserId, actor.userId);
        assertExpectedVersion(submission!.version, input.version);
        if (!['SUBMITTED', 'IN_REVIEW'].includes(submission!.status))
          this.stateConflict();
        if (submission!.reviewerId === actor.userId) {
          return {
            submissionId: id,
            reviewId: null,
            status: submission!.status,
            version: submission!.version,
          };
        }
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            status: 'IN_REVIEW',
            reviewerId: actor.userId,
            version: { increment: 1 },
          },
        });
        const review = await db.verificationReview.create({
          data: {
            id: randomUUID(),
            submissionId: id,
            reviewerId: actor.userId,
            status: 'CLAIMED',
          },
        });
        await audit('SUBMISSION_REVIEW_PRIMARY_ASSIGNED', 'submission', id, {
          reviewId: review.id,
          previousReviewerId: submission!.reviewerId,
          primaryReviewerId: actor.userId,
          version: updated.version,
        });
        return {
          submissionId: id,
          reviewId: review.id,
          status: updated.status,
          version: updated.version,
        };
      },
    );
  }

  releaseClaim(
    actor: Actor,
    id: string,
    input: { version: number },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `review.release:${id}`,
      'POST',
      `/v1/reviews/submissions/${id}/release`,
      input,
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "AssetSubmission" WHERE id = ${id} FOR UPDATE
        `;
        const submission = await db.assetSubmission.findUnique({
          where: { id },
        });
        if (!submission) this.notFound();
        assertReviewerIsNotOwner(submission!.ownerUserId, actor.userId);
        assertExpectedVersion(submission!.version, input.version);
        if (submission!.status !== 'IN_REVIEW' || !submission!.reviewerId)
          this.stateConflict();
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            reviewerId: null,
            version: { increment: 1 },
          },
        });
        await audit('SUBMISSION_REVIEW_PRIMARY_CLEARED', 'submission', id, {
          previousReviewerId: submission!.reviewerId,
          version: updated.version,
        });
        return {
          submissionId: id,
          status: updated.status,
          version: updated.version,
        };
      },
    );
  }

  saveStaffCondition(
    actor: Actor,
    id: string,
    input: { version: number; condition: string; note?: string },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `review.condition:${id}`,
      'PATCH',
      `/v1/reviews/submissions/${id}/condition`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const review = await this.lockCollaborativeReview(
          db,
          actor,
          id,
          input.version,
        );
        const updated = await db.verificationReview.update({
          where: { id: review.id },
          data: {
            staffCondition: redactNote(input.condition).slice(0, 80),
            staffConditionNote: input.note ? redactNote(input.note) : null,
          },
        });
        await audit('SUBMISSION_STAFF_CONDITION_UPDATED', 'submission', id, {
          reviewId: review.id,
          condition: updated.staffCondition,
          note: updated.staffConditionNote,
        });
        return {
          submissionId: id,
          staffCondition: updated.staffCondition,
          staffConditionNote: updated.staffConditionNote,
          updatedAt: updated.updatedAt.toISOString(),
        };
      },
    );
  }

  saveStaffValuation(
    actor: Actor,
    id: string,
    input: {
      valueMinor: string;
      version: number;
      currency: 'GBP';
      basis: string;
      confidence?: number;
      note?: string;
    },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `review.valuation:${id}`,
      'PATCH',
      `/v1/reviews/submissions/${id}/valuation`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const review = await this.lockCollaborativeReview(
          db,
          actor,
          id,
          input.version,
        );
        const updated = await db.verificationReview.update({
          where: { id: review.id },
          data: {
            valuationMinor: BigInt(input.valueMinor),
            valuationCurrency: input.currency,
            valuationBasis: redactNote(input.basis).slice(0, 120),
            valuationConfidence: input.confidence ?? null,
            valuationNote: input.note ? redactNote(input.note) : null,
          },
        });
        await audit('SUBMISSION_STAFF_VALUATION_UPDATED', 'submission', id, {
          reviewId: review.id,
          previousValueMinor: review.valuationMinor?.toString() ?? null,
          valueMinor: updated.valuationMinor?.toString() ?? null,
          currency: updated.valuationCurrency,
          basis: updated.valuationBasis,
          confidence: updated.valuationConfidence,
          note: updated.valuationNote,
        });
        return {
          submissionId: id,
          valueMinor: updated.valuationMinor?.toString() ?? null,
          currency: updated.valuationCurrency,
          basis: updated.valuationBasis,
          confidence: updated.valuationConfidence,
          note: updated.valuationNote,
          updatedAt: updated.updatedAt.toISOString(),
        };
      },
    );
  }

  private async lockCollaborativeReview(
    db: Db,
    actor: Actor,
    id: string,
    expectedVersion?: number,
  ) {
    await db.$queryRaw<Array<{ id: string }>>`
      SELECT id FROM "AssetSubmission" WHERE id = ${id} FOR UPDATE
    `;
    const submission = await db.assetSubmission.findUnique({
      where: { id },
    });
    if (!submission) this.notFound();
    assertReviewerIsNotOwner(submission!.ownerUserId, actor.userId);
    if (submission!.status !== 'IN_REVIEW') this.stateConflict();
    if (expectedVersion !== undefined)
      assertExpectedVersion(submission!.version, expectedVersion);
    const review = await db.verificationReview.findFirst({
      where: { submissionId: id, reviewerId: actor.userId, status: 'CLAIMED' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });
    if (review) return review;
    return db.verificationReview.create({
      data: {
        id: randomUUID(),
        submissionId: id,
        reviewerId: actor.userId,
        status: 'CLAIMED',
      },
    });
  }

  decide(
    actor: Actor,
    id: string,
    decision: 'CHANGES_REQUESTED' | 'APPROVED' | 'REJECTED',
    input: {
      version: number;
      reasonCode: string;
      note?: string;
      requestedItems?: string[];
      customerMessage?: string;
    },
    requestId: string,
    key: string,
  ) {
    const action =
      decision === 'CHANGES_REQUESTED'
        ? 'request-changes'
        : decision === 'APPROVED'
          ? 'approve'
          : 'reject';
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
          include: {
            media: true,
            certificationVerifications: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
            asset: { select: { title: true } },
            owner: { select: { accountStatus: true } },
            preferredIntakeLocation: true,
          },
        });
        if (!submission) this.notFound();
        assertReviewerIsNotOwner(submission!.ownerUserId, actor.userId);
        if (submission!.status !== 'IN_REVIEW') this.stateConflict();
        assertExpectedVersion(submission!.version, input.version);
        if (decision === 'APPROVED') {
          assertRequiredSafeMedia(submission!.media);
          assertReviewDecisionReady(submission!);
        }
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            status: decision,
            reviewedAt: new Date(),
            reviewerId:
              decision === 'CHANGES_REQUESTED'
                ? null
                : submission!.reviewerId,
            decisionCode: input.reasonCode,
            decisionNote:
              decision === 'CHANGES_REQUESTED'
                ? input.customerMessage
                  ? redactNote(input.customerMessage)
                  : null
                : input.note
                  ? redactNote(input.note)
                  : null,
            version: { increment: 1 },
          },
          include: { media: { orderBy: { slot: 'asc' } } },
        });
        if (decision === 'REJECTED') {
          await db.gradingCertificationClaim.updateMany({
            where: { submissionId: id, status: { not: 'ACTIVE' } },
            data: { status: 'RELEASED', submissionId: null },
          });
        }
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
        if (decision === 'CHANGES_REQUESTED' || decision === 'APPROVED')
          await this.outbox.append(
            db,
            customerResourceEvent({
              eventType:
                decision === 'CHANGES_REQUESTED'
                  ? eventType.submissionChangesRequested
                  : eventType.submissionApproved,
              submissionId: id,
              status: decision,
              ...(decision === 'CHANGES_REQUESTED' &&
              input.requestedItems?.length
                ? { requestedItems: input.requestedItems }
                : {}),
              ...(decision === 'CHANGES_REQUESTED' && input.customerMessage
                ? { customerMessage: input.customerMessage }
                : {}),
              actorUserId: submission!.ownerUserId,
              correlationId: requestId,
              occurredAt: updated.reviewedAt ?? new Date(),
            }),
          );
        const auditAction =
          decision === 'CHANGES_REQUESTED'
            ? 'SUBMISSION_CHANGES_REQUESTED'
            : decision === 'APPROVED'
              ? 'SUBMISSION_APPROVED'
              : 'SUBMISSION_REJECTED';
        await audit(auditAction, 'submission', id, {
          reviewId: review.id,
          reasonCode: input.reasonCode,
          requestedItems: input.requestedItems ?? [],
          customerMessageRecorded: Boolean(input.customerMessage),
          version: updated.version,
        });
        if (
          decision === 'APPROVED' &&
          submission!.preferredIntakeLocation &&
          submission!.preferredDeliveryMethod
        ) {
          const location = submission!.preferredIntakeLocation;
          const supportsMethod =
            submission!.preferredDeliveryMethod === 'SHIPMENT'
              ? location.acceptingShipments
              : location.acceptingInPerson;
          const acceptedCategories = Array.isArray(location.acceptedCategories)
            ? location.acceptedCategories
            : [];
          if (
            location.active &&
            location.intakeAvailable &&
            location.operationallyApproved &&
            location.environment === this.config.appEnvironment &&
            supportsMethod &&
            (!acceptedCategories.length ||
              acceptedCategories.includes(submission!.categoryId))
          ) {
            const intake = await db.submissionIntake.upsert({
              where: { submissionId: id },
              create: {
                submissionId: id,
                vaultId: location.id,
                deliveryMethod: submission!.preferredDeliveryMethod,
                intakeReference: `SLICE-${id.slice(-8).toUpperCase()}`,
                status: 'SHIPPING_REQUIRED',
                destinationSnapshot: intakeLocationSnapshot(location),
              },
              update: {},
            });
            await audit(
              'INTAKE_PREFERENCE_CARRIED_FORWARD',
              'submission-intake',
              intake.id,
              {
                submissionId: id,
                locationId: location.id,
                deliveryMethod: submission!.preferredDeliveryMethod,
              },
            );
          }
        }
        return ownerProjection(updated);
      },
    );
  }

  correctApprovedIdentity(
    actor: Actor,
    id: string,
    input: IdentityCorrectionInput,
    requestId: string,
    key: string,
  ) {
    if (
      !actor.roles.some((role) => role === 'ADMIN' || role === 'ASSET_REVIEWER')
    ) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have permission to correct submission identity.',
      });
    }
    return this.mutate(
      actor,
      `submission.identity-correction:${id}`,
      'POST',
      `/v1/reviews/submissions/${id}/correct-identity`,
      input,
      requestId,
      key,
      async (db, audit) => {
        await db.$queryRaw<Array<{ id: string }>>`
          SELECT id FROM "AssetSubmission" WHERE id = ${id} FOR UPDATE
        `;
        const current = await db.assetSubmission.findUnique({
          where: { id },
          include: {
            media: { orderBy: { slot: 'asc' } },
            marketResearch: {
              orderBy: { collectedAt: 'desc' },
              include: { observations: { orderBy: { observedAt: 'desc' } } },
            },
          },
        });
        if (!current) this.notFound();
        assertReviewerIsNotOwner(current!.ownerUserId, actor.userId);
        if (current!.status !== 'APPROVED') {
          throw new ConflictException({
            code: 'SUBMISSION_STATE_CONFLICT',
            message:
              'Only an approved submission can receive an identity correction.',
          });
        }
        if (current!.assetId) {
          throw new ConflictException({
            code: 'SUBMISSION_IDENTITY_CORRECTION_REQUIRES_ASSET_WORKFLOW',
            message: 'This submission is already linked to a catalogue asset.',
          });
        }
        assertExpectedVersion(current!.version, input.version);
        const before = isRecord(current!.declaredMetadata)
          ? current!.declaredMetadata
          : {};
        const declaredMetadata = {
          ...before,
          name: input.name,
          year: input.year,
        };
        assertSubmissionDetails(declaredMetadata);
        assertSubmissionTerms(declaredMetadata);
        const detachedResearch = await db.submissionMarketResearch.updateMany({
          where: { submissionId: id },
          data: { submissionId: null },
        });
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            declaredMetadata: jsonMetadata(declaredMetadata),
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
        await audit('SUBMISSION_IDENTITY_CORRECTED', 'submission', id, {
          previousName: stringMetadata(before.name),
          previousYear: stringMetadata(before.year),
          name: input.name,
          year: input.year,
          reason: redactNote(input.note),
          detachedResearchCount: detachedResearch.count,
          version: updated.version,
        });
        return ownerProjection(updated);
      },
    );
  }

  saveReviewNote(
    actor: Actor,
    id: string,
    input: { version: number; note: string },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `review.note:${id}`,
      'POST',
      `/v1/reviews/submissions/${id}/notes`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const review = await this.lockCollaborativeReview(
          db,
          actor,
          id,
          input.version,
        );
        const updatedAt = new Date();
        await db.verificationReview.update({
          where: { id: review.id },
          data: { note: redactNote(input.note) },
        });
        await audit('SUBMISSION_REVIEW_NOTE_UPDATED', 'submission', id, {
          reviewId: review.id,
          note: redactNote(input.note),
        });
        return { submissionId: id, updatedAt: updatedAt.toISOString() };
      },
    );
  }

  saveReviewIdentity(
    actor: Actor,
    id: string,
    input: ReviewIdentityInput,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `review.identity:${id}`,
      'PATCH',
      `/v1/reviews/submissions/${id}/identity`,
      input,
      requestId,
      key,
      async (db, audit) => {
        await this.lockCollaborativeReview(db, actor, id, input.version);
        const submission = await db.assetSubmission.findUniqueOrThrow({
          where: { id },
          select: { reviewMetadata: true },
        });
        const previous = isRecord(submission.reviewMetadata)
          ? submission.reviewMetadata
          : {};
        const reviewMetadata = {
          ...previous,
          name: input.name,
          ...(input.year ? { year: input.year } : {}),
          ...(input.set ? { set: input.set } : {}),
          ...(input.cardNumber ? { cardNumber: input.cardNumber } : {}),
          ...(input.variant ? { variant: input.variant } : {}),
        };
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            reviewMetadata: jsonMetadata(reviewMetadata),
            version: { increment: 1 },
          },
          select: { version: true, reviewMetadata: true },
        });
        await audit('SUBMISSION_REVIEW_IDENTITY_CONFIRMED', 'submission', id, {
          fields: Object.keys(reviewMetadata),
          note: redactNote(input.note),
          version: updated.version,
        });
        return {
          submissionId: id,
          version: updated.version,
          reviewMetadata: updated.reviewMetadata,
        };
      },
    );
  }

  createReviewFinding(
    actor: Actor,
    id: string,
    input: ReviewFindingInput,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `review.finding.create:${id}`,
      'POST',
      `/v1/reviews/submissions/${id}/findings`,
      input,
      requestId,
      key,
      async (db, audit) => {
        await this.lockCollaborativeReview(db, actor, id, input.version);
        const finding = await db.submissionReviewFinding.create({
          data: {
            id: randomUUID(),
            submissionId: id,
            section: input.section,
            title: redactNote(input.title).slice(0, 180),
            detail: input.detail ? redactNote(input.detail) : null,
            severity: input.severity,
            customerAction: input.customerAction ?? false,
            createdByUserId: actor.userId,
          },
        });
        const submission = await db.assetSubmission.update({
          where: { id },
          data: { version: { increment: 1 } },
          select: { version: true },
        });
        await audit('SUBMISSION_REVIEW_FINDING_CREATED', 'submission', id, {
          findingId: finding.id,
          section: finding.section,
          severity: finding.severity,
          customerAction: finding.customerAction,
          version: submission.version,
        });
        return { findingId: finding.id, submissionId: id, version: submission.version };
      },
    );
  }

  setReviewFindingStatus(
    actor: Actor,
    id: string,
    findingId: string,
    input: ReviewFindingStatusInput,
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `review.finding.status:${id}:${findingId}`,
      'PATCH',
      `/v1/reviews/submissions/${id}/findings/${findingId}`,
      input,
      requestId,
      key,
      async (db, audit) => {
        await this.lockCollaborativeReview(db, actor, id, input.version);
        const finding = await db.submissionReviewFinding.findFirst({
          where: { id: findingId, submissionId: id },
        });
        if (!finding) this.notFound();
        const isOpen = input.status === 'OPEN';
        const updatedFinding = await db.submissionReviewFinding.update({
          where: { id: findingId },
          data: {
            status: input.status,
            resolvedByUserId: isOpen ? null : actor.userId,
            resolvedAt: isOpen ? null : new Date(),
            resolutionNote: input.resolutionNote
              ? redactNote(input.resolutionNote)
              : null,
          },
        });
        const submission = await db.assetSubmission.update({
          where: { id },
          data: { version: { increment: 1 } },
          select: { version: true },
        });
        await audit('SUBMISSION_REVIEW_FINDING_UPDATED', 'submission', id, {
          findingId,
          previousStatus: finding!.status,
          status: updatedFinding.status,
          version: submission.version,
        });
        return { findingId, submissionId: id, status: updatedFinding.status, version: submission.version };
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

  private async assertGradeReference(
    db: Db,
    rawMetadata: Prisma.JsonValue | Record<string, unknown> | null | undefined,
    gradeScaleEntryId: string | null | undefined,
    required = false,
  ) {
    const metadata = isRecord(rawMetadata) ? rawMetadata : {};
    const grader = stringMetadata(metadata.grader)?.trim() ?? '';
    const rawCard = !grader || grader === 'Ungraded';
    const hasGradeInput = Boolean(
      metadata.grade || metadata.certificationNumber || gradeScaleEntryId,
    );
    if (rawCard) {
      if (hasGradeInput) {
        throw new UnprocessableEntityException({
          code: 'RAW_CARD_GRADE_CONFLICT',
          message:
            'Raw / Ungraded cards cannot include a slab grade or certificate.',
        });
      }
      return null;
    }
    if (!required && !hasGradeInput) return null;
    if (!gradeScaleEntryId) {
      throw new UnprocessableEntityException({
        code: 'GRADE_SCALE_REQUIRED',
        message: 'Choose an official grade from the selected grading company.',
      });
    }
    const entry = await db.gradeScaleEntry.findUnique({
      where: { id: gradeScaleEntryId },
      include: { company: true },
    });
    if (!entry || !entry.active || entry.company.status !== 'ACTIVE') {
      throw new UnprocessableEntityException({
        code: 'GRADE_INVALID',
        message: 'That company-specific grade is no longer available.',
      });
    }
    if (entry.company.code !== grader) {
      throw new UnprocessableEntityException({
        code: 'GRADE_COMPANY_MISMATCH',
        message: 'The selected grade does not belong to the selected company.',
      });
    }
    const declaredGrade = String(metadata.grade ?? '').trim();
    if (
      !declaredGrade ||
      new Prisma.Decimal(declaredGrade).toFixed(2) !== entry.grade.toFixed(2)
    ) {
      throw new UnprocessableEntityException({
        code: 'GRADE_INVALID',
        message: 'Choose the exact grade shown on the selected company scale.',
      });
    }
    const declaredDesignation = String(metadata.designation ?? '').trim();
    if (entry.designation && entry.designation !== declaredDesignation) {
      throw new UnprocessableEntityException({
        code: 'GRADE_DESIGNATION_REQUIRED',
        message: `Choose the ${entry.designation} designation for this numeric grade.`,
      });
    }
    if (required) assertCertificationNumber(metadata.certificationNumber);
    return entry;
  }

  private async claimCertification(
    db: Db,
    companyCode: string,
    normalizedCertificationNumber: string,
    submissionId: string | null,
    assetId: string | null,
  ) {
    const existing = await db.gradingCertificationClaim.findUnique({
      where: {
        companyCode_normalizedCertificationNumber: {
          companyCode,
          normalizedCertificationNumber,
        },
      },
    });
    if (existing && existing.status !== 'RELEASED') {
      if (existing.submissionId === submissionId && submissionId)
        return db.gradingCertificationClaim.update({
          where: { id: existing.id },
          data: { assetId, status: assetId ? 'ACTIVE' : existing.status },
        });
      throw new ConflictException({
        code: 'CERT_DUPLICATE_BLOCKED',
        message:
          'That certification number is already associated with an active Slice record.',
      });
    }
    if (existing) {
      return db.gradingCertificationClaim.update({
        where: { id: existing.id },
        data: {
          submissionId,
          assetId,
          status: assetId ? 'ACTIVE' : 'SUBMISSION',
        },
      });
    }
    try {
      return await db.gradingCertificationClaim.create({
        data: {
          id: randomUUID(),
          companyCode,
          normalizedCertificationNumber,
          submissionId,
          assetId,
          status: assetId ? 'ACTIVE' : 'SUBMISSION',
        },
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      )
        throw new ConflictException({
          code: 'CERT_DUPLICATE_BLOCKED',
          message:
            'That certification number is already associated with an active Slice record.',
        });
      throw error;
    }
  }

  async verifyCertification(
    actor: Actor,
    id: string,
    input: { certificationNumber: string },
    requestId: string,
    key: string,
  ) {
    await this.capabilities?.require(actor, 'LIST_ASSET');
    return this.mutate(
      actor,
      `submission.certification-verify:${id}`,
      'POST',
      `/v1/submissions/${id}/certification/verify`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const submission = await this.ownerForUpdate(db, actor.userId, id, {
          media: { orderBy: { slot: 'asc' } },
          certificationVerifications: {
            orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          },
        });
        assertEditableStatus(submission.status);
        const entry = await this.assertGradeReference(
          db,
          submission.declaredMetadata,
          submission.gradeScaleEntryId,
          true,
        );
        if (!entry)
          throw new UnprocessableEntityException({
            code: 'CERTIFICATION_NOT_APPLICABLE',
            message:
              'Raw / Ungraded cards do not need certification verification.',
          });
        const normalized = assertCertificationNumber(input.certificationNumber);
        await db.gradingCertificationClaim.updateMany({
          where: {
            submissionId: id,
            status: 'SUBMISSION',
            normalizedCertificationNumber: { not: normalized },
          },
          data: { status: 'RELEASED', submissionId: null },
        });
        await this.claimCertification(
          db,
          entry.company.code,
          normalized,
          id,
          null,
        );
        const verification = await db.gradingCertificationVerification.create({
          data: {
            id: randomUUID(),
            submissionId: id,
            requestedByUserId: actor.userId,
            companyCode: entry.company.code,
            certificationNumber: input.certificationNumber.trim(),
            normalizedCertificationNumber: normalized,
            status: 'MANUAL_REVIEW_REQUIRED',
            verificationMode: entry.company.verificationMode,
            officialVerificationUrl: entry.company.officialVerificationUrl,
          },
        });
        const metadata = isRecord(submission.declaredMetadata)
          ? submission.declaredMetadata
          : {};
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            normalizedCertificationNumber: normalized,
            declaredMetadata: jsonMetadata({
              ...metadata,
              certificationNumber: input.certificationNumber.trim(),
              certificationVerificationStatus: 'MANUAL_REVIEW_REQUIRED',
              certificationVerificationMode: entry.company.verificationMode,
              officialVerificationUrl:
                entry.company.officialVerificationUrl ?? '',
            }),
            version: { increment: 1 },
          },
          include: {
            media: { orderBy: { slot: 'asc' } },
            certificationVerifications: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            },
          },
        });
        await audit('CERT_VERIFICATION_REQUESTED', 'submission', id, {
          verificationId: verification.id,
          companyCode: entry.company.code,
          verificationMode: entry.company.verificationMode,
          status: verification.status,
        });
        await audit('CERT_MANUAL_REVIEW_REQUIRED', 'submission', id, {
          verificationId: verification.id,
        });
        return {
          ...ownerProjection(updated),
          certificationVerification:
            certificationVerificationProjection(verification),
          canSubmit: false,
        };
      },
    );
  }

  manualVerifyCertification(
    actor: Actor,
    id: string,
    input: {
      verifiedIdentity: Record<string, unknown>;
      verifiedGrade: string;
      verifiedLabel?: string;
      designation?: string;
      subgrades?: Record<string, unknown>;
      providerReference?: string;
    },
    requestId: string,
    key: string,
  ) {
    return this.mutate(
      actor,
      `submission.certification-manual-verify:${id}`,
      'POST',
      `/v1/reviews/submissions/${id}/certification/manual-verify`,
      input,
      requestId,
      key,
      async (db, audit) => {
        const submission = await db.assetSubmission.findUnique({
          where: { id },
          include: {
            media: { orderBy: { slot: 'asc' } },
            certificationVerifications: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              take: 1,
            },
          },
        });
        if (!submission) this.notFound();
        assertReviewerIsNotOwner(submission!.ownerUserId, actor.userId);
        if (submission!.status !== 'IN_REVIEW') this.stateConflict();
        const entry = await this.assertGradeReference(
          db,
          submission!.declaredMetadata,
          submission!.gradeScaleEntryId,
          true,
        );
        if (!entry)
          throw new UnprocessableEntityException({
            code: 'CERTIFICATION_NOT_APPLICABLE',
            message: 'Certification is not applicable.',
          });
        const latest = submission!.certificationVerifications[0];
        if (!latest)
          throw new ConflictException({
            code: 'CERTIFICATION_VERIFICATION_REQUIRED',
            message: 'Request an official certification lookup first.',
          });
        const verifiedIdentity = input.verifiedIdentity;
        const metadata = isRecord(submission!.declaredMetadata)
          ? submission!.declaredMetadata
          : {};
        const comparison = compareCertificationIdentity(
          {
            year: stringMetadata(metadata.year),
            set: stringMetadata(metadata.set),
            cardNumber: stringMetadata(metadata.cardNumber),
            name: stringMetadata(metadata.name),
            variant: stringMetadata(metadata.variant),
            language: stringMetadata(metadata.language),
            companyCode: entry.company.code,
            grade: entry.grade.toFixed(2),
          },
          {
            year: stringMetadata(verifiedIdentity.year),
            set: stringMetadata(verifiedIdentity.set),
            cardNumber: stringMetadata(verifiedIdentity.cardNumber),
            name: stringMetadata(verifiedIdentity.name),
            variant: stringMetadata(verifiedIdentity.variant),
            language: stringMetadata(verifiedIdentity.language),
            companyCode: stringMetadata(verifiedIdentity.companyCode),
            grade: input.verifiedGrade,
          },
        );
        const gradeMatches =
          new Prisma.Decimal(input.verifiedGrade).toFixed(2) ===
          entry.grade.toFixed(2);
        const designationMatches =
          !entry.designation ||
          entry.designation === (input.designation ?? '') ||
          (entry.company.code === 'BGS' &&
            entry.grade.toFixed(2) === '10.00' &&
            ['PRISTINE', 'BLACK_LABEL'].includes(input.designation ?? ''));
        const status =
          comparison.status === 'MATCH' && gradeMatches && designationMatches
            ? 'VERIFIED'
            : 'MISMATCH';
        const verification = await db.gradingCertificationVerification.update({
          where: { id: latest.id },
          data: {
            status,
            verifiedCard: verifiedIdentity as Prisma.InputJsonValue,
            verifiedGrade: input.verifiedGrade,
            verifiedLabel: input.verifiedLabel ?? entry.label,
            designation: input.designation ?? null,
            subgrades: input.subgrades as Prisma.InputJsonValue | undefined,
            providerReference: input.providerReference?.trim() || null,
            gradeEra: entry.gradeEra,
            verifiedAt: status === 'VERIFIED' ? new Date() : null,
          },
        });
        if (status === 'MISMATCH')
          await audit('CERT_VERIFICATION_MISMATCH', 'submission', id, {
            verificationId: verification.id,
            mismatches: comparison.mismatches,
          });
        if (status === 'MISMATCH') {
          const mismatchUpdated = await db.assetSubmission.update({
            where: { id },
            data: {
              declaredMetadata: jsonMetadata({
                ...metadata,
                certificationVerificationStatus: 'MISMATCH',
              }),
              version: { increment: 1 },
            },
            include: {
              media: { orderBy: { slot: 'asc' } },
              certificationVerifications: {
                orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
              },
            },
          });
          return {
            ...ownerProjection(mismatchUpdated),
            certificationVerification:
              certificationVerificationProjection(verification),
            canSubmit: false,
          };
        }
        const updated = await db.assetSubmission.update({
          where: { id },
          data: {
            declaredMetadata: jsonMetadata({
              ...metadata,
              certificationVerificationStatus: 'VERIFIED',
              certificationVerifiedGrade: input.verifiedGrade,
              certificationVerifiedLabel: input.verifiedLabel ?? entry.label,
              certificationDesignation: input.designation ?? '',
              certificationVerifiedAt: new Date().toISOString(),
            }),
            version: { increment: 1 },
          },
          include: {
            media: { orderBy: { slot: 'asc' } },
            certificationVerifications: {
              orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
            },
          },
        });
        await audit('CERT_VERIFIED', 'submission', id, {
          verificationId: verification.id,
          companyCode: entry.company.code,
          grade: entry.grade.toFixed(2),
        });
        return {
          ...ownerProjection(updated),
          certificationVerification:
            certificationVerificationProjection(verification),
          canSubmit: true,
        };
      },
    );
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

  private async assertIntakePreference(db: Db, input: DraftInput) {
    const hasLocation = Boolean(input.preferredIntakeLocationId);
    const hasMethod = Boolean(input.preferredDeliveryMethod);
    if (hasLocation !== hasMethod)
      throw new UnprocessableEntityException({
        code: 'INTAKE_PREFERENCE_INCOMPLETE',
        message: 'Choose both a Slice intake location and a delivery method.',
      });
    if (!hasLocation || !input.preferredDeliveryMethod) return;
    const location = await db.vaultIntakeLocation.findFirst({
      where: {
        id: input.preferredIntakeLocationId!,
        active: true,
        intakeAvailable: true,
        operationallyApproved: true,
        environment: this.config.appEnvironment,
        ...(input.preferredDeliveryMethod === 'SHIPMENT'
          ? { acceptingShipments: true }
          : { acceptingInPerson: true }),
      },
      select: { id: true, acceptedCategories: true },
    });
    if (!location)
      throw new UnprocessableEntityException({
        code: 'INTAKE_LOCATION_UNAVAILABLE',
        message:
          'That intake location is no longer available for this delivery method.',
      });
    const categories = location.acceptedCategories;
    if (
      Array.isArray(categories) &&
      categories.length > 0 &&
      !categories.includes(input.categoryId)
    )
      throw new UnprocessableEntityException({
        code: 'INTAKE_LOCATION_CATEGORY_UNSUPPORTED',
        message:
          'That intake location does not accept this collectible category.',
      });
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
function isAiReviewSkipped(value: Prisma.JsonValue | null) {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).aiReviewStatus === 'AI_REVIEW_SKIPPED',
  );
}
function isSafeCustomerReference(value: unknown): boolean {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const reference = value as Record<string, unknown>;
  const allowed = new Set([
    'provider',
    'externalReferenceId',
    'normalizedUrl',
    'originalTitle',
    'imageUrl',
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
    (reference.imageUrl === undefined ||
      (typeof reference.imageUrl === 'string' &&
        reference.imageUrl.length <= 2048 &&
        isHttpsUrl(reference.imageUrl))) &&
    typeof reference.importedAt === 'string' &&
    (reference.matchQuality === 'MATCH_FOUND' ||
      reference.matchQuality === 'PARTIAL_MATCH') &&
    isSafeMetadata(reference.extractedIdentity) &&
    (reference.observedAskingPrice === undefined ||
      isSafeMetadata(reference.observedAskingPrice))
  );
}
function isHttpsUrl(value: string) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
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
function certificationVerificationProjection(verification: {
  id: string;
  companyCode: string;
  certificationNumber: string;
  normalizedCertificationNumber: string;
  status: string;
  verificationMode: string;
  officialVerificationUrl: string | null;
  verifiedGrade: string | null;
  verifiedLabel: string | null;
  designation: string | null;
  gradeEra: string | null;
  verifiedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: verification.id,
    companyCode: verification.companyCode,
    certificationNumber: verification.certificationNumber,
    normalizedCertificationNumber: verification.normalizedCertificationNumber,
    status: verification.status,
    verificationMode: verification.verificationMode,
    officialVerificationUrl: verification.officialVerificationUrl,
    verifiedGrade: verification.verifiedGrade,
    verifiedLabel: verification.verifiedLabel,
    designation: verification.designation,
    gradeEra: verification.gradeEra,
    verifiedAt: verification.verifiedAt?.toISOString() ?? null,
    createdAt: verification.createdAt.toISOString(),
  };
}
function ownerProjection(submission: {
  id: string;
  status: string;
  version: number;
  currentStep: number;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
  declaredMetadata: Prisma.JsonValue | null;
  preferredIntakeLocationId: string | null;
  preferredDeliveryMethod: string | null;
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
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  marketResearch?: ResearchRow[];
  certificationVerifications?: Array<{
    id: string;
    companyCode: string;
    certificationNumber: string;
    normalizedCertificationNumber: string;
    status: string;
    verificationMode: string;
    officialVerificationUrl: string | null;
    verifiedGrade: string | null;
    verifiedLabel: string | null;
    designation: string | null;
    gradeEra: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
  }>;
}) {
  return {
    id: submission.id,
    status: submission.status,
    version: submission.version,
    currentStep: submission.currentStep,
    categoryId: submission.categoryId,
    setId: submission.setId,
    gradeScaleEntryId: submission.gradeScaleEntryId,
    declaredMetadata: submission.declaredMetadata,
    preferredIntakeLocationId: submission.preferredIntakeLocationId,
    preferredDeliveryMethod: submission.preferredDeliveryMethod,
    submittedAt: submission.submittedAt?.toISOString() ?? null,
    reviewedAt: submission.reviewedAt?.toISOString() ?? null,
    decisionCode: submission.decisionCode,
    createdAt: submission.createdAt.toISOString(),
    updatedAt: submission.updatedAt.toISOString(),
    media: submission.media.map(mediaProjection),
    marketResearch: submission.marketResearch?.[0]
      ? marketResearchProjection(submission.marketResearch[0])
      : null,
    certificationVerification: submission.certificationVerifications?.[0]
      ? certificationVerificationProjection(
          submission.certificationVerifications[0],
        )
      : null,
  };
}

/** Explicit staging fixture provenance used only for the live-Beta customer
 * projection. Real submissions are never inferred from titles or status. */
function isBetaFixtureSubmission(
  metadata: Prisma.JsonValue | null,
  isBeta: boolean,
) {
  if (
    !isBeta ||
    !metadata ||
    typeof metadata !== 'object' ||
    Array.isArray(metadata)
  )
    return false;
  const value = metadata as Record<string, unknown>;
  return (
    value.betaFixtureRetired === true ||
    (typeof value.certificationNumber === 'string' &&
      value.certificationNumber.startsWith('STG-'))
  );
}
function reviewProjection(submission: {
  id: string;
  assetId: string | null;
  status: string;
  submittedAt: Date | null;
  createdAt: Date;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
}) {
  return {
    id: submission.id,
    assetId: submission.assetId,
    status: submission.status,
    submittedAt: (submission.submittedAt ?? submission.createdAt).toISOString(),
    categoryId: submission.categoryId,
    setId: submission.setId,
    gradeScaleEntryId: submission.gradeScaleEntryId,
  };
}

type ReviewQueueRow = {
  id: string;
  ownerUserId: string;
  reviewerId: string | null;
  status: string;
  submittedAt: Date | null;
  createdAt: Date;
  category: { name: string };
  owner: {
    email: string;
    accountStatus: string;
    profile: { displayName: string; publicUsername: string | null } | null;
    collectorSubscriptions: Array<{ plan: { displayName: string } }>;
  };
  asset: {
    title: string;
    year: number | null;
    edition: string | null;
    cardNumber: string | null;
    collectibleSet: { name: string } | null;
    gradeScaleEntry: {
      label: string;
      company: { code: string };
    } | null;
  } | null;
  collectibleSet: { name: string } | null;
  gradeScaleEntry: { label: string; company: { code: string } } | null;
  gradeScaleEntryId: string | null;
  normalizedCertificationNumber: string | null;
  declaredMetadata: Prisma.JsonValue | null;
  media: Array<{
    slot: string;
    status: string;
    deletedAt: Date | null;
    objectKey: string;
  }>;
  marketResearch: Array<{ state: string; collectedAt: Date }>;
  certificationVerifications: Array<{ status: string }>;
};

function reviewQueueProjection(
  submission: ReviewQueueRow,
  context: { actorUserId: string; reviewerDisplayName: string | null },
) {
  const metadata =
    submission.declaredMetadata &&
    typeof submission.declaredMetadata === 'object'
      ? (submission.declaredMetadata as Record<string, unknown>)
      : {};
  const safeMedia = submission.media.filter(
    (media) => media.status === 'SAFE' && media.deletedAt === null,
  );
  const assetGrade =
    submission.asset?.gradeScaleEntry ?? submission.gradeScaleEntry;
  const requiredSlots = assetGrade
    ? [...REQUIRED_MEDIA_SLOTS, 'grading-label']
    : [...REQUIRED_MEDIA_SLOTS];
  const presentRequired = requiredSlots.filter((slot) =>
    safeMedia.some((media) => media.slot === slot),
  ).length;
  const missingRequired = requiredSlots.length - presentRequired;
  const evidenceStatus =
    missingRequired === 0
      ? 'COMPLETE'
      : presentRequired > 0
        ? 'PARTIAL'
        : 'MISSING_REQUIRED';
  const research = submission.marketResearch[0];
  const researchStatus = researchStatusFor(research?.state);
  const certificationStatus =
    submission.certificationVerifications[0]?.status ?? null;
  const certificationRequired = Boolean(
    submission.gradeScaleEntryId || submission.normalizedCertificationNumber,
  );
  const certificationResolved =
    !certificationRequired ||
    ['VERIFIED', 'MANUAL_REVIEW'].includes(certificationStatus ?? '');
  const title =
    submission.asset?.title ??
    stringMetadata(metadata.name) ??
    'Untitled submission';
  const submittedAt = submission.submittedAt ?? submission.createdAt;
  const ageHours = Math.max(
    0,
    Math.floor((Date.now() - submittedAt.getTime()) / 3_600_000),
  );
  const priority = reviewQueuePriority({
    accountActive: submission.owner.accountStatus === 'ACTIVE',
    certificationResolved,
    ageHours,
    missingRequired,
    researchStatus,
    reviewState: submission.status,
  });
  return {
    id: submission.id,
    submissionReference: submission.id,
    reviewState: submission.status,
    category: submission.category.name,
    collector: {
      displayName:
        submission.owner.profile?.displayName ?? submission.owner.email,
      username: submission.owner.profile?.publicUsername ?? null,
      membership:
        submission.owner.collectorSubscriptions[0]?.plan.displayName ?? null,
    },
    collectible: {
      title,
      year: submission.asset?.year
        ? String(submission.asset.year)
        : stringMetadata(metadata.year),
      variant:
        stringMetadata(metadata.variant) ?? submission.asset?.edition ?? null,
      set:
        submission.asset?.collectibleSet?.name ??
        submission.collectibleSet?.name ??
        stringMetadata(metadata.set) ??
        null,
      grader:
        assetGrade?.company.code ?? stringMetadata(metadata.grader) ?? null,
      grade: assetGrade?.label ?? stringMetadata(metadata.grade) ?? null,
      cardNumber:
        submission.asset?.cardNumber ??
        stringMetadata(metadata.cardNumber) ??
        null,
    },
    thumbnailUrl: null as string | null,
    evidence: {
      percent: Math.round((presentRequired / requiredSlots.length) * 100),
      status: evidenceStatus,
      missingRequired,
      presentRequired,
      required: requiredSlots.length,
      itemCount: safeMedia.length,
      certificationStatus,
    },
    research: {
      status: researchStatus,
      observedAt: research?.collectedAt.toISOString() ?? null,
    },
    reviewer: {
      state:
        submission.ownerUserId === context.actorUserId
          ? 'SELF_REVIEW_RESTRICTED'
          : submission.status === 'IN_REVIEW'
            ? submission.reviewerId === context.actorUserId
              ? 'CLAIMED_BY_ME'
              : 'CLAIMED_BY_OTHER'
            : 'UNCLAIMED',
      displayName: context.reviewerDisplayName,
    },
    submittedAt: submittedAt.toISOString(),
    readinessState:
      missingRequired > 0
        ? 'NEEDS_EVIDENCE'
        : !certificationResolved
          ? 'BLOCKED'
          : submission.owner.accountStatus !== 'ACTIVE'
            ? 'BLOCKED'
            : submission.status === 'IN_REVIEW'
              ? 'MANUAL_REVIEW'
              : 'READY',
    readinessReason:
      missingRequired > 0
        ? `Missing ${requiredSlots
            .filter((slot) => !safeMedia.some((media) => media.slot === slot))
            .map(formatReviewEvidenceSlot)
            .join(' and ')}.`
        : !certificationResolved
          ? certificationStatus === 'MISMATCH'
            ? 'Certificate identity mismatch requires review.'
            : 'Certificate verification pending.'
          : submission.owner.accountStatus !== 'ACTIVE'
            ? 'Collector account is not eligible for acceptance.'
            : submission.status === 'IN_REVIEW'
              ? 'Claimed review is in progress.'
              : submission.ownerUserId === context.actorUserId
                ? 'Self-review is restricted; another reviewer must claim it.'
                : 'Ready to claim for staff decision.',
    ageHours,
    overdue: null,
    priority,
    testFixture: isBetaFixtureSubmission(submission.declaredMetadata, true),
  };
}

function formatReviewEvidenceSlot(slot: string) {
  return slot === 'grading-label'
    ? 'the grading-label photo'
    : `the ${slot} photo`;
}

export function reviewQueuePriority(input: {
  accountActive: boolean;
  certificationResolved: boolean;
  ageHours: number;
  missingRequired: number;
  researchStatus: string;
  reviewState: string;
}) {
  if (
    !input.accountActive ||
    !input.certificationResolved ||
    input.ageHours >= 48
  )
    return 'HIGH' as const;
  if (
    input.missingRequired > 0 ||
    ['PENDING', 'IN_PROGRESS'].includes(input.researchStatus) ||
    input.reviewState === 'IN_REVIEW'
  )
    return 'MEDIUM' as const;
  return 'LOW' as const;
}

function stringMetadata(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function numberMetadata(value: unknown) {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 9999
    ? parsed
    : null;
}

export function collectorConditionValue(metadata: unknown) {
  if (!isRecord(metadata)) return null;
  return stringMetadata(metadata.condition) ?? stringMetadata(metadata.grade);
}

function researchStatusFor(state: string | undefined) {
  if (!state) return 'NOT_REQUESTED' as const;
  if (['FOUND', 'LIMITED', 'NO_MATCHES', 'COMPLETED'].includes(state))
    return 'COMPLETED' as const;
  if (state === 'UNAVAILABLE') return 'UNAVAILABLE' as const;
  if (['IN_PROGRESS', 'PROCESSING'].includes(state))
    return 'IN_PROGRESS' as const;
  return 'PENDING' as const;
}

function parseDateBoundary(value: string | undefined, end: boolean) {
  if (!value) return undefined;
  const parsed = new Date(
    `${value}${end ? 'T00:00:00.000Z' : 'T00:00:00.000Z'}`,
  );
  if (Number.isNaN(parsed.getTime())) return undefined;
  if (end) parsed.setUTCDate(parsed.getUTCDate() + 1);
  return parsed;
}

function reviewedMetadata(submission: {
  declaredMetadata: Prisma.JsonValue | null;
  reviewMetadata?: Prisma.JsonValue | null;
}) {
  const declared = isRecord(submission.declaredMetadata)
    ? submission.declaredMetadata
    : {};
  const reviewed = isRecord(submission.reviewMetadata)
    ? submission.reviewMetadata
    : {};
  return { ...declared, ...reviewed };
}

function assertReviewDecisionReady(submission: {
  declaredMetadata: Prisma.JsonValue | null;
  reviewMetadata?: Prisma.JsonValue | null;
  asset: { title: string } | null;
  gradeScaleEntryId: string | null;
  normalizedCertificationNumber: string | null;
  certificationVerifications: Array<{ status: string }>;
  owner: { accountStatus: string };
}) {
  const metadata = reviewedMetadata(submission);
  const hasIdentity = Boolean(
    stringMetadata(metadata.name) ?? submission.asset?.title,
  );
  if (!hasIdentity)
    throw new ConflictException({
      code: 'REVIEW_IDENTITY_REQUIRED',
      message: 'Collectible identity must be confirmed before acceptance.',
    });
  if (submission.owner.accountStatus !== 'ACTIVE')
    throw new ConflictException({
      code: 'REVIEW_ACCOUNT_BLOCKED',
      message: 'The collector account is not eligible for acceptance.',
    });
  const certificationRequired = Boolean(
    submission.gradeScaleEntryId || submission.normalizedCertificationNumber,
  );
  const certificationStatus = submission.certificationVerifications[0]?.status;
  if (
    certificationRequired &&
    !['VERIFIED', 'MANUAL_REVIEW'].includes(certificationStatus ?? '')
  )
    throw new ConflictException({
      code: 'REVIEW_CERTIFICATION_BLOCKED',
      message: 'Certification verification must be resolved before acceptance.',
    });
}

type ReviewDetailRow = {
  id: string;
  assetId: string | null;
  status: string;
  submittedAt: Date | null;
  reviewedAt: Date | null;
  decisionCode: string | null;
  decisionNote: string | null;
  createdAt: Date;
  categoryId: string;
  setId: string | null;
  gradeScaleEntryId: string | null;
  version: number;
  declaredMetadata: Prisma.JsonValue | null;
  reviewMetadata: Prisma.JsonValue | null;
  media: Array<{
    id: string;
    slot: string;
    objectKey: string;
    mimeType: string;
    sizeBytes: number;
    status: string;
    scanResultCode: string | null;
    deletedAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  reviews: Array<{
    id: string;
    status: string;
    decision: string | null;
    reasonCode: string | null;
    note: string | null;
    staffCondition: string | null;
    staffConditionNote: string | null;
    valuationMinor: bigint | null;
    valuationCurrency: string | null;
    valuationBasis: string | null;
    valuationConfidence: number | null;
    valuationNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    completedAt: Date | null;
    reviewer: {
      id: string;
      profile: { displayName: string; publicUsername: string | null } | null;
    };
  }>;
  marketResearch: ResearchRow[];
  preGrades: Array<{
    id: string;
    submissionId: string;
    requestedByUserId: string;
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
    warnings: Prisma.JsonValue | null;
    analysisFingerprint: string;
    analyzedAt: Date | null;
    providerVersion: string | null;
    errorCode: string | null;
    rawResponse: Prisma.JsonValue | null;
    visualizations: Prisma.JsonValue | null;
    supersededAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
  }>;
  certificationVerifications: Array<{
    id: string;
    companyCode: string;
    certificationNumber: string;
    normalizedCertificationNumber: string;
    status: string;
    verificationMode: string;
    officialVerificationUrl: string | null;
    verifiedGrade: string | null;
    verifiedLabel: string | null;
    designation: string | null;
    gradeEra: string | null;
    verifiedAt: Date | null;
    createdAt: Date;
  }>;
  reviewFindings: Array<{
    id: string;
    section: string;
    title: string;
    detail: string | null;
    severity: 'ADVISORY' | 'BLOCKING';
    status: 'OPEN' | 'RESOLVED' | 'DISMISSED';
    customerAction: boolean;
    createdByUserId: string;
    resolvedByUserId: string | null;
    resolutionNote: string | null;
    createdAt: Date;
    updatedAt: Date;
    resolvedAt: Date | null;
  }>;
};
function reviewDetailProjection(submission: ReviewDetailRow) {
  return {
    ...reviewProjection(submission),
    version: submission.version,
    declaredMetadata: submission.declaredMetadata,
    reviewMetadata: submission.reviewMetadata,
    media: submission.media.map(mediaProjection),
    marketResearch: submission.marketResearch[0]
      ? marketResearchProjection(submission.marketResearch[0])
      : null,
    preGrade: submission.preGrades.find((item) => !item.supersededAt)
      ? preGradeProjection(
          submission.preGrades.find((item) => !item.supersededAt)!,
        )
      : null,
    certificationVerification: submission.certificationVerifications[0]
      ? certificationVerificationProjection(
          submission.certificationVerifications[0],
        )
      : null,
    reviews: submission.reviews.map((review) => ({
      id: review.id,
      status: review.status,
      decision: review.decision,
      reasonCode: review.reasonCode,
      note: review.note,
      staffCondition: review.staffCondition,
      staffConditionNote: review.staffConditionNote,
      valuationMinor: review.valuationMinor?.toString() ?? null,
      valuationCurrency: review.valuationCurrency,
      valuationBasis: review.valuationBasis,
      valuationConfidence: review.valuationConfidence,
      valuationNote: review.valuationNote,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      completedAt: review.completedAt?.toISOString() ?? null,
      actor: {
        displayName: review.reviewer.profile?.displayName ?? 'Reviewer',
        username: review.reviewer.profile?.publicUsername ?? null,
      },
    })),
  };
}
function isPersistedPreGradeVisualization(value: unknown): value is {
  side: 'FRONT' | 'BACK';
  type: 'overview' | 'centering';
  objectKey: string;
  centering?: Record<string, number> | null;
} {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  return (
    (item.side === 'FRONT' || item.side === 'BACK') &&
    (item.type === 'overview' || item.type === 'centering') &&
    typeof item.objectKey === 'string'
  );
}
function reviewDetailContextProjection(
  submission: ReviewDetailRow,
  context: {
    owner: {
      id: string;
      createdAt: Date;
      profile: { displayName: string; publicUsername: string | null } | null;
      collectorSubscriptions: Array<{ plan: { displayName: string } }>;
      _count: { submissions: number };
      submissions: Array<{ id: string }>;
    };
    category: { name: string };
    collectibleSet: { name: string; manufacturer: string | null } | null;
    gradeScaleEntry: { label: string; company: { code: string } } | null;
    asset: {
      title: string;
      year: number | null;
      manufacturer: string | null;
      edition: string | null;
      cardNumber: string | null;
      certificationNumber: string | null;
      collectibleSet: { name: string; manufacturer: string | null } | null;
      gradeScaleEntry: { label: string; company: { code: string } } | null;
    } | null;
  } | null,
  reviewer: {
    id: string;
    profile: { displayName: string; publicUsername: string | null } | null;
  } | null,
  activity: Array<{
    id: string;
    action: string;
    actorType: string;
    metadata: Prisma.JsonValue | null;
    createdAt: Date;
    actor: {
      profile: { displayName: string; publicUsername: string | null } | null;
    } | null;
  }>,
  related: Array<{
    id: string;
    status: string;
    submittedAt: Date | null;
    declaredMetadata: Prisma.JsonValue | null;
  }>,
) {
  const metadata = reviewedMetadata(submission);
  const title =
    stringMetadata(metadata.name) ??
    context?.asset?.title ??
    'Untitled submission';
  const requiredSlots = new Set<string>(REQUIRED_MEDIA_SLOTS);
  const safeMedia = submission.media.filter(
    (item) => item.status === 'SAFE' && item.deletedAt === null,
  );
  const presentRequired = safeMedia.filter((item) =>
    requiredSlots.has(item.slot),
  ).length;
  const optional = submission.media.filter(
    (item) => !requiredSlots.has(item.slot) && item.deletedAt === null,
  ).length;
  const presentOptional = safeMedia.filter(
    (item) => !requiredSlots.has(item.slot),
  ).length;
  const notableDetails = Object.entries(metadata)
    .filter(
      ([key, value]) =>
        [
          'firstEdition',
          'holo',
          'shadowless',
          'errorMisprint',
          'autograph',
          'populationReport',
        ].includes(key) &&
        (typeof value === 'string' ||
          typeof value === 'boolean' ||
          typeof value === 'number'),
    )
    .map(([key, value]) => ({
      label: key
        .replace(/[A-Z]/g, (letter) => ` ${letter}`)
        .replace(/^./, (letter) => letter.toUpperCase()),
      value: String(value),
    }));
  const fields = isRecord(metadata.condition)
    ? Object.fromEntries(
        Object.entries(metadata.condition)
          .filter(([, value]) => typeof value === 'string')
          .map(([key, value]) => [key, String(value)]),
      )
    : {};
  const changeAudit = activity.find(
    (item) => item.action === 'SUBMISSION_CHANGES_REQUESTED',
  );
  const changeMetadata = isRecord(changeAudit?.metadata)
    ? changeAudit.metadata
    : {};
  const requestedItems = Array.isArray(changeMetadata.requestedItems)
    ? changeMetadata.requestedItems.filter(
        (item): item is string => typeof item === 'string',
      )
    : [];
  return {
    collectorSummary: context
      ? {
          userId: context.owner.id,
          displayName: context.owner.profile?.displayName ?? 'Collector',
          username: context.owner.profile?.publicUsername ?? null,
          membership:
            context.owner.collectorSubscriptions[0]?.plan.displayName ?? null,
          memberSince: context.owner.createdAt.toISOString(),
          submissionCount: context.owner._count.submissions,
          acceptedCount: context.owner.submissions.length,
        }
      : undefined,
    submissionDetails: {
      source: 'Collector Portal',
      itemCount: submission.media.filter((item) => item.deletedAt === null)
        .length,
      assignedTo: reviewer
        ? {
            id: reviewer.id,
            displayName: reviewer.profile?.displayName ?? 'Reviewer',
            username: reviewer.profile?.publicUsername ?? null,
          }
        : null,
    },
    collectible: {
      title,
      category: context?.category.name ?? 'Collectible',
      set:
        stringMetadata(metadata.set) ??
        context?.asset?.collectibleSet?.name ??
        context?.collectibleSet?.name ??
        null,
      variant: stringMetadata(metadata.variant),
      cardNumber:
        stringMetadata(metadata.cardNumber) ??
        context?.asset?.cardNumber ??
        null,
      grader:
        stringMetadata(metadata.grader) ??
        (context?.asset?.gradeScaleEntry ?? context?.gradeScaleEntry)?.company
          .code ??
        null,
      grade:
        stringMetadata(metadata.grade) ??
        (context?.asset?.gradeScaleEntry ?? context?.gradeScaleEntry)?.label ??
        null,
      certificationNumber:
        stringMetadata(metadata.certificationNumber) ??
        context?.asset?.certificationNumber ??
        null,
      year:
        stringMetadata(metadata.year) ??
        (context?.asset?.year ? String(context.asset.year) : null),
      manufacturer:
        stringMetadata(metadata.manufacturer) ??
        context?.asset?.manufacturer ??
        context?.collectibleSet?.manufacturer ??
        null,
      thumbnailUrl: null as string | null,
    },
    evidenceSummary: {
      required: requiredSlots.size,
      presentRequired,
      optional,
      presentOptional,
      missingRequired: requiredSlots.size - presentRequired,
      percent: Math.round((presentRequired / requiredSlots.size) * 100),
      status:
        presentRequired === requiredSlots.size
          ? 'COMPLETE'
          : presentRequired
            ? 'PARTIAL'
            : 'MISSING_REQUIRED',
      items: submission.media
        .filter((item) => item.deletedAt === null)
        .map((item) => ({
          id: item.id,
          slot: item.slot,
          status: item.status,
          required: requiredSlots.has(item.slot),
          mimeType: item.mimeType,
          sizeBytes: item.sizeBytes,
          uploadedAt: item.updatedAt.toISOString(),
          thumbnailUrl: null as string | null,
        })),
    },
    // `condition` is the collector-described raw-card condition. It is kept
    // separate from `grade`, which is reserved for an official grading scale.
    condition: {
      overallGrade: collectorConditionValue(metadata),
      fields,
    },
    notableDetails,
    customerReference: isRecord(metadata.customerReference)
      ? metadata.customerReference
      : null,
    reviewChecklist: [
      {
        key: 'front',
        label: 'Front image',
        required: true,
        satisfied: safeMedia.some((item) => item.slot === 'front'),
      },
      {
        key: 'back',
        label: 'Back image',
        required: true,
        satisfied: safeMedia.some((item) => item.slot === 'back'),
      },
      {
        key: 'identity',
        label: 'Collectible details',
        required: true,
        satisfied: Boolean(stringMetadata(metadata.name)),
      },
      {
        key: 'research',
        label: 'Market research',
        required: false,
        satisfied: submission.marketResearch.length > 0,
      },
    ],
    activity: activity.map((item) => ({
      id: item.id,
      action: item.action,
      actor:
        item.actor?.profile?.displayName ??
        (item.actorType === 'SYSTEM' ? 'System' : 'Staff'),
      detail:
        item.action === 'SUBMISSION_REVIEW_NOTE_UPDATED'
          ? 'Private review note updated.'
          : null,
      occurredAt: item.createdAt.toISOString(),
    })),
    notes: {
      current: submission.reviews.at(-1)?.note ?? null,
      history: submission.reviews
        .filter((review) => review.note)
        .map((review) => ({
          id: review.id,
          author: 'Staff',
          note: review.note ?? '',
          createdAt: review.createdAt.toISOString(),
        })),
    },
    changeRequest:
      submission.status === 'CHANGES_REQUESTED'
        ? {
            reasonCode: submission.decisionCode,
            message: submission.decisionNote,
            requestedItems,
            requestedAt: submission.reviewedAt?.toISOString() ?? null,
          }
        : null,
    relatedItems: related.map((item) => ({
      id: item.id,
      status: item.status,
      title: isRecord(item.declaredMetadata)
        ? (stringMetadata(item.declaredMetadata.name) ?? 'Untitled submission')
        : 'Untitled submission',
      submittedAt: item.submittedAt?.toISOString() ?? null,
    })),
  };
}
function isRecord(
  value: Prisma.JsonValue | unknown,
): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
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

function intakeLocationSnapshot(location: {
  id: string;
  displayName: string;
  locationType: string;
  environment: string;
  region: string;
  countryCode: string;
  receiverName: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  postalCode: string | null;
  customerSafeAddress: string;
  shippingInstructions: string;
  inPersonInstructions: string | null;
}) {
  return {
    locationId: location.id,
    displayName: location.displayName,
    locationType: location.locationType,
    environment: location.environment,
    region: location.region,
    countryCode: location.countryCode,
    receiverName: location.receiverName,
    addressLine1: location.addressLine1,
    addressLine2: location.addressLine2,
    city: location.city,
    postalCode: location.postalCode,
    customerSafeAddress: location.customerSafeAddress,
    shippingInstructions: location.shippingInstructions,
    inPersonInstructions: location.inPersonInstructions,
  };
}
