import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, type AuthenticatedRequest } from '../../identity/auth/access-token.guard';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import { PreSaleService } from '../application/pre-sale.service';

const units = z.object({ units: z.string().regex(/^[1-9]\d*$/).max(32), confirmation: z.literal('RESERVE_CONDITIONAL_POSITION') }).strict();
const reason = z.object({ reason: z.string().trim().min(8).max(500) }).strict();
const extend = reason.extend({ deadlineAt: z.string().datetime(), incidentReference: z.string().trim().max(120).optional() }).strict();
const configure = z.object({ estimatedValueMinor: z.string().regex(/^\d+$/).max(32).optional(), offeredPercentageBps: z.number().int().min(1).max(10_000).optional(), totalUnits: z.string().regex(/^[1-9]\d*$/).max(12).optional(), pricePerUnitMinor: z.string().regex(/^[1-9]\d*$/).max(32).optional(), currency: z.string().regex(/^[A-Z]{3}$/).optional(), reason: z.string().trim().min(8).max(500) }).strict();

@Controller()
export class PreSaleController {
  constructor(private readonly presales: PreSaleService) {}

  @Get('market/assets/:slug/pre-sale')
  publicDetail(@Param('slug') slug: string) { return this.presales.publicDetail(slug); }

  @Post('market/assets/:slug/pre-sale/reservations')
  @UseGuards(AccessTokenGuard)
  reserve(@Param('slug') slug: string, @Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) {
    const input = this.parse(units, body); this.requireKey(key);
    return this.presales.reserve(req.actor!, slug, input.units, input.confirmation, req.requestId ?? 'unknown', key!);
  }

  @Get('me/pre-sale-reservations')
  @UseGuards(AccessTokenGuard)
  list(@Req() req: AuthenticatedRequest) { return this.presales.customerList(req.actor!.userId); }

  @Get('me/pre-sale-reservations/:id')
  @UseGuards(AccessTokenGuard)
  detail(@Param('id') id: string, @Req() req: AuthenticatedRequest) { return this.presales.customerDetail(req.actor!.userId, id); }

  @Get('admin/assets/:assetId/pre-sale')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  adminDetail(@Param('assetId') assetId: string) { return this.presales.adminDetail(assetId); }

  @Post('admin/assets/:assetId/pre-sale/open')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  open(@Param('assetId') assetId: string, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { this.requireKey(key); return this.presales.open(req.actor!, assetId, req.requestId ?? 'unknown', key!); }

  @Post('admin/assets/:assetId/pre-sale/configure')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  configure(@Param('assetId') assetId: string, @Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(configure, body); this.requireKey(key); return this.presales.configure(req.actor!, assetId, input, req.requestId ?? 'unknown', key!); }

  @Post('admin/assets/:assetId/pre-sale/pause')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  pause(@Param('assetId') assetId: string, @Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(reason, body); this.requireKey(key); return this.presales.pause(req.actor!, assetId, input.reason, req.requestId ?? 'unknown', key!); }

  @Post('admin/assets/:assetId/pre-sale/resume')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  resume(@Param('assetId') assetId: string, @Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(reason, body); this.requireKey(key); return this.presales.resume(req.actor!, assetId, input.reason, req.requestId ?? 'unknown', key!); }

  @Post('admin/assets/:assetId/pre-sale/extend')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  extend(@Param('assetId') assetId: string, @Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(extend, body); this.requireKey(key); return this.presales.extend(req.actor!, assetId, input.deadlineAt, input.reason, input.incidentReference, req.requestId ?? 'unknown', key!); }

  @Post('admin/assets/:assetId/pre-sale/cancel')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  cancel(@Param('assetId') assetId: string, @Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(reason, body); this.requireKey(key); return this.presales.cancel(req.actor!, assetId, input.reason, req.requestId ?? 'unknown', key!); }

  @Post('admin/assets/:assetId/pre-sale/finalize')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('ownership.issue')
  finalize(@Param('assetId') assetId: string, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { this.requireKey(key); return this.presales.finalize(req.actor!, assetId, req.requestId ?? 'unknown', key!); }

  private parse<T>(schema: z.ZodType<T>, body: unknown) { const parsed = schema.safeParse(body); if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Request validation failed.', fieldErrors: parsed.error.flatten().fieldErrors }); return parsed.data; }
  private requireKey(key: string | undefined): asserts key is string { if (!key || !/^[\x21-\x7e]{1,128}$/.test(key)) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A valid Idempotency-Key header is required.' }); }
}
