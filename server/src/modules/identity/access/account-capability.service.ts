import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../auth/auth.service';

export const accountCapabilities = [
  'BROWSE_MARKETS',
  'VIEW_PUBLIC_ASSETS',
  'VIEW_COLLECTORS',
  'VIEW_VAULT_LIVE',
  'VIEW_PORTFOLIO',
  'MANAGE_PROFILE',
  'MANAGE_ACCOUNT_SECURITY',
  'LINK_BANK',
  'DEPOSIT_FUNDS',
  'WITHDRAW_FUNDS',
  'PLACE_BUY_ORDER',
  'PLACE_SELL_ORDER',
  'LIST_ASSET',
] as const;

export type AccountCapability = (typeof accountCapabilities)[number];
export type CapabilityStatus =
  'AVAILABLE' | 'ACTION_REQUIRED' | 'TEMPORARILY_UNAVAILABLE' | 'BLOCKED';
export type CapabilityReason =
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'PHONE_VERIFICATION_REQUIRED'
  | 'TWO_FACTOR_REQUIRED'
  | 'IDENTITY_VERIFICATION_REQUIRED'
  | 'COMPLIANCE_REVIEW_REQUIRED'
  | 'BANK_ACCOUNT_REQUIRED'
  | 'PAYOUT_ACCOUNT_REQUIRED'
  | 'PAYOUT_ACCOUNT_REVIEW_REQUIRED'
  | 'COLLECTOR_PAYOUTS_REQUIRED'
  | 'NO_WITHDRAWABLE_BALANCE'
  | 'TRADING_UNAVAILABLE'
  | 'DEPOSITS_UNAVAILABLE'
  | 'WITHDRAWALS_UNAVAILABLE'
  | 'ACCOUNT_RESTRICTED'
  | 'ACCOUNT_DEACTIVATED'
  | 'ACCOUNT_DELETION_PENDING'
  | 'ACCOUNT_REVIEW_REQUIRED'
  | 'FEATURE_DISABLED';

type Requirement = {
  type:
    | 'EMAIL_VERIFICATION'
    | 'PHONE_VERIFICATION'
    | 'TWO_FACTOR_AUTHENTICATION'
    | 'IDENTITY_VERIFICATION'
    | 'BANK_ACCOUNT'
    | 'PAYOUT_ACCOUNT'
    | 'PROVIDER_AVAILABILITY'
    | 'CASH_BALANCE'
    | 'ACCOUNT_STATUS'
    | 'FEATURE_AVAILABILITY';
  satisfied: boolean;
};

export type CapabilityDecision = {
  allowed: boolean;
  capability: AccountCapability;
  status: CapabilityStatus;
  reason: CapabilityReason | null;
  requirements: Requirement[];
};

/**
 * The sole account-state policy authority. It deliberately derives its answer
 * from existing identity, compliance, and operational controls rather than
 * persisting a second "verified" or capability flag.
 */
@Injectable()
export class AccountCapabilityService {
  constructor(
    private readonly db: PrismaService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async summary(actor: Actor) {
    const decisions = await Promise.all(
      accountCapabilities.map((capability) =>
        this.evaluate(actor.userId, capability),
      ),
    );
    return { capabilities: decisions };
  }

  async evaluate(
    userId: string,
    capability: AccountCapability,
  ): Promise<CapabilityDecision> {
    const user = await this.db.user.findUnique({
      where: { id: userId },
      select: {
        accountStatus: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
        twoFactor: { select: { enabledAt: true } },
        smsTwoFactor: { select: { enabledAt: true } },
        complianceCases: {
          where: {
            provider: providerForMode(this.config.providerMode),
            type: 'KYC',
          },
          select: { status: true },
          orderBy: { updatedAt: 'desc' },
        },
        complianceHolds: {
          where: {
            status: 'ACTIVE',
            scope: {
              in: [
                'ACCOUNT',
                'EXTERNAL_MOVEMENT',
                'WITHDRAWAL',
                'FUNDING',
                'TRADING_ELIGIBILITY',
              ],
            },
          },
          select: { id: true },
          take: 1,
        },
        deletionRequests: {
          where: {
            status: {
              in: [
                'REQUESTED',
                'UNDER_REVIEW',
                'BLOCKED',
                'APPROVED',
                'PROCESSING',
              ],
            },
          },
          select: { id: true },
          take: 1,
        },
        externalFinancialAccounts: {
          where: {
            provider: providerForMode(this.config.providerMode),
            currency: 'GBP',
            accountType: 'bacs_debit',
            status: 'CONNECTED',
            isDefault: true,
          },
          select: { id: true },
          take: 1,
        },
        externalConnectAccounts: {
          where: {
            provider: providerForMode(this.config.providerMode),
            environment: environmentForMode(this.config.providerMode),
          },
          select: { status: true },
          take: 1,
        },
        financialAccounts: {
          where: {
            ownerType: 'USER',
            code: { in: ['CASH_AVAILABLE', 'COLLECTOR_PROCEEDS_AVAILABLE'] },
            currency: 'GBP',
            status: 'ACTIVE',
          },
          select: {
            normalSide: true,
            balance: {
              select: {
                postedDebitMinor: true,
                postedCreditMinor: true,
                reservedMinor: true,
              },
            },
          },
        },
      },
    });
    if (!user)
      throw new NotFoundException({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'Account was not found.',
      });

    const requirements: Requirement[] = [];
    const needs = (type: Requirement['type'], satisfied: boolean) =>
      requirements.push({ type, satisfied });
    const basic = new Set<AccountCapability>([
      'BROWSE_MARKETS',
      'VIEW_PUBLIC_ASSETS',
      'VIEW_COLLECTORS',
      'VIEW_VAULT_LIVE',
      'VIEW_PORTFOLIO',
      'MANAGE_PROFILE',
      'MANAGE_ACCOUNT_SECURITY',
    ]);
    const restricted = [
      'RESTRICTED',
      'SUSPENDED',
      'CLOSED',
      'DEACTIVATED',
    ].includes(user.accountStatus);
    if (restricted) {
      needs('ACCOUNT_STATUS', false);
      return this.denied(
        capability,
        user.accountStatus === 'DEACTIVATED'
          ? 'ACCOUNT_DEACTIVATED'
          : 'ACCOUNT_RESTRICTED',
        requirements,
      );
    }
    if (basic.has(capability)) return this.allowed(capability, requirements);

    if (user.deletionRequests.length > 0) {
      needs('ACCOUNT_STATUS', false);
      return this.denied(capability, 'ACCOUNT_DELETION_PENDING', requirements);
    }

    if (user.accountStatus !== 'ACTIVE') {
      needs('ACCOUNT_STATUS', false);
      return this.denied(capability, 'ACCOUNT_REVIEW_REQUIRED', requirements);
    }

    const email = Boolean(user.emailVerifiedAt);
    needs('EMAIL_VERIFICATION', email);
    if (!email)
      return this.denied(
        capability,
        'EMAIL_VERIFICATION_REQUIRED',
        requirements,
      );

    if (capability === 'LIST_ASSET' || capability === 'LINK_BANK') {
      if (
        capability === 'LIST_ASSET' &&
        !this.config.operationalFeatures.listing
      ) {
        needs('FEATURE_AVAILABILITY', false);
        return this.denied(capability, 'FEATURE_DISABLED', requirements);
      }
      return this.allowed(capability, requirements);
    }

    const feature =
      capability === 'DEPOSIT_FUNDS'
        ? this.config.operationalFeatures.deposits
        : capability === 'WITHDRAW_FUNDS'
          ? this.config.operationalFeatures.withdrawals
          : this.config.operationalFeatures.trading;
    needs('FEATURE_AVAILABILITY', feature);
    if (!feature)
      return this.denied(capability, featureReason(capability), requirements);

    if (capability === 'WITHDRAW_FUNDS') {
      const phone = Boolean(user.phoneVerifiedAt);
      needs('PHONE_VERIFICATION', phone);
      if (!phone)
        return this.denied(
          capability,
          'PHONE_VERIFICATION_REQUIRED',
          requirements,
        );
      const twoFactor = Boolean(
        user.twoFactor?.enabledAt || user.smsTwoFactor?.enabledAt,
      );
      needs('TWO_FACTOR_AUTHENTICATION', twoFactor);
      if (!twoFactor)
        return this.denied(capability, 'TWO_FACTOR_REQUIRED', requirements);
    }

    const approved = user.complianceCases.some(
      (item) => item.status === 'APPROVED',
    );
    const pending = user.complianceCases.some((item) =>
      ['PENDING', 'REVIEW'].includes(item.status),
    );
    const held = user.complianceHolds.length > 0;
    needs('IDENTITY_VERIFICATION', approved && !held);
    if (!approved || held) {
      return this.denied(
        capability,
        pending || held
          ? 'COMPLIANCE_REVIEW_REQUIRED'
          : 'IDENTITY_VERIFICATION_REQUIRED',
        requirements,
      );
    }

    if (
      capability === 'DEPOSIT_FUNDS' &&
      this.config.providerMode !== 'local' &&
      user.externalFinancialAccounts.length === 0
    ) {
      needs('BANK_ACCOUNT', false);
      return this.denied(capability, 'BANK_ACCOUNT_REQUIRED', requirements);
    }

    if (
      capability === 'WITHDRAW_FUNDS' &&
      this.config.providerMode !== 'local'
    ) {
      const payout = user.externalConnectAccounts[0];
      const payoutReady = payout?.status === 'READY';
      needs('PAYOUT_ACCOUNT', payoutReady);
      if (!payoutReady) {
        return this.denied(
          capability,
          payout?.status === 'UNDER_REVIEW'
            ? 'PAYOUT_ACCOUNT_REVIEW_REQUIRED'
            : 'PAYOUT_ACCOUNT_REQUIRED',
          requirements,
        );
      }
    }
    if (capability === 'WITHDRAW_FUNDS') {
      const withdrawableMinor = (user.financialAccounts ?? []).reduce(
        (total, account) => {
          if (!account.balance) return total;
          const posted =
            account.normalSide === 'CREDIT'
              ? account.balance.postedCreditMinor - account.balance.postedDebitMinor
              : account.balance.postedDebitMinor - account.balance.postedCreditMinor;
          const available = posted - account.balance.reservedMinor;
          return total + (available > 0n ? available : 0n);
        },
        0n,
      );
      needs('CASH_BALANCE', withdrawableMinor > 0n);
      if (withdrawableMinor <= 0n)
        return this.denied(capability, 'NO_WITHDRAWABLE_BALANCE', requirements);
    }
    return this.allowed(capability, requirements);
  }

  async require(actor: Actor, capability: AccountCapability): Promise<void> {
    const decision = await this.evaluate(actor.userId, capability);
    if (decision.allowed) return;
    throw new ForbiddenException({
      code: decision.reason,
      message: customerMessage(decision.reason!),
      capability,
      status: decision.status,
      requirements: decision.requirements,
    });
  }

  async grantCollectorBeta(actor: Actor, requestId?: string) {
    if (!this.config.isBeta) {
      throw new ForbiddenException({
        code: 'FEATURE_DISABLED',
        message: 'Collector Beta access is not available in this environment.',
      });
    }
    const existing = await this.db.roleAssignment.findFirst({
      where: { userId: actor.userId, role: 'COLLECTOR', revokedAt: null },
      select: { id: true },
    });
    if (existing) {
      return {
        status: 'APPROVED' as const,
        role: 'COLLECTOR' as const,
        granted: false,
      };
    }
    const assignment = await this.db.$transaction(async (db) => {
      const created = await db.roleAssignment.create({
        data: {
          userId: actor.userId,
          role: 'COLLECTOR',
          scopeType: 'GLOBAL',
          scopeId: '*',
          assignedByUserId: actor.userId,
        },
        select: { id: true },
      });
      await db.auditEvent.create({
        data: {
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'COLLECTOR_BETA_ACCESS_GRANTED',
          resourceType: 'role-assignment',
          resourceId: created.id,
          requestId: requestId ?? null,
          sessionId: actor.sessionId,
          result: 'SUCCESS',
          metadata: { role: 'COLLECTOR', scope: 'BETA' },
        },
      });
      return created;
    });
    return {
      status: 'APPROVED' as const,
      role: 'COLLECTOR' as const,
      granted: true,
      assignmentId: assignment.id,
    };
  }

  private allowed(
    capability: AccountCapability,
    requirements: Requirement[],
  ): CapabilityDecision {
    return {
      allowed: true,
      capability,
      status: 'AVAILABLE',
      reason: null,
      requirements,
    };
  }
  private denied(
    capability: AccountCapability,
    reason: CapabilityReason,
    requirements: Requirement[],
  ): CapabilityDecision {
    return {
      allowed: false,
      capability,
      status: statusForReason(reason),
      reason,
      requirements,
    };
  }
}

function customerMessage(reason: CapabilityReason) {
  const messages: Record<CapabilityReason, string> = {
    EMAIL_VERIFICATION_REQUIRED: 'Verify your email to continue.',
    PHONE_VERIFICATION_REQUIRED: 'Verify your phone to continue.',
    TWO_FACTOR_REQUIRED: 'Enable two-factor authentication to continue.',
    IDENTITY_VERIFICATION_REQUIRED:
      'Identity verification is required to continue.',
    COMPLIANCE_REVIEW_REQUIRED:
      'This action is unavailable while verification is under review.',
    BANK_ACCOUNT_REQUIRED:
      'Connect a UK bank account before requesting a deposit.',
    PAYOUT_ACCOUNT_REQUIRED:
      'Complete payout setup before withdrawing available cash.',
    PAYOUT_ACCOUNT_REVIEW_REQUIRED:
      'Payout setup is still under review. You can withdraw once it is approved.',
    COLLECTOR_PAYOUTS_REQUIRED:
      'Complete payout setup before requesting a withdrawal.',
    NO_WITHDRAWABLE_BALANCE: 'No settled cash is currently available to withdraw.',
    TRADING_UNAVAILABLE:
      'Trading is temporarily unavailable in this environment.',
    DEPOSITS_UNAVAILABLE:
      'Deposits are temporarily unavailable in this environment.',
    WITHDRAWALS_UNAVAILABLE:
      'Withdrawals are temporarily unavailable in this environment.',
    ACCOUNT_RESTRICTED: 'This action is unavailable for this account.',
    ACCOUNT_DEACTIVATED:
      'This action is unavailable for a deactivated account.',
    ACCOUNT_DELETION_PENDING:
      'This action is unavailable while account deletion is in progress.',
    ACCOUNT_REVIEW_REQUIRED:
      'This action is unavailable until account review is complete.',
    FEATURE_DISABLED: 'This feature is currently unavailable.',
  };
  return messages[reason];
}

function statusForReason(reason: CapabilityReason): CapabilityStatus {
  if (
    reason === 'TRADING_UNAVAILABLE' ||
    reason === 'DEPOSITS_UNAVAILABLE' ||
    reason === 'WITHDRAWALS_UNAVAILABLE' ||
    reason === 'FEATURE_DISABLED'
  ) {
    return 'TEMPORARILY_UNAVAILABLE';
  }
  if (
    reason === 'ACCOUNT_RESTRICTED' ||
    reason === 'ACCOUNT_DEACTIVATED' ||
    reason === 'ACCOUNT_DELETION_PENDING' ||
    reason === 'COLLECTOR_PAYOUTS_REQUIRED'
  ) {
    return 'BLOCKED';
  }
  return 'ACTION_REQUIRED';
}

function featureReason(capability: AccountCapability): CapabilityReason {
  if (capability === 'PLACE_BUY_ORDER' || capability === 'PLACE_SELL_ORDER')
    return 'TRADING_UNAVAILABLE';
  if (capability === 'DEPOSIT_FUNDS') return 'DEPOSITS_UNAVAILABLE';
  if (capability === 'WITHDRAW_FUNDS') return 'WITHDRAWALS_UNAVAILABLE';
  return 'FEATURE_DISABLED';
}

function providerForMode(mode: AppConfig['providerMode']) {
  if (mode === 'stripe_sandbox') return 'STRIPE_SANDBOX' as const;
  if (mode === 'stripe_live') return 'STRIPE_LIVE' as const;
  return 'LOCAL_TEST' as const;
}

function environmentForMode(mode: AppConfig['providerMode']) {
  return mode === 'stripe_live' ? ('LIVE' as const) : ('SANDBOX' as const);
}
