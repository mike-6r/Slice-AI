import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { AccountCapabilityService } from '../modules/identity/access/account-capability.service';
import type { Actor } from '../modules/identity/auth/auth.service';
import { assertStagingDemoSafety, demoAccounts } from './staging-demo-safety';

/** Read-only configuration and capability report; it never prints secret values. */
async function main() {
  assertStagingDemoSafety();
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const db = app.get(PrismaService);
    const capabilities = app.get(AccountCapabilityService, { strict: false });
    const config = app.get<AppConfig>(APP_CONFIG);
    const accounts = await Promise.all(
      Object.values(demoAccounts).map(async (demo) => {
        const user = await db.user.findUnique({
          where: { normalizedEmail: demo.email },
          select: { id: true, accountStatus: true },
        });
        if (!user) return { email: demo.email, exists: false, capabilities: [] };
        const roleRows = await db.roleAssignment.findMany({
          where: { userId: user.id, revokedAt: null },
          select: { role: true },
        });
        const actor: Actor = {
          userId: user.id as Actor['userId'],
          sessionId: 'staging-demo-preflight',
          status: user.accountStatus,
          roles: roleRows.map((row) => row.role),
          sessionRevokedAt: null,
          sessionRevocationReason: null,
          authenticatedAt: new Date(),
        };
        return {
          email: demo.email,
          exists: true,
          status: user.accountStatus,
          roles: actor.roles,
          capabilities: (await capabilities.summary(actor)).capabilities,
        };
      }),
    );
    process.stdout.write(
      JSON.stringify({
        result: 'STAGING_DEMO_PREFLIGHT',
        accounts,
        configuration: {
          environment: config.environment,
          operationalFeatures: config.operationalFeatures,
          emailDelivery: { mode: config.emailDeliveryMode, configured: Boolean(config.resendApiKey && config.resendFromEmail) },
          phoneDelivery: {
            enabled: config.phoneVerificationEnabled,
            mode: config.phoneDeliveryMode,
            configured: Boolean(config.twilioAccountSid && config.twilioAuthToken && (config.twilioFromNumber || config.twilioVerifyServiceSid)),
          },
          providers: {
            mode: config.providerMode,
            productionEnabled: config.providersProductionEnabled,
            plaidConfigured: Boolean(config.plaidClientId && config.plaidSecret),
            bridgeConfigured: Boolean(config.bridgeApiKey),
            blockchainAnalysisConfigured: Boolean(config.blockchainAnalysisApiKey),
          },
          storage: { localSubmissionStorageEnabled: config.localSubmissionStorageEnabled },
          realtime: { outboxWorkerEnabled: config.outboxWorkerEnabled },
        },
        requiredSetupAuthority: {
          adminCredentialsProvided: Boolean(process.env.DEMO_SETUP_ADMIN_EMAIL && process.env.DEMO_SETUP_ADMIN_PASSWORD),
          note: 'Setup requires a real existing ADMIN and recent authentication; it never grants a demo account a staff role.',
        },
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : 'Staging demo preflight failed.'}\n`);
    process.exitCode = 1;
  });
}
