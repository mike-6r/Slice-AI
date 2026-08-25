import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../../database/prisma.service';
import { FinancialLedgerService } from '../../finance/application/financial-ledger.service';
import type { Actor } from '../../identity/auth/auth.service';
import { ProviderCryptoService } from './provider-crypto.service';
import { StripeClientFactory } from './stripe-provider.client';

/**
 * Persists Stripe's actual balance-transaction fee evidence. Provider APIs do
 * not always expose a balance transaction at the moment a webhook arrives;
 * those operations remain PENDING_EVIDENCE and are never guessed as £0.
 */
@Injectable()
export class ProviderFinancialCostService {
  constructor(
    private readonly db: PrismaService,
    private readonly ledger: FinancialLedgerService,
    private readonly crypto: ProviderCryptoService,
    private readonly stripeFactory: StripeClientFactory,
  ) {}

  async observePaymentIntent(input: {
    movementId: string;
    paymentIntentId: string;
    requestId: string;
  }) {
    const source = {
      sourceObjectType: 'STRIPE_PAYMENT_INTENT',
      sourceObjectId: input.paymentIntentId,
      costType: 'DEPOSIT_PROCESSING' as const,
    };
    try {
      const paymentIntent = await this.stripeFactory.get().paymentIntents.retrieve(input.paymentIntentId);
      const chargeId = objectId(paymentIntent.latest_charge);
      if (!chargeId) return this.pending({ ...source, relatedMovementId: input.movementId });
      const charge = await this.stripeFactory.get().charges.retrieve(chargeId);
      const balanceTransactionId = objectId(charge.balance_transaction);
      if (!balanceTransactionId) return this.pending({ ...source, relatedMovementId: input.movementId });
      const balanceTransaction = await this.stripeFactory.get().balanceTransactions.retrieve(balanceTransactionId);
      await this.persistPaymentEvidence({
        movementId: input.movementId,
        chargeId,
        balanceTransactionId,
        grossMinor: balanceTransaction.amount,
        feeMinor: balanceTransaction.fee,
        netMinor: balanceTransaction.net,
        currency: balanceTransaction.currency,
        availableOn:
          typeof balanceTransaction.available_on === 'number'
            ? new Date(balanceTransaction.available_on * 1000)
            : null,
      });
      // Evidence may satisfy an explicitly configured Bacs internal-use
      // policy. The policy service remains fail-closed when unset; provider
      // available_on is never treated as a universal return-risk guarantee.
      await this.ledger.releaseMaturedBacsDepositsForMovement(
        input.movementId,
        input.requestId,
      );
      return this.observeBalanceTransaction({
        ...source,
        relatedMovementId: input.movementId,
        balanceTransactionId,
        amountMinor: balanceTransaction.fee,
        currency: balanceTransaction.currency,
        requestId: input.requestId,
      });
    } catch (error) {
      return this.pending({
        ...source,
        relatedMovementId: input.movementId,
        failureCode: safeError(error),
      });
    }
  }

  private async persistPaymentEvidence(input: {
    movementId: string;
    chargeId: string;
    balanceTransactionId: string;
    grossMinor: number;
    feeMinor: number;
    netMinor: number;
    currency: string;
    availableOn: Date | null;
  }) {
    if (
      !Number.isSafeInteger(input.grossMinor) ||
      !Number.isSafeInteger(input.feeMinor) ||
      !Number.isSafeInteger(input.netMinor) ||
      input.currency.toLowerCase() !== 'gbp'
    )
      return;
    await this.db.moneyMovement.updateMany({
      where: {
        id: input.movementId,
        provider: this.stripeFactory.provider(),
      },
      data: {
        providerBalanceTransactionIdCiphertext: this.crypto.encrypt(
          input.balanceTransactionId,
          'movement-balance-transaction:' + input.movementId,
        ),
        providerBalanceTransactionIdHash: this.crypto.hash(input.balanceTransactionId),
        providerFeeMinor: BigInt(input.feeMinor),
        providerNetMinor: BigInt(input.netMinor),
        providerAvailableOn: input.availableOn,
        providerCurrency: input.currency.toLowerCase(),
        providerSourceReferenceHash: this.crypto.hash(input.chargeId),
      },
    });
  }

  async observePayoutForExternalId(input: {
    provider: 'STRIPE_SANDBOX' | 'STRIPE_LIVE';
    payoutId: string;
    requestId: string;
  }) {
    const payout = await this.db.connectPayout.findUnique({
      where: {
        provider_externalPayoutIdHash: {
          provider: input.provider,
          externalPayoutIdHash: this.crypto.hash(input.payoutId),
        },
      },
      include: { connectAccount: true, movement: true },
    });
    if (!payout) return null;
    const source = {
      sourceObjectType: 'STRIPE_PAYOUT',
      sourceObjectId: input.payoutId,
      costType: 'PAYOUT_PROCESSING' as const,
      relatedMovementId: payout.movementId,
      relatedConnectPayoutId: payout.id,
    };
    try {
      const externalAccountId = this.crypto.decrypt(
        payout.connectAccount.externalAccountIdCiphertext,
        `connect-account:${payout.connectAccount.id}`,
      );
      const providerPayout = await this.stripeFactory.get().payouts.retrieve(
        input.payoutId,
        {},
        { stripeAccount: externalAccountId },
      );
      const balanceTransactionId = objectId(providerPayout.balance_transaction);
      if (!balanceTransactionId) return this.pending(source);
      const balanceTransaction = await this.stripeFactory.get().balanceTransactions.retrieve(
        balanceTransactionId,
        {},
        { stripeAccount: externalAccountId },
      );
      return this.observeBalanceTransaction({
        ...source,
        balanceTransactionId,
        amountMinor: balanceTransaction.fee,
        currency: balanceTransaction.currency,
        requestId: input.requestId,
      });
    } catch (error) {
      return this.pending({ ...source, failureCode: safeError(error) });
    }
  }

  private async pending(input: {
    sourceObjectType: string;
    sourceObjectId: string;
    costType: 'DEPOSIT_PROCESSING' | 'PAYOUT_PROCESSING';
    relatedMovementId?: string;
    relatedConnectPayoutId?: string;
    failureCode?: string;
  }) {
    const existing = await this.db.providerFinancialCost.findUnique({
      where: {
        provider_environment_sourceObjectType_sourceObjectId_costType: {
          provider: this.stripeFactory.provider(),
          environment: this.stripeFactory.environment(),
          sourceObjectType: input.sourceObjectType,
          sourceObjectId: input.sourceObjectId,
          costType: input.costType,
        },
      },
    });
    if (existing?.status === 'POSTED' || existing?.status === 'RECONCILED') return existing;
    return this.db.providerFinancialCost.upsert({
      where: {
        provider_environment_sourceObjectType_sourceObjectId_costType: {
          provider: this.stripeFactory.provider(),
          environment: this.stripeFactory.environment(),
          sourceObjectType: input.sourceObjectType,
          sourceObjectId: input.sourceObjectId,
          costType: input.costType,
        },
      },
      create: {
        id: randomUUID(),
        provider: this.stripeFactory.provider(),
        environment: this.stripeFactory.environment(),
        currency: 'GBP',
        costType: input.costType,
        sourceObjectType: input.sourceObjectType,
        sourceObjectId: input.sourceObjectId,
        relatedMovementId: input.relatedMovementId,
        relatedConnectPayoutId: input.relatedConnectPayoutId,
        status: 'PENDING_EVIDENCE',
        failureCode: input.failureCode,
      },
      update: {
        status: 'PENDING_EVIDENCE',
        failureCode: input.failureCode,
        relatedMovementId: input.relatedMovementId,
        relatedConnectPayoutId: input.relatedConnectPayoutId,
      },
    });
  }

  private async observeBalanceTransaction(input: {
    sourceObjectType: string;
    sourceObjectId: string;
    costType: 'DEPOSIT_PROCESSING' | 'PAYOUT_PROCESSING';
    relatedMovementId?: string;
    relatedConnectPayoutId?: string;
    balanceTransactionId: string;
    amountMinor: number;
    currency: string;
    requestId: string;
  }) {
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor < 0 || input.currency.toLowerCase() !== 'gbp') {
      return this.pending({
        sourceObjectType: input.sourceObjectType,
        sourceObjectId: input.sourceObjectId,
        costType: input.costType,
        relatedMovementId: input.relatedMovementId,
        relatedConnectPayoutId: input.relatedConnectPayoutId,
        failureCode: 'PROVIDER_COST_CURRENCY_OR_AMOUNT_INVALID',
      });
    }
    const provider = this.stripeFactory.provider();
    const environment = this.stripeFactory.environment();
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "ProviderFinancialCost" WHERE "provider" = ${provider}::"ProviderCode" AND "environment" = ${environment}::"ExternalProviderEnvironment" AND "sourceObjectType" = ${input.sourceObjectType} AND "sourceObjectId" = ${input.sourceObjectId} FOR UPDATE`;
      const existing = await db.providerFinancialCost.findUnique({
        where: {
          provider_environment_sourceObjectType_sourceObjectId_costType: {
            provider,
            environment,
            sourceObjectType: input.sourceObjectType,
            sourceObjectId: input.sourceObjectId,
            costType: input.costType,
          },
        },
      });
      if (existing?.status === 'POSTED' || existing?.status === 'RECONCILED') return existing;
      const current = await db.providerFinancialCost.upsert({
        where: {
          provider_environment_sourceObjectType_sourceObjectId_costType: {
            provider,
            environment,
            sourceObjectType: input.sourceObjectType,
            sourceObjectId: input.sourceObjectId,
            costType: input.costType,
          },
        },
        create: {
          id: randomUUID(),
          provider,
          environment,
          currency: 'GBP',
          amountMinor: BigInt(input.amountMinor),
          costType: input.costType,
          sourceObjectType: input.sourceObjectType,
          sourceObjectId: input.sourceObjectId,
          balanceTransactionId: input.balanceTransactionId,
          relatedMovementId: input.relatedMovementId,
          relatedConnectPayoutId: input.relatedConnectPayoutId,
          status: 'OBSERVED',
          observedAt: new Date(),
        },
        update: {
          amountMinor: BigInt(input.amountMinor),
          balanceTransactionId: input.balanceTransactionId,
          relatedMovementId: input.relatedMovementId,
          relatedConnectPayoutId: input.relatedConnectPayoutId,
          status: 'OBSERVED',
          observedAt: new Date(),
          failureCode: null,
        },
      });
      if (current.status === 'POSTED' || current.status === 'RECONCILED') return current;
      if (current.amountMinor === 0n) {
        return db.providerFinancialCost.update({ where: { id: current.id }, data: { status: 'RECONCILED' } });
      }
      if (!current.relatedMovementId || current.amountMinor === null) return current;
      const movement = await db.moneyMovement.findUnique({
        where: { id: current.relatedMovementId },
        select: { userId: true },
      });
      if (!movement) return current;
      const expense = await this.expenseAccount(db, 'STRIPE_PROVIDER_EXPENSE', 'EXPENSE', 'DEBIT');
      const clearing = await this.expenseAccount(db, 'STRIPE_PROVIDER_CLEARING', 'ASSET', 'DEBIT');
      const actor = providerActor(movement.userId, current.id);
      const journal = await this.ledger.postInTransaction(
        db,
        actor,
        {
          type: 'PROVIDER_EXPENSE',
          correlationId: `provider-cost:${current.id}`,
          descriptionCode: `STRIPE_${input.costType}_EXPENSE`,
          lines: [
            { accountId: expense, side: 'DEBIT', amountMinor: current.amountMinor.toString() },
            { accountId: clearing, side: 'CREDIT', amountMinor: current.amountMinor.toString() },
          ],
        },
        input.requestId,
        `provider-cost:${current.id}:journal`,
      );
      return db.providerFinancialCost.update({
        where: { id: current.id },
        data: { status: 'POSTED', postedJournalTransactionId: journal.transactionId },
      });
    });
  }

  private async expenseAccount(
    db: Prisma.TransactionClient,
    code: string,
    accountType: 'ASSET' | 'EXPENSE',
    normalSide: 'DEBIT',
  ) {
    const existing = await db.financialAccount.findFirst({ where: { ownerType: code === 'STRIPE_PROVIDER_CLEARING' ? 'CLEARING' : 'PLATFORM', code, currency: 'GBP' } });
    if (existing) return existing.id;
    return (await db.financialAccount.create({
      data: {
        id: randomUUID(),
        ownerType: code === 'STRIPE_PROVIDER_CLEARING' ? 'CLEARING' : 'PLATFORM',
        accountType,
        code,
        currency: 'GBP',
        normalSide,
      },
    })).id;
  }
}

function objectId(value: unknown): string | null {
  if (typeof value === 'string' && value.length > 0) return value;
  if (value && typeof value === 'object' && 'id' in value) {
    const id = (value as { id?: unknown }).id;
    return typeof id === 'string' && id.length > 0 ? id : null;
  }
  return null;
}

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 96) : 'PROVIDER_COST_EVIDENCE_UNAVAILABLE';
}

function providerActor(userId: string, costId: string): Actor {
  return {
    userId: userId as Actor['userId'],
    sessionId: `provider-cost:${costId}`,
    status: 'ACTIVE',
    roles: [],
    sessionRevokedAt: null,
    sessionRevocationReason: null,
    authenticatedAt: new Date(),
  };
}
