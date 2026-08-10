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
import { LifecycleService } from '../application/lifecycle.service';

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
  })
  .strict();
const operationsQuery = z
  .object({ limit: z.coerce.number().int().min(1).max(100).default(50) })
  .strict();

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
  @UseGuards(AccessTokenGuard)
  operations(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    // Query parsing is deliberately kept bounded; this endpoint exposes only
    // staff-safe lifecycle state and is never a public catalogue projection.
    return this.lifecycle.operationsQueue(
      req.actor!,
      parse(operationsQuery, query).limit ?? 50,
    );
  }

  @Post('admin/assets/:id/handoff')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('custody.manage')
  handoff(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.lifecycle.handoff(req.actor!, id, req.requestId ?? 'unknown', key!),
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
    return this.write(req, key, () =>
      this.lifecycle.custody(
        req.actor!,
        id,
        parse(custody, body).toStatus,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
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
