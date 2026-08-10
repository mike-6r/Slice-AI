import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { PrismaService } from '../database/prisma.service';
import { AuthService } from '../modules/identity/auth/auth.service';
import {
  assertStagingDemoSafety,
  demoAccounts,
  requiredSecret,
} from './staging-demo-safety';

async function main() {
  assertStagingDemoSafety();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const auth = app.get(AuthService);
    const db = app.get(PrismaService);
    for (const demo of Object.values(demoAccounts)) {
      const before = await db.user.findUnique({
        where: { normalizedEmail: demo.email },
        select: { passwordHash: true },
      });
      if (!before) throw new Error(`Demo account is missing: ${demo.email}`);
      const password = requiredSecret(demo.passwordEnv);
      const first = await auth.login(
        { email: demo.email, password },
        `staging-demo-auth-first-${randomUUID()}`,
        { userAgent: 'slice-staging-demo-auth-verifier' },
      );
      await auth.logout(
        await auth.actor(first.accessToken),
        `staging-demo-auth-logout-${randomUUID()}`,
      );
      await auth.login(
        { email: demo.email, password },
        `staging-demo-auth-second-${randomUUID()}`,
        { userAgent: 'slice-staging-demo-auth-verifier' },
      );
      const after = await db.user.findUniqueOrThrow({
        where: { normalizedEmail: demo.email },
        select: { id: true, passwordHash: true, accountStatus: true },
      });
      if (before.passwordHash !== after.passwordHash) {
        throw new Error(`Password hash changed during logout/login: ${demo.email}`);
      }
      if (!['ACTIVE', 'PENDING_REVIEW'].includes(after.accountStatus)) {
        throw new Error(`Demo account cannot log in with status ${after.accountStatus}.`);
      }
      if (process.env.STAGING_DEMO_AUTH_RESTART_PROOF === 'true') {
        await db.auditEvent.create({
          data: {
            id: randomUUID(),
            actorUserId: after.id,
            actorType: 'USER',
            action: 'STAGING_DEMO_AUTH_RESTART_VERIFIED',
            resourceType: 'user',
            resourceId: after.id,
            requestId: `staging-demo-auth-restart-proof-${randomUUID()}`,
            result: 'SUCCESS',
            metadata: { source: 'STAGING_DEMO_VERIFY_AUTH' },
          },
        });
      }
    }
    process.stdout.write(
      JSON.stringify({
        result: process.env.STAGING_DEMO_AUTH_RESTART_PROOF === 'true'
          ? 'STAGING_DEMO_AUTH_RESTART_VERIFIED'
          : 'STAGING_DEMO_AUTH_VERIFIED',
        accounts: Object.values(demoAccounts).map((item) => item.email),
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Staging demo auth verification failed.'}\n`);
  process.exitCode = 1;
});
