import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { AccessControlService } from '../modules/identity/access/access-control.service';
import { AuthService } from '../modules/identity/auth/auth.service';

/** Idempotent, environment-gated Beta Admin provisioning. No credentials are logged. */
async function main() {
  if (process.env.APP_ENV !== 'beta')
    throw new Error(
      'Refusing Beta Admin provisioning: APP_ENV must be exactly "beta".',
    );
  const email = required('BETA_ADMIN_EMAIL').toLowerCase();
  const username = required('BETA_ADMIN_USERNAME', 3);
  const password = required('BETA_ADMIN_PASSWORD');
  const operatorEmail = required('BETA_ADMIN_OPERATOR_EMAIL').toLowerCase();
  const operatorPassword = required('BETA_ADMIN_OPERATOR_PASSWORD');
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const auth = app.get(AuthService);
    const access = app.get(AccessControlService);
    const db = app.get(PrismaService);
    const config = app.get<AppConfig>(APP_CONFIG);
    const operatorSession = await auth.login(
      { email: operatorEmail, password: operatorPassword },
      `beta-admin-operator-${randomUUID()}`,
      { userAgent: 'slice-beta-admin-provisioner' },
    );
    const operator = await auth.actor(operatorSession.accessToken);
    if (!operator.roles.includes('ADMIN'))
      throw new Error(
        'BETA_ADMIN_OPERATOR_EMAIL must authenticate as an active ADMIN.',
      );

    let target = await db.user.findUnique({
      where: { normalizedEmail: email },
      select: { id: true, accountStatus: true },
    });
    if (!target) {
      const consent = config.signupConsent.required
        ? {
            termsAccepted: true as const,
            privacyAccepted: true as const,
            termsVersion: config.signupConsent.termsVersion!,
            privacyVersion: config.signupConsent.privacyVersion!,
          }
        : undefined;
      const created = await auth.signup(
        { email, password, displayName: 'Slice Beta Admin', consent },
        `beta-admin-signup-${randomUUID()}`,
        `beta-admin-signup:${email}`,
        { userAgent: 'slice-beta-admin-provisioner' },
      );
      target = { id: created.user.id, accountStatus: 'PENDING_REVIEW' };
    }
    const targetLogin = await auth.login(
      { email, password },
      `beta-admin-login-${randomUUID()}`,
      { userAgent: 'slice-beta-admin-provisioner' },
    );
    let targetActor = await auth.actor(targetLogin.accessToken);
    if (target.accountStatus === 'PENDING_REVIEW') {
      await access.transitionStatus(
        operator,
        target.id as never,
        { toStatus: 'ACTIVE', reasonCode: 'BETA_ADMIN_PROVISIONED' },
        `beta-admin-activate-${randomUUID()}`,
        `beta-admin-activate:${target.id}`,
      );
      const activeLogin = await auth.login(
        { email, password },
        `beta-admin-active-login-${randomUUID()}`,
        { userAgent: 'slice-beta-admin-provisioner' },
      );
      targetActor = await auth.actor(activeLogin.accessToken);
    }
    await auth.updateProfile(
      targetActor,
      { displayName: 'Slice Beta Admin', publicUsername: username },
      `beta-admin-profile-${randomUUID()}`,
      `beta-admin-profile:${target.id}`,
    );
    const role = await db.roleAssignment.findFirst({
      where: {
        userId: target.id,
        role: 'ADMIN',
        scopeType: 'GLOBAL',
        scopeId: '*',
        revokedAt: null,
      },
      select: { id: true },
    });
    if (!role)
      await access.grantRole(
        operator,
        target.id as never,
        { role: 'ADMIN', scopeType: 'GLOBAL', scopeId: '*' },
        `beta-admin-role-${randomUUID()}`,
        `beta-admin-role:${target.id}`,
      );
    process.stdout.write(
      JSON.stringify({
        result: 'BETA_ADMIN_READY',
        email,
        username,
        userId: target.id,
        role: 'ADMIN',
        idempotent: Boolean(role),
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

function required(name: string, minimum = 12) {
  const value = process.env[name]?.trim();
  if (!value || value.length < minimum)
    throw new Error(`${name} must be set in the deployment secret store.`);
  return value;
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Beta Admin provisioning failed.'}\n`,
  );
  process.exitCode = 1;
});
