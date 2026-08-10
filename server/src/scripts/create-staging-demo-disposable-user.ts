import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { AuthService } from '../modules/identity/auth/auth.service';
import { assertStagingDemoSafety, requiredSecret } from './staging-demo-safety';

async function main() {
  assertStagingDemoSafety();
  const password = requiredSecret('DEMO_DISPOSABLE_USER_PASSWORD');
  const email = `demo-disposable-${Date.now()}-${randomUUID().slice(0, 8)}@slicecollectable.com`;
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const auth = app.get(AuthService);
    const config = app.get<AppConfig>(APP_CONFIG);
    await auth.signup(
      {
        email,
        password,
        displayName: 'Slice Disposable Demo User',
        consent: config.signupConsent.required
          ? {
              termsAccepted: true as const,
              privacyAccepted: true as const,
              termsVersion: config.signupConsent.termsVersion!,
              privacyVersion: config.signupConsent.privacyVersion!,
            }
          : undefined,
      },
      `staging-demo-disposable-${randomUUID()}`,
      `staging-demo-disposable:${email}`,
      { userAgent: 'slice-staging-demo-disposable-user' },
    );
    process.stdout.write(JSON.stringify({ result: 'DISPOSABLE_USER_CREATED', email }) + '\n');
  } finally {
    await app.close();
  }
}

void main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Disposable user setup failed.'}\n`);
  process.exitCode = 1;
});
