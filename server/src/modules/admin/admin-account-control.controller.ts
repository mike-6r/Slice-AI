import {
  BadRequestException,
  Body,
  Controller,
  Headers,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../identity/auth/access-token.guard';
import { ControlRateLimitService } from '../identity/access/control-rate-limit.service';
import { PermissionGuard } from '../identity/access/permission.guard';
import { RequirePermission } from '../identity/access/permission.decorator';
import { AdminAccountControlService } from './admin-account-control.service';

const revision = z.string().datetime({ offset: true });
const reasonCode = z.string().trim().min(3).max(80);
const mutation = z.object({ expectedRevision: revision, reasonCode }).strict();
const profile = mutation
  .extend({
    displayName: z.string().trim().min(2).max(120).optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/)
      .optional(),
    timezone: z.string().trim().min(3).max(80).optional(),
    preferredCurrency: z
      .string()
      .trim()
      .regex(/^[A-Z]{3}$/)
      .optional(),
  })
  .refine(
    (value) =>
      value.displayName !== undefined ||
      value.countryCode !== undefined ||
      value.timezone !== undefined ||
      value.preferredCurrency !== undefined,
    'At least one supported profile field is required.',
  );
const restriction = mutation
  .extend({
    scope: z.enum([
      'ACCOUNT',
      'EXTERNAL_MOVEMENT',
      'WITHDRAWAL',
      'FUNDING',
      'TRADING_ELIGIBILITY',
    ]),
  })
  .strict();
const note = mutation
  .extend({
    category: z.enum([
      'ACCOUNT',
      'SECURITY',
      'COMPLIANCE',
      'FINANCIAL',
      'OPERATIONS',
    ]),
    note: z.string().trim().min(3).max(500),
  })
  .strict();

@Controller('admin')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class AdminAccountControlController {
  constructor(
    private readonly controls: AdminAccountControlService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Patch('users/:id/profile')
  @RequirePermission('users.profile.manage')
  updateProfile(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.run(request, key, () =>
      this.controls.updateProfile(
        request.actor!,
        id,
        parse(profile, body),
        request.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('users/:id/security/revoke-sessions')
  @RequirePermission('users.security.manage')
  revokeSessions(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.run(request, key, () =>
      this.controls.revokeSessions(
        request.actor!,
        id,
        parse(mutation, body),
        request.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('users/:id/security/reset-two-factor')
  @RequirePermission('users.security.manage')
  resetTwoFactor(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.run(request, key, () =>
      this.controls.resetTwoFactor(
        request.actor!,
        id,
        parse(mutation, body),
        request.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('users/:id/restrictions')
  @RequirePermission('users.restrictions.manage')
  createRestriction(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.run(request, key, () =>
      this.controls.createRestriction(
        request.actor!,
        id,
        parse(restriction, body),
        request.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('users/:id/restrictions/:holdId/release')
  @RequirePermission('users.restrictions.manage')
  releaseRestriction(
    @Param('id') id: string,
    @Param('holdId') holdId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.run(request, key, () =>
      this.controls.releaseRestriction(
        request.actor!,
        id,
        holdId,
        parse(mutation, body),
        request.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('users/:id/notes')
  @RequirePermission('users.notes.manage')
  addNote(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.run(request, key, () =>
      this.controls.addNote(
        request.actor!,
        id,
        parse(note, body),
        request.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  private async run(
    request: AuthenticatedRequest,
    key: string | undefined,
    action: () => Promise<unknown>,
  ) {
    this.requireKey(key);
    await this.limiter.enforce(
      'adminMutation',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    return action();
  }

  private requireKey(value: string | undefined) {
    if (!value || !/^[\x21-\x7e]{1,128}$/.test(value)) {
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    }
  }
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      fieldErrors: result.error.flatten().fieldErrors,
    });
  }
  return result.data;
}
