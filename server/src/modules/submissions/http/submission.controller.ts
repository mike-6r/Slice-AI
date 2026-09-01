import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../identity/auth/access-token.guard';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { SubmissionService } from '../application/submission.service';
import { CollectibleMarketResearchService } from '../../market-research/market-research.service';
import { LocalSubmissionStorage } from '../infrastructure/local-submission-storage';
import { MAX_MEDIA_BYTES } from '../domain/submission.policy';
import { RawCardPreGradeService } from '../application/raw-card-pregrade.service';

const id = z.string().min(1).max(128);
const metadata = z.record(z.unknown()).nullable().optional();
const draft = z
  .object({
    categoryId: id,
    currentStep: z.number().int().min(1).max(7).optional(),
    setId: id.nullable().optional(),
    gradeScaleEntryId: id.nullable().optional(),
    declaredMetadata: metadata,
    marketResearchId: id.optional(),
    preferredIntakeLocationId: id.nullable().optional(),
    preferredDeliveryMethod: z
      .enum(['SHIPMENT', 'IN_PERSON'])
      .nullable()
      .optional(),
  })
  .strict();
const draftPatch = draft.extend({ version: z.number().int().min(1) }).strict();
const uploadIntent = z
  .object({
    slot: z.string().regex(/^[a-z][a-z0-9_-]{0,31}$/),
    // Type and size policy is enforced in the application service so clients
    // receive the documented media-specific error contracts.
    mimeType: z.string().min(1).max(128),
    sizeBytes: z.number().int().min(1),
    originalFilename: z.string().min(1).max(255),
  })
  .strict();
const complete = z
  .object({
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    version: z.number().int().min(1),
  })
  .strict();
const version = z.object({ version: z.coerce.number().int().min(1) }).strict();
const decision = z
  .object({
    version: z.coerce.number().int().min(1),
    reasonCode: z
      .string()
      .trim()
      .regex(/^[A-Z][A-Z0-9_]{1,63}$/),
    note: z.string().trim().min(1).max(2000).optional(),
    requestedItems: z
      .array(z.string().trim().min(1).max(120))
      .min(1)
      .max(10)
      .optional(),
    requestedFindingIds: z.array(id).max(20).optional(),
    customerMessage: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
const identityCorrection = z
  .object({
    version: z.number().int().min(1),
    name: z.string().trim().min(1).max(255),
    year: z
      .string()
      .trim()
      .regex(/^\d{4}$/),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
const reviewNote = z
  .object({
    version: z.coerce.number().int().min(1),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
const reviewCondition = z
  .object({
    version: z.coerce.number().int().min(1),
    condition: z.string().trim().min(1).max(80),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
const reviewValuation = z
  .object({
    version: z.coerce.number().int().min(1),
    valueMinor: z.string().regex(/^\d+$/).max(18),
    currency: z.literal('GBP'),
    basis: z.string().trim().min(1).max(120),
    confidence: z.number().int().min(0).max(100).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
const reviewIdentity = z
  .object({
    version: z.coerce.number().int().min(1),
    name: z.string().trim().min(1).max(255),
    year: z
      .string()
      .trim()
      .regex(/^\d{4}$/)
      .optional(),
    set: z.string().trim().max(255).optional(),
    cardNumber: z.string().trim().max(80).optional(),
    variant: z.string().trim().max(255).optional(),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
const reviewFinding = z
  .object({
    version: z.coerce.number().int().min(1),
    section: z.enum([
      'identity',
      'evidence',
      'certification',
      'research',
      'assessment',
      'decision',
    ]),
    title: z.string().trim().min(1).max(180),
    detail: z.string().trim().max(2000).optional(),
    severity: z.enum(['ADVISORY', 'BLOCKING']),
    customerAction: z.boolean().optional(),
  })
  .strict();
const reviewFindingStatus = z
  .object({
    version: z.coerce.number().int().min(1),
    status: z.enum(['OPEN', 'RESOLVED', 'DISMISSED']),
    resolutionNote: z.string().trim().max(2000).optional(),
  })
  .strict();
const reviewRecovery = z
  .object({
    version: z.coerce.number().int().min(1),
    reason: z.string().trim().min(1).max(2000),
  })
  .strict();
const reviewerAssignment = z
  .object({
    version: z.coerce.number().int().min(1),
    reviewerId: id.nullable(),
    reason: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
const evidenceReview = z
  .object({
    version: z.coerce.number().int().min(1),
    note: z.string().trim().max(2000).optional(),
    customerAction: z.boolean().optional(),
  })
  .strict();
const researchReference = z
  .object({
    version: z.coerce.number().int().min(1),
    provider: z.string().trim().min(1).max(120),
    url: z.string().url().optional(),
    referenceId: z.string().trim().max(255).optional(),
    currency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    valueMinor: z.string().regex(/^\d+$/).max(24).optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
const researchNote = z
  .object({
    version: z.coerce.number().int().min(1),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
const canonicalize = z
  .object({ version: z.coerce.number().int().min(1) })
  .strict();
const queueQuery = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    q: z.string().trim().max(160).optional(),
    status: z.enum(['SUBMITTED', 'IN_REVIEW']).optional(),
    evidence: z.enum(['complete', 'missing', 'partial']).optional(),
    research: z
      .enum([
        'completed',
        'in_progress',
        'pending',
        'unavailable',
        'not_requested',
      ])
      .optional(),
    readiness: z
      .enum(['READY', 'NEEDS_EVIDENCE', 'MANUAL_REVIEW', 'BLOCKED'])
      .optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    reviewer: z.enum(['unclaimed', 'mine', 'claimed']).optional(),
    testFixture: z.enum(['include', 'only', 'exclude']).default('exclude'),
    grader: z.string().trim().max(80).optional(),
    submittedFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    submittedTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    sort: z.enum(['submitted']).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
const ownerListQuery = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
const marketResearch = z
  .object({
    categoryId: id,
    declaredMetadata: z.record(z.unknown()),
    refresh: z.boolean().optional(),
  })
  .strict();
const marketResearchAttach = z.object({ submissionId: id }).strict();
const marketResearchPromotion = z.object({ assetId: id }).strict();
const certificationVerification = z
  .object({
    certificationNumber: z.string().trim().min(3).max(80),
  })
  .strict();
const manualCertificationVerification = z
  .object({
    verifiedIdentity: z.record(z.unknown()),
    verifiedGrade: z
      .string()
      .trim()
      .regex(/^\d{1,2}(?:\.\d{1,2})?$/),
    verifiedLabel: z.string().trim().max(120).optional(),
    designation: z.string().trim().max(80).optional(),
    subgrades: z.record(z.unknown()).optional(),
    providerReference: z.string().trim().max(255).optional(),
  })
  .strict();

@Controller()
export class SubmissionController {
  constructor(
    private readonly submissions: SubmissionService,
    private readonly limiter: ControlRateLimitService,
    private readonly localStorage: LocalSubmissionStorage,
    private readonly research: CollectibleMarketResearchService,
    private readonly preGrade: RawCardPreGradeService,
  ) {}

  /** Staging-only upload capability endpoint. The opaque one-use token is the
   * authority; production keeps local storage disabled by configuration. */
  @Put('submissions/local-uploads/:token')
  @HttpCode(204)
  async localUpload(
    @Param('token') token: string,
    @Headers('content-type') contentType: string | undefined,
    @Req() req: Request,
  ) {
    await this.localStorage.receiveBrowserUpload(
      token,
      contentType ?? '',
      await readRawUpload(req, MAX_MEDIA_BYTES),
    );
  }

  @Post('submissions')
  @UseGuards(AccessTokenGuard)
  create(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.create(
        req.actor!,
        parse(draft, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('submissions/market-research')
  @UseGuards(AccessTokenGuard)
  async marketCheck(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    await this.limiter.enforce(
      'marketResearch',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.research.research(
      req.actor!,
      parse(marketResearch, body),
      req.requestId ?? 'unknown',
    );
  }
  @Post('reviews/market-research/:id/reclassify')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  reclassifyMarketResearch(
    @Param('id') researchId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.research.reclassifyStored(
        req.actor!,
        researchId,
        req.requestId ?? 'unknown',
      ),
    );
  }
  @Post('reviews/market-research/:id/attach')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  attachMarketResearch(
    @Param('id') researchId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () => {
      const input = parse(marketResearchAttach, body);
      return this.research.attachToApprovedSubmission(
        req.actor!,
        researchId,
        input.submissionId,
        req.requestId ?? 'unknown',
      );
    });
  }
  @Post('reviews/submissions/:id/promote-market-research')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  promoteMarketResearch(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () => {
      const input = parse(marketResearchPromotion, body);
      return this.research.promoteToAsset(
        req.actor!,
        submissionId,
        input.assetId,
        req.requestId ?? 'unknown',
      );
    });
  }

  /**
   * Complete the staff-controlled handoff from an approved submission to the
   * canonical Asset that will carry its custody, valuation and market state.
   * The service owns all locking, approval and duplicate-link invariants.
   */
  @Post('admin/submissions/:id/asset-link')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  linkApprovedAsset(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () => {
      const input = parse(marketResearchPromotion, body);
      return this.submissions.linkApprovedAsset(
        req.actor!,
        submissionId,
        input.assetId,
        req.requestId ?? 'unknown',
        key!,
      );
    });
  }

  @Post('admin/submissions/:id/canonicalize')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  createAndLinkCanonicalAsset(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.createAndLinkCanonicalAsset(
        req.actor!,
        submissionId,
        parse(canonicalize, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Get('submissions')
  @UseGuards(AccessTokenGuard)
  list(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const input = parse(ownerListQuery, query);
    return this.submissions.listOwned(
      req.actor!,
      input.cursor,
      input.limit ?? 25,
    );
  }
  @Get('submissions/:id')
  @UseGuards(AccessTokenGuard)
  get(@Param('id') submissionId: string, @Req() req: AuthenticatedRequest) {
    return this.submissions.getOwned(req.actor!, submissionId);
  }
  @Get('submissions/:id/pre-grade')
  @UseGuards(AccessTokenGuard)
  preGradeResult(
    @Param('id') submissionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.preGrade.getOwned(req.actor!, submissionId);
  }
  @Post('submissions/:id/pre-grade')
  @UseGuards(AccessTokenGuard)
  async runPreGrade(
    @Param('id') submissionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    await this.limiter.enforce(
      'pregrade',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.preGrade.analyze(
      req.actor!,
      submissionId,
      req.requestId ?? 'unknown',
    );
  }
  @Patch('submissions/:id')
  @UseGuards(AccessTokenGuard)
  update(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.update(
        req.actor!,
        submissionId,
        parse(draftPatch, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('submissions/:id/certification/verify')
  @UseGuards(AccessTokenGuard)
  verifyCertification(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.verifyCertification(
        req.actor!,
        submissionId,
        parse(certificationVerification, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('submissions/:id/media/upload-intents')
  @UseGuards(AccessTokenGuard)
  intent(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.uploadIntent(
        req.actor!,
        submissionId,
        parse(uploadIntent, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('submissions/:id/media/:mediaId/complete')
  @UseGuards(AccessTokenGuard)
  complete(
    @Param('id') submissionId: string,
    @Param('mediaId') mediaId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.completeMedia(
        req.actor!,
        submissionId,
        mediaId,
        parse(complete, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Delete('submissions/:id/media/:mediaId')
  @UseGuards(AccessTokenGuard)
  removeMedia(
    @Param('id') submissionId: string,
    @Param('mediaId') mediaId: string,
    @Query() query: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.deleteMedia(
        req.actor!,
        submissionId,
        mediaId,
        parse(version, query).version,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('submissions/:id/submit')
  @UseGuards(AccessTokenGuard)
  submit(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.submit(
        req.actor!,
        submissionId,
        parse(version, body).version,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('submissions/:id/cancel')
  @UseGuards(AccessTokenGuard)
  cancel(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.cancel(
        req.actor!,
        submissionId,
        parse(version, body).version,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Get('reviews/submissions')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  queue(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const input = parse(queueQuery, query);
    return this.submissions.operationalQueue(req.actor!, input);
  }
  @Get('reviews/submissions/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  detail(@Param('id') submissionId: string, @Req() req: AuthenticatedRequest) {
    return this.submissions.reviewDetail(req.actor!, submissionId);
  }
  @Get('reviews/submissions/:id/reviewers')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  eligibleReviewers(
    @Param('id') submissionId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.submissions.listEligibleReviewers(req.actor!, submissionId);
  }
  @Post('reviews/submissions/:id/assignment')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  assignment(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.assignPrimaryReviewer(
        req.actor!,
        submissionId,
        parse(reviewerAssignment, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/claim')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  claim(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.claim(
        req.actor!,
        submissionId,
        parse(version, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/release')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  release(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.releaseClaim(
        req.actor!,
        submissionId,
        parse(version, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/recovery/recalculate-readiness')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  recalculateReadiness(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.recalculateReadiness(
        req.actor!,
        submissionId,
        parse(reviewRecovery, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('reviews/submissions/:id/condition')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  condition(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.saveStaffCondition(
        req.actor!,
        submissionId,
        parse(reviewCondition, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('reviews/submissions/:id/identity')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  reviewIdentity(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.saveReviewIdentity(
        req.actor!,
        submissionId,
        parse(reviewIdentity, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/findings')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  createFinding(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.createReviewFinding(
        req.actor!,
        submissionId,
        parse(reviewFinding, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('reviews/submissions/:id/findings/:findingId')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  updateFinding(
    @Param('id') submissionId: string,
    @Param('findingId') findingId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.setReviewFindingStatus(
        req.actor!,
        submissionId,
        findingId,
        parse(reviewFindingStatus, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/evidence/:mediaId/accept')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  acceptEvidence(
    @Param('id') submissionId: string,
    @Param('mediaId') mediaId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.acceptEvidence(
        req.actor!,
        submissionId,
        mediaId,
        parse(evidenceReview, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/evidence/:mediaId/flag')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  flagEvidence(
    @Param('id') submissionId: string,
    @Param('mediaId') mediaId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.flagEvidence(
        req.actor!,
        submissionId,
        mediaId,
        parse(evidenceReview, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/research/references')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  addResearchReference(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.addResearchReference(
        req.actor!,
        submissionId,
        parse(researchReference, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('reviews/submissions/:id/research/references/:referenceId/remove')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  removeResearchReference(
    @Param('id') submissionId: string,
    @Param('referenceId') referenceId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.removeResearchReference(
        req.actor!,
        submissionId,
        referenceId,
        parse(evidenceReview, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/research/notes')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  addResearchNote(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.addResearchNote(
        req.actor!,
        submissionId,
        parse(researchNote, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('reviews/submissions/:id/valuation')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  valuation(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.saveStaffValuation(
        req.actor!,
        submissionId,
        parse(reviewValuation, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/request-changes')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  changes(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.decide(
        req.actor!,
        submissionId,
        'CHANGES_REQUESTED',
        parse(decision, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/approve')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  approve(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.decide(
        req.actor!,
        submissionId,
        'APPROVED',
        parse(decision, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/reject')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  reject(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.decide(
        req.actor!,
        submissionId,
        'REJECTED',
        parse(decision, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/correct-identity')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  correctIdentity(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.correctApprovedIdentity(
        req.actor!,
        submissionId,
        parse(identityCorrection, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/certification/manual-verify')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  manualVerifyCertification(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.manualVerifyCertification(
        req.actor!,
        submissionId,
        parse(manualCertificationVerification, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('reviews/submissions/:id/notes')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  notes(
    @Param('id') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.saveReviewNote(
        req.actor!,
        submissionId,
        parse(reviewNote, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  private async write(
    req: AuthenticatedRequest,
    key: string | undefined,
    action: () => Promise<unknown>,
  ) {
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    await this.limiter.enforce(
      'submissionMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return action();
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      fieldErrors: result.error.flatten().fieldErrors,
    });
  return result.data;
}

function readRawUpload(req: Request, maxBytes: number) {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(
          new BadRequestException({
            code: 'MEDIA_TOO_LARGE',
            message: 'The media file is too large.',
          }),
        );
        return;
      }
      chunks.push(chunk);
    });
    req.once('end', () => resolve(Buffer.concat(chunks)));
    req.once('error', reject);
  });
}
