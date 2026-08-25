/* eslint-disable @typescript-eslint/no-require-imports -- Stripe v22 is CommonJS in the Nest CommonJS build. */
import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import Stripe = require('stripe');
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import type { Actor } from '../../identity/auth/auth.service';
import { ProviderCryptoService } from './provider-crypto.service';
import { StripeClientFactory } from './stripe-provider.client';

export type ConnectAccountStatus =
  | 'NOT_STARTED'
  | 'ACTION_REQUIRED'
  | 'UNDER_REVIEW'
  | 'READY'
  | 'RESTRICTED'
  | 'DISABLED';

export type ConnectPayoutWebhookEffect = {
  movementId: string;
  action: 'PROCESSING' | 'COMPLETE' | 'FAIL' | 'HOLD';
  providerReference?: string;
  reasonCode?: string;
};

export class ConnectPayoutExternalTransferError extends Error {
  readonly externalTransferCreated = true;
  constructor(message: string) {
    super(message);
    this.name = 'ConnectPayoutExternalTransferError';
  }
}

type ConnectRequirementsSummary = {
  currentlyDueCount: number;
  pastDueCount: number;
  pendingVerificationCount: number;
  hasValidationErrors: boolean;
  hasDisabledReason: boolean;
};

type ConnectAccountSnapshot = {
  status: ConnectAccountStatus;
  requirementsSummary: ConnectRequirementsSummary;
  detailsSubmitted: boolean;
  payoutsEnabled: boolean;
  transfersCapability: string | null;
};

type V2ConnectAccount = {
  object?: string;
  id: string;
  requirements?: {
    entries?: Array<{
      awaiting_action_from?: string;
      errors?: unknown[];
      impact?: {
        restricts_capabilities?: Array<{ deadline?: { status?: string } }>;
      };
    }>;
  };
  configuration?: {
    recipient?: {
      capabilities?: {
        stripe_balance?: {
          payouts?: { status?: string };
          stripe_transfers?: { status?: string };
        };
      };
    };
  };
};
type V2ConnectRequirementEntry = {
  awaiting_action_from?: string;
  errors?: unknown[];
  impact?: {
    restricts_capabilities?: Array<{ deadline?: { status?: string } }>;
  };
};
type ConnectAccountRow = {
  id: string;
  userId: string;
  environment: 'SANDBOX' | 'LIVE';
  externalAccountIdCiphertext: string;
};

export function mapConnectAccountStatus(
  account: Pick<
    Stripe.Account,
    'details_submitted' | 'payouts_enabled' | 'requirements' | 'capabilities'
  >,
): ConnectAccountStatus {
  const requirements = account.requirements;
  const currentlyDue = requirements?.currently_due ?? [];
  const pastDue = requirements?.past_due ?? [];
  const pending = requirements?.pending_verification ?? [];
  const transfers = account.capabilities?.transfers;
  if (
    requirements?.disabled_reason ||
    pastDue.length > 0 ||
    transfers === 'inactive'
  )
    return requirements?.disabled_reason ? 'DISABLED' : 'RESTRICTED';
  if (
    requirements?.errors?.length ||
    currentlyDue.length > 0 ||
    !account.details_submitted
  )
    return 'ACTION_REQUIRED';
  if (pending.length > 0 || transfers === 'pending') return 'UNDER_REVIEW';
  if (account.payouts_enabled && transfers === 'active') return 'READY';
  return 'RESTRICTED';
}

function legacyAccountSnapshot(
  account: Stripe.Account,
): ConnectAccountSnapshot {
  return {
    status: mapConnectAccountStatus(account),
    requirementsSummary: legacyRequirementsSummary(account),
    detailsSubmitted: account.details_submitted,
    payoutsEnabled: account.payouts_enabled,
    transfersCapability: account.capabilities?.transfers ?? null,
  };
}

function legacyRequirementsSummary(
  account: Stripe.Account,
): ConnectRequirementsSummary {
  const requirements = account.requirements;
  return {
    currentlyDueCount: requirements?.currently_due?.length ?? 0,
    pastDueCount: requirements?.past_due?.length ?? 0,
    pendingVerificationCount: requirements?.pending_verification?.length ?? 0,
    hasValidationErrors: Boolean(requirements?.errors?.length),
    hasDisabledReason: Boolean(requirements?.disabled_reason),
  };
}

function v2RequirementsSummary(
  account: V2ConnectAccount,
): ConnectRequirementsSummary {
  const entries = account.requirements?.entries ?? [];
  const statusesFor = (entry: V2ConnectRequirementEntry) =>
    (entry.impact?.restricts_capabilities ?? []).map(
      (item) => item.deadline?.status,
    );
  const currentlyDueCount = entries.filter(
    (entry) =>
      entry.awaiting_action_from === 'user' ||
      statusesFor(entry).includes('currently_due'),
  ).length;
  const pastDueCount = entries.filter((entry) =>
    statusesFor(entry).includes('past_due'),
  ).length;
  const pendingVerificationCount = entries.filter(
    (entry) =>
      entry.awaiting_action_from === 'stripe' ||
      statusesFor(entry).includes('eventually_due'),
  ).length;
  return {
    currentlyDueCount,
    pastDueCount,
    pendingVerificationCount,
    hasValidationErrors: entries.some(
      (entry) => (entry.errors?.length ?? 0) > 0,
    ),
    hasDisabledReason: false,
  };
}

export function mapV2ConnectAccountStatus(
  account: V2ConnectAccount,
): ConnectAccountStatus {
  const requirements = v2RequirementsSummary(account);
  const recipient =
    account.configuration?.recipient?.capabilities?.stripe_balance;
  const payouts = recipient?.payouts?.status ?? null;
  const transfers = recipient?.stripe_transfers?.status ?? null;
  return payouts === 'unsupported' || transfers === 'unsupported'
    ? 'DISABLED'
    : requirements.pastDueCount > 0 ||
        requirements.hasValidationErrors ||
        payouts === 'restricted' ||
        transfers === 'restricted'
      ? 'RESTRICTED'
      : requirements.currentlyDueCount > 0
        ? 'ACTION_REQUIRED'
        : requirements.pendingVerificationCount > 0 ||
            payouts === 'pending' ||
            transfers === 'pending'
          ? 'UNDER_REVIEW'
          : payouts === 'active' && transfers === 'active'
            ? 'READY'
            : 'RESTRICTED';
}

function v2AccountSnapshot(account: V2ConnectAccount): ConnectAccountSnapshot {
  const requirements = v2RequirementsSummary(account);
  const recipient =
    account.configuration?.recipient?.capabilities?.stripe_balance;
  const payouts = recipient?.payouts?.status ?? null;
  const transfers = recipient?.stripe_transfers?.status ?? null;
  const status = mapV2ConnectAccountStatus(account);
  return {
    status,
    requirementsSummary: requirements,
    detailsSubmitted:
      requirements.currentlyDueCount === 0 && !requirements.hasValidationErrors,
    payoutsEnabled: payouts === 'active',
    transfersCapability: transfers,
  };
}

@Injectable()
export class StripeConnectPayoutService {
  constructor(
    private readonly db: PrismaService,
    private readonly crypto: ProviderCryptoService,
    private readonly stripeFactory: StripeClientFactory,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async status(actor: Actor) {
    const provider = this.stripeFactory.provider();
    const environment = this.stripeFactory.environment();
    const row = await this.db.externalConnectAccount.findUnique({
      where: {
        provider_environment_userId: {
          provider,
          environment,
          userId: actor.userId,
        },
      },
    });
    if (!row)
      return {
        status: 'NOT_STARTED' as const,
        requirementsSummary: null,
        onboardingUrl: null,
        expiresAt: null,
      };
    const stripe = this.stripeFactory.get();
    const resolved = await this.retrieveAccount(
      stripe,
      await this.resolveExternalAccountId(stripe, row),
    );
    const updated = await this.syncAccount(row.id, resolved.snapshot);
    return {
      status: updated.status,
      requirementsSummary: updated.requirementsSummary,
      onboardingUrl: null,
      expiresAt: null,
    };
  }

  async createOnboardingLink(actor: Actor, requestId: string) {
    const stripe = this.stripeFactory.get();
    const provider = this.stripeFactory.provider();
    const environment = this.stripeFactory.environment();
    const user = await this.db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { email: true },
    });
    let row = await this.db.externalConnectAccount.findUnique({
      where: {
        provider_environment_userId: {
          provider,
          environment,
          userId: actor.userId,
        },
      },
    });
    let accountMode: 'v2' | 'legacy' = 'v2';
    if (!row) {
      const connectAccountRowId = randomUUID();
      const account = await stripe.v2.core.accounts.create(
        {
          contact_email: user.email,
          dashboard: 'express',
          defaults: {
            currency: 'gbp',
            responsibilities: {
              fees_collector: 'application',
              losses_collector: 'application',
            },
          },
          identity: { country: 'GB', entity_type: 'individual' },
          configuration: {
            recipient: {
              capabilities: {
                stripe_balance: { stripe_transfers: { requested: true } },
              },
            },
          },
          include: ['configuration.recipient', 'requirements'],
          metadata: {
            slice_user_id: actor.userId,
            slice_environment: environment,
          },
        },
        { idempotencyKey: `slice-connect-account:${environment}:${actor.userId}` },
      );
      const snapshot = v2AccountSnapshot(account as unknown as V2ConnectAccount);
      try {
        row = await this.db.externalConnectAccount.create({
          data: {
            id: connectAccountRowId,
            userId: actor.userId,
            provider,
            environment,
            externalAccountIdCiphertext: this.crypto.encrypt(
              account.id,
              `connect-account:${connectAccountRowId}`,
            ),
            externalAccountIdHash: this.crypto.hash(account.id),
            encryptionKeyVersion: this.crypto.keyVersion,
            status: snapshot.status,
            requirementsSummary: snapshot.requirementsSummary,
            detailsSubmitted: snapshot.detailsSubmitted,
            payoutsEnabled: snapshot.payoutsEnabled,
            transfersCapability: snapshot.transfersCapability,
            lastSyncedAt: new Date(),
          },
        });
      } catch (error) {
        if (
          !(error instanceof Prisma.PrismaClientKnownRequestError) ||
          error.code !== 'P2002'
        )
          throw error;
        row = await this.db.externalConnectAccount.findUniqueOrThrow({
          where: {
            provider_environment_userId: {
              provider,
              environment,
              userId: actor.userId,
            },
          },
        });
        const resolved = await this.retrieveAccount(
          stripe,
          await this.resolveExternalAccountId(stripe, row),
        );
        accountMode = resolved.mode;
      }
    } else {
      const resolved = await this.retrieveAccount(
        stripe,
        await this.resolveExternalAccountId(stripe, row),
      );
      accountMode = resolved.mode;
      row = await this.syncAccount(row.id, resolved.snapshot);
    }
    const externalAccountId = await this.resolveExternalAccountId(stripe, row);
    const link = await this.createAccountLink(
      stripe,
      accountMode,
      externalAccountId,
      environment,
      actor.userId,
      requestId,
    );
    return {
      status: row.status,
      onboardingUrl: link.url,
      expiresAt: link.expiresAt,
      requirementsSummary: row.requirementsSummary,
    };
  }

  async createPayout(input: {
    userId: string;
    movementId: string;
    amountMinor: string;
  }) {
    const stripe = this.stripeFactory.get();
    const provider = this.stripeFactory.provider();
    const environment = this.stripeFactory.environment();
    const account = await this.db.externalConnectAccount.findUnique({
      where: {
        provider_environment_userId: {
          provider,
          environment,
          userId: input.userId,
        },
      },
    });
    if (!account || account.status !== 'READY')
      throw new ConflictException({
        code: 'CONNECT_PAYOUT_NOT_READY',
        message: 'Complete payout setup before withdrawing available cash.',
      });
    const externalAccountId = await this.resolveExternalAccountId(stripe, account);
    const amount = BigInt(input.amountMinor);
    if (amount > BigInt(Number.MAX_SAFE_INTEGER))
      throw new ConflictException({
        code: 'STRIPE_AMOUNT_OUT_OF_RANGE',
        message: 'Withdrawal amount is too large.',
      });
    let payout = await this.db.connectPayout.findUnique({
      where: { movementId: input.movementId },
    });
    if (payout?.externalPayoutIdCiphertext)
      return {
        providerReference: this.crypto.decrypt(
          payout.externalPayoutIdCiphertext,
          `connect-payout:${payout.id}`,
        ),
        status: payout.status,
      };
    if (!payout)
      payout = await this.db.connectPayout.create({
        data: {
          id: randomUUID(),
          movementId: input.movementId,
          connectAccountId: account.id,
          provider,
          environment,
          amountMinor: amount,
          currency: 'GBP',
        },
      });
    let transferId: string;
    try {
      if (payout.externalTransferIdCiphertext)
        transferId = this.crypto.decrypt(
          payout.externalTransferIdCiphertext,
          `connect-transfer:${payout.id}`,
        );
      else {
        const transfer = await stripe.transfers.create(
          {
            amount: Number(amount),
            currency: 'gbp',
            destination: externalAccountId,
            metadata: {
              slice_movement_id: input.movementId,
              slice_connect_payout_id: payout.id,
            },
            transfer_group: `slice:${input.movementId}`,
          },
          {
            idempotencyKey: `slice-connect-transfer:${environment}:${input.movementId}`,
          },
        );
        transferId = transfer.id;
        await this.db.connectPayout.update({
          where: { id: payout.id },
          data: {
            externalTransferIdCiphertext: this.crypto.encrypt(
              transferId,
              `connect-transfer:${payout.id}`,
            ),
            externalTransferIdHash: this.crypto.hash(transferId),
            encryptionKeyVersion: this.crypto.keyVersion,
            status: 'TRANSFERRED',
            lastSyncedAt: new Date(),
          },
        });
      }
    } catch (error) {
      void error;
      await this.db.connectPayout.update({
        where: { id: payout.id },
        data: { status: 'FAILED', failureCode: 'STRIPE_TRANSFER_FAILED' },
      });
      throw new ConflictException({
        code: 'STRIPE_TRANSFER_FAILED',
        message:
          'The external payout could not be started. Your Slice balance was not consumed.',
      });
    }
    try {
      const externalPayout = await stripe.payouts.create(
        {
          amount: Number(amount),
          currency: 'gbp',
          method: 'standard',
          metadata: {
            slice_movement_id: input.movementId,
            slice_connect_payout_id: payout.id,
          },
        },
        {
          stripeAccount: externalAccountId,
          idempotencyKey: `slice-connect-payout:${environment}:${input.movementId}`,
        },
      );
      const status = mapPayoutStatus(externalPayout.status);
      await this.db.connectPayout.update({
        where: { id: payout.id },
        data: {
          externalPayoutIdCiphertext: this.crypto.encrypt(
            externalPayout.id,
            `connect-payout:${payout.id}`,
          ),
          externalPayoutIdHash: this.crypto.hash(externalPayout.id),
          status,
          lastSyncedAt: new Date(),
        },
      });
      return { providerReference: externalPayout.id, status };
    } catch (error) {
      void error;
      await this.db.connectPayout.update({
        where: { id: payout.id },
        data: {
          status: 'MANUAL_REVIEW',
          failureCode: 'STRIPE_PAYOUT_FAILED',
          lastSyncedAt: new Date(),
        },
      });
      throw new ConnectPayoutExternalTransferError(
        'The payout requires review because the connected-account transfer was created.',
      );
    }
  }

  async processWebhook(
    provider: 'STRIPE_SANDBOX' | 'STRIPE_LIVE',
    type: string,
    payload: Record<string, unknown>,
  ): Promise<ConnectPayoutWebhookEffect | null> {
    if (provider !== this.stripeFactory.provider()) return null;
    if (type === 'account.updated' || type === 'v2.core.account.updated') {
      const id = this.text(payload.id);
      if (!id) return null;
      const row = await this.db.externalConnectAccount.findUnique({
        where: {
          provider_environment_externalAccountIdHash: {
            provider,
            environment: this.stripeFactory.environment(),
            externalAccountIdHash: this.crypto.hash(id),
          },
        },
      });
      if (!row) return null;
      const snapshot =
        payload.object === 'v2.core.account'
          ? v2AccountSnapshot(payload as unknown as V2ConnectAccount)
          : legacyAccountSnapshot(payload as unknown as Stripe.Account);
      await this.syncAccount(row.id, snapshot);
      return null;
    }
    const payoutId = this.text(payload.id);
    if (!payoutId || !type.startsWith('payout.')) return null;
    const mapping = await this.db.connectPayout.findUnique({
      where: {
        provider_externalPayoutIdHash: {
          provider,
          externalPayoutIdHash: this.crypto.hash(payoutId),
        },
      },
    });
    if (!mapping) return null;
    if (type === 'payout.paid') {
      await this.db.connectPayout.update({
        where: { id: mapping.id },
        data: { status: 'PAID', lastSyncedAt: new Date() },
      });
      return {
        movementId: mapping.movementId,
        action: 'COMPLETE',
        providerReference: payoutId,
      };
    }
    if (type === 'payout.failed' || type === 'payout.canceled') {
      await this.db.connectPayout.update({
        where: { id: mapping.id },
        data: {
          status: type === 'payout.canceled' ? 'CANCELED' : 'FAILED',
          failureCode: type.toUpperCase().replace('.', '_'),
          lastSyncedAt: new Date(),
        },
      });
      return {
        movementId: mapping.movementId,
        action: 'HOLD',
        reasonCode:
          type === 'payout.canceled'
            ? 'STRIPE_PAYOUT_CANCELED_AFTER_TRANSFER'
            : 'STRIPE_PAYOUT_FAILED_AFTER_TRANSFER',
      };
    }
    await this.db.connectPayout.update({
      where: { id: mapping.id },
      data: { status: 'PROCESSING', lastSyncedAt: new Date() },
    });
    return { movementId: mapping.movementId, action: 'PROCESSING' };
  }

  private async retrieveAccount(stripe: Stripe, externalAccountId: string) {
    try {
      const account = await stripe.v2.core.accounts.retrieve(
        externalAccountId,
        {
          include: ['configuration.recipient', 'requirements'],
        },
      );
      return {
        mode: 'v2' as const,
        snapshot: v2AccountSnapshot(account as unknown as V2ConnectAccount),
      };
    } catch (error) {
      if (
        !(error instanceof Stripe.errors.StripeError) ||
        error.code !== 'resource_missing'
      )
        throw error;
      const account = await stripe.accounts.retrieve(externalAccountId);
      return {
        mode: 'legacy' as const,
        snapshot: legacyAccountSnapshot(account),
      };
    }
  }

  private async resolveExternalAccountId(
    stripe: Stripe,
    row: ConnectAccountRow,
  ) {
    try {
      return this.crypto.decrypt(
        row.externalAccountIdCiphertext,
        `connect-account:${row.id}`,
      );
    } catch (error) {
      // A prior release encrypted one-time Connect rows with the provider ID
      // as the AAD instead of the persisted row ID. Recover only by matching
      // Slice-owned metadata, then immediately rewrite the ciphertext using
      // the canonical row-scoped context. No account IDs are guessed.
      let recovered: { id: string; metadata?: Record<string, string> } | null =
        null;
      for await (const account of stripe.v2.core.accounts.list({
        applied_configurations: ['recipient'],
        limit: 20,
      })) {
        if (
          account.metadata?.slice_user_id === row.userId &&
          account.metadata?.slice_environment === row.environment
        ) {
          recovered = account as unknown as {
            id: string;
            metadata?: Record<string, string>;
          };
          break;
        }
      }
      if (!recovered) throw error;
      await this.db.externalConnectAccount.update({
        where: { id: row.id },
        data: {
          externalAccountIdCiphertext: this.crypto.encrypt(
            recovered.id,
            `connect-account:${row.id}`,
          ),
          externalAccountIdHash: this.crypto.hash(recovered.id),
          encryptionKeyVersion: this.crypto.keyVersion,
        },
      });
      return recovered.id;
    }
  }

  private async createAccountLink(
    stripe: Stripe,
    mode: 'v2' | 'legacy',
    externalAccountId: string,
    environment: 'SANDBOX' | 'LIVE',
    userId: string,
    requestId: string,
  ) {
    const refreshUrl = new URL(
      '/wallet?connect=refresh',
      this.config.appPublicUrl,
    ).toString();
    const returnUrl = new URL(
      '/wallet?connect=return',
      this.config.appPublicUrl,
    ).toString();
    const idempotencyKey = `slice-connect-onboarding:${environment}:${userId}:${requestId}`;
    if (mode === 'v2') {
      const link = await stripe.v2.core.accountLinks.create(
        {
          account: externalAccountId,
          use_case: {
            type: 'account_onboarding',
            account_onboarding: {
              configurations: ['recipient'],
              refresh_url: refreshUrl,
              return_url: returnUrl,
              collection_options: {
                fields: 'currently_due',
                future_requirements: 'include',
              },
            },
          },
        },
        { idempotencyKey },
      );
      return {
        url: link.url,
        expiresAt:
          typeof link.expires_at === 'number'
            ? new Date(link.expires_at * 1000).toISOString()
            : new Date(link.expires_at).toISOString(),
      };
    }
    const link = await stripe.accountLinks.create(
      {
        account: externalAccountId,
        type: 'account_onboarding',
        refresh_url: refreshUrl,
        return_url: returnUrl,
        collection_options: {
          fields: 'currently_due',
          future_requirements: 'include',
        },
      },
      { idempotencyKey },
    );
    return {
      url: link.url,
      expiresAt: new Date(Date.now() + 30 * 60_000).toISOString(),
    };
  }

  private async syncAccount(id: string, snapshot: ConnectAccountSnapshot) {
    return this.db.externalConnectAccount.update({
      where: { id },
      data: {
        status: snapshot.status,
        requirementsSummary: snapshot.requirementsSummary,
        detailsSubmitted: snapshot.detailsSubmitted,
        payoutsEnabled: snapshot.payoutsEnabled,
        transfersCapability: snapshot.transfersCapability,
        lastSyncedAt: new Date(),
      },
    });
  }

  private text(value: unknown) {
    return typeof value === 'string' && value.length > 0 ? value : null;
  }
}

function mapPayoutStatus(status: string) {
  if (status === 'paid') return 'PAID' as const;
  if (status === 'failed') return 'FAILED' as const;
  if (status === 'canceled') return 'CANCELED' as const;
  return 'PROCESSING' as const;
}
