import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../identity/auth/access-token.guard';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { CommunityService } from '../application/community.service';
import { GovernanceService } from '../application/governance.service';
import { DistributionService } from '../application/distribution.service';

const id = z.string().min(1).max(128);
const key = z.string().regex(/^[\x21-\x7e]{1,128}$/);
const postInput = z
  .object({ body: z.string().min(1).max(2000), parentId: id.optional() })
  .strict();
const reportInput = z
  .object({ reasonCode: z.string().regex(/^[A-Z0-9_]{3,64}$/) })
  .strict();
const moderationInput = z
  .object({
    action: z.enum(['HIDE', 'REMOVE', 'LOCK', 'UNHIDE']),
    reasonCode: z.string().regex(/^[A-Z0-9_]{3,64}$/),
  })
  .strict();
const reportReviewInput = z
  .object({
    status: z.enum(['UNDER_REVIEW', 'RESOLVED', 'DISMISSED']),
    reasonCode: z.string().regex(/^[A-Z0-9_]{3,64}$/),
  })
  .strict();
const proposalInput = z
  .object({ offerMinor: z.string().regex(/^\d+$/).max(32) })
  .strict();
const voteInput = z.object({ choice: z.enum(['APPROVE', 'REJECT']) }).strict();
const saleInput = z
  .object({
    grossMinor: z.string().regex(/^\d+$/).max(32),
    soldAt: z.string().datetime(),
    externalReference: z.string().min(1).max(128),
    evidenceReference: z.string().min(1).max(256),
    custodyConfirmed: z.literal(true),
    proceedsAccountId: id,
    proceedsJournalId: id,
  })
  .strict();
const page = z
  .object({
    cursor: z.string().min(1).max(128).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const proposalPage = page
  .extend({
    status: z
      .enum([
        'DRAFT',
        'OPEN',
        'APPROVED',
        'REJECTED',
        'EXPIRED',
        'CANCELLED',
        'SALE_PENDING',
        'SOLD',
        'DISTRIBUTED',
        'FAILED',
      ])
      .optional(),
    assetId: id.optional(),
    viewerRelevant: z.enum(['true', 'false']).optional(),
  })
  .strict();

@Controller()
export class CommunityController {
  constructor(
    private readonly community: CommunityService,
    private readonly governance: GovernanceService,
    private readonly distribution: DistributionService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Put('collectors/:id/follow')
  @UseGuards(AccessTokenGuard)
  async follow(
    @Param('id') followedUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    return this.community.follow(
      req.actor!,
      followedUserId,
      req.requestId ?? 'unknown',
    );
  }
  @Delete('collectors/:id/follow')
  @UseGuards(AccessTokenGuard)
  unfollow(
    @Param('id') followedUserId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.community.unfollow(req.actor!, followedUserId);
  }
  @Get('assets/:id/discussions')
  discussions(@Param('id') assetId: string, @Query() query: unknown) {
    const input = this.parse(page, query);
    return this.community.listPosts(assetId, input.cursor, input.limit);
  }
  @Post('assets/:id/discussions')
  @UseGuards(AccessTokenGuard)
  async createPost(
    @Param('id') assetId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    const input = this.parse(postInput, body);
    return this.community.createPost(
      req.actor!,
      assetId,
      input.body,
      input.parentId,
      req.requestId ?? 'unknown',
    );
  }
  @Patch('discussions/:id')
  @UseGuards(AccessTokenGuard)
  async edit(
    @Param('id') postId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    return this.community.editPost(
      req.actor!,
      postId,
      this.parse(postInput, body).body,
      req.requestId ?? 'unknown',
    );
  }
  @Delete('discussions/:id')
  @UseGuards(AccessTokenGuard)
  async remove(@Param('id') postId: string, @Req() req: AuthenticatedRequest) {
    await this.limit(req);
    return this.community.removePost(
      req.actor!,
      postId,
      req.requestId ?? 'unknown',
    );
  }
  @Post('discussions/:id/reports')
  @UseGuards(AccessTokenGuard)
  async report(
    @Param('id') postId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    return this.community.report(
      req.actor!,
      postId,
      this.parse(reportInput, body).reasonCode,
      req.requestId ?? 'unknown',
    );
  }
  @Post('admin/discussions/:id/moderation')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('community.moderate')
  async moderate(
    @Param('id') postId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(moderationInput, body);
    return this.community.moderate(
      req.actor!,
      postId,
      input.action,
      input.reasonCode,
      req.requestId ?? 'unknown',
    );
  }
  @Post('admin/community-reports/:id/review')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('community.moderate')
  async reviewReport(
    @Param('id') reportId: string,
    @Body() body: unknown,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(reportReviewInput, body);
    return this.community.reviewReport(
      req.actor!,
      reportId,
      input.status,
      input.reasonCode,
      req.requestId ?? 'unknown',
    );
  }
  @Post('assets/:id/sale-proposals')
  @UseGuards(AccessTokenGuard)
  async createProposal(
    @Param('id') assetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idem: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    const input = this.parse(proposalInput, body);
    this.requireKey(idem);
    return this.governance.create(
      req.actor!,
      assetId,
      BigInt(input.offerMinor),
      req.requestId ?? 'unknown',
      idem!,
    );
  }
  @Get('sale-proposals')
  @UseGuards(AccessTokenGuard)
  proposals(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const input = this.parse(proposalPage, query);
    return this.governance.listForViewer(req.actor!, {
      status: input.status,
      assetId: input.assetId,
      viewerRelevant: input.viewerRelevant === 'true',
      cursor: input.cursor,
      limit: input.limit ?? 20,
    });
  }
  @Get('sale-proposals/:id')
  @UseGuards(AccessTokenGuard)
  proposal(@Param('id') proposalId: string, @Req() req: AuthenticatedRequest) {
    return this.governance.read(proposalId, req.actor?.userId);
  }
  @Post('sale-proposals/:id/votes')
  @UseGuards(AccessTokenGuard)
  async vote(
    @Param('id') proposalId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idem: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    this.requireKey(idem);
    return this.governance.vote(
      req.actor!,
      proposalId,
      this.parse(voteInput, body).choice,
      req.requestId ?? 'unknown',
      idem!,
    );
  }
  @Post('admin/sale-proposals/:id/open')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('governance.manage')
  open(
    @Param('id') proposalId: string,
    @Headers('idempotency-key') idem: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireKey(idem);
    return this.governance.open(
      req.actor!,
      proposalId,
      req.requestId ?? 'unknown',
      idem!,
    );
  }
  @Post('admin/sale-proposals/:id/close')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('governance.manage')
  close(
    @Param('id') proposalId: string,
    @Headers('idempotency-key') idem: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireKey(idem);
    return this.governance.close(
      req.actor!,
      proposalId,
      req.requestId ?? 'unknown',
      idem!,
    );
  }
  @Post('admin/sale-proposals/:id/record-sale')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('distribution.manage')
  async recordSale(
    @Param('id') proposalId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') idem: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    this.requireKey(idem);
    const input = this.parse(saleInput, body);
    const sale = await this.distribution.verifyExternalSale(
      req.actor!,
      proposalId,
      {
        ...input,
        grossMinor: BigInt(input.grossMinor),
        soldAt: new Date(input.soldAt),
      },
      req.requestId ?? 'unknown',
      idem!,
    );
    const distribution = await this.distribution.prepare(
      req.actor!,
      proposalId,
      req.requestId ?? 'unknown',
    );
    return { ...sale, distribution };
  }
  @Post('admin/sale-proposals/:id/distribute')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('distribution.manage')
  async distribute(
    @Param('id') proposalId: string,
    @Headers('idempotency-key') idem: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    this.requireKey(idem);
    return this.distribution.execute(
      req.actor!,
      proposalId,
      req.requestId ?? 'unknown',
      idem!,
    );
  }
  @Post('admin/sale-proposals/:id/reconcile-distribution')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('distribution.manage')
  async reconcileDistribution(
    @Param('id') proposalId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.limit(req);
    return this.distribution.reconcile(req.actor!, proposalId);
  }

  private async limit(req: AuthenticatedRequest) {
    await this.limiter.enforce(
      'tradingMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
  }
  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const result = schema.safeParse(value);
    if (!result.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fieldErrors: result.error.flatten().fieldErrors,
      });
    return result.data;
  }
  private requireKey(value: string | undefined) {
    if (!value || !key.safeParse(value).success)
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
  }
}
