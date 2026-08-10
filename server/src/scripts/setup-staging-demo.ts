import { NestFactory } from '@nestjs/core';
import { randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { FinancialLedgerService } from '../modules/finance/application/financial-ledger.service';
import { AccessControlService } from '../modules/identity/access/access-control.service';
import { AuthService, type Actor } from '../modules/identity/auth/auth.service';
import {
  assertStagingDemoSafety,
  demoAccounts,
  requiredSecret,
} from './staging-demo-safety';

type DemoDefinition = (typeof demoAccounts)[keyof typeof demoAccounts];

/**
 * Creates only the two durable demo identities and their public presentation
 * records. It deliberately does not alter passwords of an existing account,
 * grant staff roles, directly credit balances, or create external-provider
 * records. Rich cross-domain fixtures are added only through their authorities.
 */
export async function runStagingDemoSetup() {
  assertStagingDemoSafety();
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn'],
  });
  try {
    const auth = app.get(AuthService);
    const access = app.get(AccessControlService, { strict: false });
    const db = app.get(PrismaService);
    const ledger = app.get(FinancialLedgerService, { strict: false });
    const config = app.get<AppConfig>(APP_CONFIG);
    const admin = await authenticatedAdmin(auth);

    const investor = await ensureDemoAccount(
      auth,
      access,
      db,
      config,
      admin,
      demoAccounts.investor,
      'slice-demo-investor',
    );
    const collector = await ensureDemoAccount(
      auth,
      access,
      db,
      config,
      admin,
      demoAccounts.collector,
      'slice-demo-collector',
    );

    await db.publicCollectorProfile.upsert({
      where: { userId: collector.userId },
      create: {
        userId: collector.userId,
        slug: 'slice-demo-collector',
        headline: 'Staging showcase collector profile',
        specialism: 'Authenticated collectibles',
        isPublic: true,
        publishedAt: new Date(),
      },
      update: {
        headline: 'Staging showcase collector profile',
        specialism: 'Authenticated collectibles',
        isPublic: true,
        publishedAt: new Date(),
      },
    });

    await assertAuthRestartProof(db, investor.userId, collector.userId);

    await ensureDemoFunding(db, ledger, investor.actor, {
      accountId: investor.userId,
      label: 'investor',
      amountMinor: '25000000',
    });
    await ensureDemoFunding(db, ledger, collector.actor, {
      accountId: collector.userId,
      label: 'collector',
      amountMinor: '7500000',
    });

    await assertDemoRoleBoundary(db, investor.userId, collector.userId);
    process.stdout.write(
      JSON.stringify({
        result: 'STAGING_DEMO_IDENTITIES_READY',
        accounts: [demoAccounts.investor.email, demoAccounts.collector.email],
        collectorPublicProfile: 'slice-demo-collector',
        roles: ['USER'],
        note:
          'Funding is an idempotent, internal D13 DEMO_FUNDING journal only. No passwords, staff roles, or external-provider records were written.',
      }) + '\n',
    );
  } finally {
    await app.close();
  }
}

async function authenticatedAdmin(auth: AuthService): Promise<Actor> {
  const email = process.env.DEMO_SETUP_ADMIN_EMAIL?.trim().toLowerCase();
  const password = process.env.DEMO_SETUP_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error(
      'DEMO_SETUP_ADMIN_EMAIL and DEMO_SETUP_ADMIN_PASSWORD are required to activate new demo accounts through AccessControlService.',
    );
  }
  const session = await auth.login(
    { email, password },
    `staging-demo-admin-login-${randomUUID()}`,
    { userAgent: 'slice-staging-demo-setup' },
  );
  const actor = await auth.actor(session.accessToken);
  if (!actor.roles.includes('ADMIN')) {
    throw new Error('DEMO_SETUP_ADMIN_EMAIL must authenticate as an active ADMIN.');
  }
  return actor;
}

async function ensureDemoAccount(
  auth: AuthService,
  access: AccessControlService,
  db: PrismaService,
  config: AppConfig,
  admin: Actor,
  demo: DemoDefinition,
  publicUsername: string,
) {
  const password = requiredSecret(demo.passwordEnv);
  let existing = await db.user.findUnique({
    where: { normalizedEmail: demo.email },
    select: { id: true, accountStatus: true },
  });

  if (!existing) {
    const consent = config.signupConsent.required
      ? {
          termsAccepted: true as const,
          privacyAccepted: true as const,
          termsVersion: config.signupConsent.termsVersion!,
          privacyVersion: config.signupConsent.privacyVersion!,
        }
      : undefined;
    const created = await auth.signup(
      {
        email: demo.email,
        password,
        displayName: demo.displayName,
        consent,
      },
      `staging-demo-signup-${randomUUID()}`,
      `staging-demo-signup:${demo.email}`,
      { userAgent: 'slice-staging-demo-setup' },
    );
    existing = { id: created.user.id, accountStatus: 'PENDING_REVIEW' };
  }

  // Prove supplied credentials work before doing anything else. Existing
  // passwords are never reset by this tool.
  const login = await auth.login(
    { email: demo.email, password },
    `staging-demo-login-${randomUUID()}`,
    { userAgent: 'slice-staging-demo-setup' },
  );
  let actor = await auth.actor(login.accessToken);

  if (existing.accountStatus === 'PENDING_REVIEW') {
    await access.transitionStatus(
      admin,
      actor.userId,
      { toStatus: 'ACTIVE', reasonCode: 'STAGING_DEMO_ACTIVATION' },
      `staging-demo-activate-${randomUUID()}`,
      `staging-demo-activate:${demo.email}`,
    );
    const activeLogin = await auth.login(
      { email: demo.email, password },
      `staging-demo-active-login-${randomUUID()}`,
      { userAgent: 'slice-staging-demo-setup' },
    );
    actor = await auth.actor(activeLogin.accessToken);
  } else if (existing.accountStatus !== 'ACTIVE') {
    throw new Error(
      `Refusing setup: ${demo.email} has non-demo status ${existing.accountStatus}.`,
    );
  }

  await auth.updateProfile(
    actor,
    { displayName: demo.displayName, publicUsername },
    `staging-demo-profile-${randomUUID()}`,
    `staging-demo-profile:${demo.email}`,
  );

  return { userId: actor.userId, actor };
}

async function ensureDemoFunding(
  db: PrismaService,
  ledger: FinancialLedgerService,
  actor: Actor,
  input: Readonly<{ accountId: string; label: string; amountMinor: string }>,
) {
  const cash = await ensureFinancialAccount(db, {
    ownerType: 'USER',
    ownerUserId: input.accountId,
    accountType: 'LIABILITY',
    code: 'CASH_AVAILABLE',
    normalSide: 'CREDIT',
  });
  const clearing = await ensureFinancialAccount(db, {
    ownerType: 'PLATFORM',
    ownerUserId: null,
    accountType: 'ASSET',
    code: 'STAGING_DEMO_CLEARING',
    normalSide: 'DEBIT',
  });
  const correlationId = `staging-demo-funding:${input.label}`;
  let transaction = await db.journalTransaction.findUnique({
    where: { correlationId },
    select: { id: true },
  });
  if (!transaction) {
    const result = await ledger.post(
      actor,
      {
        type: 'DEMO_FUNDING',
        correlationId,
        descriptionCode: 'STAGING_DEMO_FUNDING',
        lines: [
          { accountId: clearing.id, side: 'DEBIT', amountMinor: input.amountMinor },
          { accountId: cash.id, side: 'CREDIT', amountMinor: input.amountMinor },
        ],
      },
      `staging-demo-funding-request:${input.label}`,
      `staging-demo-funding:${input.label}`,
    );
    transaction = { id: result.transactionId };
  }
  const entries = await db.journalEntry.findMany({
    where: { transactionId: transaction.id },
    select: { accountId: true, side: true, amountMinor: true },
  });
  const valid =
    entries.length === 2 &&
    entries.some(
      (entry) =>
        entry.accountId === cash.id &&
        entry.side === 'CREDIT' &&
        entry.amountMinor.toString() === input.amountMinor,
    ) &&
    entries.some(
      (entry) =>
        entry.accountId === clearing.id &&
        entry.side === 'DEBIT' &&
        entry.amountMinor.toString() === input.amountMinor,
    );
  if (!valid) {
    throw new Error(
      `Refusing setup: ${input.label} demo funding journal is not the expected balanced D13 fixture.`,
    );
  }
}

async function ensureFinancialAccount(
  db: PrismaService,
  input: Readonly<{
    ownerType: 'USER' | 'PLATFORM';
    ownerUserId: string | null;
    accountType: 'LIABILITY' | 'ASSET';
    code: string;
    normalSide: 'CREDIT' | 'DEBIT';
  }>,
) {
  const existing = await db.financialAccount.findFirst({
    where: {
      ownerType: input.ownerType,
      ownerUserId: input.ownerUserId,
      code: input.code,
      currency: 'GBP',
    },
  });
  if (existing) return existing;
  return db.financialAccount.create({
    data: {
      ownerType: input.ownerType,
      ownerUserId: input.ownerUserId,
      accountType: input.accountType,
      code: input.code,
      currency: 'GBP',
      normalSide: input.normalSide,
    },
  });
}

async function assertDemoRoleBoundary(
  db: PrismaService,
  investorUserId: string,
  collectorUserId: string,
) {
  const roles = await db.roleAssignment.findMany({
    where: { userId: { in: [investorUserId, collectorUserId] }, revokedAt: null },
    select: { userId: true, role: true },
  });
  const invalid = roles.find((entry) => entry.role !== 'USER');
  if (invalid) {
    throw new Error(
      `Refusing setup: demo account has prohibited role ${invalid.role}. Revoke it explicitly before rerunning.`,
    );
  }
}

async function assertAuthRestartProof(
  db: PrismaService,
  investorUserId: string,
  collectorUserId: string,
) {
  const since = new Date(Date.now() - 12 * 60 * 60 * 1000);
  const proven = await db.auditEvent.findMany({
    where: {
      actorUserId: { in: [investorUserId, collectorUserId] },
      action: 'STAGING_DEMO_AUTH_RESTART_VERIFIED',
      result: 'SUCCESS',
      createdAt: { gte: since },
    },
    select: { actorUserId: true },
  });
  const userIds = new Set(proven.map((entry) => entry.actorUserId));
  if (!userIds.has(investorUserId) || !userIds.has(collectorUserId)) {
    throw new Error(
      'Demo identities are ready but funding is intentionally blocked. Run staging:demo:verify-auth, restart the Slice API, then rerun it with STAGING_DEMO_AUTH_RESTART_PROOF=true before rerunning setup.',
    );
  }
}

if (require.main === module) {
  void runStagingDemoSetup().catch((error: unknown) => {
    process.stderr.write(
      `${error instanceof Error ? error.message : 'Staging demo setup failed.'}\n`,
    );
    process.exitCode = 1;
  });
}
