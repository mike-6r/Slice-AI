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
} from '../identity/auth/access-token.guard';
import { PermissionGuard } from '../identity/access/permission.guard';
import { RequirePermission } from '../identity/access/permission.decorator';
import { AdminService } from './admin.service';

const page = z
  .object({
    q: z.string().trim().max(120).optional(),
    role: z.string().trim().max(40).optional(),
    status: z.string().trim().max(40).optional(),
    type: z.string().trim().max(40).optional(),
    membershipPlan: z.string().trim().max(40).optional(),
    membershipStatus: z.string().trim().max(40).optional(),
    joinedFrom: z.string().trim().max(40).optional(),
    joinedTo: z.string().trim().max(40).optional(),
    lastActiveWindow: z.string().trim().max(40).optional(),
    sort: z.string().trim().max(40).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    cursor: z.string().trim().max(120).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
const boundedSearch = z
  .object({
    q: z.string().trim().min(2).max(120),
    limit: z.coerce.number().int().min(1).max(50).default(20),
  })
  .strict();
const operationsQuery = z
  .object({
    status: z.string().trim().max(64).optional(),
    q: z.string().trim().max(120).optional(),
    vaultId: z.string().trim().max(80).optional(),
    carrier: z.string().trim().max(80).optional(),
    dateFrom: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    dateTo: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
    sort: z.string().trim().max(40).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const membershipsQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    plan: z.enum(['STARTER', 'PRO', 'ELITE']).optional(),
    status: z
      .enum(['ACTIVE', 'PAST_DUE', 'CANCELLED', 'CANCEL_AT_PERIOD_END', 'TRIALING', 'EXPIRED'])
      .optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sort: z.enum(['collector', 'plan', 'status', 'billing', 'updated']).default('updated'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
const financeRecordsQuery = z
  .object({
    tab: z.enum(['wallets', 'movements', 'orders', 'executions', 'reconciliation', 'adjustments']).default('wallets'),
    q: z.string().trim().max(120).optional(),
    status: z.string().trim().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
const trustSupportRecordsQuery = z
  .object({
    tab: z.enum(['compliance', 'restrictions', 'tickets', 'escalations']).default('compliance'),
    q: z.string().trim().max(120).optional(),
    status: z.string().trim().max(64).optional(),
    type: z.string().trim().max(64).optional(),
    severity: z.string().trim().max(32).optional(),
    priority: z.string().trim().max(32).optional(),
    scope: z.string().trim().max(64).optional(),
    source: z.string().trim().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
const platformRecordsQuery = z
  .object({
    tab: z.enum(['jobs', 'webhooks', 'integrations', 'audit', 'health', 'feature-flags', 'settings']).default('jobs'),
    q: z.string().trim().max(120).optional(),
    status: z.string().trim().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
const intakeApproval = z
  .object({
    operationallyApproved: z.boolean(),
    acceptingShipments: z.boolean(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
const intakeDestination = z
  .object({
    id: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{2,79}$/),
    displayName: z.string().trim().min(3).max(160),
    receiverName: z.string().trim().min(2).max(160),
    addressLine1: z.string().trim().min(3).max(200),
    addressLine2: z.string().trim().max(200).optional(),
    city: z.string().trim().min(2).max(120),
    region: z.string().trim().min(2).max(120),
    postalCode: z.string().trim().min(2).max(32),
    countryCode: z.string().trim().regex(/^[A-Za-z]{2}$/),
    acceptedCategories: z.array(z.string().trim().min(2).max(120)).max(20),
    shippingInstructions: z.string().trim().min(10).max(2000),
    environment: z.literal('beta'),
    active: z.boolean(),
    acceptingShipments: z.boolean(),
    operationallyApproved: z.boolean(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();

@Controller('admin')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('overview')
  @RequirePermission('admin.console.read')
  overview(@Req() request: AuthenticatedRequest) {
    return this.admin.overview(request.actor!);
  }

  @Get('risk-operations')
  @RequirePermission('admin.console.read')
  riskOperations(@Req() request: AuthenticatedRequest) {
    return this.admin.riskOperations(request.actor!);
  }

  @Get('platform/dashboard')
  @RequirePermission('admin.console.read')
  platformDashboard(@Req() request: AuthenticatedRequest) {
    return this.admin.platformDashboard(request.actor!);
  }

  @Get('platform/records')
  @RequirePermission('admin.console.read')
  platformRecords(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(platformRecordsQuery, query);
    return this.admin.platformRecords(request.actor!, {
      ...input,
      tab: input.tab ?? 'jobs',
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 10,
    });
  }

  @Get('operations/overview')
  @RequirePermission('admin.console.read')
  operationsOverview(@Req() request: AuthenticatedRequest) {
    return this.admin.operationsOverview(request.actor!);
  }

  @Get('intake')
  @RequirePermission('admin.console.read')
  intake(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(operationsQuery, query);
    return this.admin.listIntake(request.actor!, {
      ...input,
      limit: input.limit ?? 50,
    });
  }
  @Post('intake/destinations/:id/approval')
  @RequirePermission('custody.manage')
  approveIntakeDestination(
    @Param('id') destinationId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.setIntakeDestinationApproval(
      request.actor!,
      destinationId,
      this.parse(intakeApproval, body),
      request.requestId ?? 'unknown',
    );
  }
  @Post('intake/destinations')
  @RequirePermission('custody.manage')
  createOrUpdateIntakeDestination(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.createOrUpdateIntakeDestination(
      request.actor!,
      this.parse(intakeDestination, body),
      request.requestId ?? 'unknown',
    );
  }
  @Post('intake/:id/receipt')
  @RequirePermission('admin.console.read')
  confirmReceipt(
    @Param('id') intakeId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!idempotencyKey || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    return this.admin.confirmIntakeReceipt(
      request.actor!,
      intakeId,
      idempotencyKey,
    );
  }

  @Get('memberships')
  @RequirePermission('admin.console.read')
  memberships(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(membershipsQuery, query);
    return this.admin.listMemberships(request.actor!, {
      ...input,
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 10,
    });
  }

  @Get('users')
  @RequirePermission('users.read')
  users(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(page, query);
    return this.admin.listUsers(request.actor!, {
      ...input,
      limit: input.limit ?? 25,
    });
  }

  @Get('users/:id')
  @RequirePermission('users.read')
  user(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.admin.userDetail(request.actor!, id);
  }

  @Get('compliance/cases')
  @RequirePermission('compliance.read')
  compliance(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(page.pick({ limit: true }), query);
    return this.admin.complianceCases(request.actor!, input.limit ?? 25);
  }

  @Get('compliance/cases/:id')
  @RequirePermission('compliance.read')
  complianceDetail(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.complianceCaseDetail(request.actor!, id);
  }

  @Get('trust-support/dashboard')
  @RequirePermission('admin.console.read')
  trustSupportDashboard(@Req() request: AuthenticatedRequest) {
    return this.admin.trustSupportDashboard(request.actor!);
  }

  @Get('trust-support/records')
  @RequirePermission('admin.console.read')
  trustSupportRecords(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(trustSupportRecordsQuery, query);
    return this.admin.trustSupportRecords(request.actor!, {
      ...input,
      tab: input.tab ?? 'compliance',
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 10,
    });
  }

  @Get('finance/summary')
  @RequirePermission('finance.read')
  finance(@Req() request: AuthenticatedRequest) {
    return this.admin.financeSummary(request.actor!);
  }

  @Get('finance/dashboard')
  @RequirePermission('finance.read')
  financeDashboard(@Req() request: AuthenticatedRequest) {
    return this.admin.financeDashboard(request.actor!);
  }

  @Get('finance/records')
  @RequirePermission('finance.read')
  financeRecords(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(financeRecordsQuery, query);
    return this.admin.financeRecords(request.actor!, {
      ...input,
      tab: input.tab ?? 'wallets',
      page: input.page ?? 1,
      pageSize: input.pageSize ?? 10,
    });
  }

  @Get('integrations')
  @RequirePermission('integrations.read')
  integrations(@Req() request: AuthenticatedRequest) {
    return this.admin.integrations(request.actor!);
  }

  @Get('search')
  @RequirePermission('admin.console.read')
  search(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(boundedSearch, query);
    return this.admin.search(request.actor!, input.q, input.limit ?? 20);
  }

  @Get('assets/:id')
  @RequirePermission('admin.console.read')
  collectible(
    @Param('id') id: string,
    @Query('tab') tab: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.collectibleDetail(request.actor!, id, tab);
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
      });
    return parsed.data;
  }
}
