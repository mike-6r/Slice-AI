import { NestFactory } from '@nestjs/core';
import { createHash, randomUUID } from 'node:crypto';
import { AppModule } from '../app.module';
import { APP_CONFIG, type AppConfig } from '../config/app-config';
import { PrismaService } from '../database/prisma.service';
import { FinancialLedgerService } from '../modules/finance/application/financial-ledger.service';
import { AccessControlService } from '../modules/identity/access/access-control.service';
import { AccountCapabilityService } from '../modules/identity/access/account-capability.service';
import { AuthService, type Actor } from '../modules/identity/auth/auth.service';
import {
  assertStagingDemoSafety,
  demoAccounts,
  requiredSecret,
} from './staging-demo-safety';

type DemoDefinition = (typeof demoAccounts)[keyof typeof demoAccounts];

/**
 * Creates only the two durable staging identities and their account records.
 * It deliberately does not create collectible, intake, ownership, offering,
 * or market fixtures, alter passwords of an existing account,
 * grant privileged financial, vault, or compliance roles, or create
 * external-provider records. It may create an internal, explicitly labelled
 * staging-only identity approval for the named fake-money investor so the
 * investor trading walkthrough is usable without real identity or banking data.
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
    const capabilities = app.get(AccountCapabilityService, { strict: false });
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
    await ensureDemoInvestorTradingEligibility(db, investor.userId, config);
    await assertTradingCapability(capabilities, investor.userId);

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
        roles: {
          investor: ['USER'],
          collector: ['USER', 'COLLECTOR'],
        },
        note: 'Funding is an idempotent, internal D13 DEMO_FUNDING journal only. The named investor has an internal staging-only fake identity approval and reserved test phone; no real identity, bank mandate, external-provider record, password, or privileged role was written.',
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
    throw new Error(
      'DEMO_SETUP_ADMIN_EMAIL must authenticate as an active ADMIN.',
    );
  }
  return actor;
}

export async function ensureDemoAccount(
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
  // The identity is useful for staging walkthroughs, but it is never an
  // operational customer-liability source.
  await db.user.update({
    where: { id: actor.userId },
    data: { financialDataClass: 'DEMO' },
  });

  return { userId: actor.userId, actor };
}

/**
 * Makes the one named staging investor eligible for the fake-money trading
 * walkthrough. This is deliberately not a generic "approve user" utility:
 * the caller has already passed assertStagingDemoSafety and the email is
 * checked again inside the transaction.
 */
export async function ensureDemoInvestorTradingEligibility(
  db: PrismaService,
  investorUserId: string,
  config: AppConfig,
) {
  assertStagingDemoSafety();
  const provider = providerForMode(config.providerMode);
  if (config.providerMode === 'stripe_live') {
    throw new Error(
      'Refusing demo eligibility: Stripe live is not permitted for the staging fake-money investor.',
    );
  }
  const now = new Date();
  const decisionFingerprint = createHash('sha256')
    .update(`staging-demo-investor-identity-approved:${provider}`)
    .digest('hex');
  await db.$transaction(async (tx) => {
    const investor = await tx.user.findUnique({
      where: { id: investorUserId },
      select: { normalizedEmail: true },
    });
    if (investor?.normalizedEmail !== demoAccounts.investor.email) {
      throw new Error(
        'Refusing demo eligibility: target is not the named staging investor.',
      );
    }
    await tx.user.update({
      where: { id: investorUserId },
      data: {
        // 07700 900001 is a UK Ofcom-reserved fictional test number.
        phoneE164: '+447700900001',
        phoneVerifiedAt: now,
        emailVerifiedAt: now,
        financialDataClass: 'DEMO',
      },
    });
    const complianceCase = await tx.complianceCase.upsert({
      where: {
        userId_provider_type: { userId: investorUserId, provider, type: 'KYC' },
      },
      create: {
        userId: investorUserId,
        provider,
        type: 'KYC',
        status: 'APPROVED',
        identityState: 'VERIFIED',
        identityRequestedAt: now,
        identityCompletedAt: now,
        identityVerifiedAt: now,
        identityLastProviderSync: now,
      },
      update: {
        status: 'APPROVED',
        identityState: 'VERIFIED',
        identityCompletedAt: now,
        identityVerifiedAt: now,
        identityLastProviderSync: now,
        identitySafeFailureCode: null,
      },
      select: { id: true },
    });
    await tx.complianceDecision.upsert({
      where: {
        caseId_providerEventIdHash: {
          caseId: complianceCase.id,
          providerEventIdHash: decisionFingerprint,
        },
      },
      create: {
        caseId: complianceCase.id,
        status: 'APPROVED',
        reasonCode: 'STAGING_DEMO_FAKE_IDENTITY_APPROVED',
        providerEventIdHash: decisionFingerprint,
      },
      update: {
        status: 'APPROVED',
        reasonCode: 'STAGING_DEMO_FAKE_IDENTITY_APPROVED',
      },
    });
    const audited = await tx.auditEvent.findFirst({
      where: {
        actorUserId: investorUserId,
        action: 'STAGING_DEMO_TRADING_ELIGIBILITY_GRANTED',
        resourceType: 'user',
        resourceId: investorUserId,
        result: 'SUCCESS',
      },
      select: { id: true },
    });
    if (!audited) {
      await tx.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: investorUserId,
          actorType: 'SYSTEM',
          action: 'STAGING_DEMO_TRADING_ELIGIBILITY_GRANTED',
          resourceType: 'user',
          resourceId: investorUserId,
          requestId: `staging-demo-trading-eligibility:${provider}`,
          result: 'SUCCESS',
          metadata: {
            source: 'STAGING_DEMO_SETUP',
            provider,
            identity: 'FAKE_MONEY_TEST_ONLY',
          },
        },
      });
    }
  });
}

async function assertTradingCapability(
  capabilities: AccountCapabilityService,
  userId: string,
) {
  const [buy, sell] = await Promise.all([
    capabilities.evaluate(userId, 'PLACE_BUY_ORDER'),
    capabilities.evaluate(userId, 'PLACE_SELL_ORDER'),
  ]);
  if (!buy.allowed || !sell.allowed) {
    throw new Error(
      `Demo investor identity is ready but trading remains unavailable: buy=${buy.reason ?? 'unknown'}, sell=${sell.reason ?? 'unknown'}.`,
    );
  }
}

function providerForMode(mode: AppConfig['providerMode']) {
  if (mode === 'stripe_sandbox') return 'STRIPE_SANDBOX' as const;
  if (mode === 'stripe_live') return 'STRIPE_LIVE' as const;
  return 'LOCAL_TEST' as const;
}

export async function ensureDemoFunding(
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
    financialDataClass: 'DEMO',
  });
  const clearing = await ensureFinancialAccount(db, {
    ownerType: 'PLATFORM',
    ownerUserId: null,
    accountType: 'ASSET',
    code: 'STAGING_DEMO_CLEARING',
    normalSide: 'DEBIT',
    financialDataClass: 'DEMO',
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
          {
            accountId: clearing.id,
            side: 'DEBIT',
            amountMinor: input.amountMinor,
          },
          {
            accountId: cash.id,
            side: 'CREDIT',
            amountMinor: input.amountMinor,
          },
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

  // A repeat demo must retain enough spendable cash after its own D14 trades.
  // Replenishment is still an explicit, balanced D13 journal; it never writes
  // projections directly or touches a non-demo account. Existing history is
  // intentionally retained for the owner walkthrough.
  const wallet = await ledger.walletForUser(actor.userId);
  const availableMinor = BigInt(
    wallet.accounts.find((account) => account.code === 'CASH_AVAILABLE')
      ?.availableMinor ?? '0',
  );
  const targetAvailableMinor = BigInt(input.amountMinor);
  if (availableMinor < targetAvailableMinor) {
    const topUpMinor = targetAvailableMinor - availableMinor;
    const prefix = `staging-demo-funding-replenish:${input.label}:`;
    const priorTopUps = await db.journalTransaction.count({
      where: { correlationId: { startsWith: prefix } },
    });
    const correlationId = `${prefix}${priorTopUps + 1}:${topUpMinor}`;
    await ledger.post(
      actor,
      {
        type: 'DEMO_FUNDING',
        correlationId,
        descriptionCode: 'STAGING_DEMO_FUNDING_REPLENISHMENT',
        lines: [
          {
            accountId: clearing.id,
            side: 'DEBIT',
            amountMinor: topUpMinor.toString(),
          },
          {
            accountId: cash.id,
            side: 'CREDIT',
            amountMinor: topUpMinor.toString(),
          },
        ],
      },
      `staging-demo-funding-replenish-request:${input.label}:${priorTopUps + 1}`,
      `staging-demo-funding-replenish:${input.label}:${priorTopUps + 1}`,
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
    financialDataClass: 'DEMO';
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
      financialDataClass: input.financialDataClass,
    },
  });
}

async function assertDemoRoleBoundary(
  db: PrismaService,
  investorUserId: string,
  collectorUserId: string,
) {
  const roles = await db.roleAssignment.findMany({
    where: {
      userId: { in: [investorUserId, collectorUserId] },
      revokedAt: null,
    },
    select: { userId: true, role: true },
  });
  const invalid = roles.find(
    (entry) =>
      entry.role !== 'USER' &&
      !(entry.userId === collectorUserId && entry.role === 'COLLECTOR'),
  );
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
