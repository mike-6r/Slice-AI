import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  Patch,
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
import { MarketRefreshService } from '../market/market-refresh.service';

const page = z
  .object({
    q: z.string().trim().max(120).optional(),
    role: z.string().trim().max(40).optional(),
    status: z.string().trim().max(40).optional(),
    type: z.string().trim().max(40).optional(),
    membershipPlan: z.string().trim().max(40).optional(),
    membershipStatus: z.string().trim().max(40).optional(),
    financialState: z.string().trim().max(40).optional(),
    complianceState: z.string().trim().max(40).optional(),
    payoutState: z.string().trim().max(40).optional(),
    attention: z.enum(['REQUIRED']).optional(),
    fixture: z.enum(['ALL', 'NORMAL', 'DEMO']).optional(),
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
    fixture: z.enum(['NORMAL', 'TEST', 'ALL']).optional(),
    workType: z.enum(['ALL', 'PRODUCTION', 'DEMO_QA']).default('ALL'),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();
const accountHistoryQuery = page
  .pick({ page: true, pageSize: true })
  .extend({
    category: z
      .enum([
        'ALL',
        'SECURITY',
        'FINANCIAL',
        'TRADING',
        'COMPLIANCE',
        'ACCOUNT',
        'COLLECTOR',
        'ADMIN',
        'PROVIDER',
      ])
      .default('ALL'),
  })
  .strict();
const catalogueQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    status: z.string().trim().max(32).optional(),
    category: z.string().trim().max(80).optional(),
    physicalState: z.string().trim().max(40).optional(),
    verification: z.string().trim().max(40).optional(),
    custody: z.string().trim().max(40).optional(),
    valuation: z.string().trim().max(40).optional(),
    ownership: z.string().trim().max(40).optional(),
    market: z.string().trim().max(40).optional(),
    grading: z.string().trim().max(40).optional(),
    collector: z.string().trim().max(120).optional(),
    fixture: z.enum(['NORMAL', 'TEST', 'ALL']).default('NORMAL'),
    workType: z.enum(['ALL', 'PRODUCTION', 'DEMO_QA']).default('PRODUCTION'),
    sort: z.string().trim().max(40).optional(),
    sortDirection: z.enum(['asc', 'desc']).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(25),
  })
  .strict();
const collectorFeature = z.object({ featured: z.boolean() }).strict();
const collectorDirectoryPatch = z
  .object({
    isPublic: z.boolean().optional(),
    isFeatured: z.boolean().optional(),
    featurePriority: z.coerce.number().int().min(0).max(10_000).optional(),
    featuredCaption: z.string().trim().max(240).nullable().optional(),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
const intakeReceiptConfirmation = z
  .object({
    packageCondition: z
      .enum(['ACCEPTABLE', 'DAMAGED', 'UNKNOWN'])
      .default('UNKNOWN'),
    checklist: z
      .object({
        packageReceived: z.boolean(),
        correctIntakeReference: z.boolean(),
        correctCollectible: z.boolean(),
        visibleConditionAcceptable: z.boolean(),
        tamperDamageChecked: z.boolean(),
        trackingMatches: z.boolean(),
      })
      .strict(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
const intakeReceiptChecklistKeys = [
  'packageReceived',
  'correctIntakeReference',
  'correctCollectible',
  'visibleConditionAcceptable',
  'tamperDamageChecked',
  'trackingMatches',
] as const;
const intakeReceiptChecklistAliases: Record<
  (typeof intakeReceiptChecklistKeys)[number],
  string[]
> = {
  packageReceived: ['packagereceived', 'received', 'packagereceivedby_slice'],
  correctIntakeReference: ['correctintakereference', 'intakereference', 'correctreference'],
  correctCollectible: ['correctcollectible', 'collectiblecorrect', 'correctitem'],
  visibleConditionAcceptable: [
    'visibleconditionacceptable',
    'conditionacceptable',
    'visiblecondition',
  ],
  tamperDamageChecked: ['tamperdamagechecked', 'tamperchecked', 'damagedchecked'],
  trackingMatches: ['trackingmatches', 'trackingmatch', 'trackingcorrect'],
};
const intakeCarrierDeliveryConfirmation = z.object({}).strict();
const intakeDestinationAssignment = z
  .object({
    vaultId: z.string().trim().min(1).max(80),
    deliveryMethod: z.enum(['SHIPMENT', 'IN_PERSON']),
    reason: z.string().trim().min(3).max(500),
  })
  .strict();
const intakeVerificationComplete = z
  .object({
    identityMatch: z.boolean(),
    certificationMatch: z.boolean().nullable().optional(),
    gradeMatch: z.boolean().nullable().optional(),
    variantMatch: z.boolean().nullable().optional(),
    note: z.string().trim().max(2000).optional(),
  })
  .strict();
const intakeExceptionCreate = z
  .object({
    code: z.enum([
      'WRONG_ITEM',
      'DAMAGED_PACKAGE',
      'DAMAGED_COLLECTIBLE',
      'CERT_MISMATCH',
      'GRADE_MISMATCH',
      'IDENTITY_MISMATCH',
      'MISSING_CONTENTS',
      'TRACKING_MISMATCH',
      'DESTINATION_ERROR',
      'RETURN_TO_SENDER',
      'OTHER_REVIEW',
    ]),
    severity: z.enum(['LOW', 'MEDIUM', 'HIGH']),
    notes: z.string().trim().min(3).max(2000),
  })
  .strict();
const intakeExceptionResolve = z
  .object({ note: z.string().trim().min(3).max(2000) })
  .strict();
const membershipsQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    plan: z.enum(['STARTER', 'PRO', 'ELITE']).optional(),
    status: z
      .enum([
        'INCOMPLETE',
        'ACTIVE',
        'PAST_DUE',
        'CANCELLED',
        'CANCEL_AT_PERIOD_END',
        'TRIALING',
        'SUSPENDED',
        'EXPIRED',
      ])
      .optional(),
    billing: z
      .enum(['CURRENT', 'PENDING', 'PAST_DUE', 'SUSPENDED', 'DISABLED'])
      .optional(),
    usage: z.enum(['NORMAL', 'AT_LIMIT', 'OVER_LIMIT']).optional(),
    fixture: z.enum(['NORMAL', 'TEST', 'ALL']).default('ALL'),
    needsAction: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true')
      .optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
    sort: z
      .enum(['collector', 'plan', 'status', 'billing', 'updated'])
      .default('updated'),
    sortDirection: z.enum(['asc', 'desc']).default('desc'),
  })
  .strict();
const financeRecordsQuery = z
  .object({
    tab: z
      .enum([
        'wallets',
        'movements',
        'orders',
        'executions',
        'reconciliation',
        'adjustments',
      ])
      .default('wallets'),
    q: z.string().trim().max(120).optional(),
    status: z.string().trim().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
const trustSupportRecordsQuery = z
  .object({
    tab: z
      .enum(['compliance', 'restrictions', 'tickets', 'escalations'])
      .default('compliance'),
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
    tab: z
      .enum([
        'jobs',
        'webhooks',
        'integrations',
        'audit',
        'health',
        'feature-flags',
        'settings',
      ])
      .default('jobs'),
    q: z.string().trim().max(120).optional(),
    status: z.string().trim().max(64).optional(),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(10),
  })
  .strict();
const intakeLocationsQuery = z
  .object({
    q: z.string().trim().max(120).optional(),
    type: z
      .enum([
        'SLICE_VAULT',
        'SLICE_INTAKE',
        'PARTNER_STORE',
        'PARTNER_INTAKE',
        'DEMO_TEST',
      ])
      .optional(),
    deliveryMethod: z.enum(['SHIPPING', 'IN_PERSON', 'BOTH']).optional(),
    availability: z
      .enum(['ACCEPTING', 'PAUSED', 'AT_CAPACITY', 'UNAVAILABLE'])
      .optional(),
    environment: z.enum(['beta', 'production']).optional(),
    status: z
      .enum(['ACTIVE', 'TEMPORARILY_UNAVAILABLE', 'INACTIVE'])
      .optional(),
    acceptingNewIntakes: z.preprocess(
      (value) => (value === 'true' ? true : value === 'false' ? false : value),
      z.boolean().optional(),
    ),
    sort: z.enum(['NAME', 'ACTIVE_INTAKES', 'RECENT_ACTIVITY']).default('NAME'),
    sortDirection: z.enum(['asc', 'desc']).default('asc'),
    page: z.coerce.number().int().min(1).max(10_000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const intakeLocationInput = z
  .object({
    displayName: z.string().trim().min(3).max(160),
    locationType: z.enum([
      'SLICE_VAULT',
      'SLICE_INTAKE',
      'PARTNER_STORE',
      'PARTNER_INTAKE',
      'DEMO_TEST',
    ]),
    environment: z.enum(['beta', 'production']),
    status: z.enum(['ACTIVE', 'TEMPORARILY_UNAVAILABLE', 'INACTIVE']),
    acceptingNewIntakes: z.boolean(),
    operationallyApproved: z.boolean(),
    acceptingShipments: z.boolean(),
    acceptingInPerson: z.boolean(),
    receiverName: z.string().trim().min(2).max(160).nullable().optional(),
    addressLine1: z.string().trim().min(3).max(200).nullable().optional(),
    addressLine2: z.string().trim().max(200).nullable().optional(),
    city: z.string().trim().min(2).max(120).nullable().optional(),
    region: z.string().trim().min(2).max(120),
    postalCode: z.string().trim().min(2).max(32).nullable().optional(),
    countryCode: z
      .string()
      .trim()
      .regex(/^[A-Za-z]{2}$/),
    acceptedCategoryIds: z
      .array(z.string().trim().min(2).max(120))
      .max(50)
      .default([]),
    shippingInstructions: z.string().trim().max(2_000).default(''),
    inPersonInstructions: z.string().trim().max(2_000).nullable().optional(),
    internalName: z.string().trim().max(160).nullable().optional(),
    operationalNotes: z.string().trim().max(2_000).nullable().optional(),
    internalContact: z.string().trim().max(320).nullable().optional(),
    openingHours: z.string().trim().max(1_000).nullable().optional(),
    appointmentRequired: z.boolean().default(false),
    walkInsAllowed: z.boolean().default(false),
    publicContactInstructions: z
      .string()
      .trim()
      .max(2_000)
      .nullable()
      .optional(),
    packageLabelInstructions: z
      .string()
      .trim()
      .max(2_000)
      .nullable()
      .optional(),
    specialHandlingInstructions: z
      .string()
      .trim()
      .max(2_000)
      .nullable()
      .optional(),
    maximumActiveIntakes: z.number().int().positive().nullable().optional(),
    warningThreshold: z.number().int().nonnegative().nullable().optional(),
    pauseReason: z.string().trim().max(500).nullable().optional(),
    pauseEffectiveAt: z.string().datetime().nullable().optional(),
    expectedResumeAt: z.string().datetime().nullable().optional(),
    reason: z.string().trim().min(3).max(500),
    expectedUpdatedAt: z.string().datetime().optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.acceptingShipments && !value.acceptingInPerson)
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Configure at least one delivery method.',
      });
    if (
      value.acceptingNewIntakes &&
      (value.status !== 'ACTIVE' || !value.operationallyApproved)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'Only active, operationally approved locations may accept new intakes.',
      });
    if (
      value.environment === 'production' &&
      (!value.receiverName ||
        !value.addressLine1 ||
        !value.city ||
        !value.postalCode)
    )
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Production locations require a complete shipping address.',
      });
  });
const intakeLocationCommand = z
  .object({
    command: z.enum([
      'PAUSE_NEW_INTAKES',
      'RESUME_NEW_INTAKES',
      'DEACTIVATE',
      'REACTIVATE',
      'ENABLE_SHIPPING',
      'DISABLE_SHIPPING',
      'ENABLE_IN_PERSON',
      'DISABLE_IN_PERSON',
      'REPAIR_AVAILABILITY',
      'REPAIR_CAPACITY_PROJECTION',
    ]),
    reason: z.string().trim().min(3).max(500),
    incidentReference: z.string().trim().max(160).optional(),
  })
  .strict();
const marketReferenceInput = z
  .object({
    url: z.string().trim().url().max(2048),
    reason: z.string().trim().min(3).max(500).optional(),
    confirmation: z.string().trim().max(120).optional(),
    assetId: z.string().trim().min(1).max(128).optional(),
  })
  .strict();

@Controller('admin')
@UseGuards(AccessTokenGuard, PermissionGuard)
export class AdminController {
  constructor(
    private readonly admin: AdminService,
    private readonly marketRefresh: MarketRefreshService,
  ) {}

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
  platformRecords(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
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

  @Get('collectibles')
  @RequirePermission('admin.console.read')
  collectibles(@Query() query: unknown, @Req() request: AuthenticatedRequest) {
    const input = this.parse(catalogueQuery, query);
    return this.admin.catalogueAssets(request.actor!, input);
  }

  @Post('collectors/:slug/featured')
  @RequirePermission('catalogue.manage')
  featureCollector(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(collectorFeature, body);
    return this.admin.setCollectorFeatured(
      request.actor!,
      slug,
      input.featured,
      request.requestId ?? 'unknown',
    );
  }

  @Patch('collectors/:slug/directory')
  @RequirePermission('catalogue.manage')
  updateCollectorDirectory(
    @Param('slug') slug: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.updateCollectorDirectory(
      request.actor!,
      slug,
      this.parse(collectorDirectoryPatch, body),
      request.requestId ?? 'unknown',
    );
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
  @Get('intake/submissions/:submissionId')
  @RequirePermission('admin.console.read')
  intakeDetail(
    @Param('submissionId') submissionId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.intakeDetail(request.actor!, submissionId);
  }
  @Post('intake/submissions/:submissionId/destination')
  @RequirePermission('custody.manage')
  assignIntakeDestination(
    @Param('submissionId') submissionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!idempotencyKey || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    return this.admin.assignIntakeDestination(
      request.actor!,
      submissionId,
      idempotencyKey,
      this.parseIntakeDestinationAssignment(body),
      request.requestId ?? 'unknown',
    );
  }
  @Get('intake/locations')
  @RequirePermission('admin.console.read')
  intakeLocations(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.listIntakeLocations(
      request.actor!,
      this.parse(intakeLocationsQuery, query),
    );
  }
  @Get('intake/locations/:id')
  @RequirePermission('admin.console.read')
  intakeLocation(
    @Param('id') id: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.intakeLocationDetail(request.actor!, id);
  }
  @Post('intake/locations')
  @RequirePermission('custody.manage')
  createIntakeLocation(
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.createIntakeLocation(
      request.actor!,
      this.parse(intakeLocationInput, body),
      request.requestId ?? 'unknown',
    );
  }
  @Patch('intake/locations/:id')
  @RequirePermission('custody.manage')
  updateIntakeLocation(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.updateIntakeLocation(
      request.actor!,
      id,
      this.parse(intakeLocationInput, body),
      request.requestId ?? 'unknown',
    );
  }
  @Post('intake/locations/:id/command')
  @RequirePermission('custody.manage')
  commandIntakeLocation(
    @Param('id') id: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(intakeLocationCommand, body);
    return this.admin.commandIntakeLocation(
      request.actor!,
      id,
      input,
      request.requestId ?? 'unknown',
    );
  }
  @Post('intake/:id/receipt')
  @RequirePermission('custody.manage')
  confirmReceipt(
    @Param('id') intakeId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
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
      this.parseIntakeReceiptConfirmation(body ?? {}),
    );
  }

  @Post('intake/:id/delivery/confirm')
  @RequirePermission('custody.manage')
  confirmDelivery(
    @Param('id') intakeId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!idempotencyKey || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    this.parse(intakeCarrierDeliveryConfirmation, body ?? {});
    return this.admin.confirmIntakeDelivery(
      request.actor!,
      intakeId,
      idempotencyKey,
      request.requestId ?? 'unknown',
    );
  }

  @Post('intake/:id/verification/start')
  @RequirePermission('custody.manage')
  startVerification(
    @Param('id') intakeId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!idempotencyKey || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    return this.admin.startIntakeVerification(
      request.actor!,
      intakeId,
      idempotencyKey,
      request.requestId ?? 'unknown',
    );
  }

  @Post('intake/:id/verification/complete')
  @RequirePermission('custody.manage')
  completeVerification(
    @Param('id') intakeId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!idempotencyKey || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    return this.admin.completeIntakeVerification(
      request.actor!,
      intakeId,
      idempotencyKey,
      this.parse(intakeVerificationComplete, body),
      request.requestId ?? 'unknown',
    );
  }

  @Post('intake/:id/exceptions')
  @RequirePermission('custody.manage')
  createException(
    @Param('id') intakeId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!idempotencyKey || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    return this.admin.createIntakeException(
      request.actor!,
      intakeId,
      idempotencyKey,
      this.parse(intakeExceptionCreate, body),
      request.requestId ?? 'unknown',
    );
  }

  @Post('intake/:id/exceptions/:exceptionId/resolve')
  @RequirePermission('custody.manage')
  resolveException(
    @Param('id') intakeId: string,
    @Param('exceptionId') exceptionId: string,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    if (!idempotencyKey || !/^[\x21-\x7e]{1,128}$/.test(idempotencyKey))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
    return this.admin.resolveIntakeException(
      request.actor!,
      intakeId,
      exceptionId,
      idempotencyKey,
      this.parse(intakeExceptionResolve, body),
      request.requestId ?? 'unknown',
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

  @Get('memberships/:id')
  @RequirePermission('admin.console.read')
  membership(@Param('id') id: string, @Req() request: AuthenticatedRequest) {
    return this.admin.membershipDetail(request.actor!, id);
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

  @Get('users/:id/history')
  @RequirePermission('users.read')
  userHistory(
    @Param('id') id: string,
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    const input = this.parse(accountHistoryQuery, query);
    return this.admin.userHistory(request.actor!, id, input);
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
  trustSupportRecords(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
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

  @Get('finance/bacs-risk')
  @RequirePermission('finance.read')
  bacsRisk(@Req() request: AuthenticatedRequest) {
    return this.admin.bacsRiskDashboard(request.actor!);
  }

  @Get('finance/records')
  @RequirePermission('finance.read')
  financeRecords(
    @Query() query: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
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

  @Post('market-data/refresh/:assetId')
  @RequirePermission('integrations.manage')
  refreshMarketData(@Param('assetId') assetId: string) {
    return this.marketRefresh.refreshAsset(assetId);
  }

  @Post('assets/:id/market-references')
  @RequirePermission('integrations.manage')
  linkMarketReference(
    @Param('id') assetId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.linkMarketReference(
      request.actor!,
      assetId,
      this.parse(marketReferenceInput, body),
      request.requestId ?? 'unknown',
      false,
    );
  }

  @Post('assets/:id/market-references/force-link')
  @RequirePermission('integrations.manage')
  forceLinkMarketReference(
    @Param('id') assetId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.linkMarketReference(
      request.actor!,
      assetId,
      this.parse(marketReferenceInput, body),
      request.requestId ?? 'unknown',
      true,
    );
  }

  @Post('assets/:id/market-references/rerun')
  @RequirePermission('integrations.manage')
  rerunMarketReference(
    @Param('id') assetId: string,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.rerunMarketReference(
      request.actor!,
      assetId,
      request.requestId ?? 'unknown',
    );
  }

  @Post('assets/:id/market-references/remove-preferred')
  @RequirePermission('integrations.manage')
  removePreferredMarketReference(
    @Param('id') assetId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.removePreferredMarketReference(
      request.actor!,
      assetId,
      this.parse(
        z.object({ reason: z.string().trim().min(3).max(500) }).strict(),
        body,
      ).reason,
      request.requestId ?? 'unknown',
    );
  }

  @Post('assets/:id/market-references/mark-review')
  @RequirePermission('integrations.manage')
  markMarketReferenceReview(
    @Param('id') assetId: string,
    @Body() body: unknown,
    @Req() request: AuthenticatedRequest,
  ) {
    return this.admin.markMarketReferenceReview(
      request.actor!,
      assetId,
      this.parse(
        z.object({ reason: z.string().trim().min(3).max(500) }).strict(),
        body,
      ).reason,
      request.requestId ?? 'unknown',
    );
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

  private parse<T extends z.ZodTypeAny>(
    schema: T,
    value: unknown,
  ): z.output<T> {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
      });
    return parsed.data;
  }

  private parseIntakeDestinationAssignment(
    body: unknown,
  ): z.output<typeof intakeDestinationAssignment> {
    // Older admin bundles sent an already JSON-encoded string to the shared
    // HTTP client. Accept that representation during the rollout, then apply
    // the same strict object schema so no additional fields are admitted.
    const candidate =
      typeof body === 'string'
        ? (() => {
            try {
              return JSON.parse(body) as unknown;
            } catch {
              return body;
            }
          })()
        : body;
    const parsed = intakeDestinationAssignment.safeParse(candidate);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    return parsed.data;
  }

  private parseIntakeReceiptConfirmation(
    body: unknown,
  ): z.output<typeof intakeReceiptConfirmation> {
    // Older admin bundles passed the receipt object through JSON.stringify
    // before handing it to the shared HTTP client. Accept that representation
    // during the rollout, then apply the same strict schema so no additional
    // fields are admitted.
    const candidate = this.decodeReceiptJson(body);
    const normalized = this.normalizeIntakeReceiptCandidate(candidate);
    const parsed = intakeReceiptConfirmation.safeParse(normalized);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    return parsed.data;
  }

  private normalizeIntakeReceiptCandidate(body: unknown) {
    if (!body || typeof body !== 'object' || Array.isArray(body)) return body;

    const value = body as Record<string, unknown>;
    const checklist = this.decodeReceiptJson(value.checklist);

    // Older admin bundles used the human-readable condition value and, in one
    // rollout, placed checklist flags beside the checklist object. Normalize
    // those wire representations without defaulting any staff attestation.
    const packageCondition = value.packageCondition === 'GOOD'
      ? 'ACCEPTABLE'
      : value.packageCondition;
    const checklistRecord = this.receiptChecklistRecord(checklist, value);
    const topLevel = Object.fromEntries(
      Object.entries(value).filter(
        ([key]) =>
          key !== 'checklist' &&
          !intakeReceiptChecklistKeys.some((checklistKey) => checklistKey === key),
      ),
    );
    const normalizedChecklist = Object.fromEntries(
      intakeReceiptChecklistKeys.map((key) => [key, this.receiptChecklistValue(checklistRecord, key)]),
    );

    return {
      ...topLevel,
      packageCondition,
      checklist: normalizedChecklist,
    };
  }

  private decodeReceiptJson(value: unknown) {
    let decoded = value;
    for (let attempt = 0; attempt < 3 && typeof decoded === 'string'; attempt += 1) {
      try {
        decoded = JSON.parse(decoded) as unknown;
      } catch {
        break;
      }
    }
    return decoded;
  }

  private receiptChecklistRecord(
    checklist: unknown,
    fallback: Record<string, unknown>,
  ): Record<string, unknown> {
    if (Array.isArray(checklist)) {
      const entries = checklist.flatMap((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return [];
        const record = item as Record<string, unknown>;
        const key = record.key ?? record.name ?? record.id ?? record.field;
        const checked = record.checked ?? record.value ?? record.selected;
        return typeof key === 'string' ? [[key, checked] as const] : [];
      });
      return Object.fromEntries(entries);
    }
    if (checklist && typeof checklist === 'object') {
      const record = checklist as Record<string, unknown>;
      for (const nestedKey of ['checks', 'values', 'items', 'data']) {
        if (record[nestedKey] && typeof record[nestedKey] === 'object')
          return this.receiptChecklistRecord(record[nestedKey], fallback);
      }
      return record;
    }
    return fallback;
  }

  private receiptChecklistValue(
    record: Record<string, unknown>,
    key: (typeof intakeReceiptChecklistKeys)[number],
  ) {
    const normalized = new Map(
      Object.entries(record).map(([name, value]) => [
        name.replace(/[^a-z0-9]/gi, '').toLowerCase(),
        value,
      ]),
    );
    for (const alias of intakeReceiptChecklistAliases[key]) {
      if (normalized.has(alias)) return normalized.get(alias);
    }
    return undefined;
  }
}
