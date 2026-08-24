import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
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
import { FinancialLedgerService } from '../application/financial-ledger.service';
import { PortfolioQueryService } from '../application/portfolio-query.service';
import { FinancialReconciliationService } from '../application/financial-reconciliation.service';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import { PortfolioSnapshotService, type PortfolioPerformanceRange } from '../application/portfolio-snapshot.service';
import { currentFeePolicy } from '../domain/fee-policy';

const historyQuery = z
  .object({
    cursor: z.string().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  })
  .strict();
const reversalBody = z
  .object({
    transactionId: z.string().min(1),
    reasonCode: z.string().min(1).max(64),
  })
  .strict();
const performanceQuery = z.object({ range: z.enum(['1D', '1W', '1M', '3M', '1Y', 'ALL']).default('1M') }).strict();
const holdingsPageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(10),
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(120).optional(),
  sort: z.enum(['VALUE_DESC', 'OWNERSHIP_DESC', 'TITLE_ASC']).default('TITLE_ASC'),
}).strict();

@Controller()
export class FinanceController {
  constructor(
    private readonly ledger: FinancialLedgerService,
    private readonly portfolio: PortfolioQueryService,
    private readonly reconciliation: FinancialReconciliationService,
    private readonly limiter: ControlRateLimitService,
    private readonly snapshots: PortfolioSnapshotService,
  ) {}

  /** Self-only, derived projection. No account IDs, counterparty data, or journal metadata. */
  @Get('me/wallet/balances')
  @UseGuards(AccessTokenGuard)
  wallet(@Req() req: AuthenticatedRequest) {
    return this.ledger.walletForUser(req.actor!.userId);
  }

  @Get('fees')
  fees() {
    return currentFeePolicy();
  }

  @Get('me/wallet/transactions')
  @UseGuards(AccessTokenGuard)
  transactions(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = historyQuery.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
      });
    return this.ledger.transactionsForUser(
      req.actor!.userId,
      parsed.data.cursor,
      parsed.data.limit,
    );
  }

  @Get('me/wallet/insights')
  @UseGuards(AccessTokenGuard)
  insights(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = z.object({ period: z.literal('month').default('month') }).strict().safeParse(query);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Request validation failed.' });
    return this.ledger.walletInsightsForUser(req.actor!.userId);
  }

  @Get('me/portfolio')
  @UseGuards(AccessTokenGuard)
  portfolioSummary(@Req() req: AuthenticatedRequest) {
    return this.portfolio.portfolioForUser(req.actor!.userId);
  }

  @Get('me/portfolio/assets')
  @UseGuards(AccessTokenGuard)
  holdings(@Req() req: AuthenticatedRequest) {
    return this.portfolio.holdingsForUser(req.actor!.userId);
  }

  @Get('me/portfolio/assets/page')
  @UseGuards(AccessTokenGuard)
  holdingsPage(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = holdingsPageQuery.safeParse(query);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
      });
    return this.portfolio.holdingsPageForUser(req.actor!.userId, parsed.data);
  }

  @Get('me/portfolio/performance')
  @UseGuards(AccessTokenGuard)
  performance(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const parsed = performanceQuery.safeParse(query);
    if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Request validation failed.' });
    return this.snapshots.performanceForUser(req.actor!.userId, parsed.data.range as PortfolioPerformanceRange);
  }

  @Get('me/portfolio/lots')
  @UseGuards(AccessTokenGuard)
  lots(@Req() req: AuthenticatedRequest) {
    return this.portfolio.lotsForUser(req.actor!.userId);
  }

  @Post('admin/finance/reversals')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('finance.manage')
  reverse(
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    const input = this.parse(reversalBody, body);
    return this.write(req, key, () =>
      this.ledger.reverse(
        req.actor!,
        input.transactionId,
        input.reasonCode,
        req.requestId ?? 'unknown',
        key!,
      ),
    );
  }

  @Post('admin/finance/reconciliation-runs')
  @UseGuards(AccessTokenGuard, PermissionGuard)
  @RequirePermission('finance.manage')
  reconcile(
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: AuthenticatedRequest,
  ) {
    return this.write(req, key, () =>
      this.reconciliation.run(req.actor!, req.requestId ?? 'unknown', key!),
    );
  }

  private parse<T>(schema: z.ZodType<T>, body: unknown): T {
    const parsed = schema.safeParse(body);
    if (!parsed.success)
      throw new BadRequestException({
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed.',
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
      'adminMutation',
      req.ip ?? 'unknown',
      req.actor!.userId,
    );
    return action();
  }
}
