import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../auth/access-token.guard';
import { AccessTokenGuard } from '../auth/access-token.guard';
import { RequirePermission } from './permission.decorator';
import { PermissionGuard } from './permission.guard';
import { AccessControlService } from './access-control.service';
import { AuditQueryService } from './audit-query.service';
import { ControlRateLimitService } from './control-rate-limit.service';

const role = z.enum([
  'USER',
  'SUPPORT',
  'COMPLIANCE_ANALYST',
  'ASSET_REVIEWER',
  'VAULT_OPERATOR',
  'FINANCE_OPERATOR',
  'ADMIN',
]);
const statusChange = z
  .object({
    toStatus: z.enum([
      'PENDING_REVIEW',
      'ACTIVE',
      'RESTRICTED',
      'SUSPENDED',
      'CLOSED',
    ]),
    reasonCode: z.string().trim().min(3).max(80),
    restore: z.boolean().optional(),
  })
  .strict();
const roleGrant = z
  .object({
    role,
    scopeType: z.literal('GLOBAL').default('GLOBAL'),
    scopeId: z.literal('*').default('*'),
  })
  .strict();
const auditQuery = z
  .object({
    cursor: z.string().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
    action: z.string().min(1).max(128).optional(),
    actorId: z.string().min(1).max(128).optional(),
    subjectType: z.string().min(1).max(128).optional(),
    subjectId: z.string().min(1).max(128).optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

@Controller('admin')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class AccessControlController {
  constructor(
    private readonly controls: AccessControlService,
    private readonly audit: AuditQueryService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Post('users/:id/status')
  @RequirePermission('users.status.manage')
  async transitionStatus(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireKey(key);
    const input = parse(statusChange, body);
    await this.limiter.enforce(
      'adminMutation',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    return this.controls.transitionStatus(
      request.actor!,
      id as never,
      input,
      request.requestId ?? 'unknown',
      key!,
    );
  }

  @Post('users/:id/roles')
  @RequirePermission('users.roles.manage')
  async grantRole(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireKey(key);
    const input = parse(roleGrant, body);
    await this.limiter.enforce(
      'adminMutation',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    return this.controls.grantRole(
      request.actor!,
      id as never,
      {
        ...input,
        scopeType: input.scopeType ?? 'GLOBAL',
        scopeId: input.scopeId ?? '*',
      },
      request.requestId ?? 'unknown',
      key!,
    );
  }

  @Delete('users/:id/roles/:assignmentId')
  @HttpCode(204)
  @RequirePermission('users.roles.manage')
  async revokeRole(
    @Param('id') id: string,
    @Param('assignmentId') assignmentId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    this.requireKey(key);
    await this.limiter.enforce(
      'adminMutation',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    await this.controls.revokeRole(
      request.actor!,
      id as never,
      assignmentId,
      request.requestId ?? 'unknown',
      key!,
    );
  }

  @Get('audit-events')
  @RequirePermission('audit.read')
  async queryAudit(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parse(auditQuery, query);
    await this.limiter.enforce(
      'auditRead',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    return this.audit.query(request.actor!, {
      ...input,
      limit: input.limit ?? 50,
    });
  }

  @Get('users/:id/status-history')
  @RequirePermission('audit.read')
  async statusHistory(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = parse(auditQuery.pick({ cursor: true, limit: true }), query);
    await this.limiter.enforce(
      'auditRead',
      request.ip ?? 'unknown',
      request.actor!.userId,
    );
    return this.audit.statusHistory(
      request.actor!,
      id,
      input.cursor,
      input.limit ?? 50,
    );
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
  if (!result.success)
    throw new BadRequestException({
      code: 'VALIDATION_FAILED',
      message: 'Request validation failed.',
      fieldErrors: result.error.flatten().fieldErrors,
    });
  return result.data;
}
