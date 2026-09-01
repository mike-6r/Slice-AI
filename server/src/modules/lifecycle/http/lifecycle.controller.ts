import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../identity/auth/access-token.guard';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import {
  CONTROLLED_BETA_PHYSICAL_BYPASS_CONFIRMATION,
  CONTROLLED_BETA_UMBREON_FIXTURE_KEY,
  LifecycleService,
} from '../application/lifecycle.service';
import {
  STAGING_DEMO_PHYSICAL_CONFIRMATION,
  STAGING_DEMO_PIKACHU_FIXTURE_KEY,
} from '../domain/staging-demo-physical.policy';

const money = z
  .object({
    valueMinor: z.coerce.bigint().nonnegative(),
    currency: z.literal('GBP'),
    confidence: z.number().int().min(0).max(100),
    methodologyCode: z.string().min(1).max(64),
    sourceType: z.string().min(1).max(64),
  })
  .strict();
const coverage = z
  .object({
    insuredValueMinor: z.coerce.bigint().nonnegative(),
    currency: z.literal('GBP'),
    effectiveAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    status: z.enum(['PENDING', 'ACTIVE']),
  })
  .strict();
const custody = z
  .object({
    toStatus: z.enum([
      'RECEIVED',
      'INSPECTED',
      'SECURED',
      'RELEASE_PENDING',
      'RELEASED',
      'EXCEPTION',
      'EXPECTED',
    ]),
    providerRef: z.string().trim().min(4).max(128).optional(),
  })
  .strict();
const handoff = z
  .object({
    providerCode: z.string().trim().min(2).max(64),
    facilityCode: z.string().trim().min(2).max(64),
    providerRef: z.string().trim().min(4).max(128),
  })
  .strict();
const operationsQuery = z
  .object({
    limit: z.coerce.number().int().min(1).max(500).default(50),
    tab: z.string().trim().max(40).optional(),
    q: z.string().trim().max(160).optional(),
    category: z.string().trim().max(80).optional(),
    grader: z.string().trim().max(40).optional(),
    stage: z.string().trim().max(48).optional(),
    valuation: z.string().trim().max(48).optional(),
    ownership: z.string().trim().max(48).optional(),
    offering: z.string().trim().max(48).optional(),
    market: z.string().trim().max(48).optional(),
    workType: z.enum(['PRODUCTION', 'OWNER_DEMO', 'CONTROLLED_QA']).optional(),
    attention: z.enum(['REQUIRES_ATTENTION']).optional(),
    priority: z.enum(['HIGH', 'MEDIUM', 'NONE']).optional(),
    assignee: z.string().trim().max(128).optional(),
    sort: z
      .enum([
        'NEEDS_ACTION',
        'UPDATED_DESC',
        'NEWEST',
        'STAGE_OLDEST',
        'TITLE',
        'READY_FIRST',
      ])
      .optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    legacy: z.coerce.boolean().default(false),
  })
  .strict();
const controlledBetaPhysicalBypass = z
  .object({
    assetId: z.string().trim().min(1).max(128),
    fixtureKey: z.literal(CONTROLLED_BETA_UMBREON_FIXTURE_KEY),
    reason: z.string().trim().min(12).max(280),
    confirmation: z.literal(CONTROLLED_BETA_PHYSICAL_BYPASS_CONFIRMATION),
  })
  .strict();
const stagingDemoPhysicalIntake = z
  .object({
    assetId: z.string().trim().min(1).max(128),
    fixtureKey: z.literal(STAGING_DEMO_PIKACHU_FIXTURE_KEY),
    reason: z.string().trim().min(12).max(280),
    confirmation: z.literal(STAGING_DEMO_PHYSICAL_CONFIRMATION),
  })
  .strict();
const operationalControl = z
  .object({
    command: z.enum(['FREEZE', 'UNFREEZE']),
    reason: z.string().trim().min(12).max(500),
    confirmation: z.enum([
      'FREEZE_ASSET_OPERATIONS',
      'UNFREEZE_ASSET_OPERATIONS',
    ]),
    expectedVersion: z.number().int().min(0),
  })
  .strict()
  .superRefine((value, context) => {
    const expected =
      value.command === 'FREEZE'
        ? 'FREEZE_ASSET_OPERATIONS'
        : 'UNFREEZE_ASSET_OPERATIONS';
    if (value.confirmation !== expected)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['confirmation'],
        message: `Confirmation must be ${expected}.`,
      });
  });

@Controller()
export class LifecycleController {
  constructor(
    private readonly lifecycle: LifecycleService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Get('assets/:id/lifecycle')
  @UseGuards(AccessTokenGuard)
  sellerStatus(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.lifecycle.sellerStatus(req.actor!, id);
  }

  @Get('admin/assets/operations')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('admin.console.read')
  operations(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    // Query parsing is deliberately kept bounded; this endpoint exposes only
    // staff-safe lifecycle state and is never a public catalogue projection.
    const input = parse(operationsQuery, query);
    return input.legacy
      ? this.lifecycle.operationsQueue(req.actor!, input.limit ?? 50)
      : this.lifecycle.operationsQueue(req.actor!, input);
  }

  @Get('admin/assets/:id/operations')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('admin.console.read')
  operationDetail(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.lifecycle.operationDetail(req.actor!, id);
  }

  @Post('admin/assets/:id/operational-control')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('trading.manage')
  operationalControl(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.lifecycle.setOperationalControl(
        req.actor!,
        id,
        parse(operationalControl, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('admin/assets/:id/handoff')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('custody.manage')
  handoff(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.lifecycle.handoff(
        req.actor!,
        id,
        parse(handoff, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('admin/assets/:id/custody/transitions')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('custody.manage')
  transition(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () => {
      const input = parse(custody, body);
      return this.lifecycle.custody(
        req.actor!,
        id,
        input,
        req.requestId ?? 'unknown',
        key!,
      );
    });
  }
  @Post('admin/assets/:id/valuations/decisions')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('valuation.manage')
  valuation(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.lifecycle.valuation(
        req.actor!,
        id,
        parse(money, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('admin/assets/:id/insurance/coverage')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('insurance.manage')
  insurance(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.lifecycle.coverage(
        req.actor!,
        id,
        parse(coverage, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Get('admin/assets/:id/publication-readiness')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('publication.manage')
  readiness(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return this.lifecycle.readiness(req.actor!, id, req.requestId);
  }
  @Post('admin/submissions/:submissionId/controlled-beta/physical-bypass')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('controlled_beta.lifecycle.manage')
  controlledBetaPhysicalBypass(
    @Param('submissionId') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.lifecycle.controlledBetaPhysicalBypass(
        req.actor!,
        { submissionId, ...parse(controlledBetaPhysicalBypass, body) },
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('admin/submissions/:submissionId/staging-demo/physical-intake')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('controlled_beta.lifecycle.manage')
  completeStagingDemoPhysicalIntake(
    @Param('submissionId') submissionId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.lifecycle.completeStagingDemoPhysicalIntake(
        req.actor!,
        { submissionId, ...parse(stagingDemoPhysicalIntake, body) },
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('admin/assets/:id/publish')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('publication.manage')
  publish(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.lifecycle.publish(req.actor!, id, req.requestId ?? 'unknown', key!),
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
      'assetLifecycleMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return action();
  }
}
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      fieldErrors: parsed.error.flatten().fieldErrors,
    });
  return parsed.data;
}
