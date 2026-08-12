import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { RuntimeModule } from './runtime/runtime.module';
import { IdentityPersistenceModule } from './modules/identity/persistence/identity-persistence.module';
import { AuthModule } from './modules/identity/auth/auth.module';
import { AccessControlModule } from './modules/identity/access/access-control.module';
import { CatalogueModule } from './modules/catalogue/catalogue.module';
import { MarketModule } from './modules/market/market.module';
import { ReadsModule } from './modules/reads/reads.module';
import { SubmissionsModule } from './modules/submissions/submissions.module';
import { LifecycleModule } from './modules/lifecycle/lifecycle.module';
import { OwnershipModule } from './modules/ownership/ownership.module';
import { FinanceModule } from './modules/finance/finance.module';
import { TradingModule } from './modules/trading/trading.module';
import { CommunityModule } from './modules/community/community.module';
import { ProvidersModule } from './modules/providers/providers.module';
import { NotificationModule } from './modules/notifications/notification.module';
import { DiscordLinkModule } from './modules/identity/discord/discord-link.module';
import { EmailVerificationModule } from './modules/identity/email-verification/email-verification.module';
import { PhoneVerificationModule } from './modules/identity/phone-verification/phone-verification.module';
import { MarketResearchModule } from './modules/market-research/market-research.module';
import { CollectorWorkspaceModule } from './modules/collector-workspace/collector-workspace.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { AdminModule } from './modules/admin/admin.module';

@Module({
  imports: [
    ConfigModule,
    DatabaseModule,
    RedisModule,
    RuntimeModule,
    IdentityPersistenceModule,
    AuthModule,
    AccessControlModule,
    CatalogueModule,
    MarketModule,
    CurrencyModule,
    AdminModule,
    MarketResearchModule,
    CollectorWorkspaceModule,
    ReadsModule,
    SubmissionsModule,
    LifecycleModule,
    OwnershipModule,
    FinanceModule,
    TradingModule,
    CommunityModule,
    ProvidersModule,
    NotificationModule,
    DiscordLinkModule,
    EmailVerificationModule,
    PhoneVerificationModule,
    HealthModule,
  ],
})
export class AppModule {}
