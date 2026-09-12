import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { APP_CONFIG, type AppConfig } from '../../../config/app-config';
import { PrismaService } from '../../../database/prisma.service';
import { FinancialLedgerService } from '../../finance/application/financial-ledger.service';
import type { Actor } from '../../identity/auth/auth.service';
import { RecentAuthService } from '../../identity/access/recent-auth.service';
import { AccountCapabilityService } from '../../identity/access/account-capability.service';
import { createIdentityTransaction } from '../../identity/persistence/prisma-identity.repositories';
import { ComplianceService } from './compliance.service';
import { ProviderCryptoService } from './provider-crypto.service';
import { LocalTransactionScreeningAdapter } from './local-provider.adapters';
import { BlockchainAnalysisAdapter } from './blockchain-analysis.adapter';
import type { TransactionScreeningProvider } from '../domain/provider.types';
import { moneyMovementProviderCode } from '../domain/money-movement-provider';
import { providerTestFailurePoint } from './provider-test-failure-injection';
import { OutboxWriter } from '../../outbox/application/outbox-writer.service';
import {
  financialNotificationEvent,
  financialNotificationKind,
  formatGbpMinor,
  movementSettledEvent,
} from '../../outbox/domain/domain-event';
import { feeForBps, WITHDRAWAL_FEE_BPS } from '../../finance/domain/fee-policy';
import { BankConnectionService } from './external-provider-boundaries';
import {
  ConnectPayoutExternalTransferError,
  StripeConnectPayoutService,
} from './stripe-connect-payout.service';
import { WithdrawalPreflightService } from './withdrawal-preflight.service';
import { StripeCardFundingService } from './stripe-card-funding.service';
import { ProviderFinancialCostService } from './provider-financial-cost.service';
import { StripeClientFactory } from './stripe-provider.client';

type MovementType = 'DEPOSIT' | 'WITHDRAWAL';
type MovementRail = 'BACS_DIRECT_DEBIT' | 'CARD' | 'CONNECT_STANDARD_PAYOUT';

/**
 * Destination screening belongs to the local destination-based provider
 * adapter. Stripe withdrawals are bank payouts to a verified Connect account;
 * Stripe's connected-account requirements and Slice's compliance gates are the
 * authoritative controls for that destination.
 */
export function requiresDestinationScreening(
  providerMode: AppConfig['providerMode'],
) {
  return providerMode === 'local';
}

export function calculateWithdrawalVelocity(
  movements: ReadonlyArray<{ amountMinor: bigint; createdAt: Date }>,
  amount: bigint,
  now = new Date(),
) {
  const since24h = now.getTime() - 86_400_000;
  const since7d = now.getTime() - 7 * 86_400_000;
  return {
    total7d: movements
      .filter((item) => item.createdAt.getTime() >= since7d)
      .reduce((total, item) => total + item.amountMinor, amount),
    total24h: movements
      .filter((item) => item.createdAt.getTime() >= since24h)
      .reduce((total, item) => total + item.amountMinor, amount),
  };
}

export function calculateDepositVelocity(
  movements: ReadonlyArray<{ amountMinor: bigint; createdAt: Date }>,
  now = new Date(),
  rapidWindowSeconds?: number,
) {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const since7d = now.getTime() - 7 * 86_400_000;
  const rapidSince =
    rapidWindowSeconds === undefined
      ? null
      : now.getTime() - rapidWindowSeconds * 1000;
  return {
    dailyTotal: movements
      .filter((item) => item.createdAt >= dayStart)
      .reduce((total, item) => total + item.amountMinor, 0n),
    rolling7dTotal: movements
      .filter((item) => item.createdAt.getTime() >= since7d)
      .reduce((total, item) => total + item.amountMinor, 0n),
    dailyCount: movements.filter((item) => item.createdAt >= dayStart).length,
    rapidCount:
      rapidSince === null
        ? 0
        : movements.filter((item) => item.createdAt.getTime() >= rapidSince)
            .length,
  };
}

export type DepositLimitCode =
  | 'DEPOSIT_LIMIT_EXCEEDED'
  | 'DEPOSIT_DAILY_LIMIT_EXCEEDED'
  | 'DEPOSIT_ROLLING_LIMIT_EXCEEDED'
  | 'DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED'
  | 'DEPOSIT_RAPID_ATTEMPT_LIMIT_EXCEEDED';
export type DepositLimitPolicy = Readonly<{
  maxMinor?: number;
  dailyLimitMinor?: number;
  rolling7dLimitMinor?: number;
  dailyCountLimit?: number;
  rapidCountLimit?: number;
}>;

export function evaluateDepositLimits(
  amount: bigint,
  velocity: {
    dailyTotal: bigint;
    rolling7dTotal: bigint;
    dailyCount: number;
    rapidCount: number;
  },
  policy: DepositLimitPolicy,
): DepositLimitCode | null {
  if (policy.maxMinor !== undefined && amount > BigInt(policy.maxMinor))
    return 'DEPOSIT_LIMIT_EXCEEDED';
  if (
    policy.dailyLimitMinor !== undefined &&
    velocity.dailyTotal + amount > BigInt(policy.dailyLimitMinor)
  )
    return 'DEPOSIT_DAILY_LIMIT_EXCEEDED';
  if (
    policy.rolling7dLimitMinor !== undefined &&
    velocity.rolling7dTotal + amount > BigInt(policy.rolling7dLimitMinor)
  )
    return 'DEPOSIT_ROLLING_LIMIT_EXCEEDED';
  if (
    policy.dailyCountLimit !== undefined &&
    velocity.dailyCount + 1 > policy.dailyCountLimit
  )
    return 'DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED';
  if (
    policy.rapidCountLimit !== undefined &&
    velocity.rapidCount + 1 > policy.rapidCountLimit
  )
    return 'DEPOSIT_RAPID_ATTEMPT_LIMIT_EXCEEDED';
  return null;
}

export function depositLimitMessage(code: DepositLimitCode): string {
  switch (code) {
    case 'DEPOSIT_LIMIT_EXCEEDED':
      return 'This deposit would exceed your current bank funding limit.';
    case 'DEPOSIT_DAILY_LIMIT_EXCEEDED':
      return 'You’ve reached your current daily bank funding limit.';
    case 'DEPOSIT_ROLLING_LIMIT_EXCEEDED':
      return 'This deposit would exceed your current rolling bank funding limit.';
    case 'DEPOSIT_DAILY_COUNT_LIMIT_EXCEEDED':
      return 'You’ve reached the current number of bank deposits allowed today.';
    case 'DEPOSIT_RAPID_ATTEMPT_LIMIT_EXCEEDED':
      return 'Please wait a little before trying another bank deposit.';
  }
}

/**
 * Provider-neutral external money lifecycle. An intent never changes spendable
 * cash: only a verified completion posts the Document 013 journal exactly once.
 */
@Injectable()
export class WalletMovementService {
  private readonly screening: TransactionScreeningProvider;
  constructor(
    private readonly db: PrismaService,
    private readonly ledger: FinancialLedgerService,
    private readonly compliance: ComplianceService,
    private readonly recentAuth: RecentAuthService,
    private readonly crypto: ProviderCryptoService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly outbox: OutboxWriter = new OutboxWriter(),
    @Optional() private readonly capabilities?: AccountCapabilityService,
    @Optional() private readonly bankLinks?: BankConnectionService,
    @Optional() private readonly connectPayouts?: StripeConnectPayoutService,
    @Optional() private readonly cardFunding?: StripeCardFundingService,
    @Optional()
    private readonly withdrawalPreflight?: WithdrawalPreflightService,
    @Optional() private readonly providerCosts?: ProviderFinancialCostService,
    @Optional() private readonly stripeFactory?: StripeClientFactory,
  ) {
    this.screening =
      config.providerMode === 'local'
        ? new LocalTransactionScreeningAdapter()
        : new BlockchainAnalysisAdapter(config);
  }

  createDeposit(
    actor: Actor,
    amountMinor: string,
    requestId: string,
    key: string,
  ) {
    return this.createWithCapability(
      actor,
      'DEPOSIT',
      amountMinor,
      requestId,
      key,
      'BACS_DIRECT_DEBIT',
    );
  }

  async createCardDeposit(
    actor: Actor,
    amountMinor: string,
    requestId: string,
    key: string,
    savePaymentMethod: boolean,
  ) {
    const options = this.cardFunding?.options();
    if (!options?.available) {
      throw new ConflictException({
        code: 'CARD_FUNDING_UNAVAILABLE',
        message: options?.reason ?? 'Card funding is currently unavailable.',
      });
    }
    await this.capabilities?.requireCardFunding(actor);
    const result = await this.create(
      actor,
      'DEPOSIT',
      amountMinor,
      requestId,
      key,
      'CARD',
      savePaymentMethod,
    );
    if (!('cardFunding' in result)) {
      throw new ConflictException({
        code: 'CARD_FUNDING_UNAVAILABLE',
        message: 'The secure card payment could not be prepared.',
      });
    }
    return result;
  }

  async createWithdrawal(
    actor: Actor,
    amountMinor: string,
    requestId: string,
    key: string,
    destinationReference = 'LOCAL_LOW_RISK',
    destinationChain?: string,
    payoutDestinationId?: string,
    payoutMethod?: 'standard' | 'instant',
  ) {
    // Refresh the provider projection before evaluating the capability. This
    // prevents a previously READY Connect row from allowing a withdrawal
    // after Stripe has added a requirement or restricted payouts. The refresh
    // is read-only from Slice's financial perspective; no movement exists yet.
    if (this.config.providerMode !== 'local' && this.connectPayouts) {
      await this.connectPayouts.status(actor);
    }
    await this.capabilities?.require(actor, 'WITHDRAW_FUNDS');
    this.recentAuth.require(actor);
    // Stripe-mode withdrawals use the verified Connect account as the payout
    // destination. The blockchain adapter is only valid for the local
    // destination-based provider path; sending a bank payout through it
    // requires a blockchain chain and can reject an otherwise valid payout
    // before the Connect lifecycle starts.
    const screening = requiresDestinationScreening(this.config.providerMode)
      ? await this.screening.screen({
          address: destinationReference,
          currency: 'GBP',
          chain: destinationChain,
        })
      : { decision: 'ALLOW' as const };
    if (screening.decision !== 'ALLOW') {
      await this.db.$transaction(async (db) => {
        await db.complianceHold.create({
          data: {
            id: randomUUID(),
            userId: actor.userId,
            scope: 'WITHDRAWAL',
            reasonCode:
              screening.decision === 'MANUAL_REVIEW'
                ? 'KYT_MANUAL_REVIEW'
                : 'KYT_BLOCKED',
            source: 'SYSTEM',
          },
        });
        await createIdentityTransaction(db).audit.append({
          id: randomUUID(),
          actorUserId: actor.userId,
          actorType: 'USER',
          action: 'COMPLIANCE_HOLD_CREATED',
          resourceType: 'compliance-hold',
          resourceId: null,
          requestId,
          sessionId: actor.sessionId as never,
          result: 'SUCCESS',
          metadata: {
            source: 'SYSTEM',
            scope: 'WITHDRAWAL',
            reasonCode:
              screening.decision === 'MANUAL_REVIEW'
                ? 'KYT_MANUAL_REVIEW'
                : 'KYT_BLOCKED',
          },
          createdAt: new Date(),
        });
      });
      throw new ConflictException({
        code:
          screening.decision === 'MANUAL_REVIEW'
            ? 'KYT_MANUAL_REVIEW'
            : 'KYT_BLOCKED',
        message: 'Withdrawal requires compliance review.',
      });
    }
    return (await this.create(
      actor,
      'WITHDRAWAL',
      amountMinor,
      requestId,
      key,
      'CONNECT_STANDARD_PAYOUT',
      false,
      { payoutDestinationId, payoutMethod },
    ))
      .movement;
  }

  private async createWithCapability(
    actor: Actor,
    type: MovementType,
    amountMinor: string,
    requestId: string,
    key: string,
    rail: MovementRail,
  ) {
    await this.capabilities?.require(actor, 'DEPOSIT_FUNDS');
    return (await this.create(actor, type, amountMinor, requestId, key, rail))
      .movement;
  }

  private async create(
    actor: Actor,
    type: MovementType,
    amountText: string,
    requestId: string,
    key: string,
    rail: MovementRail = type === 'WITHDRAWAL'
      ? 'CONNECT_STANDARD_PAYOUT'
      : 'BACS_DIRECT_DEBIT',
    savePaymentMethod = false,
    withdrawalOptions?: {
      payoutDestinationId?: string;
      payoutMethod?: 'standard' | 'instant';
    },
  ) {
    const amountMinor = this.amount(amountText);
    const sliceFeeMinor =
      type === 'WITHDRAWAL' ? feeForBps(amountMinor, WITHDRAWAL_FEE_BPS) : 0n;
    const providerAmountMinor = amountMinor - sliceFeeMinor;
    await this.compliance.requireIdentityApproved(
      actor.userId,
      type === 'WITHDRAWAL' ? ['WITHDRAWAL'] : ['FUNDING'],
    );
    const hash = this.crypto.hash(key);
    const existing = await this.db.moneyMovement.findUnique({
      where: {
        userId_type_idempotencyKeyHash: {
          userId: actor.userId,
          type,
          idempotencyKeyHash: hash,
        },
      },
    });
    if (existing) return { movement: this.safe(existing, true) };
    if (type === 'WITHDRAWAL' && this.config.providerMode !== 'local') {
      if (!this.withdrawalPreflight)
        throw new ConflictException({
          code: 'PROVIDER_LIQUIDITY_UNAVAILABLE',
          message:
            "Your funds are still settling with our payment provider and aren't ready for bank withdrawal yet.",
        });
      await this.withdrawalPreflight.assertWithdrawalCanStart(
        actor.userId,
        amountText,
      );
    }

    const movementResult = await this.db.$transaction(async (db) => {
      // Serialize withdrawal intents per user before reading velocity totals.
      // This prevents concurrent requests from both passing the same window
      // without inventing a new threshold or risk score.
      if (type === 'WITHDRAWAL' || type === 'DEPOSIT') {
        const existingBeforeLock = await db.moneyMovement.findUnique({
          where: {
            userId_type_idempotencyKeyHash: {
              userId: actor.userId,
              type,
              idempotencyKeyHash: hash,
            },
          },
        });
        if (existingBeforeLock)
          return { movement: existingBeforeLock, reused: true };
        const lockKey =
          type === 'WITHDRAWAL'
            ? `WALLET_WITHDRAWAL_VELOCITY:${actor.userId}`
            : `WALLET_DEPOSIT_VELOCITY:${actor.userId}`;
        await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      }
      const existingAfterLock = await db.moneyMovement.findUnique({
        where: {
          userId_type_idempotencyKeyHash: {
            userId: actor.userId,
            type,
            idempotencyKeyHash: hash,
          },
        },
      });
      if (existingAfterLock)
        return { movement: existingAfterLock, reused: true };
      if (type === 'WITHDRAWAL')
        await this.enforceWithdrawalLimits(db, actor.userId, amountMinor);
      if (type === 'DEPOSIT' && rail === 'BACS_DIRECT_DEBIT')
        await this.enforceDepositLimits(db, actor.userId, amountMinor);
      if (type === 'DEPOSIT') {
        // New accounts do not need a ledger row until they use cash. Lock the
        // user while lazily provisioning it so concurrent first deposits cannot
        // race past the composite account uniqueness constraint.
        await db.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.userId} FOR UPDATE`;
      }
      const cashAccounts = await db.financialAccount.findMany({
        where: {
          ownerType: 'USER',
          ownerUserId: actor.userId,
          code: { in: ['CASH_AVAILABLE', 'COLLECTOR_PROCEEDS_AVAILABLE'] },
          currency: 'GBP',
          status: 'ACTIVE',
        },
        include: { balance: true },
      });
      const hasSufficientAvailable = (
        account: (typeof cashAccounts)[number],
      ) => {
        const balance = account.balance;
        if (!balance) return false;
        const authority = balance.postedCreditMinor - balance.postedDebitMinor;
        return authority - balance.reservedMinor >= amountMinor;
      };
      let cash =
        type === 'WITHDRAWAL'
          ? (cashAccounts.find(
              (account) =>
                account.code === 'COLLECTOR_PROCEEDS_AVAILABLE' &&
                hasSufficientAvailable(account),
            ) ??
            cashAccounts.find(
              (account) =>
                account.code === 'CASH_AVAILABLE' &&
                hasSufficientAvailable(account),
            ) ??
            cashAccounts.find((account) => account.code === 'CASH_AVAILABLE'))
          : cashAccounts.find((account) => account.code === 'CASH_AVAILABLE');
      if (!cash && type === 'DEPOSIT')
        cash = await this.ledger.depositCashAccount(db, actor.userId, false);
      if (!cash && type === 'WITHDRAWAL')
        throw new ConflictException({
          code: 'NO_WITHDRAWABLE_BALANCE',
          message: 'No posted GBP cash is available for withdrawal.',
        });
      if (!cash)
        throw new NotFoundException({
          code: 'FINANCIAL_ACCOUNT_NOT_FOUND',
          message: 'Cash account was not found.',
        });
      const created = await db.moneyMovement.create({
        data: {
          id: randomUUID(),
          userId: actor.userId,
          cashAccountId: cash.id,
          financialDataClass: cash.financialDataClass,
          type,
          rail,
          amountMinor,
          sliceFeeMinor,
          providerAmountMinor,
          currency: 'GBP',
          status: 'PENDING_PROVIDER',
          provider: moneyMovementProviderCode(this.config.providerMode),
          idempotencyKeyHash: hash,
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: created.id,
          toStatus: created.status,
          reasonCode: 'INTENT_CREATED',
        },
      });
      return { movement: created, reused: false };
    });
    const movement = movementResult.movement;
    if (movementResult.reused) {
      return { movement: this.safe(movement, true) };
    }

    let providerLiquidityReservationId: string | null = null;
    let providerLiquidityConsumed = false;
    let cashReservationId: string | null = null;
    if (type === 'WITHDRAWAL') {
      try {
        await providerTestFailurePoint(
          'movement.withdrawal.before-reservation',
        );
        if (this.config.providerMode !== 'local') {
          providerLiquidityReservationId =
            await this.withdrawalPreflight!.reserveProviderLiquidity(
              movement.id,
              (movement.providerAmountMinor ?? movement.amountMinor).toString(),
            );
        }
        const reservation = await this.ledger.reserveCash(
          actor,
          {
            accountId: movement.cashAccountId,
            purposeType: 'EXTERNAL_WITHDRAWAL',
            purposeId: movement.id,
            amountMinor: amountText,
          },
          requestId,
          `provider-movement:${movement.id}:reserve`,
        );
        cashReservationId = reservation.reservationId;
        await this.db.moneyMovement.update({
          where: { id: movement.id },
          data: { reservationId: reservation.reservationId },
        });
      } catch (error) {
        await this.withdrawalPreflight?.releaseProviderLiquidity(
          providerLiquidityReservationId,
        );
        // Preserve append-only lifecycle history while making the failed intent
        // permanently non-spendable. If the movement-link update failed after
        // cash reservation, release that reservation in the same transaction.
        await this.db.$transaction(async (db) => {
          if (cashReservationId) {
            await this.ledger.releaseCashInTransaction(
              db,
              this.providerActor(actor.userId, movement.id),
              cashReservationId,
              requestId,
            );
          }
          await db.moneyMovement.update({
            where: { id: movement.id },
            data: {
              status: 'FAILED',
              failureCode: 'RESERVATION_REJECTED',
              version: { increment: 1 },
            },
          });
          await db.moneyMovementHistory.create({
            data: {
              id: randomUUID(),
              movementId: movement.id,
              fromStatus: 'PENDING_PROVIDER',
              toStatus: 'FAILED',
              reasonCode: 'RESERVATION_REJECTED',
            },
          });
        });
        throw error;
      }
    }

    await this.db.$transaction(async (db) => {
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: actor.userId,
        actorType: 'USER',
        action: 'WALLET_MOVEMENT_CREATED',
        resourceType: 'money-movement',
        resourceId: movement.id,
        requestId,
        sessionId: actor.sessionId as never,
        result: 'SUCCESS',
        metadata: { type, amountMinor: amountText },
        createdAt: new Date(),
      });
    });
    let cardFunding:
      | {
          clientSecret: string;
          publishableKey: string;
        }
      | undefined;
    if (
      type === 'DEPOSIT' &&
      rail === 'BACS_DIRECT_DEBIT' &&
      this.config.providerMode !== 'local'
    ) {
      if (!this.bankLinks)
        throw new ConflictException({
          code: 'STRIPE_PROVIDER_UNAVAILABLE',
          message: 'Bank funding is not configured.',
        });
      try {
        const external = await this.bankLinks.createDepositPayment({
          userId: actor.userId,
          movementId: movement.id,
          amountMinor: amountText,
        });
        const providerHash = this.crypto.hash(external.providerReference);
        await this.db.$transaction(async (db) => {
          const current = await db.moneyMovement.findUniqueOrThrow({
            where: { id: movement.id },
          });
          await db.moneyMovement.update({
            where: { id: movement.id },
            data: {
              externalAccountId: external.externalAccountId,
              status: external.status,
              providerReferenceCiphertext: this.crypto.encrypt(
                external.providerReference,
                `movement:${movement.id}`,
              ),
              providerReferenceHash: providerHash,
              encryptionKeyVersion: this.crypto.keyVersion,
              failureCode: external.failureCode ?? null,
              version: { increment: 1 },
            },
          });
          await db.moneyMovementHistory.create({
            data: {
              id: randomUUID(),
              movementId: movement.id,
              fromStatus: current.status,
              toStatus: external.status,
              reasonCode: 'STRIPE_PAYMENT_INTENT_CREATED',
            },
          });
        });
      } catch (error) {
        await this.failFromProvider({
          movementId: movement.id,
          reasonCode: 'STRIPE_BACS_DEPOSIT_START_FAILED',
          requestId,
        });
        throw error;
      }
    }
    if (
      type === 'DEPOSIT' &&
      rail === 'CARD' &&
      this.config.providerMode !== 'local'
    ) {
      if (!this.cardFunding) {
        await this.failFromProvider({
          movementId: movement.id,
          reasonCode: 'STRIPE_CARD_FUNDING_UNAVAILABLE',
          requestId,
        });
        throw new ConflictException({
          code: 'STRIPE_CARD_FUNDING_UNAVAILABLE',
          message: 'Card funding is not configured.',
        });
      }
      try {
        const external = await this.cardFunding.createPaymentIntent({
          userId: actor.userId,
          movementId: movement.id,
          amountMinor: amountText,
          savePaymentMethod,
        });
        const providerHash = this.crypto.hash(external.providerReference);
        await this.db.$transaction(async (db) => {
          const current = await db.moneyMovement.findUniqueOrThrow({
            where: { id: movement.id },
          });
          await db.moneyMovement.update({
            where: { id: movement.id },
            data: {
              status: external.status,
              providerReferenceCiphertext: this.crypto.encrypt(
                external.providerReference,
                `movement:${movement.id}`,
              ),
              providerReferenceHash: providerHash,
              encryptionKeyVersion: this.crypto.keyVersion,
              failureCode: null,
              version: { increment: 1 },
            },
          });
          await db.moneyMovementHistory.create({
            data: {
              id: randomUUID(),
              movementId: movement.id,
              fromStatus: current.status,
              toStatus: external.status,
              reasonCode: 'STRIPE_CARD_PAYMENT_INTENT_CREATED',
            },
          });
        });
        cardFunding = {
          clientSecret: external.clientSecret,
          publishableKey: external.publishableKey,
        };
      } catch (error) {
        await this.failFromProvider({
          movementId: movement.id,
          reasonCode: 'STRIPE_CARD_FUNDING_START_FAILED',
          requestId,
        });
        throw error;
      }
    }
    if (type === 'WITHDRAWAL' && this.config.providerMode !== 'local') {
      const cashAccount = await this.db.financialAccount.findUnique({
        where: { id: movement.cashAccountId },
        select: { code: true },
      });
      if (
        cashAccount?.code !== 'CASH_AVAILABLE' &&
        cashAccount?.code !== 'COLLECTOR_PROCEEDS_AVAILABLE'
      ) {
        await this.failFromProvider({
          movementId: movement.id,
          reasonCode: 'EXTERNAL_WITHDRAWAL_NOT_CONFIGURED',
          requestId,
        });
        throw new ConflictException({
          code: 'EXTERNAL_WITHDRAWAL_NOT_CONFIGURED',
          message:
            'External withdrawals are not currently available for this cash balance.',
        });
      }
      if (!this.connectPayouts) {
        await this.failFromProvider({
          movementId: movement.id,
          reasonCode: 'STRIPE_CONNECT_UNAVAILABLE',
          requestId,
        });
        throw new ConflictException({
          code: 'STRIPE_CONNECT_UNAVAILABLE',
          message: 'Payouts are not configured.',
        });
      }
      let providerOperationStarted = false;
      try {
        await this.connectPayouts.createPayout({
          userId: actor.userId,
          movementId: movement.id,
          amountMinor: (
            movement.providerAmountMinor ?? movement.amountMinor
          ).toString(),
          payoutDestinationId: withdrawalOptions?.payoutDestinationId,
          payoutMethod: withdrawalOptions?.payoutMethod,
        });
        providerOperationStarted = true;
        await this.withdrawalPreflight?.consumeProviderLiquidity(
          providerLiquidityReservationId,
        );
        providerLiquidityConsumed = true;
        await this.processingFromProvider({
          movementId: movement.id,
          requestId,
        });
      } catch (error) {
        if (
          error instanceof ConnectPayoutExternalTransferError ||
          providerOperationStarted
        ) {
          // Once a provider transfer/payout may exist, keep the movement and
          // reservation in review even if our own post-provider persistence
          // failed. Releasing capacity here could allow a duplicate payout.
          try {
            await this.withdrawalPreflight?.consumeProviderLiquidity(
              providerLiquidityReservationId,
            );
            providerLiquidityConsumed = true;
          } catch {
            // An active reservation is safer than releasing unknown provider
            // exposure. Reconciliation can resolve it after the provider read.
          }
          await this.holdFromProvider({
            movementId: movement.id,
            reasonCode:
              error instanceof ConnectPayoutExternalTransferError
                ? 'STRIPE_PAYOUT_REQUIRES_REVIEW'
                : 'PROVIDER_STATE_RECONCILIATION_REQUIRED',
            requestId,
          });
        } else {
          if (!providerLiquidityConsumed)
            await this.withdrawalPreflight?.releaseProviderLiquidity(
              providerLiquidityReservationId,
            );
          await this.failFromProvider({
            movementId: movement.id,
            reasonCode:
              error instanceof Error
                ? error.message.slice(0, 64)
                : 'STRIPE_PAYOUT_FAILED',
            requestId,
          });
        }
        throw error;
      }
    }
    const safe = this.safe(
      await this.db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      }),
      false,
    );
    return { movement: safe, ...(cardFunding ? { cardFunding } : {}) };
  }

  async processingFromProvider(input: {
    movementId: string;
    requestId: string;
  }) {
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${input.movementId} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: input.movementId },
      });
      if (
        [
          'SETTLED',
          'FAILED',
          'CANCELLED',
          'RETURNED',
          'REVERSED',
          'MANUAL_REVIEW',
          'HELD',
        ].includes(current.status)
      )
        return this.safe(current, true);
      if (current.status === 'PROCESSING') return this.safe(current, true);
      const updated = await db.moneyMovement.update({
        where: { id: current.id },
        data: { status: 'PROCESSING', version: { increment: 1 } },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: current.id,
          fromStatus: current.status,
          toStatus: 'PROCESSING',
          reasonCode: 'PROVIDER_PROCESSING',
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: current.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'PROCESSING' },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  /** Called only after verified, deduplicated provider confirmation. */
  async completeFromProvider(input: {
    movementId: string;
    providerReference: string;
    providerEventId: string;
    requestId: string;
  }) {
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${input.movementId} FOR UPDATE`;
      const movement = await db.moneyMovement.findUniqueOrThrow({
        where: { id: input.movementId },
        include: { cashAccount: { select: { code: true } } },
      });
      if (['SETTLED', 'HELD'].includes(movement.status))
        return this.safe(movement, true);
      if (
        !['PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW'].includes(
          movement.status,
        )
      ) {
        throw new ConflictException({
          code: 'MOVEMENT_TERMINAL',
          message: 'Money movement cannot be completed.',
        });
      }
      const referenceHash = this.crypto.hash(input.providerReference);
      const referenceOwner = await db.moneyMovement.findUnique({
        where: {
          provider_providerReferenceHash: {
            provider: movement.provider,
            providerReferenceHash: referenceHash,
          },
        },
      });
      if (referenceOwner && referenceOwner.id !== movement.id) {
        throw new ConflictException({
          code: 'PROVIDER_REFERENCE_CONFLICT',
          message: 'Provider reference is already mapped.',
        });
      }
      await providerTestFailurePoint('movement.complete.before-journal');
      const clearing = await this.clearingAccount();
      const withdrawalFeeAccount =
        movement.type === 'WITHDRAWAL' && movement.sliceFeeMinor > 0n
          ? await this.withdrawalFeeAccount(db)
          : null;
      const providerAmountMinor =
        movement.providerAmountMinor ?? movement.amountMinor;
      const actor = this.providerActor(movement.userId, movement.id);
      const legacyBacsHold =
        movement.type === 'DEPOSIT' &&
        movement.cashAccount.code === 'BACS_RISK_HOLD';
      const journal = await this.ledger.postInTransaction(
        db,
        actor,
        {
          type:
            movement.type === 'DEPOSIT'
              ? 'EXTERNAL_DEPOSIT'
              : 'EXTERNAL_WITHDRAWAL',
          financialDataClass: movement.financialDataClass,
          correlationId: `provider-movement:${movement.id}`,
          descriptionCode:
            movement.type === 'WITHDRAWAL' && movement.sliceFeeMinor > 0n
              ? 'WITHDRAWAL_PROVIDER_CONFIRMED_WITH_FEE'
              : `${movement.type}_PROVIDER_CONFIRMED`,
          lines:
            movement.type === 'DEPOSIT'
              ? [
                  {
                    accountId: clearing,
                    side: 'DEBIT',
                    amountMinor: movement.amountMinor.toString(),
                  },
                  {
                    accountId: movement.cashAccountId,
                    side: 'CREDIT',
                    amountMinor: movement.amountMinor.toString(),
                  },
                ]
              : [
                  {
                    accountId: movement.cashAccountId,
                    side: 'DEBIT',
                    amountMinor: movement.amountMinor.toString(),
                  },
                  {
                    accountId: clearing,
                    side: 'CREDIT',
                    amountMinor: providerAmountMinor.toString(),
                  },
                  ...(withdrawalFeeAccount
                    ? [
                        {
                          accountId: withdrawalFeeAccount,
                          side: 'CREDIT' as const,
                          amountMinor: movement.sliceFeeMinor.toString(),
                        },
                      ]
                    : []),
                ],
        },
        input.requestId,
        `provider-movement:${movement.id}:journal`,
      );
      // Deposits created before the policy change can still point at the
      // retired BACS_RISK_HOLD account. Reclassify them in this same verified
      // provider-settlement transaction, rather than preserving a second
      // post-settlement wait.
      if (legacyBacsHold) {
        const cash = await this.ledger.depositCashAccount(
          db,
          movement.userId,
          false,
        );
        await this.ledger.postInTransaction(
          db,
          actor,
          {
            type: 'CASH_RELEASE',
            financialDataClass: movement.financialDataClass,
            correlationId: `bacs-risk-release:${movement.id}`,
            descriptionCode: 'LEGACY_BACS_HOLD_RELEASED',
            lines: [
              {
                accountId: movement.cashAccountId,
                side: 'DEBIT',
                amountMinor: movement.amountMinor.toString(),
              },
              {
                accountId: cash.id,
                side: 'CREDIT',
                amountMinor: movement.amountMinor.toString(),
              },
            ],
          },
          input.requestId,
          `bacs-risk-release:${movement.id}`,
        );
      }
      if (movement.type === 'WITHDRAWAL' && movement.reservationId) {
        await this.ledger.consumeCashInTransaction(
          db,
          actor,
          movement.reservationId,
          input.requestId,
        );
      }
      await providerTestFailurePoint('movement.complete.after-journal');
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'SETTLED') return this.safe(current, true);
      const transitioned = await db.moneyMovement.updateMany({
        where: { id: movement.id, status: { notIn: ['SETTLED', 'HELD'] } },
        data: {
          status: 'SETTLED',
          ledgerTransactionId: journal.transactionId,
          providerReferenceCiphertext: this.crypto.encrypt(
            input.providerReference,
            `movement:${movement.id}`,
          ),
          providerReferenceHash: referenceHash,
          encryptionKeyVersion: this.crypto.keyVersion,
          settledAt: new Date(),
          failureCode: null,
          version: { increment: 1 },
        },
      });
      if (transitioned.count === 0) return this.safe(current, true);
      const updated = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: updated.status,
          reasonCode: 'PROVIDER_CONFIRMED',
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: {
          status: 'SETTLED',
          reasonCode: 'PROVIDER_CONFIRMED',
        },
        createdAt: new Date(),
      });
      if (updated.type === 'DEPOSIT')
        await this.ledger.recoverReturnedFundsDeficitInTransaction(
          db,
          updated.userId,
          input.requestId,
          actor,
        );
      await this.outbox.append(
        db,
        movementSettledEvent({
          movementId: updated.id,
          type: updated.type,
          amountMinor: updated.amountMinor.toString(),
          currency: 'GBP',
          status: 'SETTLED',
          actorUserId: updated.userId,
          correlationId: input.requestId,
          occurredAt: updated.settledAt!,
        }),
      );
      return this.safe(updated, false);
    });
  }

  async failFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const preflight = await this.db.moneyMovement.findUnique({
      where: { id: input.movementId },
      select: { status: true },
    });
    if (preflight?.status === 'HELD') {
      return this.returnFromProvider({
        movementId: input.movementId,
        reasonCode: input.reasonCode,
        requestId: input.requestId,
      });
    }
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${input.movementId} FOR UPDATE`;
      const movement = await db.moneyMovement.findUniqueOrThrow({
        where: { id: input.movementId },
      });
      if (['FAILED', 'CANCELLED'].includes(movement.status))
        return this.safe(movement, true);
      if (movement.status === 'SETTLED')
        throw new ConflictException({
          code: 'MOVEMENT_TERMINAL',
          message: 'A settled movement cannot fail.',
        });
      if (movement.type === 'WITHDRAWAL' && movement.reservationId) {
        await this.ledger.releaseCashInTransaction(
          db,
          this.providerActor(movement.userId, movement.id),
          movement.reservationId,
          input.requestId,
        );
      }
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'FAILED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: movement.status,
          toStatus: 'FAILED',
          reasonCode: input.reasonCode,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'FAILED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  async cancelFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${input.movementId} FOR UPDATE`;
      const movement = await db.moneyMovement.findUniqueOrThrow({
        where: { id: input.movementId },
      });
      if (movement.status === 'CANCELLED') return this.safe(movement, true);
      if (movement.status === 'SETTLED' || movement.status === 'REVERSED')
        throw new ConflictException({
          code: 'MOVEMENT_TERMINAL',
          message: 'A terminal movement cannot be cancelled.',
        });
      await providerTestFailurePoint('movement.cancel.before-release');
      if (movement.type === 'WITHDRAWAL' && movement.reservationId) {
        await this.ledger.releaseCashInTransaction(
          db,
          this.providerActor(movement.userId, movement.id),
          movement.reservationId,
          input.requestId,
        );
      }
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'CANCELLED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'CANCELLED',
          reasonCode: input.reasonCode,
        },
      });
      return this.safe(updated, false);
    });
  }

  async holdFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const movement = await this.lockMovement(input.movementId);
    if (
      ['FAILED', 'CANCELLED', 'RETURNED', 'REVERSED'].includes(movement.status)
    )
      throw new ConflictException({
        code: 'MOVEMENT_TERMINAL',
        message: 'A terminal movement cannot be held.',
      });
    return this.db.$transaction(async (db) => {
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'MANUAL_REVIEW') return this.safe(current, true);
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'MANUAL_REVIEW',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      const existingHold = await db.complianceHold.findFirst({
        where: {
          movementId: updated.id,
          scope: 'EXTERNAL_MOVEMENT',
          status: 'ACTIVE',
        },
      });
      if (!existingHold) {
        const hold = await db.complianceHold.create({
          data: {
            id: randomUUID(),
            userId: updated.userId,
            movementId: updated.id,
            scope: 'EXTERNAL_MOVEMENT',
            reasonCode: input.reasonCode,
            source: 'PROVIDER',
          },
        });
        await createIdentityTransaction(db).audit.append({
          id: randomUUID(),
          actorUserId: null,
          actorType: 'SYSTEM',
          action: 'COMPLIANCE_HOLD_CREATED',
          resourceType: 'compliance-hold',
          resourceId: hold.id,
          requestId: input.requestId,
          sessionId: null,
          result: 'SUCCESS',
          metadata: {
            source: 'PROVIDER',
            scope: hold.scope,
            reasonCode: hold.reasonCode,
            provider: 'STRIPE',
          },
          createdAt: new Date(),
        });
      }
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'MANUAL_REVIEW',
          reasonCode: input.reasonCode,
        },
      });
      if (updated.type === 'DEPOSIT') {
        await this.outbox.append(
          db,
          financialNotificationEvent({
            kind: financialNotificationKind.depositUnderReview,
            title: 'Bank deposit under review',
            body: `Your ${formatGbpMinor(updated.amountMinor)} bank deposit is under review. It cannot be used for trading or withdrawals until the review is complete. We will notify you when the status changes.`,
            resourceType: 'money-movement',
            resourceId: updated.id,
            aggregateType: 'money-movement',
            aggregateId: updated.id,
            amountMinor: updated.amountMinor.toString(),
            actorUserId: updated.userId,
            correlationId: input.requestId,
            eventSuffix: 'review',
          }),
        );
      }
      return this.safe(updated, false);
    });
  }

  async reverseFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const movement = await this.lockMovement(input.movementId);
    if (movement.status === 'REVERSED') return this.safe(movement, true);
    if (movement.status !== 'SETTLED' || !movement.ledgerTransactionId)
      throw new ConflictException({
        code: 'MOVEMENT_REVERSAL_UNAVAILABLE',
        message: 'Only settled movements can be reversed.',
      });
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movement.id} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'REVERSED') return this.safe(current, true);
      await this.ledger.reverseInTransaction(
        db,
        this.providerActor(movement.userId, movement.id),
        movement.ledgerTransactionId!,
        input.reasonCode,
        input.requestId,
        `provider-movement:${movement.id}:reversal`,
      );
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'REVERSED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'REVERSED',
          reasonCode: input.reasonCode,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'REVERSED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  /**
   * A provider return is an append-only reversal with its own movement state.
   * The original settlement journal remains intact; any shortfall is surfaced
   * as a hold instead of being silently covered or fabricated.
   */
  async returnFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const movement = await this.lockMovement(input.movementId);
    if (movement.status === 'RETURNED') return this.safe(movement, true);
    if (
      !['SETTLED', 'HELD', 'MANUAL_REVIEW'].includes(movement.status) ||
      !movement.ledgerTransactionId
    )
      throw new ConflictException({
        code: 'MOVEMENT_RETURN_UNAVAILABLE',
        message: 'Only provider-confirmed movements can be returned.',
      });
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movement.id} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'RETURNED') return this.safe(current, true);
      await this.ledger.protectReturnedFundsReservationsInTransaction(
        db,
        current.userId,
        current.id,
        input.requestId,
      );
      const release = await db.journalTransaction.findUnique({
        where: { correlationId: `bacs-risk-release:${movement.id}` },
        select: { id: true, status: true, reversal: { select: { id: true } } },
      });
      if (release && release.status !== 'REVERSED' && !release.reversal) {
        await this.ledger.reverseInTransaction(
          db,
          this.providerActor(movement.userId, movement.id),
          release.id,
          'BACS_RISK_HOLD_RELEASE_REVERSED',
          input.requestId,
          `provider-movement:${movement.id}:release-return`,
        );
      }
      await this.ledger.reverseInTransaction(
        db,
        this.providerActor(movement.userId, movement.id),
        movement.ledgerTransactionId!,
        input.reasonCode,
        input.requestId,
        `provider-movement:${movement.id}:return`,
      );
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'RETURNED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'RETURNED',
          reasonCode: input.reasonCode,
        },
      });
      const deficitMinor =
        await this.ledger.recordReturnedFundsDeficitInTransaction(
          db,
          updated.userId,
          updated.id,
          input.requestId,
          input.reasonCode,
        );
      const recoveredMinor = deficitMinor > 0n
        ? await this.ledger.recoverReturnedFundsDeficitInTransaction(
            db,
            updated.userId,
            input.requestId,
            this.providerActor(updated.userId, updated.id),
          )
        : 0n;
      const outstandingMinor = deficitMinor - recoveredMinor;
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'RETURNED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      const returnBody =
        outstandingMinor > 0n
          ? `A ${formatGbpMinor(updated.amountMinor)} bank deposit was returned by your bank. Because some of those funds had already been used, your Slice account now has an outstanding balance of ${formatGbpMinor(outstandingMinor)}. Buying and withdrawals are temporarily restricted until it is resolved.`
          : `A ${formatGbpMinor(updated.amountMinor)} bank deposit was returned by your bank. Those funds are no longer available in Slice. If you think this is incorrect, please contact support.`;
      await this.outbox.append(
        db,
        financialNotificationEvent({
          kind: financialNotificationKind.depositReturned,
          title: 'Bank deposit returned',
          body: returnBody,
          resourceType: 'money-movement',
          resourceId: updated.id,
          aggregateType: 'money-movement',
          aggregateId: updated.id,
          amountMinor: updated.amountMinor.toString(),
          outstandingMinor: outstandingMinor.toString(),
          actorUserId: updated.userId,
          correlationId: input.requestId,
          eventSuffix: 'returned',
        }),
      );
      return this.safe(updated, false);
    });
  }

  /*
    await this.ledger.reverse(
      this.providerActor(movement.userId, movement.id),
      movement.ledgerTransactionId,
      input.reasonCode,
      input.requestId,
      `provider-movement:${movement.id}:reversal`,
    );
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movement.id} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'REVERSED') return this.safe(current, true);
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'REVERSED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'REVERSED',
          reasonCode: input.reasonCode,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'REVERSED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  /*
  /**
   * A provider return is an append-only reversal with its own movement state.
   * The original settlement journal remains intact; any shortfall is surfaced
   * as a hold instead of being silently covered or fabricated.
    *
  async returnFromProvider(input: {
    movementId: string;
    reasonCode: string;
    requestId: string;
  }) {
    const movement = await this.lockMovement(input.movementId);
    if (movement.status === 'RETURNED') return this.safe(movement, true);
    if (movement.status !== 'SETTLED' || !movement.ledgerTransactionId)
      throw new ConflictException({
        code: 'MOVEMENT_RETURN_UNAVAILABLE',
        message: 'Only settled movements can be returned.',
      });
    await this.ledger.reverse(
      this.providerActor(movement.userId, movement.id),
      movement.ledgerTransactionId,
      input.reasonCode,
      input.requestId,
      `provider-movement:${movement.id}:return`,
    );
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${movement.id} FOR UPDATE`;
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id: movement.id },
      });
      if (current.status === 'RETURNED') return this.safe(current, true);
      const updated = await db.moneyMovement.update({
        where: { id: movement.id },
        data: {
          status: 'RETURNED',
          failureCode: input.reasonCode,
          version: { increment: 1 },
        },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: updated.id,
          fromStatus: current.status,
          toStatus: 'RETURNED',
          reasonCode: input.reasonCode,
        },
      });
      const account = await db.financialAccount.findUnique({
        where: { id: updated.cashAccountId },
        include: { balance: true },
      });
      if (account?.balance) {
        const authority = accountAuthority(
          account.normalSide,
          account.balance.postedDebitMinor,
          account.balance.postedCreditMinor,
        );
        const available = authority - account.balance.reservedMinor;
        if (available < 0n) {
          await db.complianceHold.create({
            data: {
              id: randomUUID(),
              userId: updated.userId,
              movementId: updated.id,
              scope: 'ACCOUNT',
              reasonCode: 'RETURNED_FUNDS_DEFICIT',
              source: 'PROVIDER_RETURN',
            },
          });
          await createIdentityTransaction(db).audit.append({
            id: randomUUID(),
            actorUserId: null,
            actorType: 'SYSTEM',
            action: 'WALLET_RETURN_DEFICIT_DETECTED',
            resourceType: 'money-movement',
            resourceId: updated.id,
            requestId: input.requestId,
            sessionId: null,
            result: 'SUCCESS',
            metadata: { availableMinor: available.toString(), reasonCode: input.reasonCode },
            createdAt: new Date(),
          });
        }
      }
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: updated.id,
        requestId: input.requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status: 'RETURNED', reasonCode: input.reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  */
  async list(userId: string, cursor?: string, limit = 20) {
    await this.reconcilePendingStripeDeposits('wallet-movements-list', userId);
    await this.reconcilePendingStripePayouts('wallet-movements-list', userId);
    const rows = await this.db.moneyMovement.findMany({
      where: { userId, ...(cursor ? { id: { lt: cursor } } : {}) },
      include: {
        externalAccount: {
          select: {
            institutionName: true,
            accountName: true,
            accountMask: true,
            accountType: true,
          },
        },
        history: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            toStatus: true,
            reasonCode: true,
            createdAt: true,
          },
        },
        providerCosts: {
          select: {
            amountMinor: true,
            status: true,
          },
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });
    const page = rows.slice(0, limit);
    return {
      items: page.map((item) => this.safe(item, false)),
      nextCursor: rows.length > limit ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async detail(userId: string, movementId: string) {
    await this.reconcilePendingStripeDeposits('wallet-movement-detail', userId);
    await this.reconcilePendingStripePayouts('wallet-movement-detail', userId);
    const movement = await this.db.moneyMovement.findFirst({
      where: { id: movementId, userId },
      include: {
        externalAccount: {
          select: {
            institutionName: true,
            accountName: true,
            accountMask: true,
            accountType: true,
          },
        },
        history: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            toStatus: true,
            reasonCode: true,
            createdAt: true,
          },
        },
        providerCosts: {
          select: {
            amountMinor: true,
            status: true,
          },
        },
      },
    });
    if (!movement) {
      throw new NotFoundException({
        code: 'MOVEMENT_NOT_FOUND',
        message: 'Money movement was not found.',
      });
    }
    return this.safe(movement, false);
  }

  async reconcilePendingStripeDeposits(requestId: string, userId?: string) {
    if (
      this.config.providerMode === 'local' ||
      !this.providerCosts ||
      !this.stripeFactory ||
      !this.config.stripeSecretKey
    )
      return;
    try {
      const candidates = await this.db.moneyMovement.findMany({
        where: {
          ...(userId ? { userId } : {}),
          type: 'DEPOSIT',
          provider: moneyMovementProviderCode(this.config.providerMode),
          status: { in: ['PENDING_PROVIDER', 'PROCESSING', 'HELD'] },
          providerReferenceCiphertext: { not: null },
        },
        select: { id: true, providerReferenceCiphertext: true },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: userId ? 20 : 100,
      });
      for (const movement of candidates) {
        const paymentIntentId = this.crypto.decrypt(
          movement.providerReferenceCiphertext!,
          `movement:${movement.id}`,
        );
        if (!paymentIntentId.startsWith('pi_')) continue;
        const settlement = await this.providerCosts.paymentIntentSettlement(
          paymentIntentId,
        );
        if (settlement.providerAvailable) {
          await this.completeFromProvider({
            movementId: movement.id,
            providerReference: paymentIntentId,
            providerEventId: `stripe-reconciliation:${paymentIntentId}`,
            requestId,
          });
        } else if (settlement.paymentConfirmed) {
          await this.processingFromProvider({ movementId: movement.id, requestId });
        }
        await this.providerCosts.reconcileStripeDeposit({
          movementId: movement.id,
          paymentIntentId,
          requestId,
        });
      }
    } catch (error) {
      if (error instanceof ConflictException) throw error;
      // Reconciliation is an opportunistic recovery path. A wallet read must
      // remain available when Stripe is temporarily unreachable.
    }
  }

  /**
   * Recovery for missed Stripe Connect payout webhooks. This only reads a
   * payout that Slice already created and persisted, then applies the same
   * terminal transition and provider-cost observation as the webhook path.
   */
  async reconcilePendingStripePayouts(requestId: string, userId?: string) {
    if (
      this.config.providerMode === 'local' ||
      !this.connectPayouts ||
      !this.config.stripeSecretKey
    )
      return;
    const provider = moneyMovementProviderCode(this.config.providerMode);
    const stripeProvider = provider as 'STRIPE_SANDBOX' | 'STRIPE_LIVE';
    try {
      const candidates = await this.db.connectPayout.findMany({
        where: {
          provider,
          status: { in: ['CREATED', 'TRANSFERRED', 'PROCESSING'] },
          externalPayoutIdCiphertext: { not: null },
          movement: {
            ...(userId ? { userId } : {}),
            type: 'WITHDRAWAL',
            status: { in: ['PENDING_PROVIDER', 'PROCESSING', 'MANUAL_REVIEW'] },
          },
        },
        select: { id: true },
        orderBy: [{ updatedAt: 'asc' }, { id: 'asc' }],
        take: userId ? 20 : 100,
      });
      for (const candidate of candidates) {
        try {
          const effect = await this.connectPayouts.reconcilePayout(candidate.id);
          if (!effect) continue;
          if (effect.action === 'PROCESSING') {
            await this.processingFromProvider({
              movementId: effect.movementId,
              requestId,
            });
          } else if (effect.action === 'COMPLETE' && effect.providerReference) {
            await this.completeFromProvider({
              movementId: effect.movementId,
              providerReference: effect.providerReference,
              providerEventId: `stripe-payout-reconciliation:${effect.providerReference}`,
              requestId,
            });
            await this.providerCosts?.observePayoutForExternalId({
              provider: stripeProvider,
              payoutId: effect.providerReference,
              requestId,
            });
          } else if (effect.action === 'FAIL') {
            await this.failFromProvider({
              movementId: effect.movementId,
              reasonCode: effect.reasonCode ?? 'STRIPE_PAYOUT_FAILED',
              requestId,
            });
          } else if (effect.action === 'HOLD') {
            await this.holdFromProvider({
              movementId: effect.movementId,
              reasonCode: effect.reasonCode ?? 'STRIPE_PAYOUT_REVIEW',
              requestId,
            });
          }
        } catch {
          // A single unavailable provider payout must not prevent the wallet
          // from returning the other movements it can safely display.
        }
      }
    } catch {
      // This is a read-recovery path. Stripe outages remain visible as the
      // existing processing state rather than breaking Wallet reads.
    }
  }

  /**
   * Staff-only reconciliation trace. It deliberately excludes client secrets,
   * payment-method details, bank details, webhook payloads, and encryption
   * material. The returned provider IDs are sufficient to open the matching
   * Stripe records from a protected operations surface.
   */
  async staffTrace(movementId: string) {
    const movement = await this.db.moneyMovement.findUnique({
      where: { id: movementId },
      include: {
        history: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: { toStatus: true, reasonCode: true, createdAt: true },
        },
        providerCosts: {
          orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
          select: {
            sourceObjectType: true,
            sourceObjectId: true,
            balanceTransactionId: true,
            amountMinor: true,
            status: true,
            postedJournalTransactionId: true,
          },
        },
        connectPayout: {
          select: {
            id: true,
            status: true,
            failureCode: true,
            externalTransferIdCiphertext: true,
            transferBalanceTransactionIdCiphertext: true,
            destinationPaymentIdCiphertext: true,
            externalPayoutIdCiphertext: true,
            payoutBalanceTransactionIdCiphertext: true,
            externalDestinationIdCiphertext: true,
            payoutMethod: true,
            arrivalDate: true,
            connectAccount: {
              select: {
                id: true,
                externalAccountIdCiphertext: true,
              },
            },
            balanceSnapshots: {
              orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
              select: {
                stage: true,
                platformAvailableMinor: true,
                platformPendingMinor: true,
                connectedAvailableMinor: true,
                connectedPendingMinor: true,
                capturedAt: true,
              },
            },
          },
        },
      },
    });
    if (!movement) {
      throw new NotFoundException({
        code: 'MOVEMENT_NOT_FOUND',
        message: 'Money movement was not found.',
      });
    }
    return {
      movement: {
        id: movement.id,
        userId: movement.userId,
        type: movement.type,
        rail: movement.rail,
        status: movement.status,
        amountMinor: movement.amountMinor.toString(),
        sliceFeeMinor: movement.sliceFeeMinor.toString(),
        providerAmountMinor: (
          movement.providerAmountMinor ?? movement.amountMinor
        ).toString(),
        provider: movement.provider,
        environment: this.config.providerMode,
        ledgerTransactionId: movement.ledgerTransactionId,
        reservationId: movement.reservationId,
        createdAt: movement.createdAt.toISOString(),
        updatedAt: movement.updatedAt.toISOString(),
        settledAt: movement.settledAt?.toISOString() ?? null,
      },
      provider: {
        paymentIntentId: this.decryptMovementReference(movement),
        balanceTransactionId: this.decryptMovementBalanceTransaction(movement),
        sourceObjectIds: movement.providerCosts.map((cost) => ({
          type: cost.sourceObjectType,
          id: cost.sourceObjectId,
        })),
        connectTransferId: movement.connectPayout
          ? this.decryptConnectReference(
              movement.connectPayout.externalTransferIdCiphertext,
              `connect-transfer:${movement.connectPayout.id}`,
            )
          : null,
        transferBalanceTransactionId: movement.connectPayout
          ? this.decryptConnectReference(
              movement.connectPayout.transferBalanceTransactionIdCiphertext,
              `connect-transfer-balance-transaction:${movement.connectPayout.id}`,
            )
          : null,
        destinationPaymentId: movement.connectPayout
          ? this.decryptConnectReference(
              movement.connectPayout.destinationPaymentIdCiphertext,
              `connect-destination-payment:${movement.connectPayout.id}`,
            )
          : null,
        connectPayoutId: movement.connectPayout
          ? this.decryptConnectReference(
              movement.connectPayout.externalPayoutIdCiphertext,
              `connect-payout:${movement.connectPayout.id}`,
            )
          : null,
        payoutBalanceTransactionId: movement.connectPayout
          ? this.decryptConnectReference(
              movement.connectPayout.payoutBalanceTransactionIdCiphertext,
              `connect-payout-balance-transaction:${movement.connectPayout.id}`,
            )
          : null,
        externalDestinationId: movement.connectPayout
          ? this.decryptConnectReference(
              movement.connectPayout.externalDestinationIdCiphertext,
              `connect-external-destination:${movement.connectPayout.id}`,
            )
          : null,
        connectedAccountId: movement.connectPayout
          ? this.decryptConnectReference(
              movement.connectPayout.connectAccount.externalAccountIdCiphertext,
              `connect-account:${movement.connectPayout.connectAccount.id}`,
            )
          : null,
      },
      providerCosts: movement.providerCosts.map((cost) => ({
        status: cost.status,
        amountMinor: cost.amountMinor?.toString() ?? null,
        balanceTransactionId: cost.balanceTransactionId,
        postedJournalTransactionId: cost.postedJournalTransactionId,
      })),
      lifecycle: movement.history.map((event) => ({
        status: event.toStatus,
        reasonCode: event.reasonCode,
        occurredAt: event.createdAt.toISOString(),
      })),
      payout: movement.connectPayout
        ? {
            status: movement.connectPayout.status,
            failureCode: movement.connectPayout.failureCode,
            method: movement.connectPayout.payoutMethod,
            arrivalDate: movement.connectPayout.arrivalDate?.toISOString() ?? null,
            balanceSnapshots: movement.connectPayout.balanceSnapshots.map(
              (snapshot) => ({
                stage: snapshot.stage,
                platform: {
                  availableMinor: snapshot.platformAvailableMinor.toString(),
                  pendingMinor: snapshot.platformPendingMinor.toString(),
                },
                connected: {
                  availableMinor: snapshot.connectedAvailableMinor.toString(),
                  pendingMinor: snapshot.connectedPendingMinor.toString(),
                },
                capturedAt: snapshot.capturedAt.toISOString(),
              }),
            ),
          }
        : null,
    };
  }

  private amount(value: string) {
    if (!/^\d+$/.test(value) || BigInt(value) <= 0n)
      throw new ConflictException({
        code: 'INVALID_MONEY_AMOUNT',
        message: 'Amount must be a positive GBP minor-unit integer.',
      });
    return BigInt(value);
  }

  private async enforceWithdrawalLimits(
    db: Prisma.TransactionClient,
    userId: string,
    amount: bigint,
  ) {
    const per = BigInt(this.config.withdrawalLimitPerMovementMinor);
    if (amount > per)
      throw new ConflictException({
        code: 'MOVEMENT_LIMIT_EXCEEDED',
        message: 'Withdrawal exceeds the configured per-movement limit.',
      });
    const since7d = new Date(Date.now() - 7 * 86_400_000);
    const movements = await db.moneyMovement.findMany({
      where: {
        userId,
        type: 'WITHDRAWAL',
        status: {
          in: [
            'PENDING_PROVIDER',
            'PROCESSING',
            'SETTLED',
            'MANUAL_REVIEW',
            'HELD',
          ],
        },
        createdAt: { gte: since7d },
      },
      select: { amountMinor: true, createdAt: true },
    });
    const { total24h, total7d } = calculateWithdrawalVelocity(
      movements,
      amount,
    );
    if (
      total24h > BigInt(this.config.withdrawalLimit24hMinor) ||
      total7d > BigInt(this.config.withdrawalLimit7dMinor)
    )
      throw new ConflictException({
        code: 'MOVEMENT_LIMIT_EXCEEDED',
        message: 'Withdrawal exceeds the configured velocity limit.',
      });
  }

  private async enforceDepositLimits(
    db: Prisma.TransactionClient,
    userId: string,
    amount: bigint,
  ) {
    const max = this.config.bacsDepositMaxMinor;
    if (max !== undefined && amount > BigInt(max))
      throw new ConflictException({
        code: 'DEPOSIT_LIMIT_EXCEEDED',
        message: depositLimitMessage('DEPOSIT_LIMIT_EXCEEDED'),
      });
    const now = new Date();
    const dayStart = new Date(now);
    dayStart.setUTCHours(0, 0, 0, 0);
    const since7d = new Date(now.getTime() - 7 * 86_400_000);
    const rapidSince =
      this.config.bacsDepositRapidWindowSeconds === undefined
        ? null
        : new Date(
            now.getTime() - this.config.bacsDepositRapidWindowSeconds * 1000,
          );
    if (
      this.config.bacsDepositDailyLimitMinor === undefined &&
      this.config.bacsDepositRolling7dLimitMinor === undefined &&
      this.config.bacsDepositDailyCountLimit === undefined &&
      (rapidSince === null ||
        this.config.bacsDepositRapidCountLimit === undefined)
    )
      return;
    const rows = await db.moneyMovement.findMany({
      where: {
        userId,
        type: 'DEPOSIT',
        status: { notIn: ['FAILED', 'CANCELLED', 'RETURNED', 'REVERSED'] },
        createdAt: {
          gte:
            this.config.bacsDepositDailyLimitMinor !== undefined ||
            this.config.bacsDepositDailyCountLimit !== undefined
              ? dayStart
              : since7d,
        },
      },
      select: { amountMinor: true, createdAt: true },
    });
    const velocity = calculateDepositVelocity(
      rows,
      now,
      this.config.bacsDepositRapidWindowSeconds,
    );
    const code = evaluateDepositLimits(amount, velocity, {
      dailyLimitMinor: this.config.bacsDepositDailyLimitMinor,
      rolling7dLimitMinor: this.config.bacsDepositRolling7dLimitMinor,
      dailyCountLimit: this.config.bacsDepositDailyCountLimit,
      rapidCountLimit: rapidSince
        ? this.config.bacsDepositRapidCountLimit
        : undefined,
    });
    if (code)
      throw new ConflictException({ code, message: depositLimitMessage(code) });
  }

  private async lockMovement(id: string) {
    return this.db.$transaction(async (db) => {
      await db.$queryRaw`SELECT id FROM "MoneyMovement" WHERE id = ${id} FOR UPDATE`;
      return db.moneyMovement.findUniqueOrThrow({ where: { id } });
    });
  }

  private async clearingAccount() {
    return this.db.$transaction(async (db) => {
      await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('EXTERNAL_GBP_CLEARING'))`;
      const existing = await db.financialAccount.findFirst({
        where: {
          ownerType: 'CLEARING',
          code: 'EXTERNAL_GBP_CLEARING',
          currency: 'GBP',
        },
      });
      if (existing) return existing.id;
      return (
        await db.financialAccount.create({
          data: {
            id: randomUUID(),
            ownerType: 'CLEARING',
            accountType: 'ASSET',
            code: 'EXTERNAL_GBP_CLEARING',
            currency: 'GBP',
            normalSide: 'DEBIT',
          },
        })
      ).id;
    });
  }

  private async withdrawalFeeAccount(db: Prisma.TransactionClient) {
    const existing = await db.financialAccount.findFirst({
      where: {
        ownerType: 'PLATFORM',
        code: 'WITHDRAWAL_FEE_REVENUE',
        currency: 'GBP',
      },
    });
    if (existing) return existing.id;
    return (
      await db.financialAccount.create({
        data: {
          id: randomUUID(),
          ownerType: 'PLATFORM',
          accountType: 'REVENUE',
          code: 'WITHDRAWAL_FEE_REVENUE',
          currency: 'GBP',
          normalSide: 'CREDIT',
        },
      })
    ).id;
  }

  private async updateStatus(
    id: string,
    status: 'FAILED',
    reasonCode: string,
    requestId: string,
  ) {
    return this.db.$transaction(async (db) => {
      const current = await db.moneyMovement.findUniqueOrThrow({
        where: { id },
      });
      const updated = await db.moneyMovement.update({
        where: { id },
        data: { status, failureCode: reasonCode, version: { increment: 1 } },
      });
      await db.moneyMovementHistory.create({
        data: {
          id: randomUUID(),
          movementId: id,
          fromStatus: current.status,
          toStatus: status,
          reasonCode,
        },
      });
      await createIdentityTransaction(db).audit.append({
        id: randomUUID(),
        actorUserId: null,
        actorType: 'SYSTEM',
        action: 'WALLET_MOVEMENT_UPDATED',
        resourceType: 'money-movement',
        resourceId: id,
        requestId,
        sessionId: null,
        result: 'SUCCESS',
        metadata: { status, reasonCode },
        createdAt: new Date(),
      });
      return this.safe(updated, false);
    });
  }

  private providerActor(userId: string, movementId: string): Actor {
    return {
      userId: userId as Actor['userId'],
      sessionId: `provider:${movementId}`,
      status: 'ACTIVE',
      roles: [],
      sessionRevokedAt: null,
      sessionRevocationReason: null,
      authenticatedAt: new Date(),
    };
  }

  private safe(
    item: {
      id: string;
      type: string;
      rail?: string;
      amountMinor: bigint;
      sliceFeeMinor?: bigint;
      providerAmountMinor?: bigint | null;
      currency: string;
      status: string;
      createdAt: Date;
      updatedAt: Date;
      providerReferenceCiphertext?: string | null;
      providerBalanceTransactionIdCiphertext?: string | null;
      providerFeeMinor?: bigint | null;
      providerNetMinor?: bigint | null;
      providerAvailableOn?: Date | null;
      providerInstrumentLabel?: string | null;
      externalAccount?: {
        institutionName: string | null;
        accountName: string | null;
        accountMask: string | null;
        accountType: string;
      } | null;
      failureCode?: string | null;
      history?: Array<{
        toStatus: string;
        reasonCode: string;
        createdAt: Date;
      }>;
      providerCosts?: Array<{
        amountMinor: bigint | null;
        status: string;
      }>;
    },
    replayed: boolean,
  ) {
    const knownProviderCost =
      item.providerFeeMinor ??
      item.providerCosts
        ?.filter((cost) =>
          ['OBSERVED', 'POSTED', 'RECONCILED'].includes(cost.status),
        )
        .reduce((total, cost) => total + (cost.amountMinor ?? 0n), 0n);
    const providerFeeKnown =
      item.providerFeeMinor !== undefined && item.providerFeeMinor !== null
        ? true
        : Boolean(
            item.providerCosts?.some((cost) =>
              ['OBSERVED', 'POSTED', 'RECONCILED'].includes(cost.status),
            ),
          );
    const sourceLabel = item.externalAccount
      ? `${item.externalAccount.institutionName ?? item.externalAccount.accountName ?? (item.externalAccount.accountType === 'bacs_debit' ? 'UK bank account' : 'Connected account')}${item.externalAccount.accountMask ? ` · •••• ${item.externalAccount.accountMask}` : ''}`
      : (item.providerInstrumentLabel ??
        (item.rail === 'CARD'
          ? 'Card payment'
          : item.type === 'WITHDRAWAL'
            ? 'GBP wallet → verified payout account'
            : 'GBP wallet'));
    const failure = customerFailure(
      item.type,
      item.status,
      item.failureCode ?? null,
    );
    return {
      id: item.id,
      type: item.type,
      rail: item.rail ?? 'BACS_DIRECT_DEBIT',
      amountMinor: item.amountMinor.toString(),
      sliceFeeMinor: (item.sliceFeeMinor ?? 0n).toString(),
      providerAmountMinor: (
        item.providerAmountMinor ?? item.amountMinor
      ).toString(),
      currency: item.currency,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
      replayed,
      sourceLabel,
      reference: `WLT-${item.id.slice(0, 8).toUpperCase()}`,
      provider: {
        name:
          item.rail === 'BACS_DIRECT_DEBIT' || item.rail === 'CARD'
            ? 'Stripe'
            : item.rail === 'CONNECT_STANDARD_PAYOUT'
              ? 'Stripe Connect'
              : 'Provider',
        reference: this.safeProviderReference(item),
        status: providerStatusLabel(item.status),
      },
      fees: {
        sliceFeeMinor: (item.sliceFeeMinor ?? 0n).toString(),
        providerFeeMinor: providerFeeKnown
          ? (knownProviderCost ?? 0n).toString()
          : null,
        providerFeeStatus: providerFeeKnown ? 'KNOWN' : 'PENDING',
        netPayoutMinor: (item.type === 'WITHDRAWAL'
          ? (item.providerAmountMinor ?? item.amountMinor)
          : (item.providerNetMinor ?? item.amountMinor)
        ).toString(),
      },
      availability: movementAvailability(
        item.type,
        item.status,
        item.providerAvailableOn ?? null,
      ),
      failure,
      timeline: (item.history ?? []).map((event) => ({
        status: event.toStatus,
        occurredAt: event.createdAt.toISOString(),
        label: customerTimelineLabel(
          item.type,
          item.rail ?? 'BACS_DIRECT_DEBIT',
          event.toStatus,
          event.reasonCode,
        ),
      })),
    };
  }

  private safeProviderReference(item: {
    id: string;
    providerReferenceCiphertext?: string | null;
  }) {
    const reference = this.decryptMovementReference(item);
    return reference ? `STR-${reference.slice(-6).toUpperCase()}` : null;
  }

  private decryptMovementReference(item: {
    id: string;
    providerReferenceCiphertext?: string | null;
  }) {
    return this.decryptConnectReference(
      item.providerReferenceCiphertext,
      `movement:${item.id}`,
    );
  }

  private decryptMovementBalanceTransaction(item: {
    id: string;
    providerBalanceTransactionIdCiphertext?: string | null;
  }) {
    return this.decryptConnectReference(
      item.providerBalanceTransactionIdCiphertext,
      `movement-balance-transaction:${item.id}`,
    );
  }

  private decryptConnectReference(
    ciphertext: string | null | undefined,
    context: string,
  ) {
    if (!ciphertext) return null;
    try {
      return this.crypto.decrypt(ciphertext, context);
    } catch {
      return null;
    }
  }
}

function providerStatusLabel(status: string) {
  if (status === 'SETTLED') return 'Confirmed';
  if (status === 'HELD') return 'Clearing';
  if (status === 'MANUAL_REVIEW') return 'Under review';
  if (status === 'FAILED' || status === 'CANCELLED') return 'Not completed';
  if (status === 'RETURNED' || status === 'REVERSED') return 'Returned';
  return 'Awaiting confirmation';
}

function movementAvailability(
  type: string,
  status: string,
  availableOn: Date | null,
) {
  if (type === 'WITHDRAWAL') {
    if (status === 'SETTLED') {
      return {
        state: 'PAID_OUT',
        label: 'Payout confirmed by provider',
        availableOn: null,
      };
    }
    if (status === 'FAILED' || status === 'CANCELLED') {
      return {
        state: 'NOT_WITHDRAWN',
        label: 'No cash was withdrawn from your Slice wallet',
        availableOn: null,
      };
    }
    if (status === 'MANUAL_REVIEW') {
      return {
        state: 'RESERVED',
        label: 'Cash remains reserved while the payout is reviewed',
        availableOn: null,
      };
    }
    return {
      state: 'RESERVED',
      label: 'Cash remains reserved until the payout is confirmed',
      availableOn: null,
    };
  }
  if (status === 'SETTLED') {
    return {
      state: 'AVAILABLE',
      label: 'Available in your Slice wallet',
      availableOn: availableOn?.toISOString() ?? null,
    };
  }
  if (status === 'HELD') {
    return {
      state: 'CLEARING',
      label:
        'Visible in your wallet, but not yet available to trade or withdraw',
      availableOn: availableOn?.toISOString() ?? null,
    };
  }
  if (status === 'FAILED' || status === 'CANCELLED') {
    return {
      state: 'NOT_ADDED',
      label: 'No cash was added to your Slice wallet',
      availableOn: null,
    };
  }
  return {
    state: 'PENDING',
    label: 'Waiting for verified provider confirmation',
    availableOn: availableOn?.toISOString() ?? null,
  };
}

function customerFailure(
  type: string,
  status: string,
  failureCode: string | null,
) {
  if (
    !['FAILED', 'CANCELLED', 'MANUAL_REVIEW', 'RETURNED', 'REVERSED'].includes(
      status,
    )
  ) {
    return null;
  }
  if (status === 'MANUAL_REVIEW') {
    return {
      title: 'Movement under review',
      detail:
        type === 'WITHDRAWAL'
          ? 'We are confirming the provider payout state before changing your wallet balance.'
          : 'We are reviewing this funding movement before making it available.',
      moneyDisposition:
        type === 'WITHDRAWAL'
          ? 'Your cash remains reserved while we confirm the outcome.'
          : 'This deposit is not available to trade or withdraw.',
      nextStep: 'We will update your Wallet when the review is complete.',
    };
  }
  if (status === 'RETURNED' || status === 'REVERSED') {
    return {
      title: 'Provider movement returned',
      detail:
        'The provider reported that this movement was returned or reversed.',
      moneyDisposition:
        type === 'WITHDRAWAL'
          ? 'The withdrawal was not completed. Check your Wallet balance before trying again.'
          : 'The returned funds are not available in your Slice wallet.',
      nextStep: 'Contact support if you need help with this reference.',
    };
  }
  const cardFailure =
    failureCode?.includes('CARD') ||
    failureCode?.includes('PAYMENT') ||
    failureCode === 'card_declined' ||
    failureCode === 'authentication_required';
  return {
    title:
      type === 'WITHDRAWAL'
        ? 'Withdrawal not completed'
        : cardFailure
          ? 'Card payment not completed'
          : 'Deposit not completed',
    detail:
      type === 'WITHDRAWAL'
        ? 'The payout provider could not complete this withdrawal.'
        : cardFailure
          ? 'Your card payment could not be confirmed by the provider.'
          : 'Your bank deposit could not be confirmed by the provider.',
    moneyDisposition:
      type === 'WITHDRAWAL'
        ? 'No cash was withdrawn from your Slice wallet.'
        : 'No cash was added to your Slice wallet.',
    nextStep:
      type === 'WITHDRAWAL'
        ? 'Check your payout setup and try again when your cash is available.'
        : cardFailure
          ? 'Try another card or check with your card issuer.'
          : 'Check your bank mandate and try again.',
  };
}

function customerTimelineLabel(
  type: string,
  rail: string,
  status: string,
  reasonCode: string,
) {
  if (status === 'PENDING_PROVIDER') {
    return type === 'WITHDRAWAL'
      ? 'Withdrawal requested and wallet cash reserved'
      : rail === 'CARD'
        ? 'Secure card payment created'
        : 'Bank deposit requested';
  }
  if (status === 'PROCESSING') return 'Provider is processing this movement';
  if (status === 'HELD')
    return 'Provider payment confirmed; funds are clearing';
  if (status === 'SETTLED') {
    return type === 'WITHDRAWAL'
      ? 'Provider confirmed the payout'
      : 'Provider confirmation recorded in your Slice wallet';
  }
  if (status === 'FAILED') return 'Provider could not complete this movement';
  if (status === 'CANCELLED') return 'Provider payment was cancelled';
  if (status === 'MANUAL_REVIEW') return 'Provider state requires review';
  if (status === 'RETURNED') return 'Provider returned this movement';
  if (status === 'REVERSED') return 'Provider reversed this movement';
  return reasonCode === 'INTENT_CREATED'
    ? 'Movement request created'
    : 'Movement status updated';
}
