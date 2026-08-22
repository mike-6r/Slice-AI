import { Module } from '@nestjs/common';
import { AccessControlModule } from '../identity/access/access-control.module';
import { AuthModule } from '../identity/auth/auth.module';
import { FinanceModule } from '../finance/finance.module';
import { OutboxModule } from '../outbox/outbox.module';
import { ProviderCryptoService } from './application/provider-crypto.service';
import { ComplianceService } from './application/compliance.service';
import { WalletMovementService } from './application/wallet-movement.service';
import { ProviderWebhookService } from './application/provider-webhook.service';
import { ProviderReconciliationService } from './application/provider-reconciliation.service';
import { ComplianceHoldService } from './application/compliance-hold.service';
import { ProviderResilienceService } from './application/provider-resilience.service';
import { BankConnectionService } from './application/external-provider-boundaries';
import { StripeClientFactory } from './application/stripe-provider.client';
import { StripeConnectPayoutService } from './application/stripe-connect-payout.service';
import { StripeIdentityVerificationService } from './application/stripe-identity.service';
import { CollectorMembershipService } from './application/collector-membership.service';
import { ProvidersController } from './http/providers.controller';

@Module({
  imports: [AuthModule, AccessControlModule, FinanceModule, OutboxModule],
  controllers: [ProvidersController],
  providers: [
    ProviderCryptoService,
    ComplianceService,
    WalletMovementService,
    ProviderWebhookService,
    ProviderReconciliationService,
    ComplianceHoldService,
    ProviderResilienceService,
    BankConnectionService,
    StripeClientFactory,
    StripeConnectPayoutService,
    StripeIdentityVerificationService,
    CollectorMembershipService,
  ],
  exports: [
    ProviderCryptoService,
    ComplianceService,
    WalletMovementService,
    ProviderWebhookService,
    ProviderReconciliationService,
    ComplianceHoldService,
    ProviderResilienceService,
    BankConnectionService,
    StripeClientFactory,
    StripeConnectPayoutService,
    StripeIdentityVerificationService,
    CollectorMembershipService,
  ],
})
export class ProvidersModule {}
