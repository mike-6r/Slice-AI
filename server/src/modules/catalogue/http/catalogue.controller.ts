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
  Res,
  UseGuards,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Response } from 'express';
import { z } from 'zod';
import type { AuthenticatedRequest } from '../../identity/auth/access-token.guard';
import { AccessTokenGuard } from '../../identity/auth/access-token.guard';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import { CatalogueService } from '../application/catalogue.service';

const text = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/[<>]/.test(value), 'Markup is not permitted.');
const optionalText = (max: number) => text(1, max).nullable().optional();
const status = z.enum(['ACTIVE', 'ARCHIVED']);
const assetStatus = z.enum([
  'DRAFT',
  'IN_REVIEW',
  'VERIFIED',
  'PUBLISHED',
  'ARCHIVED',
]);
const categoryInput = z
  .object({
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(96)
      .optional(),
    name: text(1, 120),
    iconKey: z
      .string()
      .regex(/^[a-z0-9-]{1,64}$/)
      .nullable()
      .optional(),
    description: optionalText(500),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    status: status.optional(),
  })
  .strict();
const categoryPatch = categoryInput
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const setInput = z
  .object({
    categoryId: z.string().min(1).max(128),
    slug: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(96)
      .optional(),
    name: text(1, 160),
    manufacturer: optionalText(120),
    releaseYear: z.number().int().min(1800).max(2200).nullable().optional(),
    edition: optionalText(120),
    status: status.optional(),
  })
  .strict();
const setPatch = setInput
  .omit({ categoryId: true, slug: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const companyInput = z
  .object({
    code: z
      .string()
      .trim()
      .regex(/^[A-Za-z0-9-]{2,16}$/),
    name: text(1, 120),
    displayName: text(1, 120).optional(),
    verificationMode: z.enum(['MANUAL_OFFICIAL_LOOKUP', 'OFFICIAL_API', 'APPROVED_MACHINE_LOOKUP', 'UNSUPPORTED']).optional(),
    supportsCertVerification: z.boolean().optional(),
    supportsAutomatedVerification: z.boolean().optional(),
    officialVerificationUrl: z.string().url().nullable().optional(),
    certificationFormat: optionalText(255),
    gradeScaleVersion: text(1, 80).optional(),
    status: status.optional(),
  })
  .strict();
const companyPatch = companyInput
  .omit({ code: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const gradeInput = z
  .object({
    companyId: z.string().min(1).max(128),
    grade: z.string().regex(/^\d{1,2}(?:\.\d{1,2})?$/),
    label: text(1, 64),
    conditionLabel: optionalText(120),
    sortOrder: z.number().int().min(0).max(100000).optional(),
    active: z.boolean().optional(),
  })
  .strict();
const gradePatch = gradeInput
  .omit({ companyId: true, grade: true })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
const assetFields = {
  publicId: z
    .string()
    .regex(/^ast_[a-zA-Z0-9]{8,64}$/)
    .optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(96)
    .optional(),
  categoryId: z.string().min(1).max(128),
  setId: z.string().min(1).max(128).nullable().optional(),
  title: text(1, 180),
  shortName: optionalText(120),
  year: z.number().int().min(1800).max(2200).nullable().optional(),
  manufacturer: optionalText(120),
  edition: optionalText(120),
  cardNumber: optionalText(80),
  description: optionalText(2000),
  gradeScaleEntryId: z.string().min(1).max(128).nullable().optional(),
  certificationNumber: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9#-]{4,64}$/)
    .nullable()
    .optional(),
  status: assetStatus.optional(),
};
const assetInput = z.object(assetFields).strict();
const assetPatch = z
  .object(assetFields)
  .partial()
  .strict()
  .refine((value) => Object.keys(value).length > 0);
const pagination = z
  .object({
    cursor: z.string().min(1).max(256).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

@Controller()
export class CatalogueController {
  constructor(
    private readonly catalogue: CatalogueService,
    private readonly limiter: ControlRateLimitService,
  ) {}
  @Get('categories') async categories(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return conditional(response, ifNoneMatch, {
      items: await this.catalogue.categories(),
    });
  }
  @Get('categories/:slug/sets') async sets(
    @Param('slug') slug: string,
    @Query() query: unknown,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    const input = parse(pagination, query);
    return conditional(
      response,
      ifNoneMatch,
      await this.catalogue.sets(slug, input.cursor, input.limit ?? 50),
    );
  }
  @Get('grading-companies') async companies(
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return conditional(response, ifNoneMatch, {
      items: await this.catalogue.companies(),
    });
  }
  @Get('grading-companies/:code/grades') async grades(
    @Param('code') code: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return conditional(response, ifNoneMatch, {
      items: await this.catalogue.grades(code.toUpperCase()),
    });
  }
  @Get('catalogue/assets/:slug') async asset(
    @Param('slug') slug: string,
    @Headers('if-none-match') ifNoneMatch: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ) {
    return conditional(
      response,
      ifNoneMatch,
      await this.catalogue.publishedAsset(slug),
    );
  }

  @Post('admin/categories')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async createCategory(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.createCategory(
        req.actor!,
        parse(categoryInput, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('admin/categories/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async updateCategory(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.updateCategory(
        req.actor!,
        id,
        parse(categoryPatch, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('admin/sets')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async createSet(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.createSet(
        req.actor!,
        parse(setInput, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('admin/sets/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async updateSet(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.updateSet(
        req.actor!,
        id,
        parse(setPatch, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('admin/grading-companies')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async createCompany(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.createCompany(
        req.actor!,
        parse(companyInput, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('admin/grading-companies/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async updateCompany(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.updateCompany(
        req.actor!,
        id,
        parse(companyPatch, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('admin/grades')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async createGrade(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.createGrade(
        req.actor!,
        parse(gradeInput, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('admin/grades/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async updateGrade(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.updateGrade(
        req.actor!,
        id,
        parse(gradePatch, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Post('admin/catalogue/assets')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async createAsset(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.createAsset(
        req.actor!,
        parse(assetInput, body),
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }
  @Patch('admin/catalogue/assets/:id')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('catalogue.manage')
  async updateAsset(
    @Param('id') id: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.catalogue.updateAsset(
        req.actor!,
        id,
        parse(assetPatch, body),
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
      'catalogueMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return action();
  }
}
function conditional(
  response: Response,
  ifNoneMatch: string | undefined,
  value: unknown,
) {
  const etag = `"${createHash('sha256').update(JSON.stringify(value)).digest('hex')}"`;
  response.setHeader('ETag', etag);
  response.setHeader('Cache-Control', 'public, max-age=60');
  if (ifNoneMatch === etag) {
    response.status(304);
    return;
  }
  return value;
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
