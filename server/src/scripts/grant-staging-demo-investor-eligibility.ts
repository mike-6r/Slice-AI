import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { AccountCapabilityService } from '../modules/identity/access/account-capability.service';
import { ensureDemoInvestorTradingEligibility } from './setup-staging-demo';
import { assertStagingDemoSafety, demoAccounts } from './staging-demo-safety';

/**
 * Repairs the one pre-existing, named fake-money investor when a staging
 * operator needs to resume a trading walkthrough but cannot provision the
 * broader demo fixture credentials. It cannot create, activate, or target an
 * arbitrary user, and is guarded by the same explicit staging acknowledgement
 * as the full demo setup.
 */
async function main() {
  assertStagingDemoSafety();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const db = app.get(PrismaService);
    const config = app.get<AppConfig>(APP_CONFIG);
    const capabilities = app.get(AccountCapabilityService, { strict: false });
    const investor = await db.user.findUnique({
      where: { normalizedEmail: demoAccounts.investor.email },
      select: { id: true, accountStatus: true },
    });
    if (!investor || investor.accountStatus !== 'ACTIVE') {
      throw new Error(
        'Refusing demo eligibility: the named staging investor must already be ACTIVE.',
      );
    }

    await ensureDemoInvestorTradingEligibility(db, investor.id, config);
    const [buy, sell] = await Promise.all([
      capabilities.evaluate(investor.id, 'PLACE_BUY_ORDER'),
      capabilities.evaluate(investor.id, 'PLACE_SELL_ORDER'),
    ]);
    if (!buy.allowed || !sell.allowed) {
      throw new Error(
        `Demo investor eligibility was recorded but trading remains unavailable: buy=${buy.reason ?? 'unknown'}, sell=${sell.reason ?? 'unknown'}.`,
      );
    }
    process.stdout.write(
      JSON.stringify({
        result: 'STAGING_DEMO_INVESTOR_TRADING_ELIGIBLE',
        account: demoAccounts.investor.email,
        capabilities: ['PLACE_BUY_ORDER', 'PLACE_SELL_ORDER'],
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Staging demo investor eligibility failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
