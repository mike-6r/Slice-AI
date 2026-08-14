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
    setId: id.nullable().optional(),
    gradeScaleEntryId: id.nullable().optional(),
    declaredMetadata: metadata,
    marketResearchId: id.optional(),
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
    customerMessage: z.string().trim().min(1).max(2000).optional(),
  })
  .strict();
const identityCorrection = z
  .object({
    version: z.number().int().min(1),
    name: z.string().trim().min(1).max(255),
    year: z.string().trim().regex(/^\d{4}$/),
    note: z.string().trim().min(1).max(2000),
  })
  .strict();
const reviewNote = z.object({ note: z.string().trim().max(2000) }).strict();
const queueQuery = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
    q: z.string().trim().max(160).optional(),
    priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).optional(),
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
    submittedFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    submittedTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    sort: z
      .enum(['submitted', 'priority', 'collector', 'research', 'evidence'])
      .optional(),
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
  preGradeResult(@Param('id') submissionId: string, @Req() req: AuthenticatedRequest) {
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
      throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A valid Idempotency-Key header is required.' });
    await this.limiter.enforce('pregrade', req.ip ?? 'unknown', req.actor!.userId);
    return this.preGrade.analyze(req.actor!, submissionId, req.requestId ?? 'unknown');
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
    return this.submissions.queue(req.actor!, input);
  }
  @Get('reviews/submissions/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  detail(@Param('id') submissionId: string, @Req() req: AuthenticatedRequest) {
    return this.submissions.reviewDetail(req.actor!, submissionId);
  }
  @Post('reviews/submissions/:id/claim')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('submission.review')
  claim(
    @Param('id') submissionId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.submissions.claim(
        req.actor!,
        submissionId,
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
        parse(reviewNote, body).note,
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
