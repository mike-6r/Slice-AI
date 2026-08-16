import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Param,
  Post,
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
import { OwnershipService } from '../application/ownership.service';
import { OwnershipOperationsService } from '../application/ownership-operations.service';
import { OwnershipPolicyService } from '../application/ownership-policy.service';

const issue = z.object({ totalUnits: z.string().min(1).max(7) }).strict();
const transfer = z
  .object({
    fromUserId: z.string().min(1).optional(),
    toUserId: z.string().min(1),
    units: z.string().min(1).max(7),
  })
  .strict();
const reserve = z
  .object({
    userId: z.string().min(1),
    units: z.string().min(1).max(7),
    purposeType: z.string().min(1).max(64),
    purposeId: z.string().min(1).max(128),
    expiresAt: z.coerce.date().optional(),
  })
  .strict();
const correction = z
  .object({
    userId: z.string().min(1),
    units: z.string().min(1).max(7),
    direction: z.enum(['CREDIT', 'DEBIT']),
    reasonCode: z.string().min(1).max(64),
  })
  .strict();

@Controller()
export class OwnershipController {
  constructor(
    private readonly ownership: OwnershipService,
    private readonly operations: OwnershipOperationsService,
    private readonly policy: OwnershipPolicyService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Get('admin/assets/:id/ownership/supply-policy')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  adminSupplyPolicy(@Param('id') id: string) {
    return this.policy.adminProjection(id);
  }

  @Post('admin/assets/:id/ownership/supply-policy/proposals')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  proposeSupplyPolicy(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = z.object({ policyCode: z.string().min(1).max(64), totalUnits: z.string().min(1).max(7), reason: z.string().trim().min(12).max(280) }).strict().safeParse(body);
    if (!input.success) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Supply policy proposal is invalid.' });
    return this.write(req, key, () => this.policy.propose(req.actor!, id, input.data, req.requestId ?? 'unknown', key!));
  }

  @Post('admin/assets/:id/ownership/supply-policy/approve')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  approveSupplyPolicy(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = z.object({ reason: z.string().trim().min(12).max(280) }).strict().safeParse(body);
    if (!input.success) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Supply policy approval reason is required.' });
    return this.write(req, key, () => this.policy.approve(req.actor!, id, input.data.reason, req.requestId ?? 'unknown', key!));
  }

  /** Public aggregate only: no account, allocation, or ownership percentage. */
  @Get('market/assets/:slug/ownership/issuance')
  publicIssuance(@Param('slug') slug: string) {
    return this.ownership.publicIssuance(slug);
  }

  @Get('me/ownership/:assetId')
  @UseGuards(AccessTokenGuard)
  ownPosition(
    @Param('assetId') assetId: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.operations.ownPosition(req.actor!, assetId);
  }

  @Get('me/market/assets/:slug/ownership')
  @UseGuards(AccessTokenGuard)
  ownMarketPosition(
    @Param('slug') slug: string,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.operations.ownMarketPosition(req.actor!, slug);
  }

  @Post('admin/assets/:id/ownership/transfers')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.manage')
  transfer(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.operations.transfer(
        req.actor!,
        id,
        this.parse(transfer, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('admin/assets/:id/ownership/reservations')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.manage')
  reserve(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.operations.reserve(
        req.actor!,
        id,
        this.parse(reserve, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('admin/ownership/reservations/:id/release')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.manage')
  release(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.operations.release(req.actor!, id, req.requestId ?? 'unknown', key!),
    );
  }

  @Post('admin/assets/:id/ownership/corrections')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.manage')
  correction(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.operations.correction(
        req.actor!,
        id,
        this.parse(correction, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('admin/assets/:id/ownership/reconciliation-runs')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.manage')
  reconcile(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.operations.reconcile(
        req.actor!,
        id,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Get('admin/assets/:id/ownership/issuance')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  adminIssuance(@Param('id') id: string) {
    return this.ownership.adminIssuance(id);
  }

  @Post('admin/assets/:id/ownership/issue')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  async issue(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    const parsed = issue.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    await this.limiter.enforce(
      'assetLifecycleMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.ownership.issue(
      req.actor!,
      id,
      parsed.data.totalUnits,
      req.requestId ?? 'unknown',
      key,
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
