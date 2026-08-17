import { BadRequestException, Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, type AuthenticatedRequest } from '../../identity/auth/access-token.guard';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { ComplianceService } from '../application/compliance.service';
import { WalletMovementService } from '../application/wallet-movement.service';
import { ProviderWebhookService } from '../application/provider-webhook.service';
import { ProviderReconciliationService } from '../application/provider-reconciliation.service';
import { ComplianceHoldService } from '../application/compliance-hold.service';
import { PlaidBankLinkService } from '../application/plaid-bank-link.service';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';

const amount = z.object({ amountMinor: z.string().regex(/^\d+$/).max(32), destinationReference: z.string().min(1).max(256).optional(), destinationChain: z.string().min(1).max(32).optional() }).strict();
const page = z.object({ cursor: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const hold = z.object({ userId: z.string().min(1), scope: z.enum(['FUNDING', 'WITHDRAWAL', 'TRADING_ELIGIBILITY', 'EXTERNAL_MOVEMENT', 'ACCOUNT']), reasonCode: z.string().min(1).max(64) }).strict();
const plaidExchange = z.object({ publicToken: z.string().min(1).max(1024) }).strict();
@Controller()
export class ProvidersController {
  constructor(private readonly compliance: ComplianceService, private readonly movements: WalletMovementService, private readonly webhooks: ProviderWebhookService, private readonly reconciliation: ProviderReconciliationService, private readonly holds: ComplianceHoldService, private readonly bankLinks: PlaidBankLinkService, private readonly limiter: ControlRateLimitService) {}
  @Post('compliance/verification-sessions') @UseGuards(AccessTokenGuard)
  async start(@Req() req: AuthenticatedRequest) { await this.limit(req); return this.compliance.start(req.actor!, req.requestId ?? 'unknown'); }
  @Get('me/compliance') @UseGuards(AccessTokenGuard)
  self(@Req() req: AuthenticatedRequest) { return this.compliance.self(req.actor!.userId); }
  @Post('wallet/deposits') @UseGuards(AccessTokenGuard)
  async deposit(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { return this.write(req, key, () => this.movements.createDeposit(req.actor!, this.parse(amount, body).amountMinor, req.requestId ?? 'unknown', key!)); }
  @Post('wallet/withdrawals') @UseGuards(AccessTokenGuard)
  async withdrawal(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(amount, body); return this.write(req, key, () => this.movements.createWithdrawal(req.actor!, input.amountMinor, req.requestId ?? 'unknown', key!, input.destinationReference, input.destinationChain)); }
  @Get('wallet/movements') @UseGuards(AccessTokenGuard)
  list(@Query() query: unknown, @Req() req: AuthenticatedRequest) { const input = this.parse(page, query); return this.movements.list(req.actor!.userId, input.cursor, input.limit); }
  @Post('wallet/bank-link/token') @UseGuards(AccessTokenGuard)
  async bankLinkToken(@Req() req: AuthenticatedRequest) { await this.limit(req); return this.bankLinks.createLinkToken(req.actor!); }
  @Post('wallet/bank-link/exchange') @UseGuards(AccessTokenGuard)
  async bankLinkExchange(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) {
    const input = this.parse(plaidExchange, body);
    return this.write(req, key, () => this.bankLinks.exchangePublicToken(req.actor!, input.publicToken, req.requestId ?? 'unknown', key!));
  }
  @Get('wallet/bank-accounts') @UseGuards(AccessTokenGuard)
  bankAccounts(@Req() req: AuthenticatedRequest) { return this.bankLinks.list(req.actor!.userId); }
  @Post('providers/:provider/webhooks')
  webhook(@Param('provider') provider: string, @Req() req: AuthenticatedRequest & { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> }) {
    if (!['BRIDGE', 'PLAID'].includes(provider)) throw new BadRequestException({ code: 'PROVIDER_UNSUPPORTED', message: 'Provider is not supported.' });
    if (!req.rawBody) throw new BadRequestException({ code: 'WEBHOOK_RAW_BODY_REQUIRED', message: 'Webhook raw body is required.' });
    return this.webhooks.receive({ provider: provider as 'BRIDGE' | 'PLAID', rawBody: req.rawBody, headers: req.headers, requestId: req.requestId ?? 'unknown' });
  }
  @Post('admin/providers/reconciliation-runs') @UseGuards(AccessTokenGuard, PermissionGuard) @RequirePermission('provider.manage')
  async reconcile(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const provider = this.parse(z.object({ provider: z.enum(['BRIDGE', 'LOCAL_TEST']) }).strict(), body).provider; return this.write(req, key, () => this.reconciliation.run(req.actor!, provider, req.requestId ?? 'unknown')); }
  @Post('admin/compliance/holds') @UseGuards(AccessTokenGuard, PermissionGuard) @RequirePermission('compliance.manage')
  async createHold(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(hold, body); return this.write(req, key, () => this.holds.create(req.actor!, { ...input, requestId: req.requestId ?? 'unknown' })); }
  @Post('admin/compliance/holds/:holdId/release') @UseGuards(AccessTokenGuard, PermissionGuard) @RequirePermission('compliance.manage')
  async releaseHold(@Param('holdId') holdId: string, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { return this.write(req, key, () => this.holds.release(req.actor!, holdId)); }
  private parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Request validation failed.' }); return parsed.data; }
  private async write(req: AuthenticatedRequest, key: string | undefined, action: () => Promise<unknown>) { if (!key || !/^[\x21-\x7e]{1,128}$/.test(key)) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A valid Idempotency-Key header is required.' }); await this.limit(req); return action(); }
  private limit(req: AuthenticatedRequest) { return this.limiter.enforce('providerMutation', req.ip ?? 'unknown', req.actor!.userId); }
}
