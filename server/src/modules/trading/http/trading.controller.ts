import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
import { TradingService } from '../application/trading.service';

const orderInput = z
  .object({
    assetId: z.string().min(1).max(128),
    side: z.enum(['BUY', 'SELL']),
    type: z.literal('LIMIT'),
    timeInForce: z.enum(['GTC', 'IOC']),
    units: z.string().min(1).max(32),
    limitPriceMinor: z.string().min(1).max(32),
  })
  .strict();
const treasuryListingInput = z
  .object({
    units: z
      .string()
      .regex(/^[1-9]\d*$/)
      .max(32),
    limitPriceMinor: z
      .string()
      .regex(/^[1-9]\d*$/)
      .max(32),
    timeInForce: z.literal('GTC').default('GTC'),
    reason: z.string().trim().min(10).max(500),
  })
  .strict();
const marketControlInput = z
  .object({
    reason: z.string().trim().min(12).max(500),
    confirmation: z.enum(['HALT_TRADING', 'RESUME_TRADING']),
    expectedStatus: z.enum(['OPEN', 'HALTED', 'CLOSED']),
  })
  .strict();
const ownershipPreviewInput = z
  .object({
    assetId: z.string().min(1).max(128),
    side: z.enum(['BUY', 'SELL']),
    desiredSlices: z
      .string()
      .regex(/^[1-9]\d*$/)
      .max(32)
      .optional(),
    desiredOwnershipPercent: z
      .string()
      .regex(/^\d{1,3}(?:\.\d{1,4})?$/)
      .optional(),
    desiredAmountMinor: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    limitPriceMinor: z
      .string()
      .regex(/^[1-9]\d*$/)
      .optional(),
    timeInForce: z.enum(['GTC', 'IOC']).default('GTC'),
  })
  .strict()
  .refine(
    (value) =>
      [
        value.desiredSlices,
        value.desiredOwnershipPercent,
        value.desiredAmountMinor,
      ].filter(Boolean).length === 1,
  );
const page = z
  .object({
    cursor: z.string().min(1).max(128).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    page: z.coerce.number().int().min(1).optional(),
    pageSize: z.coerce.number().int().min(1).max(50).optional(),
    q: z.string().trim().max(120).optional(),
    side: z.enum(['BUY', 'SELL']).optional(),
    status: z
      .enum([
        'OPEN',
        'PARTIALLY_FILLED',
        'FILLED',
        'CANCELLED',
        'REJECTED',
        'EXPIRED',
      ])
      .optional(),
    assetClass: z.string().trim().max(120).optional(),
    from: z.string().datetime().optional(),
  })
  .strict();
const executionPage = z
  .object({
    cursor: z.string().min(1).max(512).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const depth = z
  .object({ depth: z.coerce.number().int().min(1).max(50).default(20) })
  .strict();

@Controller()
export class TradingController {
  constructor(
    private readonly trading: TradingService,
    private readonly limiter: ControlRateLimitService,
  ) {}

  @Post('trading/orders/preview')
  @UseGuards(AccessTokenGuard)
  preview(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    return this.trading.preview(req.actor!, this.parse(orderInput, body));
  }

  @Post('trading/orders/ownership-preview')
  @UseGuards(AccessTokenGuard)
  ownershipPreview(@Body() body: unknown, @Req() req: AuthenticatedRequest) {
    const input = this.parse(ownershipPreviewInput, body);
    return this.trading.previewOwnership(req.actor!, {
      ...input,
      timeInForce: input.timeInForce ?? 'GTC',
    });
  }

  @Post('market/assets/:slug/ownership/preview')
  publicOwnershipPreview(@Param('slug') slug: string, @Body() body: unknown) {
    const bodyRecord =
      body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>)
        : {};
    const input = this.parse(ownershipPreviewInput, {
      ...bodyRecord,
      assetId: slug,
    });
    return this.trading.previewOwnership(null, {
      ...input,
      timeInForce: input.timeInForce ?? 'GTC',
    });
  }

  @Get('market/assets/:slug/ownership/market-summary')
  marketOwnershipSummary(@Param('slug') slug: string) {
    return this.trading.publicOwnershipSummary(slug);
  }

  @Post('trading/orders')
  @UseGuards(AccessTokenGuard)
  async place(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(orderInput, body);
    this.requireKey(key);
    await this.limiter.enforce(
      'tradingMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.trading.place(
      req.actor!,
      input,
      req.requestId ?? 'unknown',
      key!,
    );
  }

  @Delete('trading/orders/:id')
  @UseGuards(AccessTokenGuard)
  async cancel(
    @Param('id') id: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireKey(key);
    await this.limiter.enforce(
      'tradingMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.trading.cancel(
      req.actor!,
      id,
      req.requestId ?? 'unknown',
      key!,
    );
  }

  @Get('trading/orders')
  @UseGuards(AccessTokenGuard)
  ownOrders(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const input = this.parse(page, query);
    return this.trading.ownOrders(
      req.actor!.userId,
      input.cursor,
      input.limit,
      input,
    );
  }

  @Get('trading/executions')
  @UseGuards(AccessTokenGuard)
  ownExecutions(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const input = this.parse(executionPage, query);
    return this.trading.ownExecutions(
      req.actor!.userId,
      input.cursor,
      input.limit,
    );
  }

  @Get('market/assets/:slug/order-book')
  book(@Param('slug') slug: string, @Query() query: unknown) {
    return this.trading.publicBook(slug, this.parse(depth, query).depth ?? 20);
  }

  @Get('market/assets/:slug/recent-trades')
  trades(@Param('slug') slug: string, @Query() query: unknown) {
    const input = this.parse(page, query);
    return this.trading.recentTrades(slug, input.cursor, input.limit);
  }

  @Post('admin/trading/markets/:assetId/treasury-listings')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('trading.treasury.manage')
  async treasuryListing(
    @Param('assetId') assetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(treasuryListingInput, body);
    this.requireKey(key);
    await this.limiter.enforce(
      'adminMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.trading.placeTreasuryListing(
      req.actor!,
      assetId,
      { ...input, timeInForce: input.timeInForce ?? 'GTC' },
      req.requestId ?? 'unknown',
      key!,
    );
  }

  @Post('admin/trading/markets/:assetId/halt')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('trading.manage')
  async halt(
    @Param('assetId') assetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(marketControlInput, body);
    if (input.confirmation !== 'HALT_TRADING')
      throw new BadRequestException({
        code: 'CONFIRMATION_REQUIRED',
        message: 'Trading halt confirmation is invalid.',
      });
    this.requireKey(key);
    await this.limiter.enforce(
      'adminMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.trading.setMarketStatus(
      req.actor!,
      assetId,
      'HALTED',
      input,
      req.requestId ?? 'unknown',
      key!,
    );
  }

  @Post('admin/trading/markets/:assetId/activate')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('trading.manage')
  async activate(
    @Param('assetId') assetId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    this.requireKey(key);
    await this.limiter.enforce(
      'adminMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.trading.activateMarket(
      req.actor!,
      assetId,
      req.requestId ?? 'unknown',
      key!,
    );
  }

  @Post('admin/trading/markets/:assetId/resume')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('trading.manage')
  async resume(
    @Param('assetId') assetId: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(marketControlInput, body);
    if (input.confirmation !== 'RESUME_TRADING')
      throw new BadRequestException({
        code: 'CONFIRMATION_REQUIRED',
        message: 'Trading resume confirmation is invalid.',
      });
    this.requireKey(key);
    await this.limiter.enforce(
      'adminMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return this.trading.setMarketStatus(
      req.actor!,
      assetId,
      'OPEN',
      input,
      req.requestId ?? 'unknown',
      key!,
    );
  }

  private parse<T>(schema: z.ZodType<T>, value: unknown): T {
    const parsed = schema.safeParse(value);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
        fieldErrors: parsed.error.flatten().fieldErrors,
      });
    return parsed.data;
  }
  private requireKey(key: string | undefined) {
    if (!key || !/^[\x21-\x7e]{1,128}$/.test(key))
      throw new BadRequestException({
        code: 'IDEMPOTENCY_KEY_REQUIRED',
        message: 'A valid Idempotency-Key header is required.',
      });
  }
}
