import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
export type CapabilityReason =
  | 'EMAIL_VERIFICATION_REQUIRED'
  | 'PHONE_VERIFICATION_REQUIRED'
  | 'TWO_FACTOR_REQUIRED'
  | 'IDENTITY_VERIFICATION_REQUIRED'
  | 'COMPLIANCE_REVIEW_REQUIRED'
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
    | 'ACCOUNT_STATUS'
    | 'FEATURE_AVAILABILITY';
  satisfied: boolean;
};

export type CapabilityDecision = {
  allowed: boolean;
  capability: AccountCapability;
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
        complianceCases: {
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
      return this.denied(capability, 'FEATURE_DISABLED', requirements);

    if (capability === 'WITHDRAW_FUNDS') {
      const phone = Boolean(user.phoneVerifiedAt);
      needs('PHONE_VERIFICATION', phone);
      if (!phone)
        return this.denied(
          capability,
          'PHONE_VERIFICATION_REQUIRED',
          requirements,
        );
      const twoFactor = Boolean(user.twoFactor?.enabledAt);
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
    return this.allowed(capability, requirements);
  }

  async require(actor: Actor, capability: AccountCapability): Promise<void> {
    const decision = await this.evaluate(actor.userId, capability);
    if (decision.allowed) return;
    throw new ForbiddenException({
      code: decision.reason,
      message: customerMessage(decision.reason!),
      capability,
      requirements: decision.requirements,
    });
  }

  private allowed(
    capability: AccountCapability,
    requirements: Requirement[],
  ): CapabilityDecision {
    return { allowed: true, capability, reason: null, requirements };
  }
  private denied(
    capability: AccountCapability,
    reason: CapabilityReason,
    requirements: Requirement[],
  ): CapabilityDecision {
    return { allowed: false, capability, reason, requirements };
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
