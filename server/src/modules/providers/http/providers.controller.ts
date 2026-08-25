import { BadRequestException, Body, Controller, Delete, Get, Headers, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { z } from 'zod';
import { AccessTokenGuard, type AuthenticatedRequest } from '../../identity/auth/access-token.guard';
import { ControlRateLimitService } from '../../identity/access/control-rate-limit.service';
import { ComplianceService } from '../application/compliance.service';
import { WalletMovementService } from '../application/wallet-movement.service';
import { ProviderWebhookService } from '../application/provider-webhook.service';
import { ProviderReconciliationService } from '../application/provider-reconciliation.service';
import { ComplianceHoldService } from '../application/compliance-hold.service';
import { BankConnectionService } from '../application/external-provider-boundaries';
import { StripeConnectPayoutService } from '../application/stripe-connect-payout.service';
import { PermissionGuard } from '../../identity/access/permission.guard';
import { RequirePermission } from '../../identity/access/permission.decorator';
import { WithdrawalPreflightService } from '../application/withdrawal-preflight.service';

const amount = z.object({ amountMinor: z.string().regex(/^\d+$/).max(32), destinationReference: z.string().min(1).max(256).optional(), destinationChain: z.string().min(1).max(32).optional() }).strict();
const page = z.object({ cursor: z.string().min(1).optional(), limit: z.coerce.number().int().min(1).max(100).default(20) }).strict();
const hold = z.object({ userId: z.string().min(1), scope: z.enum(['FUNDING', 'WITHDRAWAL', 'TRADING_ELIGIBILITY', 'EXTERNAL_MOVEMENT', 'ACCOUNT']), reasonCode: z.string().min(1).max(64) }).strict();
const bankConnectionComplete = z.object({ checkoutSessionId: z.string().min(1).max(256) }).strict();
const bankDisconnect = z.object({ confirmed: z.literal(true), mfaCode: z.string().trim().min(4).max(32).optional(), mfaChallenge: z.string().trim().min(16).max(256).optional() }).strict();
const bankRiskQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(50) }).strict();
@Controller()
export class ProvidersController {
  constructor(private readonly compliance: ComplianceService, private readonly movements: WalletMovementService, private readonly webhooks: ProviderWebhookService, private readonly reconciliation: ProviderReconciliationService, private readonly holds: ComplianceHoldService, private readonly bankLinks: BankConnectionService, private readonly connectPayouts: StripeConnectPayoutService, private readonly limiter: ControlRateLimitService, private readonly withdrawalPreflight: WithdrawalPreflightService) {}
  @Post('compliance/verification-sessions') @UseGuards(AccessTokenGuard)
  async start(@Req() req: AuthenticatedRequest) { await this.limit(req); return this.compliance.start(req.actor!, req.requestId ?? 'unknown'); }
  @Get('me/compliance') @UseGuards(AccessTokenGuard)
  self(@Req() req: AuthenticatedRequest) { return this.compliance.self(req.actor!.userId); }
  @Get('me/compliance/identity-details') @UseGuards(AccessTokenGuard)
  identityDetails(@Req() req: AuthenticatedRequest) { return this.compliance.identityDetails(req.actor!.userId); }
  @Post('wallet/deposits') @UseGuards(AccessTokenGuard)
  async deposit(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { return this.write(req, key, () => this.movements.createDeposit(req.actor!, this.parse(amount, body).amountMinor, req.requestId ?? 'unknown', key!)); }
  @Post('wallet/withdrawals') @UseGuards(AccessTokenGuard)
  async withdrawal(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(amount, body); return this.write(req, key, () => this.movements.createWithdrawal(req.actor!, input.amountMinor, req.requestId ?? 'unknown', key!, input.destinationReference, input.destinationChain)); }
  @Get('wallet/movements') @UseGuards(AccessTokenGuard)
  list(@Query() query: unknown, @Req() req: AuthenticatedRequest) { const input = this.parse(page, query); return this.movements.list(req.actor!.userId, input.cursor, input.limit); }
  @Get('wallet/withdrawal-preflight') @UseGuards(AccessTokenGuard)
  withdrawalPreflightProjection(@Query() query: unknown, @Req() req: AuthenticatedRequest) {
    const input = this.parse(z.object({ amountMinor: z.string().regex(/^\d+$/).max(32).default('0') }).strict(), query);
    return this.withdrawalPreflight.forUser(req.actor!.userId, input.amountMinor);
  }
  @Post('wallet/bank-link/checkout') @UseGuards(AccessTokenGuard)
  async bankLinkCheckout(@Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { return this.write(req, key, () => this.bankLinks.createLinkCheckout(req.actor!, key!)); }
  @Post('wallet/bank-link/complete') @UseGuards(AccessTokenGuard)
  async bankLinkComplete(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) {
    const input = this.parse(bankConnectionComplete, body);
    return this.write(req, key, () => this.bankLinks.completeLink(req.actor!, input.checkoutSessionId, req.requestId ?? 'unknown', key!));
  }
  @Get('wallet/bank-accounts') @UseGuards(AccessTokenGuard)
  bankAccounts(@Req() req: AuthenticatedRequest) { return this.bankLinks.list(req.actor!.userId); }
  @Get('admin/providers/bank-risk') @UseGuards(AccessTokenGuard, PermissionGuard) @RequirePermission('provider.manage')
  bankRisk(@Query() query: unknown) { return this.bankLinks.listRisk(this.parse(bankRiskQuery, query).limit); }
  @Post('wallet/bank-accounts/:connectionId/disconnect/challenge') @UseGuards(AccessTokenGuard)
  async disconnectChallenge(@Param('connectionId') connectionId: string, @Req() req: AuthenticatedRequest) { await this.limit(req); return this.bankLinks.beginDisconnectChallenge(req.actor!, connectionId, req.ip ?? 'unknown', req.requestId ?? 'unknown'); }
  @Delete('wallet/bank-accounts/:connectionId') @UseGuards(AccessTokenGuard)
  async disconnectBank(@Param('connectionId') connectionId: string, @Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(bankDisconnect, body); return this.write(req, key, () => this.bankLinks.disconnect(req.actor!, connectionId, input, req.requestId ?? 'unknown', req.ip ?? 'unknown')); }
  @Patch('wallet/bank-accounts/:connectionId/default') @UseGuards(AccessTokenGuard)
  async defaultBank(@Param('connectionId') connectionId: string, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { return this.write(req, key, () => this.bankLinks.setDefault(req.actor!, connectionId, req.requestId ?? 'unknown', req.ip ?? 'unknown')); }
  @Get('wallet/payouts/connect') @UseGuards(AccessTokenGuard)
  connectStatus(@Req() req: AuthenticatedRequest) { return this.connectPayouts.status(req.actor!); }
  @Post('wallet/payouts/connect/onboarding') @UseGuards(AccessTokenGuard)
  async connectOnboarding(@Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { return this.write(req, key, () => this.connectPayouts.createOnboardingLink(req.actor!, req.requestId ?? 'unknown')); }
  @Post('wallet/payouts/connect/refresh') @UseGuards(AccessTokenGuard)
  async connectRefresh(@Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { return this.write(req, key, () => this.connectPayouts.createOnboardingLink(req.actor!, req.requestId ?? 'unknown')); }
  @Post('providers/:provider/webhooks')
  webhook(@Param('provider') provider: string, @Req() req: AuthenticatedRequest & { rawBody?: Buffer; headers: Record<string, string | string[] | undefined> }) {
    if (!['LOCAL_TEST', 'STRIPE_SANDBOX', 'STRIPE_LIVE'].includes(provider)) throw new BadRequestException({ code: 'PROVIDER_UNSUPPORTED', message: 'Provider is not supported.' });
    if (!req.rawBody) throw new BadRequestException({ code: 'WEBHOOK_RAW_BODY_REQUIRED', message: 'Webhook raw body is required.' });
    return this.webhooks.receive({ provider: provider as 'LOCAL_TEST' | 'STRIPE_SANDBOX' | 'STRIPE_LIVE', rawBody: req.rawBody, headers: req.headers, requestId: req.requestId ?? 'unknown' });
  }
  @Post('admin/providers/reconciliation-runs') @UseGuards(AccessTokenGuard, PermissionGuard) @RequirePermission('provider.manage')
  async reconcile(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const provider = this.parse(z.object({ provider: z.enum(['LOCAL_TEST', 'STRIPE_SANDBOX', 'STRIPE_LIVE']) }).strict(), body).provider; return this.write(req, key, () => this.reconciliation.run(req.actor!, provider, req.requestId ?? 'unknown')); }
  @Get('admin/providers/liquidity') @UseGuards(AccessTokenGuard, PermissionGuard) @RequirePermission('finance.read')
  providerLiquidity() { return this.withdrawalPreflight.adminProjection(); }
  @Post('admin/compliance/holds') @UseGuards(AccessTokenGuard, PermissionGuard) @RequirePermission('compliance.manage')
  async createHold(@Body() body: unknown, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { const input = this.parse(hold, body); return this.write(req, key, () => this.holds.create(req.actor!, { ...input, requestId: req.requestId ?? 'unknown' })); }
  @Post('admin/compliance/holds/:holdId/release') @UseGuards(AccessTokenGuard, PermissionGuard) @RequirePermission('compliance.manage')
  async releaseHold(@Param('holdId') holdId: string, @Headers('idempotency-key') key: string | undefined, @Req() req: AuthenticatedRequest) { return this.write(req, key, () => this.holds.release(req.actor!, holdId, req.requestId ?? 'unknown')); }
  private parse<T>(schema: z.ZodType<T>, value: unknown): T { const parsed = schema.safeParse(value); if (!parsed.success) throw new BadRequestException({ code: 'VALIDATION_FAILED', message: 'Request validation failed.' }); return parsed.data; }
  private async write(req: AuthenticatedRequest, key: string | undefined, action: () => Promise<unknown>) { if (!key || !/^[\x21-\x7e]{1,128}$/.test(key)) throw new BadRequestException({ code: 'IDEMPOTENCY_KEY_REQUIRED', message: 'A valid Idempotency-Key header is required.' }); await this.limit(req); return action(); }
  private limit(req: AuthenticatedRequest) { return this.limiter.enforce('providerMutation', req.ip ?? 'unknown', req.actor!.userId); }
}
