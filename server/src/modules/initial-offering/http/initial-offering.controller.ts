import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../../identity/auth/access-token.guard';
import { InitialOfferingService } from '../application/initial-offering.service';

const propose = z
  .object({
    offeredUnits: z
      .string()
      .regex(/^[1-9]\d*$/)
      .max(32),
  })
  .strict();
const reason = z
  .object({ reason: z.string().trim().min(12).max(280) })
  .strict();
const offeringControl = z
  .object({
    reason: z.string().trim().min(12).max(500),
    confirmation: z.enum([
      'PAUSE_INITIAL_OFFERING',
      'CANCEL_UNLAUNCHED_OFFERING',
    ]),
    expectedStatus: z.string().trim().min(1).max(40),
  })
  .strict();
const offeringResume = z
  .object({
    reason: z.string().trim().min(12).max(500),
    confirmation: z.literal('RESUME_INITIAL_OFFERING'),
    expectedStatus: z.literal('PAUSED'),
  })
  .strict();
const offeredUnits = z
  .object({
    offeredUnits: z
      .string()
      .regex(/^[1-9]\d*$/)
      .max(32),
  })
  .strict();

@Controller()
export class InitialOfferingController {
  constructor(
    private readonly offerings: InitialOfferingService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Post('collector/assets/:assetId/offering')
  @UseGuards(AccessTokenGuard)
  async propose(
    @Param('assetId') assetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(propose, body);
    this.requireKey(key);
    await this.limiter.enforce(
      'assetLifecycleMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.offerings.propose(
      req.actor!,
      assetId,
      input.offeredUnits,
      req.requestId ?? 'unknown',
      key!,
    );
  }

  @Get('collector/assets/:assetId/offering')
  @UseGuards(AccessTokenGuard)
  projection(
    @Param('assetId') assetId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.offerings.collectorProjection(req.actor!, assetId);
  }

  @Get('collector/assets/:assetId/offering/preview')
  @UseGuards(AccessTokenGuard)
  preview(
    @Param('assetId') assetId: string,
    @Query('percentageBps') percentageBps: string,
    @Req() req: AuthenticatedRequest,
  ) {
    const value = Number(percentageBps);
    if (!Number.isInteger(value) || value <= 0 || value > 10_000)
      throw new BadRequestException({
        code: 'PERCENTAGE_INVALID',
        message: 'Percentage must be between 0 and 100.',
      });
    return this.offerings.collectorPreview(req.actor!, assetId, value);
  }

  @Patch('collector/initial-offerings/:id')
  @UseGuards(AccessTokenGuard)
  update(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(offeredUnits, body);
    this.requireKey(key);
    return this.offerings.update(
      req.actor!,
      id,
      input.offeredUnits,
      req.requestId ?? 'unknown',
      key!,
    );
  }

  @Get('admin/initial-offerings/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  adminProjection(@Param('id') id: string) {
    return this.offerings.adminProjection(id);
  }

  @Post('admin/initial-offerings/:id/approve')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  approve(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(reason, body);
    return this.write(req, key, () =>
      this.offerings.approve(
        req.actor!,
        id,
        input.reason,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('admin/initial-offerings/:id/request-changes')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  requestChanges(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(reason, body);
    return this.write(req, key, () =>
      this.offerings.requestChanges(
        req.actor!,
        id,
        input.reason,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('admin/initial-offerings/:id/open')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  open(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input =
      body && Object.keys(body as object).length
        ? this.parse(offeringResume, body)
        : undefined;
    return this.write(req, key, () =>
      this.offerings.open(
        req.actor!,
        id,
        req.requestId ?? 'unknown',
        key!,
        input,
      ),
    );
  }

  @Post('admin/initial-offerings/:id/pause')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  pause(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(offeringControl, body);
    if (input.confirmation !== 'PAUSE_INITIAL_OFFERING')
      throw new BadRequestException({
        code: 'CONFIRMATION_REQUIRED',
        message: 'Pause confirmation is invalid.',
      });
    return this.write(req, key, () =>
      this.offerings.transition(
        req.actor!,
        id,
        'PAUSED',
        input,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('admin/initial-offerings/:id/cancel')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  cancel(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(offeringControl, body);
    if (input.confirmation !== 'CANCEL_UNLAUNCHED_OFFERING')
      throw new BadRequestException({
        code: 'CONFIRMATION_REQUIRED',
        message: 'Cancellation confirmation is invalid.',
      });
    return this.write(req, key, () =>
      this.offerings.transition(
        req.actor!,
        id,
        'CANCELLED',
        input,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    return parsed.data;
  }

  private requireKey(key: string | undefined): asserts key is string {
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
  }

  private async write(
    req: AuthenticatedRequest,
    key: string | undefined,
    action: () => Promise<unknown>,
  ) {
    this.requireKey(key);
    await this.limiter.enforce(
      'adminMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return action();
  }
}
